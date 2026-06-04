import sys
import json
from sqlalchemy.orm import Session
from database import get_db
from ai_agent import chat_with_llm
from prompt_manager import get_full_system_prompt
from logger import get_recent_logs

def test_chat(user_message: str):
    print(f"\n[{'='*40}]")
    print(f"👤 模拟用户输入: {user_message}")
    print(f"[{'-'*40}]")
    
    db: Session = next(get_db())
    response = chat_with_llm(user_message, user_id="boss", project_id="p1", session_id="test_session", db=db)
    
    print(f"🤖 AI 回复: {response}")
    print(f"[{'='*40}]\n")

def show_logs():
    print("\n--- 最近的聊天日志 ---")
    logs = get_recent_logs(5)
    for log in logs:
        print(f"[{log['timestamp']}]")
        print(f"👤: {log['user_message']}")
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
        test_chat("达梦这个项目总预算多少？")
        test_chat("以后都叫我大老板")
        # 重新测试问候
        test_chat("你好，我是谁？")
        show_prompt()
        show_logs()
