@echo off
chcp 65001 >nul
cd /d "%~dp0\..\door-alert-backend"

echo [Backend] cwd: %CD%
echo.

where mvn >nul 2>&1
if %errorlevel%==0 (
    echo [Backend] mvn spring-boot:run
    mvn spring-boot:run
    goto :done
)

set "MVN="
for /f "delims=" %%M in ('dir /s /b "%USERPROFILE%\.m2\wrapper\dists\apache-maven-*\bin\mvn.cmd" 2^>nul') do (
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
