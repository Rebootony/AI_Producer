from sqlalchemy import Column, Integer, String, Float, ForeignKey, DateTime
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship
from database import Base
from datetime import datetime, timezone, timedelta

def get_utc_8():
    return datetime.now(timezone(timedelta(hours=8)))

class User(Base):
    __tablename__ = "users"
    id = Column(String, primary_key=True, index=True)
    role = Column(String)
    name = Column(String)

class Project(Base):
    __tablename__ = "projects"
    id = Column(String, primary_key=True, index=True)
    name = Column(String)
    client = Column(String, default="未知客户")
    industry = Column(String, default="未知行业")
    goal = Column(String, default="品牌宣传")
    delivery_date = Column(String, default="2026-04-15")
    status = Column(String, default="planning")
    budget = Column(Float, default=0.0)

    # —— v2 报价/排期相关字段 ——
    film_type = Column(String, default="宣传片")          # 影片性质
    duration_minutes = Column(Float, default=0.0)          # 影片时长(分钟)
    difficulty = Column(String, default="中")              # 难度: 低/中/高
    shoot_days = Column(Integer, default=0)                # 拍摄天数(驱动排期)
    cost_total = Column(Float, default=0.0)                # 成本核算(各段小计之和)
    tax_rate = Column(Float, default=0.01)                 # 税点
    margin_rate = Column(Float, default=0.25)              # 利润率(默认25%)
    client_price = Column(Float, default=0.0)              # 实收(对客户报价)
    brief_text = Column(String, default="")                # 上传/粘贴的 Brief 文本
    generated = Column(Integer, default=0)                 # 是否已生成报价+排期

    messages = relationship("Message", back_populates="project")
    budget_items = relationship("BudgetBreakdown", back_populates="project")
    crews = relationship("Crew", back_populates="project")
    assets = relationship("Asset", back_populates="project")
    quote_items = relationship("QuoteItem", back_populates="project", cascade="all, delete-orphan")
    schedule_items = relationship("ScheduleItem", back_populates="project", cascade="all, delete-orphan")

class BudgetBreakdown(Base):
    __tablename__ = "budget_breakdown"
    id = Column(Integer, primary_key=True, index=True)
    project_id = Column(String, ForeignKey("projects.id"))
    category = Column(String)  # e.g., '前期筹备', '拍摄执行'
    item_name = Column(String) # e.g., '导演', '创意方案'
    amount = Column(Float, default=0.0)
    
    project = relationship("Project", back_populates="budget_items")

class Crew(Base):
    __tablename__ = "crews"
    id = Column(Integer, primary_key=True, index=True)
    project_id = Column(String, ForeignKey("projects.id"))
    role = Column(String) # e.g., '导演', '制片'
    name = Column(String)
    days = Column(Integer, default=1)
    
    project = relationship("Project", back_populates="crews")

class Asset(Base):
    __tablename__ = "assets"
    id = Column(Integer, primary_key=True, index=True)
    project_id = Column(String, ForeignKey("projects.id"))
    name = Column(String)
    asset_type = Column(String) # e.g., '文档', '视频'
    file_path = Column(String, nullable=True)   # 上传文件的本地存储路径（有则可下载）
    kind = Column(String, default="upload")     # upload(用户上传) / generated(平台生成)

    project = relationship("Project", back_populates="assets")

class QuoteItem(Base):
    """报价单明细行。金额 = 单价 × 人数 × 天数（后期段天数视为分钟数/项数，统一用 qty_days 承载）。"""
    __tablename__ = "quote_items"
    id = Column(Integer, primary_key=True, index=True)
    project_id = Column(String, ForeignKey("projects.id"))
    phase = Column(String)        # A/B/C/D
    phase_name = Column(String)   # 前期筹备/拍摄执行/后期制作/其他杂费
    item_name = Column(String)    # 导演/摄影/剪辑...
    unit_price = Column(Float, default=0.0)
    qty_people = Column(Float, default=1)   # 人数/项数
    qty_days = Column(Float, default=1)     # 天数(B段) / 分钟数(C段) / 1(项)
    unit = Column(String, default="项")     # 人*天 / 项 / 分钟 ...
    amount = Column(Float, default=0.0)     # 成本金额 = unit_price * qty_people * qty_days
    client_unit_price = Column(Float, default=0.0)  # 客户单价(含利润，可独立编辑)；0 表示按全局利润率算
    is_locked = Column(Integer, default=0)  # 价格锁定：AI/批量调利润率时不动此项
    is_overrun = Column(Integer, default=0) # 是否为超支新增项
    sort_order = Column(Integer, default=0)
    note = Column(String, default="")

    project = relationship("Project", back_populates="quote_items")


class ScheduleItem(Base):
    """排期节点。按客户交付日倒推生成。"""
    __tablename__ = "schedule_items"
    id = Column(Integer, primary_key=True, index=True)
    project_id = Column(String, ForeignKey("projects.id"))
    stage = Column(String)         # 前期/拍摄/后期/交付
    task = Column(String)          # 需求沟通/Final PPM/拍摄DAY1-3/Acopy提交...
    start_date = Column(String)    # YYYY-MM-DD
    end_date = Column(String)
    is_milestone = Column(Integer, default=0)  # 关键节点(不可随意变)
    needs_client = Column(Integer, default=0)  # 需客户配合
    status = Column(String, default="pending") # pending/current/completed
    sort_order = Column(Integer, default=0)

    project = relationship("Project", back_populates="schedule_items")


class TeamMember(Base):
    """项目团队成员（按阶段配置，可增减，可指定项目经理）。"""
    __tablename__ = "team_members"
    id = Column(Integer, primary_key=True, index=True)
    project_id = Column(String, ForeignKey("projects.id"))
    name = Column(String)
    role = Column(String)
    stage = Column(String, default="全程")   # 全程/前期/拍摄/后期
    is_pm = Column(Integer, default=0)        # 是否项目经理
    sort_order = Column(Integer, default=0)

    project = relationship("Project")


class ProjectGroup(Base):
    """项目经理"拉的群"：把跨阶段需要对接的人组成一个协作小组。"""
    __tablename__ = "project_groups"
    id = Column(Integer, primary_key=True, index=True)
    project_id = Column(String, ForeignKey("projects.id"))
    name = Column(String)
    members = Column(String, default="")     # 逗号分隔的成员名
    purpose = Column(String, default="")
    created_at = Column(DateTime(timezone=True), default=get_utc_8)

    project = relationship("Project")


class Task(Base):
    """执行任务：派给执行端（员工）的个人任务。由排期生成，也可由 AI/老板指派。"""
    __tablename__ = "tasks"
    id = Column(Integer, primary_key=True, index=True)
    project_id = Column(String, ForeignKey("projects.id"))
    title = Column(String)
    description = Column(String, default="")
    assignee = Column(String, default="employee")  # 负责人（执行端）
    stage = Column(String, default="")
    deliverable = Column(String, default="")        # 交付标准/交付物
    start_date = Column(String, default="")          # 开始时间 YYYY-MM-DD（§1.3 周期编辑）
    deadline = Column(String, default="")           # 截止/结束 YYYY-MM-DD
    priority = Column(String, default="中")          # 高/中/低
    status = Column(String, default="pending")       # pending/in_progress/submitted/done/revision/delayed
    ai_note = Column(String, default="")             # AI 项目经理修改意见
    submission = Column(String, default="")          # 员工提交说明
    # —— §6 任务卡片全字段 ——
    collaborators = Column(String, default="")       # 协作人
    background = Column(String, default="")          # 任务背景
    requirements = Column(String, default="")        # 任务要求
    ref_material = Column(String, default="")        # 参考资料
    depends_on = Column(Integer, nullable=True)      # 依赖的前置任务 id（§1.3 依赖/自动重排）
    sort_order = Column(Integer, default=0)
    created_at = Column(DateTime(timezone=True), default=get_utc_8)

    project = relationship("Project")


class Proposal(Base):
    """诺亚向老板提交的「决策方案卡片」（§3.6）：重大风险/方向问题时生成，老板可确认(选方案)/驳回/要求补充。"""
    __tablename__ = "proposals"
    id = Column(Integer, primary_key=True, index=True)
    project_id = Column(String, ForeignKey("projects.id"))
    summary = Column(String, default="")       # 问题摘要
    conclusion = Column(String, default="")    # 当前结论
    impact = Column(String, default="")        # 影响判断
    option_a = Column(String, default="")      # 方案A
    option_b = Column(String, default="")      # 方案B
    option_c = Column(String, default="")      # 方案C（可空）
    recommend = Column(String, default="")     # 诺亚推荐（含理由，通常指向 A/B/C 之一）
    decision = Column(String, default="")      # 需要决策事项
    status = Column(String, default="pending") # pending/confirmed/rejected/need_more
    chosen = Column(String, default="")        # 老板确认时选择的方案 A/B/C
    result_note = Column(String, default="")   # 确认后诺亚转成的执行指令
    created_at = Column(DateTime(timezone=True), default=get_utc_8)

    project = relationship("Project")


class ChatThread(Base):
    __tablename__ = "chat_threads"
    id = Column(String, primary_key=True, index=True)
    project_id = Column(String, ForeignKey("projects.id"))
    user_id = Column(String, ForeignKey("users.id"))
    name = Column(String)
    updated_at = Column(DateTime(timezone=True), default=get_utc_8, onupdate=get_utc_8)
    
    project = relationship("Project")
    user = relationship("User")

class Message(Base):
    __tablename__ = "messages"
    id = Column(Integer, primary_key=True, index=True)
    project_id = Column(String, ForeignKey("projects.id"))
    session_id = Column(String, default="default", index=True)
    sender_id = Column(String, ForeignKey("users.id"))
    content = Column(String)
    target_role = Column(String, nullable=True)
    timestamp = Column(DateTime(timezone=True), default=get_utc_8)
    is_read = Column(Integer, default=0)
    
    project = relationship("Project", back_populates="messages")
    sender = relationship("User")
