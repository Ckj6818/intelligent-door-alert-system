@echo off
chcp 65001 >nul
cd /d "%~dp0\..\door-alert-ai"

echo [AI] cwd: %CD%
echo.

if exist ".venv\Scripts\python.exe" (
    .venv\Scripts\python.exe doorAlert.py
) else (
    python doorAlert.py
)
echo.
pause
