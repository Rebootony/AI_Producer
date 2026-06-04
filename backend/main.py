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

# 初始化默认数据
def init_db(db: Session):
    if not db.query(models.User).first():
        boss = models.User(id="boss", role="boss", name="创始人/老板")
        employee = models.User(id="employee", role="employee", name="执行团队/张导")
        ai = models.User(id="ai_producer", role="ai", name="AI 制片人")
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

@app.get("/api/messages/{project_id}/sessions")
def get_sessions(project_id: str, db: Session = Depends(get_db)):
    # Group by session_id and get the latest message timestamp
    # Since sqlite doesn't easily support simple group by with latest in ORM, we can do it via a subquery or python side
    messages = db.query(models.Message).filter(models.Message.project_id == project_id).all()
    sessions = {}
    for m in messages:
        if m.session_id not in sessions:
            sessions[m.session_id] = {"id": m.session_id, "timestamp": m.timestamp}
        else:
            if m.timestamp > sessions[m.session_id]["timestamp"]:
                sessions[m.session_id]["timestamp"] = m.timestamp
    
    # Sort sessions by timestamp desc
    sorted_sessions = sorted(sessions.values(), key=lambda x: x["timestamp"], reverse=True)
    return {"sessions": sorted_sessions}

@app.delete("/api/messages/{project_id}/{session_id}")
def delete_session(project_id: str, session_id: str, db: Session = Depends(get_db)):
    db.query(models.Message).filter(models.Message.project_id == project_id, models.Message.session_id == session_id).delete()
    db.commit()
    return {"status": "ok"}

@app.get("/api/messages/{project_id}")
def get_messages(project_id: str, session_id: str = "default", role: Optional[str] = None, db: Session = Depends(get_db)):
    query = db.query(models.Message).filter(
        models.Message.project_id == project_id,
        models.Message.session_id == session_id
    )
    if role:
        # 如果是某个角色获取消息，他们能看到：
        # 1. 目标角色是他们的消息 (target_role == role)
        # 2. 目标角色是所有人/没有特定角色的消息 (target_role == None)
        # 3. 发送者是他们自己的消息 (sender_id == role) -> 虽然通常发送给自己不需要过滤，但为了完整性。最重要的还是 1 和 2。
        # 重点修正：员工应该能看到老板让 AI 发给员工的消息（target_role == 'employee'）。
        query = query.filter(
            or_(
                models.Message.target_role == None, 
                models.Message.target_role == role,
                models.Message.sender_id == role
            )
        )
    messages = query.order_by(models.Message.timestamp.asc()).all()
    return {"messages": [{"id": m.id, "role": m.sender.role, "content": m.content, "user_id": m.sender_id, "timestamp": m.timestamp} for m in messages]}

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
            content=f"【AI已主动联系员工】{req.content}",
            target_role="boss"
        )
        db.add(boss_notice)

    db.commit()
    return {"status": "ok"}

if __name__ == "__main__":
    uvicorn.run("main:app", host="127.0.0.1", port=8000, reload=True)
