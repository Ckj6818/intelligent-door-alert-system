@echo off
chcp 65001 >nul
cd /d "%~dp0\..\door-alert-backend"

echo [Backend] cwd: %CD%
echo.

if exist "%LOCALAPPDATA%\apache-maven\apache-maven-3.9.9\bin\mvn.cmd" set "PATH=%LOCALAPPDATA%\apache-maven\apache-maven-3.9.9\bin;%PATH%"

where mvn >nul 2>&1
if %errorlevel%==0 (
    echo [Backend] mvn spring-boot:run
    mvn spring-boot:run
    goto :done
)

set "MVN="
for /f "delims=" %%M in ('where /r %USERPROFILE%\.m2 mvn.cmd 2^>nul') do (
    if not defined MVN set "MVN=%%M"
)

if not defined MVN (
    echo [ERROR] Maven not found. Install Maven or add mvn to PATH.
    goto :done
)

echo [Backend] "%MVN%" spring-boot:run
call "%MVN%" spring-boot:run

:done
echo.
pause
