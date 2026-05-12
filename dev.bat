@echo off
REM ============================================================
REM Dev script - jalanin server dengan auto-reload (nodemon)
REM ============================================================
setlocal
cd /d "%~dp0"

echo.
echo ============================================
echo   SAHAM INDONESIA ANALYZER - DEV MODE
echo ============================================
echo.

REM Cek node_modules
if not exist node_modules (
  echo [INFO] node_modules belum ada, install dulu...
  call npm install
  if errorlevel 1 exit /b 1
)

REM Cek nodemon (devDependency)
if not exist node_modules\nodemon (
  echo [INFO] nodemon belum terinstall, install dulu...
  call npm install --save-dev nodemon
)

echo [INFO] Server dengan auto-reload...
echo [INFO] File yang di-watch: server.js, indicators.js, public/*
echo [INFO] Akses http://localhost:3000
echo.
call npm run dev

endlocal
