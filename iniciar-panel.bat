@echo off
cd /d "%~dp0"
echo ======================================
echo   UNEMI PANEL ACADEMICO
 echo ======================================
echo.
where node >nul 2>nul
if errorlevel 1 (
  echo ERROR: No se encontro Node.js.
  echo Instala Node.js LTS y vuelve a ejecutar este archivo.
  pause
  exit /b 1
)
echo Abriendo servidor...
start "UNEMI Panel Server" cmd /k "node server\index.js"
timeout /t 2 >nul
start "UNEMI Panel" http://localhost:3000
