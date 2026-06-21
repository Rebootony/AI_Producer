# AI 制片 (AI Producer) - 本地全栈运行指南

本项目分为前端（React + Vite）和后端（Python + FastAPI）。核心能力：**上传客户 Brief → 一键生成报价单 + 执行排期 → 与 AI 制片实时对话调整**（改单价/人数/拍摄天数/利润率、超支管控），同时保留老板↔员工的传话协作。

## 目录结构
- `/frontend` - 前端界面代码
- `/backend` - 后端逻辑、价格单引擎与大模型连接代码

---

## ⚡ 最快上手（推荐）

Mac 下直接双击或运行：
```bash
bash start_mac.command
```
它会自动清理旧进程、装依赖、同时启动前后端，并打开浏览器。打开后选「创始人/老板」→ 左侧进「项目 / 达梦」→ 在「项目总览」点「立即生成」，即可看到报价、排期与利润率滑杆。

> 想要干净的初始演示态：删掉 `backend/sql_app_demo.db` 再启动，达梦会回到「未生成」状态。

---

## 🤖 大模型配置（OpenRouter 免费模型）

后端通过 **OpenAI 兼容接口** 连接大模型，默认使用 **OpenRouter 免费模型**。配置在 [`backend/.env`](backend/.env)：

1. 去 https://openrouter.ai → **Keys** 申请一个免费 API Key；
2. 把它粘到 `.env` 的 `OPENROUTER_API_KEY=` 后面；
3. 重新运行 `start_mac.command`（或重启后端）。

```env
LLM_BASE_URL=https://openrouter.ai/api/v1
OPENROUTER_API_KEY=你的key
LLM_MODEL=deepseek/deepseek-chat-v3-0324:free   # 免费且支持工具调用
LLM_SUPPORTS_FUNCTIONS=true
```

说明：
- **不填 key 也能演示**报价/排期/利润率/超支等对话指令（走确定性规则引擎，不经过大模型）；只有「自由聊天 + 传话转述」需要可用的 key。
- 换模型只改 `LLM_MODEL`（建议选支持 function calling 的 `:free` 模型）；想切回硅基流动，按 `.env` 注释切换即可。

---

## 一、启动后端服务 (Backend)

后端提供了 API 接口，负责价格单引擎（报价/排期生成）、连接大模型（默认 OpenRouter，见上文配置）、管理历史记忆以及执行功能调用（Function Calling）。

### 准备工作
请确保您的电脑已经安装了 **Python 3.8** 或以上版本。

### Windows 系统启动步骤
1. （推荐）直接在项目根目录运行一键脚本：
   ```cmd
   start_windows.bat
   ```
2. 或者手动启动。先进入 `backend` 目录：
   ```cmd
   cd producer\backend
   ```
3. 创建并激活虚拟环境（注意：cmd 与 PowerShell 写法不同）：
   - cmd：
     ```cmd
     python -m venv venv
     venv\Scripts\activate.bat
     ```
   - PowerShell：
     ```powershell
     python -m venv venv
     .\venv\Scripts\Activate.ps1
     ```
4. 安装依赖包：
   ```cmd
   pip install -r requirements.txt
   ```
5. 启动服务：
   ```cmd
   python main.py
   ```
   *服务将运行在 http://127.0.0.1:8000*

### Mac 系统启动步骤
1. 打开终端（Terminal），进入 `backend` 目录：
   ```bash
   cd producer/backend
   ```
2. （推荐）创建并激活虚拟环境：
   ```bash
   python3 -m venv venv
   source venv/bin/activate
   ```
3. 安装依赖包：
   ```bash
   pip3 install -r requirements.txt
   ```
4. 启动服务：
   ```bash
   python3 main.py
   ```
   *服务将运行在 http://127.0.0.1:8000*

---

## 二、启动前端服务 (Frontend)

前端提供了可视化的聊天界面与动态工作台。

### 准备工作
请确保您的电脑已经安装了 **Node.js** (推荐 v18+)。

### Windows / Mac 通用启动步骤
1. 打开新的终端窗口，进入 `frontend` 目录：
   ```bash
   cd producer/frontend
   ```
2. 安装依赖（首次运行需要）：
   ```bash
   npm install
   ```
3. 启动开发服务器：
   ```bash
   npm run dev
   ```
   *服务将运行在 http://localhost:5173，在浏览器中打开此地址即可体验。*

---

## 一键启动脚本

### Mac（双击启动）
1. 第一次下载/克隆后，如果双击 `start_mac.command` 没反应或提示无权限，先在项目根目录执行一次：
   ```bash
   chmod +x start_mac.command
   ```
2. 推荐双击 `start_mac_double_click.command`：会分别打开两个终端窗口（后端/前端各一个），更适合小白辨认哪个在跑。
3. 若你更希望一个窗口同时启动前后端，也可以双击 `start_mac.command`。
4. 若被系统安全策略拦截：右键对应脚本 → 打开（Open）。

### Mac（不依赖双击，强制运行）
在项目根目录执行：
```bash
bash start_mac.command
```
