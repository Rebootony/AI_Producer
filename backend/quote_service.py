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
    """重建排期 + 由排期派生执行任务（派给执行端），并写全任务字段与线性依赖链。"""
    db.query(models.ScheduleItem).filter(models.ScheduleItem.project_id == project_id).delete()
    db.query(models.Task).filter(models.Task.project_id == project_id).delete()
    db.flush()
    created = []
    for s in eng.generate_schedule(delivery_date, days):
        db.add(models.ScheduleItem(project_id=project_id, **s))
        need = "（需客户配合确认）" if s.get("needs_client") else ""
        t = models.Task(
            project_id=project_id, title=s["task"], description=f"{s['stage']}阶段 · {s['task']}",
            assignee="employee", stage=s["stage"], deliverable=eng.task_deliverable(s["task"]),
            start_date=s["start_date"], deadline=s["end_date"],
            priority="高" if s["is_milestone"] else "中", status="pending",
            collaborators=eng.task_collab(s["task"]),
            background=f"{s['stage']}阶段任务：{s['task']}{need}。",
            requirements=f"按{s['stage']}标准完成「{s['task']}」，产出可评审的{eng.task_deliverable(s['task'])}。",
            ref_material="客户 Brief、项目脚本与价格单",
            sort_order=s["sort_order"])
        db.add(t)
        created.append(t)
    db.flush()  # 拿到 id 后，串成线性依赖链（前一个任务是后一个的前置）
    for prev, cur in zip(created, created[1:]):
        cur.depends_on = prev.id


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


def set_tax_rate(db: Session, project_id: str, rate: float) -> dict:
    """调整税点。传 0.06 或 6 都当 6%。不改各明细，只影响含税报价与税额。"""
    project = db.query(models.Project).filter(models.Project.id == project_id).first()
    if not project:
        return {"ok": False, "msg": "项目不存在"}
    try:
        r = float(rate)
    except Exception:
        return {"ok": False, "msg": "税率不合法"}
    if r > 1:          # 传 6 表示 6%
        r = r / 100.0
    r = max(0.0, min(r, 0.5))
    project.tax_rate = r
    totals = recompute_totals(db, project)
    db.commit()
    return {"ok": True, "tax_rate": r, "client_price": totals["client_price"],
            "client_price_tax": totals.get("client_price_tax", totals["client_price"]),
            "tax": totals.get("tax", 0)}


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
        "stage": t.stage, "deliverable": t.deliverable or "",
        "start_date": t.start_date or "", "deadline": t.deadline or "",
        "priority": t.priority or "中", "status": t.status or "pending",
        "ai_note": t.ai_note or "", "submission": t.submission or "",
        "collaborators": t.collaborators or "", "background": t.background or "",
        "requirements": t.requirements or "", "ref_material": t.ref_material or "",
        "depends_on": t.depends_on,
        "has_file": bool(t.submission_file), "submission_filename": t.submission_filename or "",
        "submitted_at": t.submitted_at or "", "submitter": t.submitter or "",
    }


def serialize_tasks(db: Session, assignee: str = "employee") -> dict:
    """某执行人的全部任务（跨项目）。"""
    rows = db.query(models.Task).filter(models.Task.assignee == assignee).all()
    names = {p.id: p.name for p in db.query(models.Project).all()}
    items = [_task_dict(t, names.get(t.project_id, "")) for t in rows]
    # 按截止日期排序（空的排后面）
    items.sort(key=lambda x: (x["deadline"] == "", x["deadline"]))
    return {"tasks": items}


_STATUS_CN = {"pending": "待办", "in_progress": "进行中", "submitted": "待初审",
              "revision": "退回修改", "done": "已完成", "delayed": "已延期"}


def serialize_execution(db: Session, project_id: str) -> dict:
    """Boss 端「执行看板」：项目整体进度 + 每条任务当前谁在做/什么状态/是否延期/诺亚备注。"""
    from datetime import date
    rows = (db.query(models.Task)
              .filter(models.Task.project_id == project_id)
              .order_by(models.Task.sort_order, models.Task.id).all())
    members = db.query(models.TeamMember).filter(models.TeamMember.project_id == project_id).all()
    today = date.today().isoformat()

    def owner_for(t):
        # 优先匹配同阶段的团队成员，否则回落到执行人（员工=张导）
        for m in members:
            if m.stage and t.stage and (m.stage in t.stage or t.stage in m.stage) and m.stage != "全程":
                return m.name
        return "张导" if t.assignee == "employee" else (t.assignee or "—")

    def next_step(t):
        s = t.status
        if s == "done":
            return "已完成，进入下一节点"
        if s in ("submitted", "revision"):
            return "诺亚初审中"
        if s == "in_progress":
            return f"按标准推进，{t.deadline or '按期'}前提交" if t.deadline else "按标准推进并提交"
        return "待启动"

    items = []
    for t in rows:
        overdue = bool(t.deadline) and t.deadline < today and t.status != "done"
        d = _task_dict(t)
        d.update({
            "owner": owner_for(t),
            "status_cn": _STATUS_CN.get(t.status, t.status),
            "overdue": overdue,
            "next_step": next_step(t),
        })
        items.append(d)

    total = len(rows)
    done = sum(1 for t in rows if t.status == "done")
    prog = {
        "total": total,
        "done": done,
        "in_progress": sum(1 for t in rows if t.status == "in_progress"),
        "submitted": sum(1 for t in rows if t.status in ("submitted", "revision")),
        "pending": sum(1 for t in rows if t.status == "pending"),
        "overdue": sum(1 for t in items if t["overdue"]),
        "rate": round(done / total * 100) if total else 0,
    }
    return {"progress": prog, "tasks": items}


_EDITABLE_TASK_FIELDS = ("title", "description", "deliverable", "start_date", "deadline",
                         "priority", "status", "ai_note", "submission", "assignee", "stage",
                         "collaborators", "background", "requirements", "ref_material", "depends_on")


def _pdate(s):
    from datetime import datetime as _dt
    try:
        return _dt.strptime((s or "").strip(), "%Y-%m-%d").date()
    except Exception:
        return None


def _reschedule_from(db: Session, project_id: str, root_id: int) -> list:
    """§1.3 自动重排：某任务日期变化后，沿依赖链把"会早于前置结束就开始"的后续任务顺延（保持各自时长）。"""
    from datetime import timedelta
    tasks = {t.id: t for t in db.query(models.Task).filter(models.Task.project_id == project_id).all()}
    children = {}
    for t in tasks.values():
        if t.depends_on:
            children.setdefault(t.depends_on, []).append(t)
    shifted, seen, stack = [], set(), [root_id]
    while stack:
        pid = stack.pop()
        if pid in seen:
            continue
        seen.add(pid)
        parent = tasks.get(pid)
        pend = _pdate(parent.deadline) if parent else None
        if not pend:
            continue
        for ch in children.get(pid, []):
            min_start = pend + timedelta(days=1)
            cstart, cend = _pdate(ch.start_date), _pdate(ch.deadline)
            if cstart is None or cstart < min_start:
                dur = (cend - cstart).days if (cstart and cend and cend >= cstart) else 0
                ch.start_date = min_start.isoformat()
                ch.deadline = (min_start + timedelta(days=max(dur, 0))).isoformat()
                shifted.append(ch.id)
            stack.append(ch.id)
    if shifted:
        db.commit()
    return shifted


def update_task(db: Session, task_id: int, **fields) -> dict:
    t = db.query(models.Task).filter(models.Task.id == int(task_id)).first()
    if not t:
        return {"ok": False, "msg": "任务不存在"}
    date_changed = False
    for k in _EDITABLE_TASK_FIELDS:
        if fields.get(k) is not None:
            setattr(t, k, fields[k])
            if k in ("start_date", "deadline"):
                date_changed = True
    db.commit()
    shifted = _reschedule_from(db, t.project_id, t.id) if date_changed else []
    return {"ok": True, "shifted": shifted}


def add_task(db: Session, project_id: str, title: str, **fields) -> dict:
    if not title or not title.strip():
        return {"ok": False, "msg": "任务名不能为空"}
    from sqlalchemy import func as _f
    maxsort = db.query(_f.max(models.Task.sort_order)).filter(
        models.Task.project_id == project_id).scalar() or 0
    t = models.Task(project_id=project_id, title=title.strip(), assignee="employee",
                    status="pending", priority="中", sort_order=maxsort + 1)
    for k in _EDITABLE_TASK_FIELDS:
        if fields.get(k) is not None:
            setattr(t, k, fields[k])
    db.add(t)
    db.commit()
    return {"ok": True, "id": t.id}


def delete_task(db: Session, task_id: int) -> dict:
    t = db.query(models.Task).filter(models.Task.id == int(task_id)).first()
    if not t:
        return {"ok": False, "msg": "任务不存在"}
    # 依赖它的任务改为指向它的前置，避免依赖链断裂
    for ch in db.query(models.Task).filter(models.Task.depends_on == t.id).all():
        ch.depends_on = t.depends_on
    db.delete(t)
    db.commit()
    return {"ok": True}


def move_task(db: Session, task_id: int, direction: str) -> dict:
    """排期任务上移/下移（§1）：规整 sort_order 后与相邻任务交换。"""
    t = db.query(models.Task).filter(models.Task.id == int(task_id)).first()
    if not t:
        return {"ok": False, "msg": "任务不存在"}
    rows = (db.query(models.Task).filter(models.Task.project_id == t.project_id)
              .order_by(models.Task.sort_order, models.Task.id).all())
    idx = next((i for i, r in enumerate(rows) if r.id == t.id), -1)
    j = idx - 1 if direction == "up" else idx + 1
    if idx < 0 or j < 0 or j >= len(rows):
        return {"ok": False, "msg": "已到边界"}
    for k, r in enumerate(rows):
        r.sort_order = k
    rows[idx].sort_order, rows[j].sort_order = rows[j].sort_order, rows[idx].sort_order
    db.commit()
    return {"ok": True}


_PHASE_ORDER = {"A": 0, "B": 1, "C": 2, "D": 3}

def move_quote_item(db: Session, project_id: str, item_id: int, direction: str) -> dict:
    """预算明细在【同一阶段内】上移/下移（§1）：先按阶段规整全局 sort_order，再交换同阶段相邻项。"""
    it = db.query(models.QuoteItem).filter(
        models.QuoteItem.id == int(item_id), models.QuoteItem.project_id == project_id).first()
    if not it:
        return {"ok": False, "msg": "报价项不存在"}
    allrows = db.query(models.QuoteItem).filter(models.QuoteItem.project_id == project_id).all()
    allrows.sort(key=lambda r: (_PHASE_ORDER.get(r.phase, 9), r.sort_order, r.id))
    for k, r in enumerate(allrows):
        r.sort_order = k
    sibs = [r for r in allrows if r.phase == it.phase]
    idx = next((i for i, r in enumerate(sibs) if r.id == it.id), -1)
    j = idx - 1 if direction == "up" else idx + 1
    if idx < 0 or j < 0 or j >= len(sibs):
        return {"ok": False, "msg": "已到边界"}
    sibs[idx].sort_order, sibs[j].sort_order = sibs[j].sort_order, sibs[idx].sort_order
    db.commit()
    return {"ok": True}


def serialize_task_schedule(db: Session, project_id: str) -> dict:
    """Boss 端排期编辑视图：按顺序返回全部任务（含开始/结束/依赖/负责人等可编辑字段）。"""
    from datetime import date
    rows = (db.query(models.Task).filter(models.Task.project_id == project_id)
              .order_by(models.Task.sort_order, models.Task.id).all())
    today = date.today().isoformat()
    items = []
    for t in rows:
        d = _task_dict(t)
        d["status_cn"] = _STATUS_CN.get(t.status, t.status)
        d["overdue"] = bool(t.deadline) and t.deadline < today and t.status != "done"
        items.append(d)
    return {"tasks": items}


# ============ 决策方案卡片（§3.6）============

def create_proposal(db: Session, project_id: str, summary: str, conclusion: str = "",
                    impact: str = "", option_a: str = "", option_b: str = "", option_c: str = "",
                    recommend: str = "", decision: str = "") -> dict:
    if not summary or not summary.strip():
        return {"ok": False, "msg": "缺少问题摘要"}
    p = models.Proposal(project_id=project_id, summary=summary.strip(), conclusion=conclusion,
                        impact=impact, option_a=option_a, option_b=option_b, option_c=option_c,
                        recommend=recommend, decision=decision, status="pending")
    db.add(p)
    db.commit()
    return {"ok": True, "id": p.id}


def _proposal_dict(p) -> dict:
    return {
        "id": p.id, "project_id": p.project_id, "summary": p.summary or "",
        "conclusion": p.conclusion or "", "impact": p.impact or "",
        "option_a": p.option_a or "", "option_b": p.option_b or "", "option_c": p.option_c or "",
        "recommend": p.recommend or "", "decision": p.decision or "",
        "status": p.status or "pending", "chosen": p.chosen or "", "result_note": p.result_note or "",
        "created_at": p.created_at.isoformat() if p.created_at else "",
    }


def serialize_proposals(db: Session, project_id: str, only_pending: bool = True) -> dict:
    rows = (db.query(models.Proposal).filter(models.Proposal.project_id == project_id)
              .order_by(models.Proposal.id.desc()).all())
    items = [_proposal_dict(p) for p in rows if (not only_pending or p.status == "pending")]
    return {"proposals": items}


def act_on_proposal(db: Session, proposal_id: int, action: str, chosen: str = "", note: str = "") -> dict:
    """老板对决策卡片操作：confirm(选方案→转执行) / reject(驳回) / need_more(要求补充)。"""
    p = db.query(models.Proposal).filter(models.Proposal.id == int(proposal_id)).first()
    if not p:
        return {"ok": False, "msg": "方案不存在"}
    if p.status != "pending":
        return {"ok": False, "msg": "该方案已处理"}

    if action == "confirm":
        opts = {"A": p.option_a, "B": p.option_b, "C": p.option_c}
        p.chosen = (chosen or "A").upper()
        chosen_text = opts.get(p.chosen) or p.option_a or p.recommend
        p.status = "confirmed"
        p.result_note = f"按{p.chosen}方案执行：{chosen_text}"
        # 转成执行指令：给执行端建一条高优任务 + 留言
        add_task(db, p.project_id, title=f"[决策执行] {p.summary[:18]}",
                 background=p.summary, requirements=chosen_text, priority="高", status="pending")
        db.add(models.Message(project_id=p.project_id, session_id="default", sender_id="ai_producer",
                              content=f"诺亚：老板已拍板，按{p.chosen}方案执行——{chosen_text}。我已排进你的任务，按要求推进。",
                              target_role="employee"))
        db.commit()
        return {"ok": True, "instruction": p.result_note}

    if action == "reject":
        p.status = "rejected"
        p.result_note = note or "老板已驳回该方案"
        db.commit()
        return {"ok": True}

    if action == "need_more":
        p.status = "need_more"
        p.result_note = note or "老板要求补充更多方案"
        db.add(models.Message(project_id=p.project_id, session_id="default", sender_id="ai_producer",
                              content=f"诺亚：收到，「{p.summary}」我再补充几个可选方案，稍后给你新的卡片。",
                              target_role="boss"))
        db.commit()
        return {"ok": True}

    return {"ok": False, "msg": "未知操作"}


def _now_str():
    from datetime import datetime, timezone, timedelta
    return datetime.now(timezone(timedelta(hours=8))).strftime("%Y-%m-%d %H:%M")


def submit_task(db: Session, task_id: int, note: str = "", filename: str = "",
                file_path: str = "", submitter: str = "张导") -> dict:
    """执行端提交成果：状态→已提交(待审核，不直接完成)，可带成果文件；给老板留一条消息。"""
    t = db.query(models.Task).filter(models.Task.id == int(task_id)).first()
    if not t:
        return {"ok": False, "msg": "任务不存在"}
    t.status = "submitted"            # 上传成果 ≠ 完成：进入待审核
    t.submission = note or "已提交"
    t.submitter = submitter
    t.submitted_at = _now_str()
    if file_path:
        t.submission_file = file_path
        t.submission_filename = filename or "成果文件"
    file_tip = f"（附件：{t.submission_filename}）" if t.submission_file else ""
    msg = f'{submitter}提交了「{t.title}」待你审核{file_tip}：{note or "请查收"}'
    db.add(models.Message(project_id=t.project_id, session_id="default",
                          sender_id="ai_producer", content=msg, target_role="boss"))
    db.commit()
    return {"ok": True, "title": t.title}


def approve_task(db: Session, task_id: int) -> dict:
    """老板审核通过：任务→已完成，执行端同步；给执行端留一条消息。"""
    t = db.query(models.Task).filter(models.Task.id == int(task_id)).first()
    if not t:
        return {"ok": False, "msg": "任务不存在"}
    t.status = "done"
    t.ai_note = ""   # 通过后清掉旧的退回意见
    db.add(models.Message(project_id=t.project_id, session_id="default", sender_id="ai_producer",
                          content=f'诺亚已确认通过「{t.title}」，进入下一节点。', target_role="employee"))
    db.commit()
    return {"ok": True}


def reject_task(db: Session, task_id: int, reason: str) -> dict:
    """老板退回：必须填修改意见；任务→需修改，执行端同步显示退回原因。"""
    if not reason or not reason.strip():
        return {"ok": False, "msg": "退回必须填写修改意见"}
    t = db.query(models.Task).filter(models.Task.id == int(task_id)).first()
    if not t:
        return {"ok": False, "msg": "任务不存在"}
    t.status = "revision"
    t.ai_note = reason.strip()
    db.add(models.Message(project_id=t.project_id, session_id="default", sender_id="ai_producer",
                          content=f'诺亚已退回「{t.title}」，需修改：{reason.strip()}', target_role="employee"))
    db.commit()
    return {"ok": True}


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
