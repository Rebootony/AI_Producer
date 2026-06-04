#!/bin/bash

# 切换到脚本所在目录
cd "$(dirname "$0")"

echo "========================================"
echo "   AI Producer - 一键启动脚本 (Mac)"
echo "========================================"

# 检查 Python
if ! command -v python3 &> /dev/null; then
    echo "错误: 未安装 Python3! 请前往 https://www.python.org/downloads/ 下载安装"
    exit 1
fi

# 检查 Node
if ! command -v npm &> /dev/null; then
    echo "错误: 未安装 Node.js! 请前往 https://nodejs.org/ 下载安装"
    exit 1
fi

echo ">>> 正在清理可能残留的进程..."
lsof -ti:8000 | xargs kill -9 2>/dev/null
lsof -ti:5173 | xargs kill -9 2>/dev/null

echo ">>> [1/2] 正在准备后端服务..."
cd backend
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt > /dev/null 2>&1
python3 -m uvicorn main:app --host 127.0.0.1 --port 8000 &
BACKEND_PID=$!
cd ..

echo ">>> [2/2] 正在准备前端服务 (可能会下载依赖，请耐心等待)..."
cd frontend
npm install > /dev/null 2>&1
npm run dev &
FRONTEND_PID=$!
cd ..

echo ">>> 服务启动中，浏览器即将自动打开..."
sleep 3
open http://localhost:5173

echo "========================================"
echo "服务运行中... 请不要关闭此终端窗口！"
echo "退出服务请在此窗口按 [Ctrl+C]"
echo "========================================"

# 捕获退出信号，清理后台进程
trap "echo -e '\n正在关闭服务...'; kill $BACKEND_PID $FRONTEND_PID 2>/dev/null; exit" INT TERM
wait
