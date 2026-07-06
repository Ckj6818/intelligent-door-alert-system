@echo off
chcp 65001 >nul
cd /d "%~dp0"

set "MYSQL_HOME=D:\mysql8"
set "MYSQLD=%MYSQL_HOME%\bin\mysqld.exe"
set "MYSQL=%MYSQL_HOME%\bin\mysql.exe"

if not exist "%MYSQLD%" (
    echo [ERROR] mysqld not found: %MYSQLD%
    echo Edit scripts\start_mysql.bat and set MYSQL_HOME to your MySQL install path.
    pause
    exit /b 1
)

netstat -ano | findstr ":3306" | findstr "LISTENING" >nul 2>&1
if %errorlevel%==0 (
    echo [MySQL] Already running on port 3306.
    goto :verify
)

echo [MySQL] Starting mysqld ...
cd /d "%MYSQL_HOME%\bin"
start "DoorAlert-MySQL" cmd /k mysqld.exe --console
cd /d "%~dp0"

echo [MySQL] Waiting for startup 5s ...
timeout /t 5 /nobreak >nul

:verify
if not exist "%MYSQL%" (
    echo [MySQL] Server start command sent. mysql.exe not found for ping test.
    goto :done
)

"%MYSQL%" -uroot -p123456 -e "SELECT 1;" >nul 2>&1
if %errorlevel%==0 (
    echo [MySQL] Connection OK. Database ready.
) else (
    echo [MySQL] Started but connection test failed. Check password or wait a few seconds.
)

:done
echo.
