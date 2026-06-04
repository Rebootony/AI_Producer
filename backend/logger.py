import json
import os
from datetime import datetime
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent
LOGS_DIR = BASE_DIR / "logs"

# Ensure logs directory exists
LOGS_DIR.mkdir(exist_ok=True)

CHAT_LOG_FILE = LOGS_DIR / "chat_history.jsonl"

def log_interaction(project_id: str, user_id: str, user_message: str, ai_response: str, tools_used: list = None):
    """
    专门用于测试和记录的 Logging 模块。
    将所有的对话、触发的工具以及时间戳写入到 JSONL 文件中，方便后续分析或回溯。
    """
    log_entry = {
        "timestamp": datetime.now().isoformat(),
        "project_id": project_id,
        "user_id": user_id,
        "user_message": user_message,
        "ai_response": ai_response,
        "tools_used": tools_used or []
    }
    
    with open(CHAT_LOG_FILE, "a", encoding="utf-8") as f:
        f.write(json.dumps(log_entry, ensure_ascii=False) + "\n")

def get_recent_logs(limit: int = 10) -> list:
    """获取最近的日志记录"""
    if not CHAT_LOG_FILE.exists():
        return []
    
    logs = []
    with open(CHAT_LOG_FILE, "r", encoding="utf-8") as f:
        for line in f:
            if line.strip():
                logs.append(json.loads(line))
    
    return logs[-limit:]
