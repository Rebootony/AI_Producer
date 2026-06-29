"""
报价/排期服务层：把 pricing_engine 的计算结果落库，并提供"改 → 重算"能力。
被 main.py(REST) 与 ai_agent.py(AI 工具) 共用。

报价模型（B 批）：每行有独立的 成本单价(unit_price) 与 客户单价(client_unit_price)，
客户单价可单独编辑、可锁定。批量调利润率只动未锁定项。客户实收 = 各行客户金额之和（自洽）。
"""
from sqlalchemy.orm import Session
import models
import pricing_engine as eng


def _eff_client_unit(it, margin: float) -> float:
    """有存储的客户单价就用它；否则按全局利润率算（兼容老数据 / 未设置）。"""
    if it.client_unit_price and it.client_unit_price > 0:
        return it.client_unit_price
    return eng.client_unit_price(it.unit_price, margin)


def _payload(items, margin: float):
    return [{"phase": it.phase, "amount": it.amount,
             "client_amount": _eff_client_unit(it, margin) * it.qty_people * it.qty_days} for it in items]


def _write_schedule_and_tasks(db: Session, project_id: str, delivery_date: str, days: int):
    """重建排期 + 由排期派生执行任务（派给执行端）。"""
    db.query(models.ScheduleItem).filter(models.ScheduleItem.project_id == project_id).delete()
    db.query(models.Task).filter(models.Task.project_id == project_id).delete()
    for s in eng.generate_schedule(delivery_date, days):
        db.add(models.ScheduleItem(project_id=project_id, **s))
        db.add(models.Task(
            project_id=project_id, title=s["task"], description=f"{s['stage']}阶段 · {s['task']}",
            assignee="employee", stage=s["stage"], deliverable=eng.task_deliverable(s["task"]),
            deadline=s["end_date"], priority="高" if s["is_milestone"] else "中",
            status="pending", sort_order=s["sort_order"]))


DEFAULT_TEAM = [
    ("制片", "制片（项目经理）", "全程", 1),
    ("策划", "策划/编剧", "前期", 0),
    ("张导", "导演", "拍摄", 0),
    ("摄影", "摄影指导", "拍摄", 0),
    ("灯光", "灯光师", "拍摄", 0),
    ("剪辑", "后期剪辑", "后期", 0),
    ("调色", "调色/音乐", "后期", 0),
]


def _ensure_team(db: Session, project_id: str):
    """首次生成时配默认团队；已有团队则保留用户增减；并保证始终有且仅有一个项目经理（删了PM会自动补）。"""
    members = db.query(models.TeamMember).filter(
        models.TeamMember.project_id == project_id).order_by(models.TeamMember.sort_order).all()
    if not members:
        for i, (name, role, stage, pm) in enumerate(DEFAULT_TEAM):
            db.add(models.TeamMember(project_id=project_id, name=name, role=role, stage=stage, is_pm=pm, sort_order=i))
        db.commit()
        return
    if not any(m.is_pm for m in members):   # 没有PM（比如PM被删）→ 自动补一个
        pm = next((m for m in members if m.stage == "全程"), members[0])
        pm.is_pm = 1
        db.commit()


def serialize_team(db: Session, project_id: str) -> dict:
    members = db.query(models.TeamMember).filter(
        models.TeamMember.project_id == project_id).order_by(
        models.TeamMember.is_pm.desc(), models.TeamMember.sort_order).all()
    groups = db.query(models.ProjectGroup).filter(
        models.ProjectGroup.project_id == project_id).order_by(models.ProjectGroup.id.desc()).all()
    return {
        "members": [{"id": m.id, "name": m.name, "role": m.role, "stage": m.stage, "is_pm": bool(m.is_pm)} for m in members],
        "groups": [{"id": g.id, "name": g.name, "members": g.members, "purpose": g.purpose} for g in groups],
    }


def recompute_totals(db: Session, project: "models.Project"):
    """重算成本/利润/实收，并写回 project。"""
    margin = project.margin_rate if project.margin_rate is not None else 0.25
    items = db.query(models.QuoteItem).filter(models.QuoteItem.project_id == project.id).all()
    totals = eng.compute_totals(_payload(items, margin), tax_rate=project.tax_rate or 0.01, margin_rate=margin)
    project.cost_total = totals["cost_total"]
    project.client_price = totals["client_price"]
    project.budget = totals["client_price"]  # 兼容旧前端的 budget 字段
    db.commit()
    return totals


def generate_for_project(db: Session, project_id: str, dynamic_params: dict = None,
                         force_dynamic: bool = False) -> dict:
    """从项目档案生成报价明细 + 排期，落库并重算。幂等：会先清空旧的生成结果。"""
    project = db.query(models.Project).filter(models.Project.id == project_id).first()
    if not project:
        return {"error": "项目不存在"}

    # 内置档案(达梦/泰康)用其精确档案；其余项目一律按用户表单设的参数动态生成。
    hardcoded = (project_id in eng.PROJECT_PROFILES) and not force_dynamic
    if hardcoded:
        prof = eng.get_project_profile(project_id)
    else:
        # 修 F1：用户在表单里设的 拍摄天数/时长/影片性质 永远优先；LLM 只补 crew_scale/difficulty。
        # 即使 LLM 抽参为空，也不退回 DEFAULT 档案（那会把天数覆盖成 2）。
        dp = dynamic_params or {}
        sd = int(project.shoot_days or dp.get("shoot_days") or 2)
        dur = float(project.duration_minutes or dp.get("duration_minutes") or 5)
        ft = project.film_type or dp.get("film_type") or "宣传片"
        prof = {
            "profile": eng.build_dynamic_profile({
                "shoot_days": sd, "duration_minutes": dur,
                "crew_scale": dp.get("crew_scale"), "difficulty": dp.get("difficulty")}),
            "shoot_days": sd, "duration_minutes": dur,
            "difficulty": dp.get("difficulty") or project.difficulty,
            "film_type": ft,
        }
    project.shoot_days = prof.get("shoot_days", project.shoot_days)
    project.duration_minutes = prof.get("duration_minutes", project.duration_minutes)
    project.difficulty = prof.get("difficulty", project.difficulty)
    project.film_type = prof.get("film_type", project.film_type)

    db.query(models.QuoteItem).filter(models.QuoteItem.project_id == project_id).delete()

    margin0 = project.margin_rate if project.margin_rate is not None else 0.25
    for it in eng.build_quote_items(prof["profile"]):
        cu = eng.client_unit_price(it["unit_price"], margin0)   # 初始化每行客户单价 = 成本×(1+利润率)
        db.add(models.QuoteItem(project_id=project_id, client_unit_price=cu, is_locked=0, **it))

    _write_schedule_and_tasks(db, project_id, project.delivery_date, project.shoot_days)
    _ensure_team(db, project_id)

    project.generated = 1
    project.status = "in_progress"
    db.commit()
    return recompute_totals(db, project)


def set_margin(db: Session, project_id: str, margin_rate: float) -> dict:
    """批量调利润率：把所有【未锁定】项的客户单价重设为 成本×(1+利润率)；锁定项不动。"""
    project = db.query(models.Project).filter(models.Project.id == project_id).first()
    if not project:
        return {"error": "项目不存在"}
    m = max(0.0, min(float(margin_rate), 3.0))
    project.margin_rate = m
    items = db.query(models.QuoteItem).filter(models.QuoteItem.project_id == project_id).all()
    for it in items:
        if not it.is_locked:
            it.client_unit_price = eng.client_unit_price(it.unit_price, m)
    db.commit()
    return recompute_totals(db, project)


def set_target_client_price(db: Session, project_id: str, target_total: float) -> dict:
    """按目标实收反推：把【未锁定】项的客户单价等比"拉匀"，使总实收≈目标；锁定项不动（B5）。"""
    project = db.query(models.Project).filter(models.Project.id == project_id).first()
    if not project:
        return {"ok": False, "msg": "项目不存在"}
    target = float(target_total)
    margin = project.margin_rate if project.margin_rate is not None else 0.25
    items = db.query(models.QuoteItem).filter(models.QuoteItem.project_id == project_id).all()
    locked_sum = sum(_eff_client_unit(it, margin) * it.qty_people * it.qty_days for it in items if it.is_locked)
    unlocked = [it for it in items if not it.is_locked]
    unlocked_sum = sum(_eff_client_unit(it, margin) * it.qty_people * it.qty_days for it in unlocked)
    if unlocked_sum <= 0:
        return {"ok": False, "msg": "所有报价项都锁定了，没法按目标反推。先解锁一些再试。"}
    target_unlocked = target - locked_sum
    if target_unlocked <= 0:
        return {"ok": False, "msg": f"已锁定项就合计 {locked_sum:.0f} 元，已经达到/超过目标 {target:.0f}。请解锁部分项或提高目标价。"}
    scale = target_unlocked / unlocked_sum
    for it in unlocked:
        cu = _eff_client_unit(it, margin)
        it.client_unit_price = max(round(cu * scale), 0)
    db.commit()
    totals = recompute_totals(db, project)
    return {"ok": True, "target": round(target), "client_price": totals["client_price"],
            "cost_total": totals["cost_total"], "gross_margin": totals["gross_margin"],
            "locked_sum": round(locked_sum)}


def set_target_margin(db: Session, project_id: str, target_margin: float) -> dict:
    """按目标毛利率反推：目标实收 = 成本 / (1 - 毛利率)，再拉匀未锁定项（B5）。"""
    project = db.query(models.Project).filter(models.Project.id == project_id).first()
    if not project:
        return {"ok": False, "msg": "项目不存在"}
    m = max(0.0, min(float(target_margin), 0.95))
    cost = sum(it.amount for it in db.query(models.QuoteItem).filter(models.QuoteItem.project_id == project_id).all())
    target_total = round(cost / (1 - m)) if m < 0.999 else cost * 5
    res = set_target_client_price(db, project_id, target_total)
    res["target_margin"] = m
    return res


def _find_item(db, project_id, item_id=None, item_name=None):
    q = db.query(models.QuoteItem).filter(models.QuoteItem.project_id == project_id)
    if item_id is not None:
        return q.filter(models.QuoteItem.id == int(item_id)).first()
    item = q.filter(models.QuoteItem.item_name == item_name).first()
    if not item and item_name:
        item = next((i for i in q.all() if item_name in i.item_name or i.item_name in item_name), None)
    return item


def update_quote_item(db: Session, project_id: str, item_name=None, item_id=None,
                      unit_price=None, qty_people=None, qty_days=None,
                      client_unit_price=None, is_locked=None, new_name=None) -> dict:
    """改某行的 名称/成本单价/人数/天数/客户单价/锁定。成本与客户单价相互独立（改成本不动客户价，改的是毛利）。"""
    project = db.query(models.Project).filter(models.Project.id == project_id).first()
    if not project:
        return {"ok": False, "msg": "项目不存在"}
    item = _find_item(db, project_id, item_id, item_name)
    if not item:
        return {"ok": False, "msg": f"报价里没有找到「{item_name or item_id}」这一项"}
    if new_name:
        item.item_name = str(new_name)[:40]
    if unit_price is not None:
        item.unit_price = float(unit_price)
    if qty_people is not None:
        item.qty_people = float(qty_people)
    if qty_days is not None:
        item.qty_days = float(qty_days)
    if client_unit_price is not None:
        item.client_unit_price = float(client_unit_price)
    if is_locked is not None:
        item.is_locked = 1 if is_locked else 0
    if item.client_unit_price is None or item.client_unit_price <= 0:
        item.client_unit_price = eng.client_unit_price(item.unit_price, project.margin_rate or 0.25)
    item.amount = item.unit_price * item.qty_people * item.qty_days
    db.commit()
    totals = recompute_totals(db, project)
    return {"ok": True, "item": item.item_name, "cost_total": totals["cost_total"], "client_price": totals["client_price"]}


def add_quote_item(db: Session, project_id: str, phase="D", item_name="新增项",
                   unit_price=0, qty_people=1, qty_days=1, unit="项",
                   client_unit_price=None) -> dict:
    project = db.query(models.Project).filter(models.Project.id == project_id).first()
    if not project:
        return {"ok": False, "msg": "项目不存在"}
    phase = phase if phase in ("A", "B", "C", "D") else "D"
    margin = project.margin_rate if project.margin_rate is not None else 0.25
    up = float(unit_price or 0)
    cu = float(client_unit_price) if client_unit_price is not None else eng.client_unit_price(up, margin)
    rows = db.query(models.QuoteItem).filter(models.QuoteItem.project_id == project_id).all()
    nxt = (max([r.sort_order for r in rows], default=0) + 1)
    item = models.QuoteItem(
        project_id=project_id, phase=phase, phase_name=eng.PHASE_NAMES.get(phase, phase),
        item_name=item_name, unit_price=up, qty_people=float(qty_people or 1), qty_days=float(qty_days or 1),
        unit=unit, amount=up * float(qty_people or 1) * float(qty_days or 1),
        client_unit_price=cu, is_locked=0, sort_order=nxt)
    db.add(item)
    db.commit()
    totals = recompute_totals(db, project)
    return {"ok": True, "id": item.id, "client_price": totals["client_price"]}


def delete_quote_item(db: Session, project_id: str, item_id: int) -> dict:
    project = db.query(models.Project).filter(models.Project.id == project_id).first()
    if not project:
        return {"ok": False, "msg": "项目不存在"}
    n = db.query(models.QuoteItem).filter(
        models.QuoteItem.id == int(item_id), models.QuoteItem.project_id == project_id).delete()
    db.commit()
    totals = recompute_totals(db, project)
    return {"ok": bool(n), "client_price": totals["client_price"]}


def set_shoot_days(db: Session, project_id: str, days: int) -> dict:
    """改拍摄天数：联动更新所有"人天/套天/天"项（含 B 段 + D 段餐食/设备车），并重新倒推排期（修 F2）。"""
    project = db.query(models.Project).filter(models.Project.id == project_id).first()
    if not project:
        return {"ok": False, "msg": "项目不存在"}
    days = max(1, int(days))
    old = project.shoot_days
    project.shoot_days = days
    items = db.query(models.QuoteItem).filter(models.QuoteItem.project_id == project_id).all()
    for it in items:
        if "天" in (it.unit or ""):
            it.qty_days = days
            it.amount = it.unit_price * it.qty_people * it.qty_days
    _write_schedule_and_tasks(db, project_id, project.delivery_date, days)
    db.commit()
    totals = recompute_totals(db, project)
    return {"ok": True, "old": old, "days": days,
            "cost_total": totals["cost_total"], "client_price": totals["client_price"]}


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
            unit="项", amount=amount, client_unit_price=amount, is_overrun=1, sort_order=999, note=reason))
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
        models.QuoteItem.project_id == project_id).order_by(models.QuoteItem.sort_order).all()
    margin = project.margin_rate if project.margin_rate is not None else 0.25
    totals = eng.compute_totals(_payload(items, margin), tax_rate=project.tax_rate or 0.01, margin_rate=margin)
    out_items = []
    for it in items:
        cu = _eff_client_unit(it, margin)
        client_amt = cu * it.qty_people * it.qty_days
        profit = client_amt - it.amount
        out_items.append({
            "id": it.id, "phase": it.phase, "phase_name": it.phase_name, "item_name": it.item_name,
            "unit_price": it.unit_price, "qty_people": it.qty_people, "qty_days": it.qty_days,
            "unit": it.unit, "amount": it.amount, "is_overrun": bool(it.is_overrun), "note": it.note or "",
            "client_unit_price": round(cu, 2), "client_amount": round(client_amt, 2),
            "profit": round(profit, 2),
            "gross_margin": round(profit / client_amt, 4) if client_amt else 0.0,  # 该行毛利率=毛利/客户小计
            "is_locked": bool(it.is_locked),
        })
    return {
        "generated": bool(project.generated),
        "film_type": project.film_type,
        "duration_minutes": project.duration_minutes,
        "shoot_days": project.shoot_days,
        "items": out_items,
        "totals": totals,
    }


# ============ 执行任务（执行端工作台）============

def _task_dict(t, project_name=""):
    return {
        "id": t.id, "project_id": t.project_id, "project_name": project_name,
        "title": t.title, "description": t.description or "", "assignee": t.assignee,
        "stage": t.stage, "deliverable": t.deliverable or "", "deadline": t.deadline or "",
        "priority": t.priority or "中", "status": t.status or "pending",
        "ai_note": t.ai_note or "", "submission": t.submission or "",
    }


def serialize_tasks(db: Session, assignee: str = "employee") -> dict:
    """某执行人的全部任务（跨项目）。"""
    rows = db.query(models.Task).filter(models.Task.assignee == assignee).all()
    names = {p.id: p.name for p in db.query(models.Project).all()}
    items = [_task_dict(t, names.get(t.project_id, "")) for t in rows]
    # 按截止日期排序（空的排后面）
    items.sort(key=lambda x: (x["deadline"] == "", x["deadline"]))
    return {"tasks": items}


def update_task(db: Session, task_id: int, **fields) -> dict:
    t = db.query(models.Task).filter(models.Task.id == int(task_id)).first()
    if not t:
        return {"ok": False, "msg": "任务不存在"}
    for k in ("title", "description", "deliverable", "deadline", "priority", "status", "ai_note", "submission", "assignee"):
        if fields.get(k) is not None:
            setattr(t, k, fields[k])
    db.commit()
    return {"ok": True}


def submit_task(db: Session, task_id: int, note: str = "") -> dict:
    """执行端提交成果：状态→已提交，并给老板/项目经理留一条消息。"""
    t = db.query(models.Task).filter(models.Task.id == int(task_id)).first()
    if not t:
        return {"ok": False, "msg": "任务不存在"}
    t.status = "submitted"
    t.submission = note or "已提交"
    msg = f'张导提交了「{t.title}」：{note or "已完成，请查收"}'
    db.add(models.Message(project_id=t.project_id, session_id="default",
                          sender_id="ai_producer", content=msg, target_role="boss"))
    db.commit()
    return {"ok": True, "title": t.title}


def task_feedback(db: Session, task_id: int, note: str) -> dict:
    """执行端就某任务向 AI 项目经理/老板反馈问题。"""
    t = db.query(models.Task).filter(models.Task.id == int(task_id)).first()
    if not t:
        return {"ok": False, "msg": "任务不存在"}
    msg = f'张导就「{t.title}」反馈：{note}'
    db.add(models.Message(project_id=t.project_id, session_id="default",
                          sender_id="ai_producer", content=msg, target_role="boss"))
    db.commit()
    return {"ok": True}


def serialize_schedule(db: Session, project_id: str) -> dict:
    project = db.query(models.Project).filter(models.Project.id == project_id).first()
    if not project:
        return {}
    items = db.query(models.ScheduleItem).filter(
        models.ScheduleItem.project_id == project_id).order_by(models.ScheduleItem.sort_order).all()
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
