@echo off
title Multistream Chat Overlay - Twitch, YouTube, Kick, TikTok
color 0b

echo ========================================================
echo   Iniciando Multistream Chat Overlay...
echo ========================================================

:: Check for node in PATH or standard install directory
where node >nul 2>nul
if %errorlevel% neq 0 (
    if exist "C:\Program Files\nodejs\node.exe" (
        set "PATH=C:\Program Files\nodejs;%PATH%"
    ) else (
        echo [ERROR] No se encontro Node.js en su sistema.
        echo Por favor instale Node.js desde https://nodejs.org
        pause
        exit /b 1
    )
)

:: Clear any Node CLI override
set "ELECTRON_RUN_AS_NODE="

:: Launch the native Windows executable
start "" "%~dp0Multistream Chat.exe"
exit
