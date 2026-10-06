@echo off
title Multistream Chat Overlay Desktop App
cd /d "%~dp0"

:: Add Node.js to PATH if needed
where node >nul 2>nul
if %errorlevel% neq 0 (
    if exist "C:\Program Files\nodejs\node.exe" (
        set "PATH=C:\Program Files\nodejs;%PATH%"
    )
)

:: Ensure Electron runs in full desktop GUI mode
set "ELECTRON_RUN_AS_NODE="

:: Launch the standalone desktop application
start "" "%~dp0node_modules\electron\dist\electron.exe" "%~dp0."
exit
