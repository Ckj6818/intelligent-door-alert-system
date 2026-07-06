@echo off
chcp 65001 >nul
cd /d "%~dp0\..\door-alert-frontend"

echo [Frontend] cwd: %CD%
echo.

if exist "D:\NODE.js\npm.cmd" set "PATH=D:\NODE.js;%PATH%"
if exist "C:\Program Files\nodejs\npm.cmd" set "PATH=C:\Program Files\nodejs;%PATH%"

where npm >nul 2>&1
if errorlevel 1 (
    echo [ERROR] npm not found. Install Node.js first.
    pause
    exit /b 1
)

echo [Frontend] npm run dev
npm run dev
echo.
pause
