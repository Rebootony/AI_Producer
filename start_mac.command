#!/bin/bash
set -euo pipefail

if [ -z "${AI_PRODUCER_MAC_BOOTSTRAPPED:-}" ]; then
  export AI_PRODUCER_MAC_BOOTSTRAPPED=1
  chmod +x "$0" 2>/dev/null || true
  exec /bin/bash "$0" "$@"
fi

# 切换到脚本所在目录
cd "$(dirname "$0")"
ROOT_DIR="$(pwd)"

MODE="${1:-all}"

start_backend_foreground() {
  cd "${ROOT_DIR}/backend"
  if [ ! -d "venv" ]; then
    python3 -m venv venv
  fi
  source venv/bin/activate 2>/dev/null || true
  venv/bin/python -m pip install --upgrade pip
  venv/bin/python -m pip install -r requirements.txt
  venv/bin/python -m uvicorn main:app --host 127.0.0.1 --port 8000 --reload
}

start_frontend_foreground() {
  cd "${ROOT_DIR}/frontend"
  npm install
  npm run dev
}

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
PIDS_8000="$(lsof -ti:8000 2>/dev/null || true)"
if [ -n "${PIDS_8000}" ]; then
  kill -9 ${PIDS_8000} 2>/dev/null || true
fi
PIDS_5173="$(lsof -ti:5173 2>/dev/null || true)"
if [ -n "${PIDS_5173}" ]; then
  kill -9 ${PIDS_5173} 2>/dev/null || true
fi

if [ "${MODE}" = "--backend" ]; then
  start_backend_foreground
  exit 0
fi

if [ "${MODE}" = "--frontend" ]; then
  start_frontend_foreground
  exit 0
fi

echo ">>> [1/2] 正在准备后端服务..."
cd "${ROOT_DIR}/backend"
if [ ! -d "venv" ]; then
  python3 -m venv venv
fi
source venv/bin/activate 2>/dev/null || true
venv/bin/python -m pip install --upgrade pip
venv/bin/python -m pip install -r requirements.txt
BACKEND_LOG="${TMPDIR:-/tmp}/ai_producer_backend_runtime.log"
rm -f "${BACKEND_LOG}"
venv/bin/python -m uvicorn main:app --host 127.0.0.1 --port 8000 --reload > "${BACKEND_LOG}" 2>&1 &
BACKEND_PID=$!
cd "${ROOT_DIR}"
sleep 1
if ! kill -0 ${BACKEND_PID} 2>/dev/null; then
  echo "错误: 后端启动失败。下面是后端日志："
  tail -n 200 "${BACKEND_LOG}" || true
  exit 1
fi

echo ">>> [2/2] 正在准备前端服务 (可能会下载依赖，请耐心等待)..."
cd "${ROOT_DIR}/frontend"
npm install
npm run dev &
FRONTEND_PID=$!
cd "${ROOT_DIR}"

echo ">>> 服务启动中，浏览器即将自动打开..."
sleep 3
open http://localhost:5173

echo "========================================"
echo "服务运行中... 请不要关闭此终端窗口！"
echo "退出服务请在此窗口按 [Ctrl+C]"
echo "========================================"

trap "echo -e '\n正在关闭服务...'; kill $BACKEND_PID $FRONTEND_PID 2>/dev/null; exit" INT TERM
wait
