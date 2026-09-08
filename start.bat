@echo off
chcp 65001 >nul
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js가 설치되어 있지 않습니다. https://nodejs.org 에서 설치한 뒤 다시 실행해주세요.
  pause
  exit /b 1
)

if not exist "node_modules" (
  echo 처음 실행이므로 필요한 구성 요소를 설치합니다. 잠시만 기다려주세요...
  call npm install
)

node server.js
pause
