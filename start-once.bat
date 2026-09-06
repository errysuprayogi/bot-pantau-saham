@echo off
rem Jalankan sekali lalu keluar (untuk Windows Task Scheduler).
cd /d "%~dp0"
"C:\Program Files\nodejs\node.exe" index.js --once %*