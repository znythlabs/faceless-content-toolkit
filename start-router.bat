@echo off
cd /d "%~dp0"
echo Starting Faceless Content Toolkit Router...
echo.
echo   Router: http://127.0.0.1:3737
echo   UI:     http://127.0.0.1:3737/
echo   Health: http://127.0.0.1:3737/health
echo.
echo Close this window to stop the router.
echo.
node secure-provider-server.js
pause
