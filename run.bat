@echo off
REM ============================================================
REM Run script - jalanin server di mode production
REM ============================================================
setlocal
cd /d "%~dp0"

echo.
echo ============================================
echo   SAHAM INDONESIA ANALYZER - START
echo ============================================
echo.

REM Cek node_modules
if not exist node_modules (
  echo [INFO] node_modules belum ada, build dulu...
  call build.bat
  if errorlevel 1 exit /b 1
)

REM Cek .env
if not exist .env (
  echo [ERROR] File .env tidak ada. Bikin dulu dengan isi:
  echo   GOAPI_TOKEN=your_token
  echo   STOCKBIT_TOKEN=your_token
  echo   PORT=3000
  pause
  exit /b 1
)

echo [INFO] Server starting...
echo [INFO] Akses http://localhost:3000 di browser
echo [INFO] Ctrl+C untuk stop
echo.
node server.js

endlocal
