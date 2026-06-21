"""
价格单引擎（确定性）。
所有金额计算都在这里完成，LLM 只负责"读 Brief 抽参数"和"对话改动"，绝不自己算钱。
数据来源：成永强 `资料/价格计算方式.xls` 基准单价 + 三套真实样本 + 达梦真实报价。

金额公式： amount = unit_price * qty_people * qty_days
  - B 段(拍摄执行): qty_people=人数, qty_days=天数
  - C 段(后期制作): qty_people=1, qty_days=分钟数(或项数)
  - A/D 段: 多为 qty_people=数量, qty_days=1, 单位"项"
"""
import math
from datetime import datetime, timedelta

PHASE_NAMES = {"A": "前期筹备", "B": "拍摄执行", "C": "后期制作", "D": "其他杂费"}

# —— 基准单价(刊例价)：来自 价格计算方式.xls ——
# item -> (unit_price, unit)
RATE_CARD = {
    # A 前期筹备
    "脚本撰写": (3000, "项"), "创意方案": (3000, "项"), "执行方案": (2000, "项"), "执行脚本": (3000, "项"),
    # B 拍摄执行 (人*天)
    "导演": (3000, "人*天"), "制片": (1000, "人*天"), "摄影": (2000, "人*天"), "焦点": (1500, "人*天"),
    "摄助": (500, "人*天"), "摄影助理": (500, "人*天"), "灯光师": (1500, "人*天"), "灯光助理": (500, "人*天"),
    "美术": (2000, "人*天"), "道具": (1000, "人*天"), "道具助理": (500, "人*天"), "场务": (500, "人*天"),
    "录音师": (2000, "人*天"), "演员": (1000, "人*天"), "服化师": (1500, "人*天"), "服化助理": (500, "人*天"),
    "设备器材": (5000, "套*天"), "场地": (0, "项"),
    # C 后期制作 (分钟/项)
    "剪辑": (1500, "分钟"), "包装": (3000, "分钟"), "视效": (3000, "秒"), "调色": (1500, "分钟"),
    "配乐": (2000, "项"), "配音": (1000, "项"), "素材": (3000, "项"),
    # D 其他杂费
    "餐食": (70, "人*天"), "设备车": (500, "人*天"), "机动费用": (1000, "天"),
}


def rate_of(item_name: str, default_price: float = 3000.0, default_unit: str = "项"):
    return RATE_CARD.get(item_name, (default_price, default_unit))


def round_up_clean(value: float, step: int = 1000) -> float:
    """向上取整到整千，得到对客户报价的"漂亮数字"。"""
    if value <= 0:
        return 0.0
    return float(math.ceil(value / step) * step)


def build_quote_items(profile: list) -> list:
    """
    profile: [{phase, item_name, unit_price?, qty_people, qty_days, unit?, note?}, ...]
    返回带 amount/phase_name/sort_order 的明细行列表。
    """
    items = []
    for i, row in enumerate(profile):
        phase = row["phase"]
        name = row["item_name"]
        up, unit = rate_of(name)
        unit_price = float(row.get("unit_price", up))
        unit = row.get("unit", unit)
        qty_people = float(row.get("qty_people", 1))
        qty_days = float(row.get("qty_days", 1))
        amount = unit_price * qty_people * qty_days
        items.append({
            "phase": phase,
            "phase_name": PHASE_NAMES.get(phase, phase),
            "item_name": name,
            "unit_price": unit_price,
            "qty_people": qty_people,
            "qty_days": qty_days,
            "unit": unit,
            "amount": amount,
            "is_overrun": int(row.get("is_overrun", 0)),
            "sort_order": i,
            "note": row.get("note", ""),
        })
    return items


def client_unit_price(cost_unit: float, margin_rate: float) -> float:
    """把利润摊进单价：对客户的单价 = 成本单价 ×(1+利润率)，取整到元。"""
    return float(round((cost_unit or 0) * (1 + margin_rate)))


def compute_totals(items: list, tax_rate: float = 0.01, margin_rate: float = 0.25) -> dict:
    """利润摊到每一条明细：客户单价=成本单价×(1+利润率)。客户实收=各明细客户金额之和（与明细自洽）。"""
    cost_total = 0.0
    client_total = 0.0
    subtotals = {}          # 成本分段小计
    client_subtotals = {}   # 客户(含利润)分段小计
    for it in items:
        ph = it["phase"]
        cost_amt = it["amount"]
        cost_total += cost_amt
        subtotals[ph] = subtotals.get(ph, 0.0) + cost_amt
        up = it.get("unit_price")
        people = it.get("qty_people", 1)
        days = it.get("qty_days", 1)
        if up is not None:
            cl_amt = client_unit_price(up, margin_rate) * people * days
        else:
            cl_amt = round(cost_amt * (1 + margin_rate))
        client_total += cl_amt
        client_subtotals[ph] = client_subtotals.get(ph, 0.0) + cl_amt
    tax = cost_total * tax_rate
    profit = client_total - cost_total
    return {
        "cost_total": round(cost_total, 2),
        "tax_rate": tax_rate,
        "tax": round(tax, 2),
        "margin_rate": margin_rate,
        "profit": round(profit, 2),
        "client_price": round(client_total, 2),
        "subtotals": {k: round(v, 2) for k, v in subtotals.items()},
        "client_subtotals": {k: round(v, 2) for k, v in client_subtotals.items()},
    }


# ============ 排期生成（按交付日倒推） ============

def generate_schedule(delivery_date: str, shoot_days: int = 3) -> list:
    """
    按客户交付(Final)日期倒推生成排期节点。
    标准工期参考 `资料/部分环节解释.docx`。返回按时间顺序排列的节点列表。
    """
    try:
        delivery = datetime.strptime(delivery_date, "%Y-%m-%d")
    except Exception:
        delivery = datetime.now() + timedelta(days=30)

    shoot_days = max(int(shoot_days or 1), 1)
    shoot_label = f"拍摄 DAY1" if shoot_days == 1 else f"拍摄 DAY1-{shoot_days}"

    # (stage, task, duration_days, is_milestone, needs_client)  —— 时间顺序
    stages = [
        ("前期", "需求沟通", 3, 0, 1),
        ("前期", "脚本大纲撰写", 4, 0, 1),
        ("前期", "脚本细化/分镜", 3, 0, 1),
        ("前期", "PPM 内容准备/堪景", 3, 0, 0),
        ("前期", "Final PPM", 1, 1, 1),
        ("拍摄", "拍摄前准备", 2, 0, 0),
        ("拍摄", shoot_label, shoot_days, 1, 0),
        ("后期", "整理素材/后期剪辑", 4, 0, 0),
        ("后期", "Acopy 提交(完成度80%)", 1, 1, 1),
        ("后期", "Acopy 客户反馈/修改", 3, 0, 1),
        ("后期", "TC 调色", 2, 1, 0),
        ("后期", "Bcopy 提交(完成度95%)/修改", 2, 0, 1),
        ("交付", "Final 交付", 1, 1, 1),
    ]

    total_days = sum(s[2] for s in stages)
    cursor = delivery - timedelta(days=total_days - 1)  # 让最后一个节点正好落在交付日
    today = datetime.now().date()

    items = []
    for i, (stage, task, dur, milestone, needs_client) in enumerate(stages):
        start = cursor
        end = cursor + timedelta(days=dur - 1)
        if end.date() < today:
            status = "completed"
        elif start.date() <= today <= end.date():
            status = "current"
        else:
            status = "pending"
        items.append({
            "stage": stage,
            "task": task,
            "start_date": start.strftime("%Y-%m-%d"),
            "end_date": end.strftime("%Y-%m-%d"),
            "is_milestone": milestone,
            "needs_client": needs_client,
            "status": status,
            "sort_order": i,
        })
        cursor = end + timedelta(days=1)
    return items


# ============ 项目档案（Brief → 参数 profile） ============
# Day1 聚焦达梦：内置一个能复刻真实达梦报价(成本核算 118,860)的 profile。
# 其它项目走通用默认。LLM 抽参数后也可覆盖这里。

DAMENG_QUOTE_PROFILE = [
    {"phase": "A", "item_name": "创意方案", "unit_price": 3000, "qty_people": 1, "qty_days": 1, "unit": "项"},
    {"phase": "A", "item_name": "执行脚本", "unit_price": 3000, "qty_people": 1, "qty_days": 1, "unit": "项"},
    {"phase": "B", "item_name": "导演", "unit_price": 3000, "qty_people": 1, "qty_days": 3, "unit": "人*天"},
    {"phase": "B", "item_name": "制片", "unit_price": 1500, "qty_people": 1, "qty_days": 3, "unit": "人*天"},
    {"phase": "B", "item_name": "摄影", "unit_price": 2500, "qty_people": 1, "qty_days": 3, "unit": "人*天"},
    {"phase": "B", "item_name": "焦点", "unit_price": 1500, "qty_people": 1, "qty_days": 3, "unit": "人*天"},
    {"phase": "B", "item_name": "摄影助理", "unit_price": 500, "qty_people": 2, "qty_days": 3, "unit": "人*天"},
    {"phase": "B", "item_name": "灯光师", "unit_price": 1500, "qty_people": 1, "qty_days": 3, "unit": "人*天"},
    {"phase": "B", "item_name": "灯光助理", "unit_price": 800, "qty_people": 2, "qty_days": 3, "unit": "人*天"},
    {"phase": "B", "item_name": "摄影灯光器材", "unit_price": 5000, "qty_people": 1, "qty_days": 3, "unit": "套*天"},
    {"phase": "B", "item_name": "演员(含外籍)", "unit_price": 2000, "qty_people": 6, "qty_days": 1, "unit": "人*天"},
    {"phase": "B", "item_name": "服化", "unit_price": 800, "qty_people": 2, "qty_days": 2, "unit": "人*天"},
    {"phase": "B", "item_name": "服装道具", "unit_price": 2000, "qty_people": 1, "qty_days": 1, "unit": "项"},
    {"phase": "C", "item_name": "剪辑", "unit_price": 2500, "qty_people": 1, "qty_days": 2, "unit": "分钟"},
    {"phase": "C", "item_name": "包装", "unit_price": 10000, "qty_people": 1, "qty_days": 2, "unit": "分钟"},
    {"phase": "C", "item_name": "调色", "unit_price": 1500, "qty_people": 1, "qty_days": 2, "unit": "分钟"},
    {"phase": "C", "item_name": "版权音乐", "unit_price": 2000, "qty_people": 1, "qty_days": 1, "unit": "项"},
    {"phase": "C", "item_name": "版权素材", "unit_price": 5000, "qty_people": 1, "qty_days": 1, "unit": "项"},
    {"phase": "D", "item_name": "演职人员餐食", "unit_price": 70, "qty_people": 16, "qty_days": 3, "unit": "人*天"},
    {"phase": "D", "item_name": "设备车", "unit_price": 500, "qty_people": 1, "qty_days": 3, "unit": "人*天"},
    {"phase": "D", "item_name": "机动费用", "unit_price": 1000, "qty_people": 3, "qty_days": 1, "unit": "天"},
]

# 通用默认 profile（无 Brief 信息时的兜底：一条常规 5 分钟宣传片）
DEFAULT_QUOTE_PROFILE = [
    {"phase": "A", "item_name": "创意方案", "qty_people": 1, "qty_days": 1, "unit": "项"},
    {"phase": "A", "item_name": "执行脚本", "qty_people": 1, "qty_days": 1, "unit": "项"},
    {"phase": "B", "item_name": "导演", "qty_people": 1, "qty_days": 2, "unit": "人*天"},
    {"phase": "B", "item_name": "制片", "qty_people": 1, "qty_days": 2, "unit": "人*天"},
    {"phase": "B", "item_name": "摄影", "qty_people": 1, "qty_days": 2, "unit": "人*天"},
    {"phase": "B", "item_name": "摄影助理", "qty_people": 1, "qty_days": 2, "unit": "人*天"},
    {"phase": "B", "item_name": "灯光师", "qty_people": 1, "qty_days": 2, "unit": "人*天"},
    {"phase": "B", "item_name": "设备器材", "qty_people": 1, "qty_days": 2, "unit": "套*天"},
    {"phase": "C", "item_name": "剪辑", "qty_people": 1, "qty_days": 5, "unit": "分钟"},
    {"phase": "C", "item_name": "包装", "qty_people": 1, "qty_days": 5, "unit": "分钟"},
    {"phase": "C", "item_name": "调色", "qty_people": 1, "qty_days": 5, "unit": "分钟"},
    {"phase": "D", "item_name": "餐食", "qty_people": 8, "qty_days": 2, "unit": "人*天"},
]

# 泰康之家·海琴府：复刻 资料/1泰康 真实成本单（成本 ≈ 9.3 万，拍摄 3 天）
TAIKANG_QUOTE_PROFILE = [
    {"phase": "A", "item_name": "创意脚本撰写", "unit_price": 3000, "qty_people": 1, "qty_days": 1, "unit": "项"},
    {"phase": "A", "item_name": "执行计划方案", "unit_price": 3000, "qty_people": 1, "qty_days": 1, "unit": "项"},
    {"phase": "B", "item_name": "导演", "unit_price": 3000, "qty_people": 1, "qty_days": 4, "unit": "人*天"},
    {"phase": "B", "item_name": "制片", "unit_price": 1000, "qty_people": 1, "qty_days": 4, "unit": "人*天"},
    {"phase": "B", "item_name": "摄影", "unit_price": 2000, "qty_people": 2, "qty_days": 3, "unit": "人*天"},
    {"phase": "B", "item_name": "灯光师", "unit_price": 1500, "qty_people": 1, "qty_days": 3, "unit": "人*天"},
    {"phase": "B", "item_name": "摄影助理", "unit_price": 500, "qty_people": 2, "qty_days": 3, "unit": "人*天"},
    {"phase": "B", "item_name": "灯光助理", "unit_price": 500, "qty_people": 2, "qty_days": 3, "unit": "人*天"},
    {"phase": "B", "item_name": "化妆师", "unit_price": 1000, "qty_people": 1, "qty_days": 3, "unit": "人*天"},
    {"phase": "B", "item_name": "化妆助理", "unit_price": 500, "qty_people": 1, "qty_days": 3, "unit": "人*天"},
    {"phase": "B", "item_name": "场务", "unit_price": 500, "qty_people": 2, "qty_days": 3, "unit": "人*天"},
    {"phase": "B", "item_name": "青岛设备器材", "unit_price": 4100, "qty_people": 1, "qty_days": 3, "unit": "项*天"},
    {"phase": "B", "item_name": "北京设备器材", "unit_price": 2900, "qty_people": 1, "qty_days": 3, "unit": "项*天"},
    {"phase": "C", "item_name": "剪辑", "unit_price": 1500, "qty_people": 1, "qty_days": 6, "unit": "分钟"},
    {"phase": "C", "item_name": "包装", "unit_price": 500, "qty_people": 1, "qty_days": 6, "unit": "分钟"},
    {"phase": "C", "item_name": "调色", "unit_price": 1000, "qty_people": 6, "qty_days": 1, "unit": "项"},
    {"phase": "C", "item_name": "版权音乐(线上)", "unit_price": 500, "qty_people": 1, "qty_days": 1, "unit": "项"},
    {"phase": "C", "item_name": "花字设计", "unit_price": 500, "qty_people": 1, "qty_days": 1, "unit": "项"},
    {"phase": "D", "item_name": "货拉拉", "unit_price": 627, "qty_people": 1, "qty_days": 1, "unit": "项"},
]

# 项目档案：project_id -> {profile, shoot_days, duration_minutes, difficulty, film_type}
PROJECT_PROFILES = {
    "p1": {"profile": DAMENG_QUOTE_PROFILE, "shoot_days": 3, "duration_minutes": 2,
           "difficulty": "中", "film_type": "英文宣传片"},
    "p2": {"profile": TAIKANG_QUOTE_PROFILE, "shoot_days": 3, "duration_minutes": 6,
           "difficulty": "中", "film_type": "品牌宣传片"},
}


def get_project_profile(project_id: str) -> dict:
    if project_id in PROJECT_PROFILES:
        return PROJECT_PROFILES[project_id]
    return {"profile": DEFAULT_QUOTE_PROFILE, "shoot_days": 2, "duration_minutes": 5,
            "difficulty": "中", "film_type": "宣传片"}


# 不同摄制组规格的人员模板（人数）
CREW_TEMPLATES = {
    "小": [("导演", 1), ("摄影", 1), ("摄影助理", 1), ("灯光师", 1)],
    "中": [("导演", 1), ("制片", 1), ("摄影", 1), ("摄影助理", 1), ("灯光师", 1), ("灯光助理", 1)],
    "大": [("导演", 1), ("制片", 1), ("摄影", 1), ("焦点", 1), ("摄影助理", 2), ("灯光师", 1),
           ("灯光助理", 2), ("美术", 1), ("录音师", 1)],
}


def build_dynamic_profile(params: dict) -> list:
    """根据从 Brief 抽取的参数动态生成报价档案（人数/天数/分钟由参数驱动，单价仍来自价格单）。"""
    shoot_days = max(int(params.get("shoot_days") or 2), 1)
    duration = max(float(params.get("duration_minutes") or 5), 1)
    scale = params.get("crew_scale") or "中"
    if scale not in CREW_TEMPLATES:
        scale = "中"
    crew = CREW_TEMPLATES[scale]

    profile = [
        {"phase": "A", "item_name": "创意方案", "qty_people": 1, "qty_days": 1, "unit": "项"},
        {"phase": "A", "item_name": "执行脚本", "qty_people": 1, "qty_days": 1, "unit": "项"},
    ]
    for name, people in crew:
        profile.append({"phase": "B", "item_name": name, "qty_people": people,
                        "qty_days": shoot_days, "unit": "人*天"})
    profile.append({"phase": "B", "item_name": "设备器材", "qty_people": 1,
                    "qty_days": shoot_days, "unit": "套*天"})
    mins = max(round(duration), 1)
    for name in ("剪辑", "包装", "调色"):
        profile.append({"phase": "C", "item_name": name, "qty_people": 1, "qty_days": mins, "unit": "分钟"})
    headcount = sum(p for _, p in crew) + 2
    profile.append({"phase": "D", "item_name": "餐食", "qty_people": headcount,
                    "qty_days": shoot_days, "unit": "人*天"})
    return profile
