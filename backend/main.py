from fastapi import FastAPI, HTTPException, Depends
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import uvicorn
from sqlalchemy.orm import Session
from database import engine, Base, get_db
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
        
        project = models.Project(id="demo_project", name="达梦宣传片", status="planning", budget=300000)
        db.add(project)
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
    project_id: str = "demo_project"

@app.get("/")
def read_root():
    return {"status": "ok", "message": "AI Producer Backend is running."}

@app.get("/api/projects/{project_id}")
def get_project(project_id: str, db: Session = Depends(get_db)):
    project = db.query(models.Project).filter(models.Project.id == project_id).first()
    if project:
        return {"id": project.id, "name": project.name, "status": project.status, "budget": project.budget}
    raise HTTPException(status_code=404, detail="Project not found")

@app.get("/api/messages/{project_id}")
def get_messages(project_id: str, db: Session = Depends(get_db)):
    messages = db.query(models.Message).filter(models.Message.project_id == project_id).order_by(models.Message.timestamp.asc()).all()
    return {"messages": [{"role": m.sender.role, "content": m.content, "user_id": m.sender_id, "timestamp": m.timestamp} for m in messages]}

from ai_agent import chat_with_llm

@app.post("/api/chat")
def chat_with_ai(req: ChatRequest, db: Session = Depends(get_db)):
    """
    处理与大模型的对话，并维持记忆
    """
    # 存入用户消息
    user_msg = models.Message(project_id=req.project_id, sender_id=req.user_id, content=req.message)
    db.add(user_msg)
    db.commit()
    
    # 调用大模型并执行 Function Calling
    reply = chat_with_llm(req.message, req.user_id, req.project_id, db)
    
    # 存入 AI 回复
    ai_msg = models.Message(project_id=req.project_id, sender_id="ai_producer", content=reply)
    db.add(ai_msg)
    db.commit()
    
    return {"reply": reply}

if __name__ == "__main__":
    uvicorn.run("main:app", host="127.0.0.1", port=8000, reload=True)