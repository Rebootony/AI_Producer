import sys
import json
from sqlalchemy.orm import Session
from database import get_db
from ai_agent import chat_with_llm
from prompt_manager import get_full_system_prompt
from logger import get_recent_logs

def test_chat(user_message: str, user_id="boss"):
    print(f"\n[{'='*40}]")
    print(f"👤 模拟用户[{user_id}]输入: {user_message}")
    print(f"[{'-'*40}]")
    
    db: Session = next(get_db())
    response = chat_with_llm(user_message, user_id=user_id, project_id="p1", session_id="test_session", db=db)
    
    print(f"🤖 AI 回复: {response}")
    print(f"[{'='*40}]\n")

def show_logs():
    print("\n--- 最近的聊天日志 ---")
    logs = get_recent_logs(5)
    for log in logs:
        print(f"[{log['timestamp']}]")
        print(f"👤[{log['user_id']}]: {log['user_message']}")
        if log['tools_used']:
            print(f"🔧 (Tools: {', '.join(log['tools_used'])})")
        print(f"🤖: {log['ai_response']}\n")
    print("----------------------\n")

def show_prompt():
    print("\n--- 当前完整的 System Prompt ---")
    print(get_full_system_prompt())
    print("--------------------------------\n")

if __name__ == "__main__":
    if len(sys.argv) > 1:
        command = sys.argv[1]
        if command == "logs":
            show_logs()
        elif command == "prompt":
            show_prompt()
        elif command == "chat" and len(sys.argv) > 2:
            test_chat(sys.argv[2])
        else:
            print("用法: ")
            print("  python test_agent.py chat '你的问题'")
            print("  python test_agent.py logs")
            print("  python test_agent.py prompt")
    else:
        # 默认执行一个测试流程
        test_chat("去问一下张导风险点", "boss")
        test_chat("目前还没什么风险，明天可以顺利开拍", "employee")
        show_logs()
