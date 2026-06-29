import json
import os
import re
from pathlib import Path
from openai import OpenAI
from sqlalchemy import or_
from sqlalchemy.orm import Session
from dotenv import load_dotenv
import models

from prompt_manager import get_full_system_prompt, add_user_preference
from logger import log_interaction
import quote_service

load_dotenv(dotenv_path=Path(__file__).resolve().parent / ".env", override=True)

BASE_URL = os.getenv("LLM_BASE_URL", "https://openrouter.ai/api/v1")
# 兼容多种供应商的 key 命名：通用 LLM_API_KEY > OpenRouter > 硅基流动
API_KEY = os.getenv("LLM_API_KEY") or os.getenv("OPENROUTER_API_KEY") or os.getenv("SILICONFLOW_API_KEY", "")
MODEL_NAME = os.getenv("LLM_MODEL", "deepseek/deepseek-chat-v3-0324:free")
SUPPORTS_FUNCTIONS = os.getenv("LLM_SUPPORTS_FUNCTIONS", "false").lower() == "true"

if not API_KEY and "localhost" in BASE_URL:
    API_KEY = "ollama"

# OpenRouter 推荐(可选)的排行 headers
_default_headers = None
if "openrouter" in BASE_URL:
    _default_headers = {
        "HTTP-Referer": os.getenv("OPENROUTER_SITE_URL", "http://localhost:5173"),
        "X-Title": os.getenv("OPENROUTER_APP_NAME", "AI Producer"),
    }

client = OpenAI(api_key=API_KEY, base_url=BASE_URL, default_headers=_default_headers)

import time as _time

def _llm_create(**kwargs):
    """带重试的模型调用：免费模型偶发 429 限流时，自动等待重试几次。"""
    last = None
    for attempt in range(3):
        try:
            return client.chat.completions.create(**kwargs)
        except Exception as e:
            last = e
            es = str(e)
            if attempt < 2 and ("429" in es or "rate" in es.lower() or "temporarily" in es.lower()):
                _time.sleep(1.5 * (attempt + 1))
                continue
            raise
    raise last

tools = [
    {"type": "function", "function": {"name": "get_project_overview", "description": "获取客户信息、核心目标、制作周期与总预算", "parameters": {"type": "object", "properties": {"project_id": {"type": "string"}}, "required": ["project_id"]}}},
    {"type": "function", "function": {"name": "get_budget_breakdown", "description": "获取报价的成本核算、利润率、毛利、对客户实收以及各段(前期/拍摄/后期/杂费)费用。当被问到'毛利率/利润/利润率/报价多少/成本多少/预算/还有提升空间吗'时调用。", "parameters": {"type": "object", "properties": {"project_id": {"type": "string"}}, "required": ["project_id"]}}},
    {"type": "function", "function": {"name": "modify_budget", "description": "修改项目的总预算，或者记录特定细项的超支增加", "parameters": {"type": "object", "properties": {"project_id": {"type": "string"}, "amount": {"type": "number", "description": "增减金额"}, "reason": {"type": "string"}}, "required": ["project_id", "amount", "reason"]}}},
    {"type": "function", "function": {"name": "get_project_timeline", "description": "获取项目排期、当前阶段及预计交付时间", "parameters": {"type": "object", "properties": {"project_id": {"type": "string"}}, "required": ["project_id"]}}},
    {"type": "function", "function": {"name": "update_project_stage", "description": "更新项目的执行阶段（planning, shooting, post_production）", "parameters": {"type": "object", "properties": {"project_id": {"type": "string"}, "new_stage": {"type": "string"}}, "required": ["project_id", "new_stage"]}}},
    {"type": "function", "function": {"name": "get_crew_info", "description": "获取项目团队成员名单（按阶段，含项目经理）。当被问到'团队/几个人/都有谁/谁负责'时调用。", "parameters": {"type": "object", "properties": {"project_id": {"type": "string"}}, "required": ["project_id"]}}},
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
    {"type": "function", "function": {"name": "report_to_boss", "description": "员工回复后，AI调用此工具向后台/老板记录情况（附带员工原话在双引号内）", "parameters": {"type": "object", "properties": {"project_id": {"type": "string"}, "report_content": {"type": "string", "description": "向后台记录的内容，需将员工原话放在双引号内"}}, "required": ["project_id", "report_content"]}}},
    {"type": "function", "function": {"name": "generate_quote_and_schedule", "description": "根据项目 Brief 一键生成（或重新生成）报价单与执行排期。当老板说'生成报价/出个报价/排个期/按brief算一下'时调用。", "parameters": {"type": "object", "properties": {"project_id": {"type": "string"}}, "required": ["project_id"]}}},
    {"type": "function", "function": {"name": "update_quote_item", "description": "修改报价单里某一项的成本单价/人数/天数/客户单价并自动重算。例如'导演成本按5000算'(unit_price)、'导演给客户报8000'(client_unit_price)、'摄影加一个人'(qty_people)。", "parameters": {"type": "object", "properties": {"project_id": {"type": "string"}, "item_name": {"type": "string", "description": "报价项名称，如 导演/摄影/剪辑"}, "unit_price": {"type": "number", "description": "成本单价"}, "client_unit_price": {"type": "number", "description": "客户单价(含利润)"}, "qty_people": {"type": "number"}, "qty_days": {"type": "number"}}, "required": ["project_id", "item_name"]}}},
    {"type": "function", "function": {"name": "lock_quote_item", "description": "锁定/解锁某个报价项的价格。锁定后批量调利润率不会改动它。例如'锁定导演的价格'。", "parameters": {"type": "object", "properties": {"project_id": {"type": "string"}, "item_name": {"type": "string"}, "locked": {"type": "boolean", "description": "true 锁定 / false 解锁"}}, "required": ["project_id", "item_name", "locked"]}}},
    {"type": "function", "function": {"name": "add_quote_item", "description": "新增一个报价项。例如'加一项场地费 2000'。phase: A前期/B拍摄/C后期/D杂费。", "parameters": {"type": "object", "properties": {"project_id": {"type": "string"}, "item_name": {"type": "string"}, "phase": {"type": "string"}, "unit_price": {"type": "number"}, "qty_people": {"type": "number"}, "qty_days": {"type": "number"}, "unit": {"type": "string"}}, "required": ["project_id", "item_name", "unit_price"]}}},
    {"type": "function", "function": {"name": "delete_quote_item", "description": "删除一个报价项。例如'删掉道具这一项'。", "parameters": {"type": "object", "properties": {"project_id": {"type": "string"}, "item_name": {"type": "string"}}, "required": ["project_id", "item_name"]}}},
    {"type": "function", "function": {"name": "set_target_price", "description": "按目标总报价反推：客户只给了一个总价(如11万/20万)时，把未锁定项等比拉匀到该总价。例如'客户就给11万，按这个报'。", "parameters": {"type": "object", "properties": {"project_id": {"type": "string"}, "target_price": {"type": "number", "description": "目标实收总价(元)"}}, "required": ["project_id", "target_price"]}}},
    {"type": "function", "function": {"name": "set_target_margin", "description": "按目标毛利率反推报价：例如'目标毛利率做到35%'就传 0.35，系统反推总价并拉匀未锁定项。", "parameters": {"type": "object", "properties": {"project_id": {"type": "string"}, "target_margin": {"type": "number", "description": "毛利率小数，如 0.35"}}, "required": ["project_id", "target_margin"]}}},
    {"type": "function", "function": {"name": "set_margin_rate", "description": "调整项目利润率(毛利率)并重算实收报价。例如老板说'利润率提到30%'就传 0.3。", "parameters": {"type": "object", "properties": {"project_id": {"type": "string"}, "margin_rate": {"type": "number", "description": "小数，如 0.25 表示25%"}}, "required": ["project_id", "margin_rate"]}}},
    {"type": "function", "function": {"name": "request_overrun", "description": "员工/执行层申请追加预算或报销超支时调用。AI作为流程执行者：≤2000元可自行批准，超出则打回让其找老板。", "parameters": {"type": "object", "properties": {"project_id": {"type": "string"}, "item_name": {"type": "string"}, "amount": {"type": "number"}, "reason": {"type": "string"}}, "required": ["project_id", "amount", "reason"]}}},
    {"type": "function", "function": {"name": "set_shoot_days", "description": "调整拍摄天数。会联动更新 B 段拍摄费用并重新倒推排期。例如老板说'拍摄加一天'或'改成拍4天'。", "parameters": {"type": "object", "properties": {"project_id": {"type": "string"}, "days": {"type": "integer"}}, "required": ["project_id", "days"]}}}
]

def execute_function_call(name: str, args: dict, session_id: str, db: Session):
    work_session_id = "default"
    project = db.query(models.Project).filter(models.Project.id == args.get("project_id")).first()
    if not project and name not in ["transfer_message", "save_user_preference"]:
        return "找不到该项目"

    if name == "get_project_overview":
        # 不含金额（预算/报价只在 get_budget_breakdown，且对员工屏蔽），避免向员工泄露预算
        return f"客户: {project.client}, 行业: {project.industry}, 目标: {project.goal}, 影片: {project.film_type}, 交付: {project.delivery_date}, 拍摄: {project.shoot_days}天"
    elif name == "get_budget_breakdown":
        items = db.query(models.QuoteItem).filter(models.QuoteItem.project_id == project.id).order_by(models.QuoteItem.sort_order).all()
        if not items:
            return "目前还没有生成报价单。可以让我先按 Brief 生成报价。"
        subs = {}
        for i in items:
            subs[i.phase_name] = subs.get(i.phase_name, 0) + i.amount
        seg = ", ".join([f"{k} {v:.0f}元" for k, v in subs.items()])
        return f"报价分段：{seg}。成本核算 {project.cost_total:.0f}，利润率 {project.margin_rate*100:.0f}%，实收 {project.client_price:.0f}。"
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
        members = db.query(models.TeamMember).filter(models.TeamMember.project_id == project.id).order_by(models.TeamMember.is_pm.desc(), models.TeamMember.sort_order).all()
        if not members:
            return "这个项目还没配置团队成员（生成项目后会自动配一套默认团队）。"
        names = "、".join(m.name for m in members)
        pm = next((m.name for m in members if m.is_pm), None)
        extra = f"，项目经理是{pm}" if pm else ""
        return f"项目团队 {len(members)} 人：{names}{extra}。"
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
        target_role = args.get("target_role")
        session_id_to_use = work_session_id if target_role in ["employee", "boss"] else session_id
        db.add(models.Message(project_id=args["project_id"], session_id=session_id_to_use, sender_id="ai_producer", content=args["content"], target_role=target_role))
        db.commit()
        return f"已成功向 {args['target_role']} 传达消息。"
    elif name == "save_user_preference":
        return add_user_preference(args["preference"])
    elif name == "ask_employee_schedule":
        details = args.get("details", "")
        content = f"目前的排期进度怎么样了？{details}"
        db.add(models.Message(project_id=project.id, session_id=work_session_id, sender_id="ai_producer", content=content, target_role="employee"))
        db.commit()
        return "已向员工询问排期进度。"
    elif name == "ask_employee_risk":
        content = "目前项目有什么风险点或困难需要我这边协调解决的吗？"
        db.add(models.Message(project_id=project.id, session_id=work_session_id, sender_id="ai_producer", content=content, target_role="employee"))
        db.commit()
        return "已向员工询问项目风险。"
    elif name == "urge_employee_delivery":
        content = "请尽快完成并交付当前的产出物，加快进度。"
        db.add(models.Message(project_id=project.id, session_id=work_session_id, sender_id="ai_producer", content=content, target_role="employee"))
        db.commit()
        return "已向员工催促交付。"
    elif name == "provide_client_feedback":
        content = f"客户的最新反馈来了，注意按照这个修改：{args.get('feedback')}"
        db.add(models.Message(project_id=project.id, session_id=work_session_id, sender_id="ai_producer", content=content, target_role="employee"))
        db.commit()
        return "已向员工转达客户反馈。"
    elif name == "schedule_internal_meeting":
        content = f"请注意一下接下来的会议或日程安排：{args.get('meeting_info')}"
        db.add(models.Message(project_id=project.id, session_id=work_session_id, sender_id="ai_producer", content=content, target_role="employee"))
        db.commit()
        return "已向员工通知会议安排。"
    elif name == "report_to_boss":
        content = args.get("report_content")
        # 主动发给老板
        db.add(models.Message(project_id=project.id, session_id=work_session_id, sender_id="ai_producer", content=content, target_role="boss"))
        db.commit()
        return "情况已记录。"
    elif name == "generate_quote_and_schedule":
        totals = quote_service.generate_for_project(db, project.id)
        return (f"已按 Brief 生成报价和排期。成本核算 {totals['cost_total']:.0f} 元，"
                f"利润率 {project.margin_rate*100:.0f}%，对客户实收 {totals['client_price']:.0f} 元，"
                f"拍摄 {project.shoot_days} 天，看板已更新。")
    elif name == "update_quote_item":
        res = quote_service.update_quote_item(
            db, project.id, item_name=args.get("item_name"),
            unit_price=args.get("unit_price"), qty_people=args.get("qty_people"),
            qty_days=args.get("qty_days"), client_unit_price=args.get("client_unit_price"))
        if not res.get("ok"):
            return res.get("msg", "改不了这一项")
        return (f"已把「{res['item']}」改好，成本核算 {res['cost_total']:.0f}，实收 {res['client_price']:.0f}。")
    elif name == "lock_quote_item":
        res = quote_service.update_quote_item(db, project.id, item_name=args.get("item_name"),
                                              is_locked=bool(args.get("locked")))
        if not res.get("ok"):
            return res.get("msg", "找不到这一项")
        return f"「{res['item']}」价格已{'锁定' if args.get('locked') else '解锁'}，批量调利润率时{'不会' if args.get('locked') else '会'}动它。"
    elif name == "add_quote_item":
        res = quote_service.add_quote_item(
            db, project.id, phase=args.get("phase", "D"), item_name=args.get("item_name", "新增项"),
            unit_price=args.get("unit_price", 0), qty_people=args.get("qty_people", 1),
            qty_days=args.get("qty_days", 1), unit=args.get("unit", "项"))
        return f"已新增报价项「{args.get('item_name')}」，实收变为 {res['client_price']:.0f}。"
    elif name == "delete_quote_item":
        item = quote_service._find_item(db, project.id, item_name=args.get("item_name"))
        if not item:
            return f"报价里没找到「{args.get('item_name')}」。"
        res = quote_service.delete_quote_item(db, project.id, item.id)
        return f"已删除「{args.get('item_name')}」，实收变为 {res['client_price']:.0f}。"
    elif name == "set_target_price":
        res = quote_service.set_target_client_price(db, project.id, args.get("target_price", 0))
        if not res.get("ok"):
            return res.get("msg", "反推失败")
        return (f"已按目标 {res['target']:.0f} 元把未锁定项拉匀，现在实收 {res['client_price']:.0f}，"
                f"成本 {res['cost_total']:.0f}，毛利率 {res['gross_margin']*100:.0f}%。")
    elif name == "set_target_margin":
        res = quote_service.set_target_margin(db, project.id, args.get("target_margin", 0.25))
        if not res.get("ok"):
            return res.get("msg", "反推失败")
        return (f"已按目标毛利率 {res.get('target_margin',0)*100:.0f}% 反推：实收调到 {res['client_price']:.0f}，"
                f"成本 {res['cost_total']:.0f}，实际毛利率 {res['gross_margin']*100:.0f}%。")
    elif name == "set_margin_rate":
        totals = quote_service.set_margin(db, project.id, args.get("margin_rate", 0.25))
        return (f"利润率已调到 {project.margin_rate*100:.0f}%，成本 {totals['cost_total']:.0f} 不变，"
                f"对客户实收变为 {totals['client_price']:.0f} 元。")
    elif name == "request_overrun":
        res = quote_service.request_overrun(db, project.id, args.get("item_name", "杂项"),
                                            args.get("amount", 0), args.get("reason", ""))
        return res.get("msg", "")
    elif name == "set_shoot_days":
        res = quote_service.set_shoot_days(db, project.id, args.get("days", 1))
        if not res.get("ok"):
            return res.get("msg", "改不了拍摄天数")
        return (f"拍摄天数从 {res['old']} 天改成 {res['days']} 天，B 段费用和排期都已重算："
                f"成本核算 {res['cost_total']:.0f}，实收 {res['client_price']:.0f}。")

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

# —— 规则命令层（确定性，不依赖大模型；保证演示在 API key 不可用时也能跑通报价/排期）——
KNOWN_ITEMS = ["摄影灯光器材", "摄影助理", "灯光助理", "服化助理", "道具助理", "版权音乐", "版权素材",
               "设备器材", "导演", "制片", "摄影", "焦点", "摄助", "灯光师", "美术", "道具",
               "录音师", "录音", "演员", "服化师", "服化", "剪辑", "包装", "调色", "配乐", "配音",
               "场地", "餐食", "设备车"]
CN_NUM = {"两": 2, "一": 1, "二": 2, "三": 3, "四": 4, "五": 5, "六": 6, "七": 7, "八": 8, "九": 9, "十": 10}

def _num(text: str):
    t = text.replace(",", "").replace("，", "")
    m = re.search(r"(\d+(?:\.\d+)?)\s*万", t)
    if m:
        return float(m.group(1)) * 10000
    m = re.search(r"(\d+(?:\.\d+)?)", t)
    if m:
        return float(m.group(1))
    for ch, v in CN_NUM.items():
        if ch in t:
            return float(v)
    return None

def try_rule_command(user_message: str, user_id: str, project_id: str, db: Session):
    """命中确定性命令则直接执行并返回回复，否则返回 None（交给大模型）。"""
    text = (user_message or "").strip()
    if not text:
        return None
    is_employee = (user_id == "employee")

    # 超支/报销：员工的预算交互入口（≤2000 自批，超出打回），老板也可用
    if any(k in text for k in ["超支", "报销", "追加预算", "多花", "超了预算", "加预算"]):
        amt = _num(text)
        if amt is not None:
            return execute_function_call("request_overrun",
                                         {"project_id": project_id, "item_name": "杂项", "amount": amt, "reason": text},
                                         "default", db)

    # —— 权限：员工只读排期/进度/总览，预算与报价一律不接 ——
    if is_employee:
        if any(k in text for k in ["排期", "进度", "到哪一步", "什么时候交", "几号交", "交付时间"]):
            return execute_function_call("get_project_timeline", {"project_id": project_id}, "default", db)
        if any(k in text for k in ["总览", "基本情况", "项目情况", "项目概况"]):
            return execute_function_call("get_project_overview", {"project_id": project_id}, "default", db)
        if any(k in text for k in ["报价", "预算", "利润", "毛利", "成本", "多少钱", "生成", "单价", "调价"]) \
                or any(it in text for it in KNOWN_ITEMS):
            return "预算和报价这块你不用管，盯好自己的进度和交付就行。"
        return None  # 其它（闲聊/汇报）交给大模型

    # —— 老板：完整命令 ——
    # 1) 生成报价 + 排期
    if any(k in text for k in ["生成报价", "出报价", "出个报价", "生成排期", "排个期", "按brief", "按 brief",
                               "一键生成", "算个报价", "报个价", "生成方案", "生成预算", "重新生成"]):
        return execute_function_call("generate_quote_and_schedule", {"project_id": project_id}, "default", db)
    # 2) 利润率
    if "利润率" in text or "毛利" in text:
        mm = re.search(r"(\d+(?:\.\d+)?)\s*%", text) or re.search(r"(\d+(?:\.\d+)?)\s*个?点", text)
        num = None
        if mm:
            num = float(mm.group(1)) / 100
        else:
            v = _num(text)
            if v is not None:
                num = v / 100 if v > 1 else v
        if num is not None:
            return execute_function_call("set_margin_rate", {"project_id": project_id, "margin_rate": num}, "default", db)
    # 3) 超支 / 报销
    if any(k in text for k in ["超支", "报销", "追加预算", "多花", "超了预算", "加预算"]):
        amt = _num(text)
        if amt is not None:
            return execute_function_call("request_overrun",
                                         {"project_id": project_id, "item_name": "杂项", "amount": amt, "reason": text},
                                         "default", db)
    # 4) 拍摄天数（联动 B 段费用 + 排期）
    if "拍摄" in text and "天" in text:
        proj = db.query(models.Project).filter(models.Project.id == project_id).first()
        cur = proj.shoot_days if proj else 3
        if any(k in text for k in ["加", "多", "增"]):
            return execute_function_call("set_shoot_days", {"project_id": project_id, "days": int(cur + (_num(text) or 1))}, "default", db)
        if any(k in text for k in ["减", "少"]):
            return execute_function_call("set_shoot_days", {"project_id": project_id, "days": int(cur - (_num(text) or 1))}, "default", db)
        n = _num(text)
        if n is not None:
            return execute_function_call("set_shoot_days", {"project_id": project_id, "days": int(n)}, "default", db)
    # 5) 某报价项单价
    for item in KNOWN_ITEMS:
        if item in text and any(k in text for k in ["单价", "一天", "每天", "按", "改成", "调到", "调成", "改为", "调整到"]):
            num = _num(text)
            if num is not None:
                return execute_function_call("update_quote_item",
                                             {"project_id": project_id, "item_name": item, "unit_price": num},
                                             "default", db)
            break
    # 6) 只读查询（避免 key 失效时报错；但放过明显的传话意图，留给大模型）
    relay_intent = any(k in text for k in ["张导", "员工", "问下", "问问", "催", "转达", "告诉", "通知", "让他", "让她", "汇报"])
    if not relay_intent:
        if any(k in text for k in ["报价", "预算", "多少钱", "成本", "花多少"]):
            return execute_function_call("get_budget_breakdown", {"project_id": project_id}, "default", db)
        if any(k in text for k in ["排期", "进度", "到哪一步", "什么时候交", "几号交", "交付时间"]):
            return execute_function_call("get_project_timeline", {"project_id": project_id}, "default", db)
        if any(k in text for k in ["总览", "基本情况", "项目情况", "项目概况"]):
            return execute_function_call("get_project_overview", {"project_id": project_id}, "default", db)
    return None


def chat_with_llm(user_message: str, user_id: str, project_id: str, session_id: str, db: Session) -> str:
    is_rule = False
    if ("以后都叫我" in user_message or "以后请叫我" in user_message or "请记住规则" in user_message) and not any(k in user_message for k in ["看看", "落后", "进度"]):
        is_rule = True
            
    if is_rule:
        # 特别防止老板问“张导进度”这类话被大模型误判为保存规则
        if user_id == "boss" and any(k in user_message for k in ["看看", "张导", "落后", "进度"]):
            pass
        else:
            content = add_user_preference(user_message)
            content = f"好的，{content}"
            log_interaction(project_id, user_id, user_message, content, ["save_user_preference_fallback"])
            return content

    # 注：旧的"规则命令层"已停用 —— 硬性要求：所有回答都必须经过大模型。
    # 工具只负责确定性地算数/取数，措辞一律交给模型组织（见下方 tool_calls 处理）。

    if not SUPPORTS_FUNCTIONS:
        pass
    else:
        # 针对支持 Function calling 的情况，我们要防止大模型自己决定不调工具，直接生成假回复。
        # 如果老板提到了这几个词，强制不走大模型，直接走工具并返回。
        # 这里已移除旧版的硬编码工具直接发送老板原话的逻辑，完全交给大模型自主判断上下文，仅在极特殊情况下防幻觉。
        pass

    # 1. 获取历史记录（最近10条）——按角色可见性过滤，避免把老板的预算对话喂进员工的上下文（防泄露）
    history = db.query(models.Message).filter(
        models.Message.project_id == project_id,
        models.Message.session_id == session_id,
        or_(
            models.Message.target_role == None,
            models.Message.target_role == user_id,     # user_id 即 'boss'/'employee'
            models.Message.sender_id == user_id,
        )
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
            # 员工(执行端)只给一小套工具：能查自己相关信息、能汇报/申请，但不能动预算、也不能用"派活给员工"这类老板专用工具
            if user_id == "employee":
                emp_blocked = {
                    "generate_quote_and_schedule", "update_quote_item", "set_margin_rate", "set_shoot_days",
                    "modify_budget", "get_budget_breakdown", "lock_quote_item", "add_quote_item",
                    "delete_quote_item", "set_target_price", "set_target_margin",
                    "ask_employee_schedule", "ask_employee_risk", "urge_employee_delivery",
                    "provide_client_feedback", "schedule_internal_meeting", "transfer_message"}
                tools_to_use = [t for t in tools if t["function"]["name"] not in emp_blocked]
            else:
                tools_to_use = tools

            response = _llm_create(
                model=MODEL_NAME,
                messages=messages,
                tools=tools_to_use,
                tool_choice="auto",
                max_tokens=512,
                temperature=0.2
            )
        else:
            response = _llm_create(
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
            tool_call = tool_calls[0]
            function_name = tool_call.function.name
            try:
                function_args = json.loads(tool_call.function.arguments or "{}")
            except Exception:
                function_args = {}
            # 强制使用真实项目ID（免费模型经常把 project_id 填错或填 unknown）
            function_args["project_id"] = project_id

            # 权限：员工不能查看/修改预算与报价
            if user_id == "employee" and function_name in {
                "generate_quote_and_schedule", "update_quote_item", "set_margin_rate",
                "set_shoot_days", "modify_budget", "get_budget_breakdown",
                "lock_quote_item", "add_quote_item", "delete_quote_item",
                "set_target_price", "set_target_margin"
            }:
                content = "预算和报价这块你不用管，盯好自己的进度和交付就行。"
                log_interaction(project_id, user_id, user_message, content, [function_name + "_blocked"])
                return content

            tools_used.append(function_name)
            function_response = execute_function_call(function_name, function_args, session_id, db)

            if function_name == "save_user_preference":
                content = f"好的，{function_response}"
                log_interaction(project_id, user_id, user_message, content, tools_used)
                return content

            # 关系类工具：给老板固定确认、给员工固定收到，不再二次调用大模型（更快、防止伪造进度）
            RELAY_TOOLS = {"ask_employee_schedule", "ask_employee_risk", "urge_employee_delivery",
                           "provide_client_feedback", "schedule_internal_meeting", "transfer_message"}
            if function_name in RELAY_TOOLS:
                content = "好的，我已经安排下去了，等他们回复。" if user_id != "employee" else function_response
                log_interaction(project_id, user_id, user_message, content, tools_used)
                return content
            if function_name == "report_to_boss":
                # 转述内容已由模型写入 report_content 并存给老板，这里只回员工
                content = "收到，情况我了解了，继续推进。"
                log_interaction(project_id, user_id, user_message, content, tools_used)
                return content

            # 所有报价/排期/查询/动作类工具：把工具的准确结果交回大模型，由模型用自然语言措辞回复。
            # （硬性要求：回答必须经过模型，不能直接甩工具原文。）
            messages.append(response_message)
            messages.append({
                "tool_call_id": tool_call.id, "role": "tool",
                "name": function_name, "content": function_response,
            })
            messages.append({"role": "system", "content": "现在用自然、口语化的中文、像真人项目经理一样，根据上面工具的结果直接回答用户这句话。只说重点和关键数字（数字必须用工具里的准确值），绝不要原样罗列字段或把整张数据表甩出来。一两句话即可。"})
            try:
                second = _llm_create(model=MODEL_NAME, messages=messages, max_tokens=500, temperature=0.4)
                content = second.choices[0].message.content or function_response
            except Exception:
                content = function_response  # 仅当模型二次调用失败时，才退回工具原文以免丢数据
            if len(content) > 1200:
                content = content[:1200] + "…"
            log_interaction(project_id, user_id, user_message, content, tools_used)
            return content

        content = response_message.content
        if content and len(content) > 1000:
            content = content[:1000] + "…"
        if not content and not tool_calls:
            content = "我不太明白您的意思，您可以换个说法吗？"
            
        # 日志记录
        log_interaction(project_id, user_id, user_message, content, tools_used)
        return content

    except Exception as e:
        error_text = str(e)
        if "429" in error_text or "rate" in error_text.lower() or "temporarily" in error_text.lower():
            return "AI 这会儿有点忙（免费模型限流了），稍等几秒再发一次就好。"
        if "401" in error_text or "Invalid token" in error_text or "No auth" in error_text:
            return "【系统】API Key 无效，请检查 backend/.env 里的 OPENROUTER_API_KEY。"
        return f"【系统】AI 暂时不可用，请稍后重试。({error_text[:100]})"

def extract_brief_params(brief_text: str) -> dict:
    """用大模型从 Brief 抽取生成报价所需的关键参数。失败时返回 {}（上层走默认档案）。"""
    if not brief_text or not API_KEY:
        return {}
    sys = ("你是广告制片助手。从客户Brief中抽取拍摄制作参数，只输出一个JSON对象，"
           "字段：film_type(影片性质,如宣传片/TVC/创意短视频)、duration_minutes(成片时长,分钟,数字)、"
           "shoot_days(拍摄天数,整数)、difficulty(难度:低/中/高)、crew_scale(摄制组规格:小/中/大)。"
           "信息缺失就按常规宣传片合理估计。不要输出JSON以外的任何内容。")
    try:
        resp = _llm_create(
            model=MODEL_NAME,
            messages=[{"role": "system", "content": sys},
                      {"role": "user", "content": brief_text[:2000]}],
            temperature=0, max_tokens=200,
        )
        txt = resp.choices[0].message.content or ""
        m = re.search(r"\{.*\}", txt, re.DOTALL)
        data = json.loads(m.group(0) if m else txt)
        out = {}
        if data.get("film_type"):
            out["film_type"] = str(data["film_type"])[:20]
        try: out["duration_minutes"] = float(data.get("duration_minutes"))
        except Exception: pass
        try: out["shoot_days"] = int(float(data.get("shoot_days")))
        except Exception: pass
        if data.get("difficulty") in ("低", "中", "高"):
            out["difficulty"] = data["difficulty"]
        if data.get("crew_scale") in ("小", "中", "大"):
            out["crew_scale"] = data["crew_scale"]
        return out
    except Exception:
        return {}


def get_config_snapshot():
    key = API_KEY
    masked = "" if not key else f"{key[:4]}***{key[-4:]}"
    return {
        "base_url": BASE_URL,
        "model": MODEL_NAME,
        "supports_functions": SUPPORTS_FUNCTIONS,
        "api_key_masked": masked
    }
