@echo off
setlocal
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0build-msix.ps1" %*
echo.
pause