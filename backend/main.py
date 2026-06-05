from fastapi import FastAPI, HTTPException, Depends
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import uvicorn
from sqlalchemy.orm import Session
from sqlalchemy import or_
from typing import Optional
from database import engine, get_db
import models

# 创建数据库表
models.Base.metadata.create_all(bind=engine)

app = FastAPI(title="AI Producer Backend")

# 配置 CORS，允许前端跨域请求
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # 实际生产环境中应替换为前端的具体域名
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

from datetime import timezone, timedelta

def ensure_tz(dt):
    if dt is None:
        return None
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone(timedelta(hours=8)))
    return dt

# 初始化默认数据
def init_db(db: Session):
    if not db.query(models.User).first():
        boss = models.User(id="boss", role="boss", name="创始人/老板")
        employee = models.User(id="employee", role="employee", name="执行团队/张导")
        ai = models.User(id="ai_producer", role="ai", name="AI 制片")
        db.add_all([boss, employee, ai])

    project = db.query(models.Project).filter(models.Project.id == "p1").first()
    if not project:
        project = models.Project(
            id="p1", name="达梦宣传片", status="planning", budget=300000.0,
            client="武汉达梦数据库股份有限公司", industry="IT-基础软件",
            goal="品牌升级与营销传播", delivery_date="2026-04-15"
        )
        db.add(project)
        db.commit() # Commit to get project ID
        
        # Add Budget Breakdown
        db.add_all([
            models.BudgetBreakdown(project_id="p1", category="前期筹备", item_name="创意方案", amount=3000),
            models.BudgetBreakdown(project_id="p1", category="前期筹备", item_name="执行脚本", amount=3000),
            models.BudgetBreakdown(project_id="p1", category="拍摄执行", item_name="导演", amount=9000),
            models.BudgetBreakdown(project_id="p1", category="拍摄执行", item_name="制片", amount=4500),
            models.BudgetBreakdown(project_id="p1", category="拍摄执行", item_name="摄影", amount=7500),
        ])
        
        # Add Crew
        db.add_all([
            models.Crew(project_id="p1", role="导演", name="张导", days=3),
            models.Crew(project_id="p1", role="制片", name="李制片", days=3),
            models.Crew(project_id="p1", role="摄影指导", name="王摄影", days=3),
        ])
        
        # Add Asset
        db.add_all([
            models.Asset(project_id="p1", name="达梦英文宣传片需求Brief", asset_type="PDF"),
            models.Asset(project_id="p1", name="达梦英文宣传片报价", asset_type="Excel"),
        ])
        
        db.commit()

# 在启动时初始化数据
@app.on_event("startup")
def on_startup():
    db = next(get_db())
    init_db(db)

class ChatRequest(BaseModel):
    message: str
    user_id: str
    role: str # 'boss' 或 'employee'
    project_id: str = "p1"
    session_id: str = "default"

class RelayRequest(BaseModel):
    project_id: str
    target_role: str
    content: str
    session_id: str = "default"

@app.get("/")
def read_root():
    return {"status": "ok", "message": "AI Producer Backend is running."}

@app.get("/api/projects/{project_id}")
def get_project(project_id: str, db: Session = Depends(get_db)):
    project = db.query(models.Project).filter(models.Project.id == project_id).first()
    if project:
        return {"id": project.id, "name": project.name, "status": project.status, "budget": project.budget}
    raise HTTPException(status_code=404, detail="Project not found")

class ThreadRequest(BaseModel):
    name: str

@app.post("/api/projects/{project_id}/threads")
def create_thread(project_id: str, req: ThreadRequest, user_id: str, db: Session = Depends(get_db)):
    import time
    thread_id = f"thread_{int(time.time()*1000)}"
    new_thread = models.ChatThread(id=thread_id, project_id=project_id, user_id=user_id, name=req.name)
    db.add(new_thread)
    db.commit()
    return {"id": new_thread.id, "name": new_thread.name}

@app.get("/api/projects/{project_id}/threads")
def get_threads(project_id: str, role: Optional[str] = None, db: Session = Depends(get_db)):
    # 为了简化，我们依然复用原来基于 messages 表推导 session 的逻辑，但也结合 ChatThread 表
    # 如果要完全重构，就直接从 ChatThread 表里查。
    # 这里我们返回所有的 thread 列表，并附加 unreadCount。
    threads_db = db.query(models.ChatThread).filter(models.ChatThread.project_id == project_id).all()
    threads_dict = {t.id: {"id": t.id, "name": t.name, "timestamp": ensure_tz(t.updated_at), "unreadCount": 0} for t in threads_db}
    
    # 默认存在一个 "default" session，为了兼容之前的逻辑
    if "default" not in threads_dict:
        threads_dict["default"] = {"id": "default", "name": "主频道", "timestamp": models.get_utc_8(), "unreadCount": 0}

    messages = db.query(models.Message).filter(models.Message.project_id == project_id).all()
    for m in messages:
        m_ts = ensure_tz(m.timestamp)
        if m.session_id not in threads_dict:
            # 如果是历史遗留的 session_id 没有在 thread 表里
            threads_dict[m.session_id] = {"id": m.session_id, "name": f"对话 {m.session_id.replace('session_', '')}", "timestamp": m_ts, "unreadCount": 0}
        else:
            t_ts = threads_dict[m.session_id]["timestamp"]
            if m_ts and t_ts and m_ts > t_ts:
                threads_dict[m.session_id]["timestamp"] = m_ts
        
        if role and m.target_role == role and m.sender_id == "ai_producer" and not m.is_read:
             threads_dict[m.session_id]["unreadCount"] += 1
    
    sorted_threads = sorted(threads_dict.values(), key=lambda x: x["timestamp"], reverse=True)
    return {"threads": sorted_threads}

@app.put("/api/projects/{project_id}/threads/{thread_id}")
def update_thread(project_id: str, thread_id: str, req: ThreadRequest, db: Session = Depends(get_db)):
    thread = db.query(models.ChatThread).filter(models.ChatThread.id == thread_id, models.ChatThread.project_id == project_id).first()
    if thread:
        thread.name = req.name
        db.commit()
    return {"status": "ok"}

@app.delete("/api/projects/{project_id}/threads/{thread_id}")
def delete_thread(project_id: str, thread_id: str, db: Session = Depends(get_db)):
    if thread_id == "default":
        return {"status": "error", "message": "主频道不可删除"}
    db.query(models.Message).filter(models.Message.project_id == project_id, models.Message.session_id == thread_id).delete()
    db.query(models.ChatThread).filter(models.ChatThread.project_id == project_id, models.ChatThread.id == thread_id).delete()
    db.commit()
    return {"status": "ok"}

@app.post("/api/projects/{project_id}/threads/{thread_id}/read")
def mark_thread_read(project_id: str, thread_id: str, role: str, db: Session = Depends(get_db)):
    db.query(models.Message).filter(
        models.Message.project_id == project_id,
        models.Message.session_id == thread_id,
        models.Message.target_role == role,
        models.Message.is_read == 0
    ).update({"is_read": 1})
    db.commit()
    return {"status": "ok"}

@app.get("/api/messages/{project_id}")
def get_messages(project_id: str, session_id: str = "default", role: Optional[str] = None, db: Session = Depends(get_db)):
    query = db.query(models.Message).filter(
        models.Message.project_id == project_id,
        models.Message.session_id == session_id
    )
    if role:
        query = query.filter(
            or_(
                models.Message.target_role == None, 
                models.Message.target_role == role,
                models.Message.sender_id == role
            )
        )
    messages = query.order_by(models.Message.timestamp.asc()).all()
    
    if role:
        # 自动将获取到的发送给该角色的消息标记为已读
        unread_messages = [m for m in messages if m.target_role == role and m.is_read == 0 and m.sender_id == "ai_producer"]
        for m in unread_messages:
            m.is_read = 1
        if unread_messages:
            db.commit()
            
    # 特殊处理：如果是老板，把 sender_id 修正为实际名字或 AI，如果发信人是 employee，应该显示 employee
    res = []
    for m in messages:
        r = "ai"
        if m.sender_id == role:
            r = "user"
        elif m.sender_id == "employee" and role == "boss":
            r = "employee"
            
        res.append({"id": m.id, "role": r, "content": m.content, "user_id": m.sender_id, "timestamp": ensure_tz(m.timestamp)})
        
    return {"messages": res}

from ai_agent import chat_with_llm, get_config_snapshot

@app.post("/api/chat")
def chat_with_ai(req: ChatRequest, db: Session = Depends(get_db)):
    """
    处理与大模型的对话，并维持记忆
    """
    # 存入用户消息
    user_msg = models.Message(project_id=req.project_id, session_id=req.session_id, sender_id=req.user_id, content=req.message, target_role=req.role)
    db.add(user_msg)
    db.commit()
    
    # 调用大模型并执行 Function Calling
    reply = chat_with_llm(req.message, req.user_id, req.project_id, req.session_id, db)
    
    # 检查 AI 的回复中是否包含 "【AI转达】" 或者是否调用了 report_to_boss 等需要将消息发给特定角色的功能
    # 为了简化，如果 reply 是我们刚刚在 report_to_boss 工具里生成的那个提示，说明它主要是生成给 boss 的
    # 这里我们在 ai_agent.py 中处理了工具调用。
    # 实际上，如果工具已经被调用，工具内部会生成针对目标角色 (boss/employee) 的 message。
    # LLM 返回的 summary (reply) 应该是返回给当前请求者 (req.role) 的确认信息。
    
    # 修复：如果是老板发起了让 AI 去催进度等指令，AI 会返回类似 "已向员工催促交付" 的总结。
    # 老板看到这句话就行了，不需要再看到一条假的“张导说...”
    # 如果是员工发消息，AI 调用了 report_to_boss，那个工具会直接生成一条发给老板的消息，
    # 而这个 reply 就是回复给员工的 "好的，我已向老板汇报" 或者类似的话。
    # 强制修复：如果是员工发消息，且 AI 成功汇报了，不应该把 "大老板，张导说..." 这种文本作为 reply 再次发给员工自己。
    # 在 ai_agent.py 中，如果走的是工具 report_to_boss，其实 reply 是 "好的，已执行操作。"
    # 但如果由于某种原因 reply 被大模型生成了包含 "老板" 的话语，且当前是 employee，我们直接替换。
    if reply:
        if req.role == "employee" and ("老板" in reply or "汇报" in reply):
            # 如果大模型出现幻觉，把该发给老板的话当成了普通回复返回了，强制替换
            reply = "收到，情况我已了解，继续推进。"
            
        ai_msg = models.Message(project_id=req.project_id, session_id=req.session_id, sender_id="ai_producer", content=reply, target_role=req.role)
        db.add(ai_msg)
        db.commit()
    
    return {"reply": reply}

@app.get("/api/health")
def health():
    return get_config_snapshot()

@app.post("/api/relay")
def relay_to_role(req: RelayRequest, db: Session = Depends(get_db)):
    ai_to_target = models.Message(
        project_id=req.project_id,
        session_id=req.session_id,
        sender_id="ai_producer",
        content=req.content,
        target_role=req.target_role
    )
    db.add(ai_to_target)

    if req.target_role == "employee":
        boss_notice = models.Message(
            project_id=req.project_id,
            session_id=req.session_id,
            sender_id="ai_producer",
            content=f"已发送指令给员工，等待回复。",
            target_role="boss"
        )
        db.add(boss_notice)

    db.commit()
    return {"status": "ok"}

if __name__ == "__main__":
    uvicorn.run("main:app", host="127.0.0.1", port=8000, reload=True)
