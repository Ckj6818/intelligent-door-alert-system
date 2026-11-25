@echo off
chcp 65001 >nul
echo ========================================
echo   Door Alert System - Stop All Services
echo ========================================
echo.

echo [1/4] Stopping AI Edge Vision Node (port 8090) ...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":8090" ^| findstr "LISTENING"') do (
    taskkill /PID %%a /F >nul 2>&1 && echo   - Killed PID %%a
)

echo [2/4] Stopping Frontend Dev Server (port 5173) ...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":5173" ^| findstr "LISTENING"') do (
    taskkill /PID %%a /F >nul 2>&1 && echo   - Killed PID %%a
)

echo [3/4] Stopping Spring Boot Backend (port 8081) ...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":8081" ^| findstr "LISTENING"') do (
    taskkill /PID %%a /F >nul 2>&1 && echo   - Killed PID %%a
)

echo [4/4] Stopping MySQL Server (port 3306) ...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":3306 " ^| findstr "LISTENING"') do (
    taskkill /PID %%a /F >nul 2>&1 && echo   - Killed PID %%a
)

echo.
echo ========================================
echo   All DoorAlert services have been stopped.
echo ========================================
pause
