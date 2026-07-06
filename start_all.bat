@echo off
chcp 65001 >nul
cd /d "%~dp0"

echo ========================================
echo   Door Alert System - Start All
echo ========================================
echo.

powershell -NoProfile -ExecutionPolicy Bypass -Command "Get-ChildItem -LiteralPath '%CD%' -Recurse -ErrorAction SilentlyContinue | Unblock-File -ErrorAction SilentlyContinue" >nul 2>&1

set "SCRIPTS=%~dp0scripts"

echo [0/4] Starting MySQL ...
call "%SCRIPTS%\start_mysql.bat"

echo [wait] mysql warmup 3s ...
timeout /t 3 /nobreak >nul

echo [1/4] Starting Backend ...
start "DoorAlert-Backend" cmd /k call "%SCRIPTS%\start_backend.bat"

echo [wait] backend warmup 8s ...
timeout /t 8 /nobreak >nul

echo [2/4] Starting Frontend ...
start "DoorAlert-Frontend" cmd /k call "%SCRIPTS%\start_frontend.bat"

echo [wait] frontend warmup 3s ...
timeout /t 3 /nobreak >nul

echo [3/4] Starting AI ...
start "DoorAlert-AI" cmd /k call "%SCRIPTS%\start_ai.bat"

echo.
echo ========================================
echo   4 windows launched (MySQL + Backend + Frontend + AI)
echo   Backend : http://localhost:8081
echo   Frontend: http://localhost:5173/login
echo   admin   : admin / 123456
echo   security: security / 123456
echo.
echo   If blocked by Windows Security, run scripts\unblock_project.bat
echo ========================================
echo.
pause
