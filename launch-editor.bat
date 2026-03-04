@echo off
setlocal

set ROOT=%~dp0

:: Load nvm-windows if available
where nvm >nul 2>&1
if %errorlevel% neq 0 (
    echo Error: nvm not found. Install nvm-windows from https://github.com/coreybutler/nvm-windows
    exit /b 1
)

cd /d "%ROOT%apps\editor"
nvm use 20.18.2
call scripts\code.bat %*
