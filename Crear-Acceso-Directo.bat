@echo off
title Crear Acceso Directo en el Escritorio
cd /d "%~dp0"

powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$ws = New-Object -ComObject WScript.Shell; " ^
  "$desktop = [Environment]::GetFolderPath('Desktop'); " ^
  "$sc = $ws.CreateShortcut(\"$desktop\Multistream Chat Overlay.lnk\"); " ^
  "$sc.TargetPath = '%~dp0Multistream Chat.exe'; " ^
  "$sc.Arguments = ''; " ^
  "$sc.WorkingDirectory = '%~dp0'; " ^
  "$sc.Description = 'Multistream Chat Overlay - App de Escritorio'; " ^
  "$sc.IconLocation = '%~dp0Multistream Chat.ico,0'; " ^
  "if (!(Test-Path '%~dp0Multistream Chat.ico')) { $sc.IconLocation = '%~dp0Multistream Chat.exe,0'; }; " ^
  "$sc.Save(); " ^
  "Write-Host 'Acceso directo creado exitosamente en tu Escritorio!' -ForegroundColor Green"

echo.
echo ========================================================
echo   Listo! Ya tienes el acceso directo en tu Escritorio:
echo   "Multistream Chat Overlay"
echo ========================================================
pause
