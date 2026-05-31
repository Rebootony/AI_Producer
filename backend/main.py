from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import uvicorn

app = FastAPI(title="AI Producer Backend")

# 配置 CORS，允许前端跨域请求
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # 实际生产环境中应替换为前端的具体域名
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 临时内存存储（后续可接入 SQLite 或数据库）
chat_history = []
projects_db = {}

class ChatRequest(BaseModel):
    message: str
    user_id: str
    role: str # 'boss' 或 'employee'

@app.get("/")
def read_root():
    return {"status": "ok", "message": "AI Producer Backend is running."}

@app.post("/api/chat")
def chat_with_ai(req: ChatRequest):
    """
    处理与大模型的对话，并维持记忆
    （此处为骨架，后续将接入硅基流动API并执行 Function Calling）
    """
    chat_history.append({"role": "user", "content": req.message, "user_id": req.user_id})
    
    # 模拟大模型回复
    reply = f"【AI制片收到】（当前为后端模拟回复，尚未接入LLM）。您作为 {req.role} 说：{req.message}"
    
    chat_history.append({"role": "assistant", "content": reply, "user_id": "ai_producer"})
    
    return {"reply": reply}

if __name__ == "__main__":
    uvicorn.run("main:app", host="127.0.0.1", port=8000, reload=True)