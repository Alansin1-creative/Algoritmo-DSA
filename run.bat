@echo off
cd /d "%~dp0"
where node >nul 2>&1
if errorlevel 1 (
  echo Instala Node.js 22 o superior y vuelve a abrir este archivo.
  pause
  exit /b 1
)
node server.js
pause
