import json
import os
from openai import OpenAI
from sqlalchemy.orm import Session
from dotenv import load_dotenv
import models

load_dotenv()

BASE_URL = os.getenv("LLM_BASE_URL", "https://api.siliconflow.cn/v1")
API_KEY = os.getenv("SILICONFLOW_API_KEY", "")
MODEL_NAME = os.getenv("LLM_MODEL", "deepseek-ai/DeepSeek-R1-0528-Qwen3-8B") #免费

if not API_KEY:
    API_KEY = "ollama"

client = OpenAI(api_key=API_KEY, base_url=BASE_URL)

SYSTEM_PROMPT = """你是一个专业的“AI制片人”。你现在在一个广告制片管理系统中工作。
当前 Demo 只有两个真实角色：老板（boss）与员工（employee）。其它角色为占位符，不参与真实流程。
你可以和老板沟通，也可以和员工沟通。每次对话系统会自动传入当前聊天的项目ID (project_id)，如果用户让你“增加预算”或“推进进度”，请直接使用系统传入的 project_id，不要再向用户询问项目编号。
当老板要求你“询问员工/催促/转达”时，请主动调用 transfer_message 向员工发起会话；当员工给出回复时，请将核心信息回传给老板。
你有能力通过调用工具（Function Calling）来实际操作系统的后端数据：
1. modify_budget: 修改项目的预算
2. update_project_stage: 推进项目的执行阶段
3. transfer_message: 向不在场的其他角色传话或派发任务
4. get_project_status: 获取当前项目预算与阶段信息

你的回复应当专业、简洁、像真实的制片人。当需要修改预算或推进进度，或向他人传话时，请调用相应的工具。
"""

tools = [
    {
        "type": "function",
        "function": {
            "name": "modify_budget",
            "description": "修改项目的预算。当老板同意增加预算或员工报销超支时调用。",
            "parameters": {
                "type": "object",
                "properties": {
                    "project_id": {"type": "string"},
                    "amount": {"type": "number", "description": "增加或减少的金额，正数为增加，负数为减少"},
                    "reason": {"type": "string", "description": "修改预算的原因"}
                },
                "required": ["project_id", "amount", "reason"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "update_project_stage",
            "description": "推进或更新项目的执行阶段（planning, shooting, post_production）",
            "parameters": {
                "type": "object",
                "properties": {
                    "project_id": {"type": "string"},
                    "new_stage": {"type": "string", "enum": ["planning", "shooting", "post_production"]}
                },
                "required": ["project_id", "new_stage"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "transfer_message",
            "description": "向指定的其他角色传话或派发任务（例如老板让你告诉导演明天开会）",
            "parameters": {
                "type": "object",
                "properties": {
                    "project_id": {"type": "string"},
                    "target_role": {"type": "string", "description": "目标角色的ID，如 'employee' 或 'boss'"},
                    "content": {"type": "string", "description": "要传达的具体内容"}
                },
                "required": ["project_id", "target_role", "content"]
            }
        }
    }
    ,
    {
        "type": "function",
        "function": {
            "name": "get_project_status",
            "description": "获取项目当前预算与阶段信息",
            "parameters": {
                "type": "object",
                "properties": {
                    "project_id": {"type": "string"}
                },
                "required": ["project_id"]
            }
        }
    }
]

def execute_function_call(name: str, args: dict, db: Session):
    if name == "modify_budget":
        project = db.query(models.Project).filter(models.Project.id == args["project_id"]).first()
        if project:
            project.budget += args["amount"]
            db.commit()
            return f"预算已修改，增加了 {args['amount']}，目前总预算为 {project.budget}。原因：{args['reason']}"
        return "找不到该项目"
    elif name == "update_project_stage":
        project = db.query(models.Project).filter(models.Project.id == args["project_id"]).first()
        if project:
            project.status = args["new_stage"]
            db.commit()
            return f"项目阶段已更新为：{args['new_stage']}"
        return "找不到该项目"
    elif name == "transfer_message":
        ai_msg = models.Message(
            project_id=args["project_id"],
            sender_id="ai_producer",
            content=f"【传达给 {args['target_role']}】：{args['content']}",
            target_role=args["target_role"]
        )
        db.add(ai_msg)
        db.commit()
        return f"已成功向 {args['target_role']} 传达消息。"
    elif name == "get_project_status":
        project = db.query(models.Project).filter(models.Project.id == args["project_id"]).first()
        if project:
            return f"项目 {project.id} 当前预算为 {project.budget}，阶段为 {project.status}。"
        return "找不到该项目"
    
    return "未知函数"

def chat_with_llm(user_message: str, user_id: str, project_id: str, db: Session) -> str:
    # 1. 获取历史记录（最近10条）
    history = db.query(models.Message).filter(models.Message.project_id == project_id).order_by(models.Message.timestamp.desc()).limit(10).all()
    history = list(reversed(history))
    
    messages = [{"role": "system", "content": SYSTEM_PROMPT + f"\n\n当前正在沟通的项目ID为: {project_id}"}]
    for msg in history:
        # 排除刚才用户刚发的那条（防止重复，假设外部已经存了），这里我们依赖外部先存用户消息，所以直接用
        role = "assistant" if msg.sender_id == "ai_producer" else "user"
        prefix = "" if role == "assistant" else f"[{msg.sender_id} 说] "
        messages.append({"role": role, "content": prefix + msg.content})
        
    try:
        response = client.chat.completions.create(
            model=MODEL_NAME,
            messages=messages,
            tools=tools,
            tool_choice="auto"
        )
        
        response_message = response.choices[0].message
        tool_calls = response_message.tool_calls
        
        # 如果大模型决定调用工具
        if tool_calls:
            # 这里简化处理，只执行第一个 tool_call，然后把结果告诉大模型让它总结
            tool_call = tool_calls[0]
            function_name = tool_call.function.name
            function_args = json.loads(tool_call.function.arguments)
            
            function_response = execute_function_call(function_name, function_args, db)
            
            messages.append(response_message)
            messages.append({
                "tool_call_id": tool_call.id,
                "role": "tool",
                "name": function_name,
                "content": function_response,
            })
            
            second_response = client.chat.completions.create(
                model=MODEL_NAME,
                messages=messages,
            )
            return second_response.choices[0].message.content

        return response_message.content

    except Exception as e:
        return f"【AI系统提示】请求大模型出错。可能是 API_KEY 未设置或余额不足。错误信息: {str(e)}"
