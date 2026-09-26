@echo off
title NoteBlockWeb Local Build
cd /d "%~dp0"

echo ============================================================
echo   NoteBlockWeb Local Offline Build
echo   src/  -^>  blbl-toy/   (embedded base64 sounds, file:// ready)
echo ============================================================
echo.

where node >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Node.js not found. Please install Node.js and add it to PATH.
    echo Download: https://nodejs.org/
    echo.
    pause
    exit /b 1
)

echo [1/3] Node.js version...
node -v
echo.

echo [2/3] Building...
node build_local.js
if errorlevel 1 (
    echo.
    echo [ERROR] Build failed. See log above.
    pause
    exit /b 1
)
echo.

echo [3/3] Opening output directory...
explorer "blbl-toy"
echo.
echo Ready. Double-click blbl-toy\index.html to use offline.
echo.
echo Press any key to close...
pause >nul
