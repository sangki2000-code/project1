@echo off
chcp 65001 >nul
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo [ERROR] Node.js is not installed on this PC.
  echo Please install it from https://nodejs.org, then run this file again.
  pause
  exit /b 1
)

if not exist "node_modules" (
  echo First run detected - installing required files. Please wait...
  call npm install
  if errorlevel 1 (
    echo [ERROR] npm install failed. Check your internet connection and try again.
    pause
    exit /b 1
  )
)

node server.js
echo.
echo [Server stopped]
pause
