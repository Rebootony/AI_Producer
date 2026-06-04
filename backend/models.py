from sqlalchemy import Column, Integer, String, Float, ForeignKey, DateTime
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship
from database import Base

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
    
    messages = relationship("Message", back_populates="project")
    budget_items = relationship("BudgetBreakdown", back_populates="project")
    crews = relationship("Crew", back_populates="project")
    assets = relationship("Asset", back_populates="project")

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
    
    project = relationship("Project", back_populates="assets")

class Message(Base):
    __tablename__ = "messages"
    id = Column(Integer, primary_key=True, index=True)
    project_id = Column(String, ForeignKey("projects.id"))
    sender_id = Column(String, ForeignKey("users.id"))
    content = Column(String)
    target_role = Column(String, nullable=True)
    timestamp = Column(DateTime(timezone=True), server_default=func.now())
    
    project = relationship("Project", back_populates="messages")
    sender = relationship("User")
