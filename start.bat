@echo off
title KAT Tattoo Studio - Servidor
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
    echo ERROR: Node.js no esta instalado o no esta en el PATH.
    pause
    exit /b 1
)
echo Arrancando KAT Tattoo Studio...
echo Sitio web: http://localhost:3000
node server.js
pause