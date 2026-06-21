"""
报价/排期服务层：把 pricing_engine 的计算结果落库，并提供"改 → 重算"能力。
被 main.py(REST) 与 ai_agent.py(AI 工具) 共用。
"""
from sqlalchemy.orm import Session
import models
import pricing_engine as eng


def _payload(items):
    return [{"phase": it.phase, "amount": it.amount, "unit_price": it.unit_price,
             "qty_people": it.qty_people, "qty_days": it.qty_days} for it in items]


def recompute_totals(db: Session, project: "models.Project"):
    """根据当前 quote_items + 项目 margin_rate 重算成本/利润/实收，并写回 project。"""
    items = db.query(models.QuoteItem).filter(models.QuoteItem.project_id == project.id).all()
    totals = eng.compute_totals(_payload(items), tax_rate=project.tax_rate or 0.01,
                                margin_rate=project.margin_rate if project.margin_rate is not None else 0.25)
    project.cost_total = totals["cost_total"]
    project.client_price = totals["client_price"]
    project.budget = totals["client_price"]  # 兼容旧前端的 budget 字段
    db.commit()
    return totals


def generate_for_project(db: Session, project_id: str, dynamic_params: dict = None,
                         force_dynamic: bool = False) -> dict:
    """从项目档案生成报价明细 + 排期，落库并重算。幂等：会先清空旧的生成结果。
    dynamic_params: 由 Brief 抽取的参数，让报价随 Brief 变化。
    force_dynamic: True 时即使是内置档案项目(达梦/泰康)也改用 Brief 动态生成（用于用户改了 Brief 后同步）。"""
    project = db.query(models.Project).filter(models.Project.id == project_id).first()
    if not project:
        return {"error": "项目不存在"}

    use_dynamic = bool(dynamic_params) and (force_dynamic or project_id not in eng.PROJECT_PROFILES)
    if use_dynamic:
        # 按 Brief 抽取参数动态生成档案
        prof = {
            "profile": eng.build_dynamic_profile(dynamic_params),
            "shoot_days": int(dynamic_params.get("shoot_days") or project.shoot_days or 2),
            "duration_minutes": float(dynamic_params.get("duration_minutes") or project.duration_minutes or 5),
            "difficulty": dynamic_params.get("difficulty") or project.difficulty,
            "film_type": dynamic_params.get("film_type") or project.film_type,
        }
    else:
        prof = eng.get_project_profile(project_id)
    project.shoot_days = prof.get("shoot_days", project.shoot_days)
    project.duration_minutes = prof.get("duration_minutes", project.duration_minutes)
    project.difficulty = prof.get("difficulty", project.difficulty)
    project.film_type = prof.get("film_type", project.film_type)

    # 清空旧结果
    db.query(models.QuoteItem).filter(models.QuoteItem.project_id == project_id).delete()
    db.query(models.ScheduleItem).filter(models.ScheduleItem.project_id == project_id).delete()

    # 报价明细
    for it in eng.build_quote_items(prof["profile"]):
        db.add(models.QuoteItem(project_id=project_id, **it))

    # 排期
    for s in eng.generate_schedule(project.delivery_date, project.shoot_days):
        db.add(models.ScheduleItem(project_id=project_id, **s))

    project.generated = 1
    project.status = "in_progress"
    db.commit()
    return recompute_totals(db, project)


def set_margin(db: Session, project_id: str, margin_rate: float) -> dict:
    project = db.query(models.Project).filter(models.Project.id == project_id).first()
    if not project:
        return {"error": "项目不存在"}
    project.margin_rate = max(0.0, min(float(margin_rate), 3.0))
    return recompute_totals(db, project)


def update_quote_item(db: Session, project_id: str, item_name: str,
                      unit_price=None, qty_people=None, qty_days=None) -> dict:
    """模糊匹配项目名(如"导演")，改单价/人数/天数并重算金额与总价。"""
    project = db.query(models.Project).filter(models.Project.id == project_id).first()
    if not project:
        return {"ok": False, "msg": "项目不存在"}
    q = db.query(models.QuoteItem).filter(models.QuoteItem.project_id == project_id)
    item = q.filter(models.QuoteItem.item_name == item_name).first()
    if not item:
        item = next((i for i in q.all() if item_name in i.item_name or i.item_name in item_name), None)
    if not item:
        return {"ok": False, "msg": f"报价里没有找到「{item_name}」这一项"}
    if unit_price is not None:
        item.unit_price = float(unit_price)
    if qty_people is not None:
        item.qty_people = float(qty_people)
    if qty_days is not None:
        item.qty_days = float(qty_days)
    item.amount = item.unit_price * item.qty_people * item.qty_days
    db.commit()
    totals = recompute_totals(db, project)
    return {"ok": True, "item": item.item_name, "amount": item.amount,
            "cost_total": totals["cost_total"], "client_price": totals["client_price"]}


def set_shoot_days(db: Session, project_id: str, days: int) -> dict:
    """改拍摄天数：联动更新 B 段人天/套天项的金额，并重新倒推排期(R-T5)。"""
    project = db.query(models.Project).filter(models.Project.id == project_id).first()
    if not project:
        return {"ok": False, "msg": "项目不存在"}
    days = max(1, int(days))
    old = project.shoot_days
    project.shoot_days = days
    b_items = db.query(models.QuoteItem).filter(
        models.QuoteItem.project_id == project_id, models.QuoteItem.phase == "B").all()
    for it in b_items:
        if "天" in (it.unit or ""):
            it.qty_days = days
            it.amount = it.unit_price * it.qty_people * it.qty_days
    # 重新倒推排期
    db.query(models.ScheduleItem).filter(models.ScheduleItem.project_id == project_id).delete()
    for s in eng.generate_schedule(project.delivery_date, days):
        db.add(models.ScheduleItem(project_id=project_id, **s))
    db.commit()
    totals = recompute_totals(db, project)
    return {"ok": True, "old": old, "days": days,
            "cost_total": totals["cost_total"], "client_price": totals["client_price"]}


# 单笔超支：≤2000 AI 可自行批准；超出则打回找老板
OVERRUN_SELF_APPROVE_LIMIT = 2000


def request_overrun(db: Session, project_id: str, item_name: str, amount: float, reason: str) -> dict:
    project = db.query(models.Project).filter(models.Project.id == project_id).first()
    if not project:
        return {"approved": False, "msg": "项目不存在"}
    amount = float(amount)
    if amount <= OVERRUN_SELF_APPROVE_LIMIT:
        db.add(models.QuoteItem(
            project_id=project_id, phase="D", phase_name=eng.PHASE_NAMES["D"],
            item_name=f"{item_name}(超支)", unit_price=amount, qty_people=1, qty_days=1,
            unit="项", amount=amount, is_overrun=1, sort_order=999, note=reason))
        db.commit()
        totals = recompute_totals(db, project)
        return {"approved": True, "amount": amount, "client_price": totals["client_price"],
                "msg": f"这笔 {amount:.0f} 元在我审批权限内（上限 {OVERRUN_SELF_APPROVE_LIMIT} 元），我批了，已记进预算。原因：{reason}"}
    return {"approved": False, "amount": amount,
            "msg": f"这笔 {amount:.0f} 元超了我的审批红线（上限 {OVERRUN_SELF_APPROVE_LIMIT} 元），我做不了主，得走专项审批，你先把这笔压一压、别垫付。"}


# ============ 序列化（给前端） ============

def serialize_quote(db: Session, project_id: str) -> dict:
    project = db.query(models.Project).filter(models.Project.id == project_id).first()
    if not project:
        return {}
    items = db.query(models.QuoteItem).filter(
        models.QuoteItem.project_id == project_id
    ).order_by(models.QuoteItem.sort_order).all()
    margin = project.margin_rate if project.margin_rate is not None else 0.25
    totals = eng.compute_totals(_payload(items), tax_rate=project.tax_rate or 0.01, margin_rate=margin)
    out_items = []
    for it in items:
        cu = eng.client_unit_price(it.unit_price, margin)   # 含利润单价（给客户）
        out_items.append({
            "id": it.id, "phase": it.phase, "phase_name": it.phase_name, "item_name": it.item_name,
            "unit_price": it.unit_price, "qty_people": it.qty_people, "qty_days": it.qty_days,
            "unit": it.unit, "amount": it.amount, "is_overrun": bool(it.is_overrun), "note": it.note,
            "client_unit_price": cu,                                   # 客户单价(含利润)
            "client_amount": cu * it.qty_people * it.qty_days,         # 客户金额(含利润)
        })
    return {
        "generated": bool(project.generated),
        "film_type": project.film_type,
        "duration_minutes": project.duration_minutes,
        "shoot_days": project.shoot_days,
        "items": out_items,
        "totals": totals,
    }


def serialize_schedule(db: Session, project_id: str) -> dict:
    project = db.query(models.Project).filter(models.Project.id == project_id).first()
    if not project:
        return {}
    items = db.query(models.ScheduleItem).filter(
        models.ScheduleItem.project_id == project_id
    ).order_by(models.ScheduleItem.sort_order).all()
    return {
        "generated": bool(project.generated),
        "delivery_date": project.delivery_date,
        "shoot_days": project.shoot_days,
        "items": [{
            "id": it.id, "stage": it.stage, "task": it.task,
            "start_date": it.start_date, "end_date": it.end_date,
            "is_milestone": bool(it.is_milestone), "needs_client": bool(it.needs_client),
            "status": it.status,
        } for it in items],
    }
