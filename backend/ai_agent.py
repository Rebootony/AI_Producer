import json
import os
from pathlib import Path
from openai import OpenAI
from sqlalchemy.orm import Session
from dotenv import load_dotenv
import models

from prompt_manager import get_full_system_prompt, add_user_preference
from logger import log_interaction

load_dotenv(dotenv_path=Path(__file__).resolve().parent / ".env", override=True)

BASE_URL = os.getenv("LLM_BASE_URL", "https://api.siliconflow.cn/v1")
API_KEY = os.getenv("SILICONFLOW_API_KEY", "")
MODEL_NAME = os.getenv("LLM_MODEL", "deepseek-ai/DeepSeek-R1-0528-Qwen3-8B")
SUPPORTS_FUNCTIONS = os.getenv("LLM_SUPPORTS_FUNCTIONS", "false").lower() == "true"

if not API_KEY and "localhost" in BASE_URL:
    API_KEY = "ollama"

client = OpenAI(api_key=API_KEY, base_url=BASE_URL)

tools = [
    {"type": "function", "function": {"name": "get_project_overview", "description": "获取客户信息、核心目标、制作周期与总预算", "parameters": {"type": "object", "properties": {"project_id": {"type": "string"}}, "required": ["project_id"]}}},
    {"type": "function", "function": {"name": "get_budget_breakdown", "description": "获取前期、拍摄、后期等具体费用拆解", "parameters": {"type": "object", "properties": {"project_id": {"type": "string"}}, "required": ["project_id"]}}},
    {"type": "function", "function": {"name": "modify_budget", "description": "修改项目的总预算，或者记录特定细项的超支增加", "parameters": {"type": "object", "properties": {"project_id": {"type": "string"}, "amount": {"type": "number", "description": "增减金额"}, "reason": {"type": "string"}}, "required": ["project_id", "amount", "reason"]}}},
    {"type": "function", "function": {"name": "get_project_timeline", "description": "获取项目排期、当前阶段及预计交付时间", "parameters": {"type": "object", "properties": {"project_id": {"type": "string"}}, "required": ["project_id"]}}},
    {"type": "function", "function": {"name": "update_project_stage", "description": "更新项目的执行阶段（planning, shooting, post_production）", "parameters": {"type": "object", "properties": {"project_id": {"type": "string"}, "new_stage": {"type": "string"}}, "required": ["project_id", "new_stage"]}}},
    {"type": "function", "function": {"name": "get_crew_info", "description": "获取当前项目分配的主创人员名单（导演、制片等）及工作天数", "parameters": {"type": "object", "properties": {"project_id": {"type": "string"}}, "required": ["project_id"]}}},
    {"type": "function", "function": {"name": "update_crew_assignment", "description": "更新人员安排，如换人或增加工作天数", "parameters": {"type": "object", "properties": {"project_id": {"type": "string"}, "role": {"type": "string"}, "name": {"type": "string"}, "days": {"type": "integer"}}, "required": ["project_id", "role", "name", "days"]}}},
    {"type": "function", "function": {"name": "get_assets_list", "description": "获取已经产出并归档的项目交付物/资产列表", "parameters": {"type": "object", "properties": {"project_id": {"type": "string"}}, "required": ["project_id"]}}},
    {"type": "function", "function": {"name": "add_project_asset", "description": "记录新的资产文件上传或确认交付物已完成", "parameters": {"type": "object", "properties": {"project_id": {"type": "string"}, "asset_name": {"type": "string"}, "asset_type": {"type": "string"}}, "required": ["project_id", "asset_name", "asset_type"]}}},
    {"type": "function", "function": {"name": "transfer_message", "description": "向指定的其他角色传话", "parameters": {"type": "object", "properties": {"project_id": {"type": "string"}, "target_role": {"type": "string"}, "content": {"type": "string"}}, "required": ["project_id", "target_role", "content"]}}},
    {"type": "function", "function": {"name": "save_user_preference", "description": "当用户提出长期的习惯、要求、回答格式等长期指令时调用此工具保存。例如'以后都叫我老板'、'以后回答要简短'。", "parameters": {"type": "object", "properties": {"preference": {"type": "string", "description": "需要长期保存的用户偏好指令"}}, "required": ["preference"]}}},
    {"type": "function", "function": {"name": "ask_employee_schedule", "description": "向员工询问当前的排期进度与下一步计划", "parameters": {"type": "object", "properties": {"project_id": {"type": "string"}, "details": {"type": "string", "description": "补充说明"}}, "required": ["project_id"]}}},
    {"type": "function", "function": {"name": "ask_employee_risk", "description": "向员工询问目前项目的风险点或困难", "parameters": {"type": "object", "properties": {"project_id": {"type": "string"}}, "required": ["project_id"]}}},
    {"type": "function", "function": {"name": "urge_employee_delivery", "description": "催促员工尽快完成并交付当前产出物", "parameters": {"type": "object", "properties": {"project_id": {"type": "string"}}, "required": ["project_id"]}}},
    {"type": "function", "function": {"name": "provide_client_feedback", "description": "向员工转达客户的修改意见或反馈", "parameters": {"type": "object", "properties": {"project_id": {"type": "string"}, "feedback": {"type": "string"}}, "required": ["project_id", "feedback"]}}},
    {"type": "function", "function": {"name": "schedule_internal_meeting", "description": "通知员工安排内部开会或堪景等日程", "parameters": {"type": "object", "properties": {"project_id": {"type": "string"}, "meeting_info": {"type": "string"}}, "required": ["project_id", "meeting_info"]}}},
    {"type": "function", "function": {"name": "report_to_boss", "description": "员工回复后，AI对内容进行自然语言处理并向老板汇报（附带员工原话在双引号内）", "parameters": {"type": "object", "properties": {"project_id": {"type": "string"}, "report_content": {"type": "string", "description": "向老板汇报的内容，需将员工原话放在双引号内"}}, "required": ["project_id", "report_content"]}}}
]

def execute_function_call(name: str, args: dict, session_id: str, db: Session):
    project = db.query(models.Project).filter(models.Project.id == args.get("project_id")).first()
    if not project and name not in ["transfer_message", "save_user_preference"]:
        return "找不到该项目"

    if name == "get_project_overview":
        return f"客户: {project.client}, 行业: {project.industry}, 目标: {project.goal}, 交付: {project.delivery_date}, 总预算: {project.budget}"
    elif name == "get_budget_breakdown":
        items = db.query(models.BudgetBreakdown).filter(models.BudgetBreakdown.project_id == project.id).all()
        res = ", ".join([f"{i.category}-{i.item_name}: {i.amount}" for i in items])
        return f"预算明细: {res if res else '无'}"
    elif name == "modify_budget":
        project.budget += args["amount"]
        db.commit()
        return f"预算已修改，调整 {args['amount']}，总预算变为 {project.budget}。原因：{args['reason']}"
    elif name == "get_project_timeline":
        return f"当前阶段: {project.status}, 交付时间: {project.delivery_date}"
    elif name == "update_project_stage":
        project.status = args["new_stage"]
        db.commit()
        return f"阶段已更新为：{args['new_stage']}"
    elif name == "get_crew_info":
        crews = db.query(models.Crew).filter(models.Crew.project_id == project.id).all()
        res = ", ".join([f"{c.role}({c.name}) {c.days}天" for c in crews])
        return f"当前人员: {res if res else '无'}"
    elif name == "update_crew_assignment":
        crew = db.query(models.Crew).filter(models.Crew.project_id == project.id, models.Crew.role == args["role"]).first()
        if crew:
            crew.name = args["name"]
            crew.days = args["days"]
        else:
            db.add(models.Crew(project_id=project.id, role=args["role"], name=args["name"], days=args["days"]))
        db.commit()
        return f"人员已更新: {args['role']}为{args['name']}，工作{args['days']}天"
    elif name == "get_assets_list":
        assets = db.query(models.Asset).filter(models.Asset.project_id == project.id).all()
        res = ", ".join([f"{a.name}({a.asset_type})" for a in assets])
        return f"资产列表: {res if res else '暂无资产'}"
    elif name == "add_project_asset":
        db.add(models.Asset(project_id=project.id, name=args["asset_name"], asset_type=args["asset_type"]))
        db.commit()
        return f"已添加交付物: {args['asset_name']}"
    elif name == "transfer_message":
        db.add(models.Message(project_id=args["project_id"], session_id=session_id, sender_id="ai_producer", content=f"【传达给 {args['target_role']}】：{args['content']}", target_role=args["target_role"]))
        db.commit()
        return f"已成功向 {args['target_role']} 传达消息。"
    elif name == "save_user_preference":
        return add_user_preference(args["preference"])
    elif name == "ask_employee_schedule":
        details = args.get("details", "")
        content = f"【工作安排】目前的排期进度怎么样了？{details}"
        db.add(models.Message(project_id=project.id, session_id=session_id, sender_id="ai_producer", content=content, target_role="employee"))
        db.commit()
        return "已向员工询问排期进度。"
    elif name == "ask_employee_risk":
        content = "【进度跟进】目前项目有什么风险点或困难需要我这边协调解决的吗？"
        db.add(models.Message(project_id=project.id, session_id=session_id, sender_id="ai_producer", content=content, target_role="employee"))
        db.commit()
        return "已向员工询问项目风险。"
    elif name == "urge_employee_delivery":
        content = "【催促交付】请尽快完成并交付当前的产出物，加快进度。"
        db.add(models.Message(project_id=project.id, session_id=session_id, sender_id="ai_producer", content=content, target_role="employee"))
        db.commit()
        return "已向员工催促交付。"
    elif name == "provide_client_feedback":
        content = f"【客户反馈】客户的最新反馈来了，注意按照这个修改：{args.get('feedback')}"
        db.add(models.Message(project_id=project.id, session_id=session_id, sender_id="ai_producer", content=content, target_role="employee"))
        db.commit()
        return "已向员工转达客户反馈。"
    elif name == "schedule_internal_meeting":
        content = f"【会议安排】请注意一下接下来的会议或日程安排：{args.get('meeting_info')}"
        db.add(models.Message(project_id=project.id, session_id=session_id, sender_id="ai_producer", content=content, target_role="employee"))
        db.commit()
        return "已向员工通知会议安排。"
    elif name == "report_to_boss":
        content = args.get("report_content")
        # 主动发给老板
        db.add(models.Message(project_id=project.id, session_id=session_id, sender_id="ai_producer", content=content, target_role="boss"))
        db.commit()
        return "已成功向老板汇报。"
    
    return "未知函数"

from typing import Optional

def parse_budget_target(message: str) -> Optional[float]:
    text = message.replace(",", "").replace("，", "")
    if "万" in text:
        digits = "".join([c for c in text if c.isdigit()])
        if digits:
            return float(digits) * 10000
        return None
    digits = "".join([c for c in text if c.isdigit()])
    if digits:
        return float(digits)
    return None

def chat_with_llm(user_message: str, user_id: str, project_id: str, session_id: str, db: Session) -> str:
    # 严格判断是否是添加规则指令
    if "以后都叫我" in user_message or "以后请叫我" in user_message or "请记住规则" in user_message:
        is_rule = True
            
    if is_rule:
        content = add_user_preference(user_message)
        content = f"好的，{content}"
        log_interaction(project_id, user_id, user_message, content, ["save_user_preference_fallback"])
        return content

    if not SUPPORTS_FUNCTIONS:
        if any(key in user_message for key in ["单位", "什么单位"]):
            project = db.query(models.Project).filter(models.Project.id == project_id).first()
            if project:
                return f"预算单位为人民币元，当前预算为 {project.budget} 元（约 {project.budget / 10000:.1f} 万）。"
            return "找不到该项目"

        if "预算" in user_message and any(key in user_message for key in ["改为", "修改", "调整", "改成", "变更"]):
            target = parse_budget_target(user_message)
            project = db.query(models.Project).filter(models.Project.id == project_id).first()
            if project and target is not None:
                delta = target - project.budget
                return execute_function_call("modify_budget", {"project_id": project_id, "amount": delta, "reason": "手动调整预算"}, session_id, db)
            return "找不到该项目"

        if any(key in user_message for key in ["预算", "多少钱", "成本", "花费"]):
            return execute_function_call("get_project_overview", {"project_id": project_id}, session_id, db)

        if any(key in user_message for key in ["阶段", "排期"]) and not any(k in user_message for k in ["催", "看看", "落后", "张导"]):
            return execute_function_call("get_project_timeline", {"project_id": project_id}, session_id, db)

        if any(key in user_message for key in ["传达", "转达", "告诉", "催", "问", "联系", "看看", "落后"]):
            target_role = "employee" if user_id == "boss" else "boss"
            
            # 如果是老板发起的指令
            if user_id == "boss":
                if "催" in user_message:
                    return execute_function_call("urge_employee_delivery", {"project_id": project_id}, session_id, db)
                if "风险" in user_message or "困难" in user_message:
                    return execute_function_call("ask_employee_risk", {"project_id": project_id}, session_id, db)
                if "进度" in user_message or "排期" in user_message or "落后" in user_message:
                    return execute_function_call("ask_employee_schedule", {"project_id": project_id}, session_id, db)
            
            return execute_function_call(
                "transfer_message",
                {"project_id": project_id, "target_role": target_role, "content": user_message},
                session_id,
                db
            )

        # 在没有开启 SUPPORTS_FUNCTIONS 的情况下，如果老板询问员工相关进度，也应当返回固定的提示，避免出现假回复
        if user_id == "boss" and any(key in user_message for key in ["看看", "落后", "张导进度", "催", "问"]):
             # 模拟工具调用的行为
             execute_function_call("ask_employee_schedule", {"project_id": project_id}, session_id, db)
             return "好的，我已经向员工发送了指令，请等待员工回复。"

    # 1. 获取历史记录（最近10条）
    history = db.query(models.Message).filter(
        models.Message.project_id == project_id,
        models.Message.session_id == session_id
    ).order_by(models.Message.timestamp.desc()).limit(10).all()
    history = list(reversed(history))
    
    # 获取包含用户偏好的完整 Prompt
    system_prompt = get_full_system_prompt()
    
    messages = [{"role": "system", "content": system_prompt + f"\n\n当前正在沟通的项目ID为: {project_id}\n你现在正在和【{user_id}】对话。"}]
    for msg in history:
        # 排除刚才用户刚发的那条（防止重复，假设外部已经存了），这里我们依赖外部先存用户消息，所以直接用
        role = "assistant" if msg.sender_id == "ai_producer" else "user"
        prefix = "" if role == "assistant" else f"[{msg.sender_id} 说] "
        messages.append({"role": role, "content": prefix + msg.content})
        
    try:
        if SUPPORTS_FUNCTIONS:
            # 对于员工，我们强制它只能用 report_to_boss
            tools_to_use = tools
            if user_id == "employee":
                tools_to_use = [t for t in tools if t["function"]["name"] == "report_to_boss"]
                
            response = client.chat.completions.create(
                model=MODEL_NAME,
                messages=messages,
                tools=tools_to_use,
                tool_choice="auto",
                max_tokens=512,
                temperature=0.2
            )
        else:
            response = client.chat.completions.create(
                model=MODEL_NAME,
                messages=messages,
                max_tokens=512,
                temperature=0.2
            )
        
        response_message = response.choices[0].message
        tool_calls = response_message.tool_calls if SUPPORTS_FUNCTIONS else None
        
        # 记录执行的工具
        tools_used = []
        
        # 如果大模型决定调用工具
        if tool_calls:
            # 这里简化处理，只执行第一个 tool_call，然后把结果告诉大模型让它总结
            tool_call = tool_calls[0]
            function_name = tool_call.function.name
            function_args = json.loads(tool_call.function.arguments)
            
            tools_used.append(function_name)
            
            function_response = execute_function_call(function_name, function_args, session_id, db)
            
            # 如果是特殊的无需总结的指令，或者直接返回
            if function_name == "save_user_preference":
                content = f"好的，{function_response}"
                log_interaction(project_id, user_id, user_message, content, tools_used)
                return content

            messages.append(response_message)
            messages.append({
                "tool_call_id": tool_call.id,
                "role": "tool",
                "name": function_name,
                "content": function_response,
            })
            
            # 第二次对话是为了生成自然的回复给当前用户
            second_response = client.chat.completions.create(
                model=MODEL_NAME,
                messages=messages,
            )
            content = second_response.choices[0].message.content
            if content and len(content) > 1000:
                content = content[:1000] + "…"
            if not content:
                content = "好的，已执行操作。"
                
            # 修正：当老板发指令让 AI 去问员工时，第二轮大模型有时会自作主张伪造一个“员工说：正常”。
            # 我们必须强行拦截：如果工具调用是 ask_employee_* 或 urge_employee_* 等发给员工的，
            # 那么给老板的回复必须是死板的确认，绝不能是虚假的进度。
            if user_id == "boss" and any(t in tools_used for t in ["ask_employee_schedule", "ask_employee_risk", "urge_employee_delivery", "schedule_internal_meeting", "provide_client_feedback"]):
                content = "好的，我已经向员工发送了指令，请等待员工回复。"
            
            # 日志记录
            log_interaction(project_id, user_id, user_message, content, tools_used)
            return content

        if any(key in user_message for key in ["预算", "多少钱", "成本", "花费", "排期", "阶段", "进度"]) and not any(k in user_message for k in ["催", "看看", "张导", "落后"]):
            content = execute_function_call("get_project_overview", {"project_id": project_id}, session_id, db)
            log_interaction(project_id, user_id, user_message, content, ["get_project_overview_fallback"])
            return content

        content = response_message.content
        if content and len(content) > 1000:
            content = content[:1000] + "…"
        if not content and not tool_calls:
            content = "我不太明白您的意思，您可以换个说法吗？"
            
        # 日志记录
        log_interaction(project_id, user_id, user_message, content, tools_used)
        
        # 修正：当 AI 执行完工具后，如果返回的 content 就是函数的结果，那就不需要给发消息的人额外存一条奇怪的回复。
        # 这里我们在 chat_with_llm 中返回内容。如果 content 是工具直接返回的字符串（比如 "已成功向老板汇报"），
        # 并且用户是员工，那这句话其实是回复给员工确认的，没有问题。
        # 但如果是老板说“看看进度是不是落后了”，工具返回 "已向员工询问排期进度。"
        # 这句话应该回复给老板。之前出 Bug 是因为老板这边的上下文被污染了。
        return content

    except Exception as e:
        error_text = str(e)
        if "401" in error_text or "Invalid token" in error_text:
            return "【AI系统提示】API_KEY 无效或未设置，请检查硅基流动密钥。"
        return f"【AI系统提示】请求大模型出错。可能是 API_KEY 未设置或余额不足。错误信息: {error_text}"

def get_config_snapshot():
    key = API_KEY
    masked = "" if not key else f"{key[:4]}***{key[-4:]}"
    return {
        "base_url": BASE_URL,
        "model": MODEL_NAME,
        "supports_functions": SUPPORTS_FUNCTIONS,
        "api_key_masked": masked
    }
