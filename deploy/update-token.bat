@echo off
rem update-token.bat — wrapper Windows: jalankan deploy/update-token.sh di WSL.
rem Pemakaian:  double-click (HAR default di Downloads), atau:
rem   update-token.bat C:\path\ke\file.har
cd /d "%~dp0"
if "%~1"=="" (
  wsl bash deploy/update-token.sh
) else (
  for /f %%i in ('wsl wslpath -u "%~1"') do set HAR=%%i
  wsl bash deploy/update-token.sh "%HAR%"
)
pause