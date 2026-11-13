@echo off
cd /d %~dp0..
mkdir logs 2>nul
:loop
node run.js start >> logs\sim.log 2>&1
if %errorlevel% EQU 0 exit /b 0
timeout /t 60 /nobreak >nul
goto loop
