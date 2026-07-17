@echo off
REM ============================================================
REM  CaseCue - control script
REM  Run this from the CaseCue folder (where CaseCue.exe lives).
REM
REM    casecue show     - reveal the CaseCue window
REM    casecue hide      - hide it again (keeps running in the background)
REM    casecue quit      - fully quit CaseCue (stops background checks too)
REM    casecue status    - check whether CaseCue is currently running
REM ============================================================

set "EXE=%~dp0CaseCue.exe"
set "CMD=%~1"
if "%CMD%"=="" set "CMD=show"

if not exist "%EXE%" (
  echo Could not find CaseCue.exe next to this script.
  echo Run casecue.bat from inside the CaseCue folder.
  pause
  exit /b 1
)

if /I "%CMD%"=="show" (
  start "" "%EXE%"
  echo CaseCue window shown.
  goto :eof
)
if /I "%CMD%"=="hide" (
  start "" "%EXE%" --hidden
  echo CaseCue hidden - still running in the background.
  goto :eof
)
if /I "%CMD%"=="quit" (
  start "" "%EXE%" --quit
  echo CaseCue is shutting down ^(background checks stop too^).
  goto :eof
)
if /I "%CMD%"=="status" (
  powershell -NoProfile -Command "if (Get-Process CaseCue -ErrorAction SilentlyContinue) { 'CaseCue is running.' } else { 'CaseCue is not running.' }"
  goto :eof
)

echo Unknown command: %CMD%
echo Usage: casecue [show^|hide^|quit^|status]
pause
