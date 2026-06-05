@echo off
chcp 65001 >nul
setlocal enabledelayedexpansion

echo ========================================
echo    AI Producer - 一键启动脚本 (Windows)
echo ========================================

where python >nul 2>nul || (
    echo 错误: 未安装 Python! 
    echo 请前往 https://www.python.org/downloads/ 下载安装
    echo (注意: 安装时请务必勾选底部 "Add Python.exe to PATH" 选项!!!)
    pause
    exit /b 1
)

where npm >nul 2>nul || (
    echo 错误: 未安装 Node.js! 
    echo 请前往 https://nodejs.org/ 下载安装
    pause
    exit /b 1
)

echo.
echo ^>^>^> 正在清理可能残留的进程...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :8000') do taskkill /F /PID %%a >nul 2>&1
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :5173') do taskkill /F /PID %%a >nul 2>&1

echo.
echo ^>^>^> [1/2] 正在准备后端服务...
cd backend
if not exist "venv" (
    python -m venv venv
)
if not exist "venv\Scripts\activate.bat" (
    echo 错误: 虚拟环境创建失败 (未找到 venv\Scripts\activate.bat)
    pause
    exit /b 1
)
call venv\Scripts\activate.bat
pip --version >nul 2>nul || (
    echo 错误: pip 不可用。请确认 Python 安装完整，或重新创建 venv。
    pause
    exit /b 1
)
pip install -r requirements.txt
start "AI Producer Backend" /MIN cmd /c "uvicorn main:app --host 127.0.0.1 --port 8000"
cd ..

echo ^>^>^> [2/2] 正在准备前端服务 (可能会下载依赖，请耐心等待)...
cd frontend
call npm install
start "AI Producer Frontend" /MIN cmd /c "npm run dev"
cd ..

echo.
echo ^>^>^> 服务启动中，浏览器即将自动打开...
timeout /t 5 /nobreak >nul
start http://localhost:5173

echo ========================================
echo 服务已在后台成功启动！
echo 运行期间请勿关闭弹出的两个黑色隐藏窗口。
echo 想要退出时，关闭那两个黑色窗口即可。
echo ========================================
pause
