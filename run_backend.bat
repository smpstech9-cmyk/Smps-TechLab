@echo off
title SMPS Tech Lab Backend Launcher
echo ==========================================================
echo Starting SMPS Tech Lab Backend...
echo ==========================================================

cd /d "%~dp0"

if exist venv\Scripts\activate.bat (
    echo Activating virtual environment...
    call venv\Scripts\activate.bat
) else (
    echo Warning: virtual environment not found. Trying to run using system python...
)

python app.py
pause
