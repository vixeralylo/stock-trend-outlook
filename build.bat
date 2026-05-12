@echo off
REM ============================================================
REM Build script - validasi syntax & install dependencies
REM ============================================================
setlocal
cd /d "%~dp0"

echo.
echo ============================================
echo   SAHAM INDONESIA ANALYZER - BUILD
echo ============================================
echo.

REM 1. Cek node terinstall
where node >nul 2>nul
if errorlevel 1 (
  echo [ERROR] Node.js belum terinstall. Download dari https://nodejs.org/
  pause
  exit /b 1
)
echo [OK] Node.js:
node --version

REM 2. Cek npm
where npm >nul 2>nul
if errorlevel 1 (
  echo [ERROR] npm tidak ditemukan
  pause
  exit /b 1
)
echo [OK] npm:
npm --version
echo.

REM 3. Install dependencies kalau belum
if not exist node_modules (
  echo [INFO] node_modules belum ada, install dulu...
  call npm install
  if errorlevel 1 (
    echo [ERROR] npm install gagal
    pause
    exit /b 1
  )
) else (
  echo [INFO] node_modules sudah ada, skip install
)
echo.

REM 4. Validasi syntax server.js & indicators.js
echo [BUILD] Cek syntax server.js...
node --check server.js
if errorlevel 1 (
  echo [ERROR] Syntax error di server.js
  pause
  exit /b 1
)
echo [OK] server.js syntax valid

echo [BUILD] Cek syntax indicators.js...
node --check indicators.js
if errorlevel 1 (
  echo [ERROR] Syntax error di indicators.js
  pause
  exit /b 1
)
echo [OK] indicators.js syntax valid

REM 5. Cek .env ada
if not exist .env (
  echo [WARN] File .env tidak ada - bikin dari .env.example dulu
  if exist .env.example copy .env.example .env >nul
)
echo [OK] .env ada
echo.

echo ============================================
echo   BUILD SUKSES
echo ============================================
echo.
echo Jalankan server pakai salah satu:
echo   - run.bat                 ^(production mode^)
echo   - npm run dev             ^(auto-reload pakai nodemon^)
echo   - npm start               ^(node biasa^)
echo.
endlocal
