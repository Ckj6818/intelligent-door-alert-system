@echo off
chcp 65001 >nul
setlocal EnableDelayedExpansion
cd /d "%~dp0"

echo ========================================
echo   智能门禁安防系统 - 一键启动
echo ========================================
echo.

REM ---------- 自动检测 Maven ----------
set "MVN=mvn"
where mvn >nul 2>&1
if errorlevel 1 (
    for /f "delims=" %%M in ('dir /s /b "%USERPROFILE%\.m2\wrapper\dists\*\apache-maven-*\bin\mvn.cmd" 2^>nul') do (
        set "MVN=%%M"
        goto :mvn_found
    )
    echo [警告] 未在 PATH 中找到 mvn，将尝试默认命令（请确保已安装 Maven）
)
:mvn_found
echo [信息] 使用 Maven: !MVN!
echo.

REM ---------- 步骤1：启动 Java 后端 ----------
echo [步骤1] 正在启动 Spring Boot 后端服务...
start "DoorAlert-Backend" cmd /k "cd /d "%~dp0door-alert-backend" && "!MVN!" spring-boot:run"

echo [等待] 后端预热 5 秒...
timeout /t 5 /nobreak >nul

REM ---------- 步骤2：启动 Vue 前端 ----------
echo [步骤2] 正在启动 Vue 3 智脑大屏前端...
start "DoorAlert-Frontend" cmd /k "cd /d "%~dp0door-alert-frontend" && npm run dev"

echo [等待] 前端启动 3 秒...
timeout /t 3 /nobreak >nul

REM ---------- 步骤3：启动 AI 边缘端 ----------
echo [步骤3] 正在拉起 YOLOv8 边缘感知端...
if exist "%~dp0door-alert-ai\.venv\Scripts\python.exe" (
    start "DoorAlert-AI" cmd /k "cd /d "%~dp0door-alert-ai" && .venv\Scripts\python.exe doorAlert.py"
) else (
    start "DoorAlert-AI" cmd /k "cd /d "%~dp0door-alert-ai" && python doorAlert.py"
)

echo.
echo ========================================
echo   全部启动命令已下发（3 个独立窗口）
echo ========================================
echo   后端 API : http://localhost:8081
echo   智脑大屏 : http://localhost:5173/login
echo   默认账号 : admin / 123456
echo ========================================
echo.
pause
