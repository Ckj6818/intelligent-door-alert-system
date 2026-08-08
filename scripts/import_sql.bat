@echo off
chcp 65001 >nul
cd /d "%~dp0"

set "MYSQL_HOME=D:\mysql8"
set "MYSQL=%MYSQL_HOME%\bin\mysql.exe"

if not exist "%MYSQL%" (
    echo [ERROR] mysql.exe not found at %MYSQL%
    pause
    exit /b 1
)

echo [Import SQL] Re-importing schema.sql and seed_data.sql with UTF-8 encoding...
"%MYSQL%" --default-character-set=utf8mb4 -uroot -p123456 < "%~dp0..\docs\schema.sql"
"%MYSQL%" --default-character-set=utf8mb4 -uroot -p123456 intelligent_door_alert < "%~dp0..\docs\seed_data.sql"

echo [Import SQL] UTF-8 Database import finished successfully!
pause
