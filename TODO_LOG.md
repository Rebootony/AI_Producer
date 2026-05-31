# 项目开发 Todo List 及状态追踪

> **当前阶段**：前后端基础已搭建，准备进入全链路联调与大模型接入。

## 🎯 任务列表

- [x] **Todo 1: 代码库结构整理**
  - **状态**: `completed`
  - **详情**: 将 agent/producer 目录下的代码结构迁移至 AI_Producer 根目录，并完成 Git 仓库的初始提交。

- [x] **Todo 2: 后端数据库搭建**
  - **状态**: `completed`
  - **详情**: 基于 FastAPI 搭建 SQLite 数据库，设计 Users(用户表)、Projects(项目表)、Messages(消息历史表)，实现 AI 长期记忆功能。

- [x] **Todo 3: 接入大模型**
  - **状态**: `completed`
  - **详情**: 对接硅基流动 API，设定“AI 制片人” System Prompt，并将历史消息作为上下文传递给大模型。

- [x] **Todo 4: 实现核心 Function Calling**
  - **状态**: `completed`
  - **详情**: 在后端开发 `modify_budget` (修改预算)、`update_project_stage` (推进阶段)、`transfer_message` (跨角色传话) 三个工具并供 AI 调用。

- [ ] **Todo 5: 前后端全链路联调**
  - **状态**: `pending`
  - **详情**: 将前端的“角色登录系统”和“Chat 交互”与后端 API 真实连通，跑通创始人“一人分饰两角（老板/员工）”的演示沙盒。

- [ ] **Todo 6: 云端环境部署配置**
  - **状态**: `pending`
  - **详情**: 将后端服务部署至免费云平台（如 Render 或 Supabase），实现无本地环境也能让非程序员直接体验。

---
*注：该文档会随着开发进度实时更新，供您随时查看当前的项目状态。*