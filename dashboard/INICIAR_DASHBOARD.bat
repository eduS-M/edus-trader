@echo off
title EduS Trader - Servidor
color 0A
echo.
echo  ================================================
echo    EduS Trader - Iniciando servidor local...
echo  ================================================
echo.
echo  Abriendo dashboard en: http://localhost:5000
echo  Presiona Ctrl+C para detener el servidor.
echo.

:: Verificar Python
python --version >nul 2>&1
if errorlevel 1 (
    echo  ERROR: Python no encontrado.
    echo  Descarga Python desde https://www.python.org/downloads/
    pause
    exit
)

:: Instalar dependencias (cloudscraper es necesario para Forex Factory)
echo  Verificando dependencias...
pip install flask flask-cors yfinance requests beautifulsoup4 lxml cloudscraper -q

echo.
echo  Iniciando servidor...
echo.

cd /d "%~dp0"
start "" /b cmd /c "timeout /t 2 /nobreak >nul && start http://localhost:5000"
python server.py

pause
