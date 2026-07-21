from fastapi import FastAPI, HTTPException, Depends, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response, FileResponse
from pydantic import BaseModel
from pathlib import Path
from urllib.parse import quote as _urlquote
import time as _time
import re as _re
import uvicorn
from sqlalchemy.orm import Session
from sqlalchemy import or_, func, text
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

from datetime import date as _date

# 初始化默认数据
def init_db(db: Session):
    # 演示用：把交付日锚定在"今天 + 16 天"，让排期始终呈现"进行中"的活态（而非全部已完成）
    demo_delivery = (_date.today() + timedelta(days=16)).strftime("%Y-%m-%d")
    if not db.query(models.User).first():
        boss = models.User(id="boss", role="boss", name="创始人/老板")
        employee = models.User(id="employee", role="employee", name="执行团队/张导")
        ai = models.User(id="ai_producer", role="ai", name="诺亚")
        db.add_all([boss, employee, ai])

    project = db.query(models.Project).filter(models.Project.id == "p1").first()
    if not project:
        project = models.Project(
            id="p1", name="达梦英文宣传片", status="planning", budget=0.0,
            client="武汉达梦数据库股份有限公司", industry="IT-基础软件",
            goal="品牌升级与营销传播：传递达梦品牌全球定位，呈现技术价值与行业影响力",
            delivery_date=demo_delivery,
            film_type="英文宣传片", duration_minutes=2, difficulty="中", shoot_days=3,
            margin_rate=0.25, tax_rate=0.01, generated=0,
            brief_text=(
                "客户：武汉达梦数据库股份有限公司（国企，IT-基础软件）。预算 20-30 万。交付：见排期表。"
                "核心目标：清晰传递达梦品牌的全球定位（数据产品&解决方案提供商），呈现技术价值与行业影响力。"
                "内容：兼具技术专业性与科技感，含品牌立意、展现身份与实力、技术如何改变现实、升华品牌价值。"
                "应用场景：发布会、展会、拜访客户、自媒体平台。影片：英文宣传片，约 2 分钟，拍摄 3 天。"
            ),
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

    # 第二个项目：泰康之家·海琴府（用真实成本单反推演示；完整 Brief 待补）
    p2 = db.query(models.Project).filter(models.Project.id == "p2").first()
    if not p2:
        p2 = models.Project(
            id="p2", name="泰康之家·海琴府", status="planning", budget=0.0,
            client="泰康之家·海琴府", industry="高端康养地产",
            goal="呈现高端康养社区的品质生活与品牌温度",
            delivery_date=(_date.today() + timedelta(days=24)).strftime("%Y-%m-%d"),
            film_type="品牌宣传片", duration_minutes=6, difficulty="中", shoot_days=3,
            margin_rate=0.25, tax_rate=0.01, generated=0,
            brief_text=("【占位 Brief】泰康之家·海琴府 高端康养社区品牌宣传片，约 6 分钟，拍摄 3 天。"
                        "注：完整客户 Brief 与商务沟通记录待成永强提供，当前先用真实成本单反推做演示。"),
        )
        db.add(p2)
        db.commit()
        db.add(models.Asset(project_id="p2", name="泰康-项目费用(成本单)", asset_type="Excel"))
        db.commit()

def _migrate():
    """对已存在的库做轻量迁移（SQLite ADD COLUMN，不丢数据）。"""
    with engine.connect() as conn:
        for stmt in ["ALTER TABLE assets ADD COLUMN file_path VARCHAR",
                     "ALTER TABLE assets ADD COLUMN kind VARCHAR DEFAULT 'upload'",
                     "ALTER TABLE quote_items ADD COLUMN client_unit_price FLOAT DEFAULT 0",
                     "ALTER TABLE quote_items ADD COLUMN is_locked INTEGER DEFAULT 0",
                     "ALTER TABLE tasks ADD COLUMN start_date VARCHAR DEFAULT ''",
                     "ALTER TABLE tasks ADD COLUMN collaborators VARCHAR DEFAULT ''",
                     "ALTER TABLE tasks ADD COLUMN background VARCHAR DEFAULT ''",
                     "ALTER TABLE tasks ADD COLUMN requirements VARCHAR DEFAULT ''",
                     "ALTER TABLE tasks ADD COLUMN ref_material VARCHAR DEFAULT ''",
                     "ALTER TABLE tasks ADD COLUMN depends_on INTEGER",
                     "ALTER TABLE tasks ADD COLUMN submission_file VARCHAR DEFAULT ''",
                     "ALTER TABLE tasks ADD COLUMN submission_filename VARCHAR DEFAULT ''",
                     "ALTER TABLE tasks ADD COLUMN submitted_at VARCHAR DEFAULT ''",
                     "ALTER TABLE tasks ADD COLUMN submitter VARCHAR DEFAULT ''"]:
            try:
                conn.execute(text(stmt))
                conn.commit()
            except Exception:
                pass

# 在启动时初始化数据
@app.on_event("startup")
def on_startup():
    _migrate()
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

class CreateProjectRequest(BaseModel):
    name: str
    client: str = "未知客户"
    industry: str = "未知行业"
    goal: str = "品牌宣传"
    delivery_date: str = ""
    film_type: str = "宣传片"
    duration_minutes: float = 5
    shoot_days: int = 2
    brief_text: str = ""

@app.get("/api/projects")
def list_projects(db: Session = Depends(get_db)):
    rows = db.query(models.Project).all()
    return {"projects": [{
        "id": p.id, "name": p.name, "client": p.client, "industry": p.industry,
        "delivery_date": p.delivery_date, "generated": bool(p.generated),
        "client_price": p.client_price, "status": p.status,
    } for p in rows]}

@app.post("/api/projects")
def create_project(req: CreateProjectRequest, db: Session = Depends(get_db)):
    existing = {p.id for p in db.query(models.Project).all()}
    n = 1
    while f"p{n}" in existing:
        n += 1
    pid = f"p{n}"
    delivery = req.delivery_date or (_date.today() + timedelta(days=30)).strftime("%Y-%m-%d")
    project = models.Project(
        id=pid, name=req.name, client=req.client, industry=req.industry, goal=req.goal,
        delivery_date=delivery, film_type=req.film_type, duration_minutes=req.duration_minutes,
        shoot_days=req.shoot_days, margin_rate=0.25, tax_rate=0.01, generated=0,
        status="planning", budget=0.0, brief_text=req.brief_text or "",
    )
    db.add(project)
    db.commit()
    return {"status": "ok", "id": pid, "name": project.name}

@app.delete("/api/projects/{project_id}")
def delete_project(project_id: str, db: Session = Depends(get_db)):
    project = db.query(models.Project).filter(models.Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    for M in (models.QuoteItem, models.ScheduleItem, models.Message, models.Asset,
              models.ChatThread, models.BudgetBreakdown, models.Crew):
        db.query(M).filter(M.project_id == project_id).delete()
    db.delete(project)
    db.commit()
    return {"status": "ok"}

@app.get("/api/projects/{project_id}")
def get_project(project_id: str, db: Session = Depends(get_db)):
    project = db.query(models.Project).filter(models.Project.id == project_id).first()
    if project:
        return {
            "id": project.id, "name": project.name, "status": project.status,
            "budget": project.budget, "client": project.client, "industry": project.industry,
            "goal": project.goal, "delivery_date": project.delivery_date,
            "film_type": project.film_type, "duration_minutes": project.duration_minutes,
            "difficulty": project.difficulty, "shoot_days": project.shoot_days,
            "cost_total": project.cost_total, "tax_rate": project.tax_rate,
            "margin_rate": project.margin_rate, "client_price": project.client_price,
            "brief_text": project.brief_text, "generated": bool(project.generated),
        }
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
def get_threads(project_id: str, role: Optional[str] = None, user_id: Optional[str] = None, db: Session = Depends(get_db)):
    # 为了简化，我们依然复用原来基于 messages 表推导 session 的逻辑，但也结合 ChatThread 表
    # 如果要完全重构，就直接从 ChatThread 表里查。
    # 这里我们返回所有的 thread 列表，并附加 unreadCount。
    threads_q = db.query(models.ChatThread).filter(models.ChatThread.project_id == project_id)
    if user_id:
        threads_q = threads_q.filter(models.ChatThread.user_id == user_id)
    threads_db = threads_q.all()
    threads_dict = {t.id: {"id": t.id, "name": t.name, "timestamp": ensure_tz(t.updated_at), "unreadCount": 0} for t in threads_db}
    
    # 默认存在一个 "default" session，为了兼容之前的逻辑
    if "default" not in threads_dict:
        threads_dict["default"] = {"id": "default", "name": "主频道", "timestamp": models.get_utc_8(), "unreadCount": 0}

    messages_q = db.query(models.Message).filter(models.Message.project_id == project_id)
    if user_id:
        messages_q = messages_q.filter(
            or_(
                models.Message.session_id == "default",
                models.Message.sender_id == user_id
            )
        )
    messages = messages_q.all()
    for m in messages:
        m_ts = ensure_tz(m.timestamp)
        if m.session_id not in threads_dict:
            if m.session_id == "default":
                continue
            if user_id and m.sender_id != user_id:
                continue
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
    if thread_id == "default":
        return {"status": "error", "message": "主频道不可重命名"}
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

@app.delete("/api/messages/{project_id}")
def clear_messages(project_id: str, session_id: str = "default", db: Session = Depends(get_db)):
    """清空某项目某会话的对话记录（仅在用户主动点击时调用）。"""
    db.query(models.Message).filter(
        models.Message.project_id == project_id,
        models.Message.session_id == session_id
    ).delete()
    db.commit()
    return {"status": "ok"}

@app.get("/api/messages_global")
def get_messages_global(role: Optional[str] = None, db: Session = Depends(get_db)):
    query = db.query(models.Message)
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
        unread_messages = [m for m in messages if m.target_role == role and m.is_read == 0 and m.sender_id == "ai_producer"]
        for m in unread_messages:
            m.is_read = 1
        if unread_messages:
            db.commit()

    res = []
    for m in messages:
        r = "ai"
        if role and m.sender_id == role:
            r = "user"
        elif m.sender_id == "employee" and role == "boss":
            r = "employee"
        res.append({
            "id": m.id,
            "role": r,
            "content": m.content,
            "user_id": m.sender_id,
            "timestamp": ensure_tz(m.timestamp),
            "project_id": m.project_id
        })
    return {"messages": res}

@app.get("/api/unread_counts")
def get_unread_counts(role: str, db: Session = Depends(get_db)):
    rows = db.query(models.Message.project_id, func.count(models.Message.id)).filter(
        models.Message.sender_id == "ai_producer",
        models.Message.target_role == role,
        models.Message.is_read == 0
    ).group_by(models.Message.project_id).all()
    counts = {pid: int(cnt) for pid, cnt in rows}
    return {"counts": counts}

from ai_agent import chat_with_llm, get_config_snapshot, extract_brief_params
import pricing_engine

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
    # 强制修复：如果是员工发消息，且 AI 成功汇报了，不应该把 "老板，张导说..." 这种文本作为 reply 再次发给员工自己。
    # 在 ai_agent.py 中，如果走的是工具 report_to_boss，其实 reply 是 "好的，已执行操作。"
    # 但如果由于某种原因 reply 被大模型生成了包含 "老板" 的话语，且当前是 employee，我们直接替换。
    if reply:
        # 仅当回复明显是"对老板说的话"误发给员工时才拦截（避免误伤正常含"老板"二字的内容，如超支需走专项审批）
        _r = reply.strip()
        if req.role == "employee" and (_r.startswith("老板") or "向老板汇报" in _r or "跟老板说" in _r or "已向老板" in _r):
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

import quote_service

class GenerateRequest(BaseModel):
    brief_text: Optional[str] = None
    business_notes: Optional[str] = None

class MarginRequest(BaseModel):
    margin_rate: float

class TaxRequest(BaseModel):
    rate: float

class QuoteItemUpdate(BaseModel):
    unit_price: Optional[float] = None
    qty_people: Optional[float] = None
    qty_days: Optional[float] = None
    client_unit_price: Optional[float] = None
    is_locked: Optional[bool] = None
    item_name: Optional[str] = None

class QuoteItemCreate(BaseModel):
    phase: str = "D"
    item_name: str = "新增项"
    unit_price: float = 0
    qty_people: float = 1
    qty_days: float = 1
    unit: str = "项"
    client_unit_price: Optional[float] = None

@app.post("/api/projects/{project_id}/generate")
def generate_project(project_id: str, req: GenerateRequest, db: Session = Depends(get_db)):
    """从 Brief 一键生成报价 + 排期（确定性引擎算钱）。"""
    project = db.query(models.Project).filter(models.Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    if req.brief_text:
        project.brief_text = req.brief_text
        db.commit()
    # 新项目（无内置档案）且有 Brief：让大模型抽参数，使报价随 Brief 变化
    params = None
    if project.brief_text and project_id not in pricing_engine.PROJECT_PROFILES:
        params = extract_brief_params(project.brief_text)
    totals = quote_service.generate_for_project(db, project_id, dynamic_params=params)
    return {
        "status": "ok",
        "totals": totals,
        "params": params,
        "quote": quote_service.serialize_quote(db, project_id),
        "schedule": quote_service.serialize_schedule(db, project_id),
    }

@app.get("/api/projects/{project_id}/quote")
def get_quote(project_id: str, db: Session = Depends(get_db)):
    return quote_service.serialize_quote(db, project_id)

@app.get("/api/projects/{project_id}/schedule")
def get_schedule(project_id: str, db: Session = Depends(get_db)):
    return quote_service.serialize_schedule(db, project_id)

@app.get("/api/projects/{project_id}/assets")
def get_assets(project_id: str, db: Session = Depends(get_db)):
    rows = db.query(models.Asset).filter(models.Asset.project_id == project_id).all()
    return {"assets": [{
        "id": a.id, "name": a.name, "type": (a.asset_type or "FILE"),
        "kind": (a.kind or "upload"), "downloadable": bool(a.file_path),
    } for a in rows]}

UPLOAD_DIR = Path(__file__).resolve().parent / "uploads"

def _save_upload(project_id: str, filename: str, raw: bytes) -> str:
    safe = _re.sub(r"[^\w.\-一-鿿]", "_", filename or "file")
    d = UPLOAD_DIR / project_id
    d.mkdir(parents=True, exist_ok=True)
    p = d / f"{int(_time.time() * 1000)}_{safe}"
    p.write_bytes(raw)
    return str(p)

def _xlsx_response(data: bytes, filename: str) -> Response:
    dispo = f"attachment; filename*=UTF-8''{_urlquote(filename)}"
    return Response(content=data,
                    media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                    headers={"Content-Disposition": dispo})

@app.get("/api/projects/{project_id}/quote.xlsx")
def export_quote(project_id: str, version: str = "client", db: Session = Depends(get_db)):
    import excel_export
    project = db.query(models.Project).filter(models.Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    data = excel_export.build_quote_xlsx(db, project_id, version=version)
    tag = "内部版" if version == "internal" else "客户版"
    return _xlsx_response(data, f"{project.name}-报价单({tag}).xlsx")

@app.get("/api/projects/{project_id}/schedule.xlsx")
def export_schedule(project_id: str, db: Session = Depends(get_db)):
    import excel_export
    project = db.query(models.Project).filter(models.Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    data = excel_export.build_schedule_xlsx(db, project_id)
    return _xlsx_response(data, f"{project.name}-执行排期.xlsx")

@app.post("/api/projects/{project_id}/assets/upload")
async def upload_asset(project_id: str, file: UploadFile = File(...), db: Session = Depends(get_db)):
    project = db.query(models.Project).filter(models.Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    raw = await file.read()
    path = _save_upload(project_id, file.filename, raw)
    ext = (file.filename.rsplit(".", 1)[-1].upper() if "." in (file.filename or "") else "FILE")
    a = models.Asset(project_id=project_id, name=file.filename or "文件", asset_type=ext,
                     file_path=path, kind="upload")
    db.add(a)
    db.commit()
    return {"status": "ok", "id": a.id, "name": a.name}

@app.get("/api/projects/{project_id}/assets/{asset_id}/download")
def download_asset(project_id: str, asset_id: int, db: Session = Depends(get_db)):
    a = db.query(models.Asset).filter(models.Asset.id == asset_id,
                                      models.Asset.project_id == project_id).first()
    if not a or not a.file_path or not Path(a.file_path).exists():
        raise HTTPException(status_code=404, detail="文件不存在或未存储原件")
    dispo = f"attachment; filename*=UTF-8''{_urlquote(a.name)}"
    return FileResponse(a.file_path, headers={"Content-Disposition": dispo})

@app.put("/api/projects/{project_id}/margin")
def update_margin(project_id: str, req: MarginRequest, db: Session = Depends(get_db)):
    totals = quote_service.set_margin(db, project_id, req.margin_rate)
    return {"status": "ok", "totals": totals}

@app.put("/api/projects/{project_id}/tax")
def update_tax(project_id: str, req: TaxRequest, db: Session = Depends(get_db)):
    return {"status": "ok", "result": quote_service.set_tax_rate(db, project_id, req.rate)}

@app.put("/api/projects/{project_id}/quote/items/{item_id}")
def update_quote_item_api(project_id: str, item_id: int, req: QuoteItemUpdate, db: Session = Depends(get_db)):
    res = quote_service.update_quote_item(
        db, project_id, item_id=item_id,
        unit_price=req.unit_price, qty_people=req.qty_people, qty_days=req.qty_days,
        client_unit_price=req.client_unit_price, is_locked=req.is_locked, new_name=req.item_name,
    )
    if not res.get("ok"):
        raise HTTPException(status_code=404, detail=res.get("msg", "Quote item not found"))
    return {"status": "ok", "result": res, "quote": quote_service.serialize_quote(db, project_id)}

@app.post("/api/projects/{project_id}/quote/items")
def add_quote_item_api(project_id: str, req: QuoteItemCreate, db: Session = Depends(get_db)):
    res = quote_service.add_quote_item(
        db, project_id, phase=req.phase, item_name=req.item_name, unit_price=req.unit_price,
        qty_people=req.qty_people, qty_days=req.qty_days, unit=req.unit,
        client_unit_price=req.client_unit_price)
    return {"status": "ok", "result": res, "quote": quote_service.serialize_quote(db, project_id)}

@app.delete("/api/projects/{project_id}/quote/items/{item_id}")
def delete_quote_item_api(project_id: str, item_id: int, db: Session = Depends(get_db)):
    res = quote_service.delete_quote_item(db, project_id, item_id)
    return {"status": "ok", "result": res, "quote": quote_service.serialize_quote(db, project_id)}

class TargetRequest(BaseModel):
    target_client_price: Optional[float] = None
    target_margin: Optional[float] = None   # 毛利率 0-0.95

@app.put("/api/projects/{project_id}/quote/target")
def set_quote_target(project_id: str, req: TargetRequest, db: Session = Depends(get_db)):
    if req.target_client_price is not None:
        res = quote_service.set_target_client_price(db, project_id, req.target_client_price)
    elif req.target_margin is not None:
        res = quote_service.set_target_margin(db, project_id, req.target_margin)
    else:
        res = {"ok": False, "msg": "请提供目标实收或目标毛利率"}
    return {"status": "ok", "result": res, "quote": quote_service.serialize_quote(db, project_id)}

class BriefRequest(BaseModel):
    brief_text: str

def _extract_brief_text(raw: bytes, filename: str) -> str:
    name = (filename or "").lower()
    if name.endswith(".pdf"):
        try:
            import io
            from pypdf import PdfReader
            reader = PdfReader(io.BytesIO(raw))
            return "\n".join((p.extract_text() or "") for p in reader.pages).strip()
        except Exception as e:
            return f"(PDF 解析失败：{e})"
    for enc in ("utf-8", "gbk", "latin-1"):
        try:
            return raw.decode(enc).strip()
        except Exception:
            continue
    return ""

def _resync_kanban_after_brief(db: Session, project: "models.Project") -> bool:
    """Brief 变更后保持看板一致：若已生成过报价，则按新 Brief 重新生成（保持一致性）。
    未生成的项目不动（等用户点"生成"）。"""
    if not project.generated:
        return False
    params = extract_brief_params(project.brief_text)
    quote_service.generate_for_project(db, project.id, dynamic_params=params, force_dynamic=True)
    return True

@app.put("/api/projects/{project_id}/brief")
def set_brief(project_id: str, req: BriefRequest, db: Session = Depends(get_db)):
    project = db.query(models.Project).filter(models.Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    project.brief_text = req.brief_text
    db.commit()
    regenerated = _resync_kanban_after_brief(db, project)
    return {"status": "ok", "brief_text": project.brief_text, "regenerated": regenerated}

@app.post("/api/projects/{project_id}/brief/upload")
async def upload_brief(project_id: str, file: UploadFile = File(...), db: Session = Depends(get_db)):
    project = db.query(models.Project).filter(models.Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    raw = await file.read()
    text = _extract_brief_text(raw, file.filename)
    if text:
        project.brief_text = text
    path = _save_upload(project_id, file.filename, raw)
    ext = (file.filename.rsplit(".", 1)[-1].upper() if "." in (file.filename or "") else "FILE")
    db.add(models.Asset(project_id=project_id, name=file.filename or "Brief", asset_type=ext,
                        file_path=path, kind="upload"))
    db.commit()
    regenerated = _resync_kanban_after_brief(db, project)
    return {"status": "ok", "filename": file.filename, "brief_text": project.brief_text, "regenerated": regenerated}

@app.get("/api/dashboard")
def dashboard(db: Session = Depends(get_db)):
    from datetime import date as _d
    today = _d.today().isoformat()
    projects = db.query(models.Project).all()
    items = []
    total_price = 0.0
    total_cost = 0.0
    risk = 0
    alerts = []   # Noah 提醒你：需关注的项目
    for p in projects:
        low_margin = bool(p.generated and (p.margin_rate or 0) < 0.15)
        overdue = db.query(models.Task).filter(
            models.Task.project_id == p.id, models.Task.deadline != "",
            models.Task.deadline < today, models.Task.status != "done").count()
        if low_margin:
            risk += 1
            alerts.append({"project_id": p.id, "name": p.name, "kind": "low_margin",
                           "text": f"{p.name} 的利润率偏低（{round((p.margin_rate or 0)*100)}%）"})
        if overdue > 0:
            alerts.append({"project_id": p.id, "name": p.name, "kind": "overdue",
                           "text": f"{p.name} 有 {overdue} 个执行节点已逾期"})
        items.append({
            "id": p.id, "name": p.name, "client": p.client, "industry": p.industry,
            "delivery_date": p.delivery_date, "generated": bool(p.generated),
            "client_price": p.client_price, "cost_total": p.cost_total,
            "margin_rate": p.margin_rate, "shoot_days": p.shoot_days, "overdue": overdue,
            "health": "warning" if (low_margin or overdue) else ("good" if p.generated else "planning"),
        })
        total_price += p.client_price or 0
        total_cost += p.cost_total or 0
    return {
        "projects": items, "count": len(projects),
        "total_client_price": total_price, "total_cost": total_cost,
        "total_profit": total_price - total_cost, "risk_count": risk,
        "alerts": alerts,
    }

class TaskNote(BaseModel):
    note: str = ""

class TaskUpdate(BaseModel):
    status: Optional[str] = None
    ai_note: Optional[str] = None
    priority: Optional[str] = None
    start_date: Optional[str] = None
    deadline: Optional[str] = None
    title: Optional[str] = None
    description: Optional[str] = None
    stage: Optional[str] = None
    deliverable: Optional[str] = None
    collaborators: Optional[str] = None
    background: Optional[str] = None
    requirements: Optional[str] = None
    ref_material: Optional[str] = None
    depends_on: Optional[int] = None

class TaskCreate(BaseModel):
    title: str = ""
    stage: Optional[str] = None
    start_date: Optional[str] = None
    deadline: Optional[str] = None
    priority: Optional[str] = None
    deliverable: Optional[str] = None
    depends_on: Optional[int] = None

class ProposalReq(BaseModel):
    summary: str = ""
    conclusion: Optional[str] = ""
    impact: Optional[str] = ""
    option_a: Optional[str] = ""
    option_b: Optional[str] = ""
    option_c: Optional[str] = ""
    recommend: Optional[str] = ""
    decision: Optional[str] = ""

class ProposalAct(BaseModel):
    action: str = "confirm"      # confirm / reject / need_more
    chosen: Optional[str] = ""   # A / B / C
    note: Optional[str] = ""

@app.get("/api/tasks")
def list_tasks(assignee: str = "employee", db: Session = Depends(get_db)):
    return quote_service.serialize_tasks(db, assignee)

@app.get("/api/projects/{project_id}/execution")
def project_execution(project_id: str, db: Session = Depends(get_db)):
    """Boss 端执行看板：项目进度 + 每条任务状态（含审核）。"""
    return quote_service.serialize_execution(db, project_id)

@app.get("/api/projects/{project_id}/dynamics")
def project_dynamics(project_id: str, db: Session = Depends(get_db)):
    """执行动态：以人为核心，每个成员当前在做什么。"""
    return quote_service.serialize_dynamics(db, project_id)

@app.get("/api/projects/{project_id}/task-schedule")
def project_task_schedule(project_id: str, db: Session = Depends(get_db)):
    """Boss 端排期编辑视图：全部任务（含开始/结束/依赖），与 /schedule(只读时间线) 区分。"""
    return quote_service.serialize_task_schedule(db, project_id)

@app.post("/api/projects/{project_id}/tasks")
def add_task_api(project_id: str, req: TaskCreate, db: Session = Depends(get_db)):
    return {"status": "ok", "result": quote_service.add_task(
        db, project_id, **req.dict(exclude_none=True))}

@app.delete("/api/tasks/{task_id}")
def delete_task_api(task_id: int, db: Session = Depends(get_db)):
    return {"status": "ok", "result": quote_service.delete_task(db, task_id)}

class MoveReq(BaseModel):
    direction: str = "up"   # up / down

@app.post("/api/tasks/{task_id}/move")
def move_task_api(task_id: int, req: MoveReq, db: Session = Depends(get_db)):
    return {"status": "ok", "result": quote_service.move_task(db, task_id, req.direction)}

@app.post("/api/projects/{project_id}/quote/items/{item_id}/move")
def move_quote_item_api(project_id: str, item_id: int, req: MoveReq, db: Session = Depends(get_db)):
    return {"status": "ok", "result": quote_service.move_quote_item(db, project_id, item_id, req.direction)}

@app.post("/api/tasks/{task_id}/submit")
def submit_task_api(task_id: int, req: TaskNote, db: Session = Depends(get_db)):
    return {"status": "ok", "result": quote_service.submit_task(db, task_id, req.note)}

@app.post("/api/tasks/{task_id}/upload")
async def upload_task_result(task_id: int, file: UploadFile = File(...),
                             note: str = "", submitter: str = "张导", db: Session = Depends(get_db)):
    """执行端上传成果文件 → 进入待审核（上传≠完成）。文件同时归档到项目资产。"""
    t = db.query(models.Task).filter(models.Task.id == task_id).first()
    if not t:
        raise HTTPException(status_code=404, detail="任务不存在")
    raw = await file.read()
    path = _save_upload(t.project_id, file.filename or "成果文件", raw)
    ext = (file.filename.rsplit(".", 1)[-1].upper() if "." in (file.filename or "") else "FILE")
    db.add(models.Asset(project_id=t.project_id, name=f"[{t.title}] {file.filename or '成果'}",
                        asset_type=ext, file_path=path, kind="submission"))
    res = quote_service.submit_task(db, task_id, note=note, filename=file.filename or "成果文件",
                                    file_path=path, submitter=submitter)
    return {"status": "ok", "result": res}

@app.get("/api/tasks/{task_id}/submission")
def download_submission(task_id: int, db: Session = Depends(get_db)):
    t = db.query(models.Task).filter(models.Task.id == task_id).first()
    if not t or not t.submission_file or not Path(t.submission_file).exists():
        raise HTTPException(status_code=404, detail="没有成果文件")
    dispo = f"attachment; filename*=UTF-8''{_urlquote(t.submission_filename or '成果文件')}"
    return FileResponse(t.submission_file, headers={"Content-Disposition": dispo})

@app.post("/api/tasks/{task_id}/approve")
def approve_task_api(task_id: int, db: Session = Depends(get_db)):
    return {"status": "ok", "result": quote_service.approve_task(db, task_id)}

@app.post("/api/tasks/{task_id}/reject")
def reject_task_api(task_id: int, req: TaskNote, db: Session = Depends(get_db)):
    return {"status": "ok", "result": quote_service.reject_task(db, task_id, req.note)}

@app.post("/api/tasks/{task_id}/feedback")
def task_feedback_api(task_id: int, req: TaskNote, db: Session = Depends(get_db)):
    return {"status": "ok", "result": quote_service.task_feedback(db, task_id, req.note)}

@app.put("/api/tasks/{task_id}")
def update_task_api(task_id: int, req: TaskUpdate, db: Session = Depends(get_db)):
    return {"status": "ok", "result": quote_service.update_task(
        db, task_id, **req.dict(exclude_none=True))}

# —— 决策方案卡片（§3.6）——
@app.get("/api/projects/{project_id}/proposals")
def list_proposals_api(project_id: str, only_pending: bool = True, db: Session = Depends(get_db)):
    return quote_service.serialize_proposals(db, project_id, only_pending)

@app.post("/api/projects/{project_id}/proposals")
def create_proposal_api(project_id: str, req: ProposalReq, db: Session = Depends(get_db)):
    return {"status": "ok", "result": quote_service.create_proposal(db, project_id, **req.dict())}

@app.post("/api/proposals/{proposal_id}/act")
def act_proposal_api(proposal_id: int, req: ProposalAct, db: Session = Depends(get_db)):
    return {"status": "ok", "result": quote_service.act_on_proposal(
        db, proposal_id, req.action, req.chosen or "", req.note or "")}

class TeamMemberReq(BaseModel):
    name: str = "新成员"
    role: str = "成员"
    stage: str = "全程"

class TeamMemberPatch(BaseModel):
    name: Optional[str] = None
    role: Optional[str] = None
    stage: Optional[str] = None
    is_pm: Optional[bool] = None

class GroupReq(BaseModel):
    name: str
    members: str = ""
    purpose: str = ""

@app.get("/api/projects/{project_id}/team")
def get_team(project_id: str, db: Session = Depends(get_db)):
    return quote_service.serialize_team(db, project_id)

@app.post("/api/projects/{project_id}/team")
def add_team_member(project_id: str, req: TeamMemberReq, db: Session = Depends(get_db)):
    rows = db.query(models.TeamMember).filter(models.TeamMember.project_id == project_id).all()
    nxt = max([r.sort_order for r in rows], default=0) + 1
    db.add(models.TeamMember(project_id=project_id, name=req.name, role=req.role, stage=req.stage, sort_order=nxt))
    db.commit()
    return {"status": "ok", "team": quote_service.serialize_team(db, project_id)}

@app.put("/api/projects/{project_id}/team/{member_id}")
def update_team_member(project_id: str, member_id: int, req: TeamMemberPatch, db: Session = Depends(get_db)):
    m = db.query(models.TeamMember).filter(models.TeamMember.id == member_id, models.TeamMember.project_id == project_id).first()
    if not m:
        raise HTTPException(status_code=404, detail="成员不存在")
    if req.is_pm is True:
        # 一个项目只有一个项目经理
        for other in db.query(models.TeamMember).filter(models.TeamMember.project_id == project_id).all():
            other.is_pm = 0
        m.is_pm = 1
    elif req.is_pm is False:
        m.is_pm = 0
    for k in ("name", "role", "stage"):
        v = getattr(req, k)
        if v is not None:
            setattr(m, k, v)
    db.commit()
    return {"status": "ok", "team": quote_service.serialize_team(db, project_id)}

@app.delete("/api/projects/{project_id}/team/{member_id}")
def delete_team_member(project_id: str, member_id: int, db: Session = Depends(get_db)):
    db.query(models.TeamMember).filter(models.TeamMember.id == member_id, models.TeamMember.project_id == project_id).delete()
    db.commit()
    quote_service._ensure_team(db, project_id)  # 删了PM自动补
    return {"status": "ok", "team": quote_service.serialize_team(db, project_id)}

@app.post("/api/projects/{project_id}/groups")
def create_group(project_id: str, req: GroupReq, db: Session = Depends(get_db)):
    db.add(models.ProjectGroup(project_id=project_id, name=req.name, members=req.members, purpose=req.purpose))
    db.commit()
    return {"status": "ok", "team": quote_service.serialize_team(db, project_id)}

@app.delete("/api/projects/{project_id}/groups/{group_id}")
def delete_group(project_id: str, group_id: int, db: Session = Depends(get_db)):
    db.query(models.ProjectGroup).filter(models.ProjectGroup.id == group_id, models.ProjectGroup.project_id == project_id).delete()
    db.commit()
    return {"status": "ok", "team": quote_service.serialize_team(db, project_id)}

if __name__ == "__main__":
    uvicorn.run("main:app", host="127.0.0.1", port=8000, reload=True)
