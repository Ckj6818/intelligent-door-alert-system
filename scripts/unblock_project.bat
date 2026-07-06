@echo off
chcp 65001 >nul
cd /d "%~dp0"

echo Unblocking project files ...
powershell -NoProfile -ExecutionPolicy Bypass -Command "Get-ChildItem -LiteralPath '%CD%' -Recurse -ErrorAction SilentlyContinue | Unblock-File -ErrorAction SilentlyContinue"
echo Done. Run start_all.bat again.
pause
