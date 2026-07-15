@echo off
REM ============================================================
REM  CaseCue - Backup tool
REM  Copies your CaseCue data (cases, recipients, SMTP settings)
REM  to your Desktop so you can restore it after updating.
REM  Just double-click this file.
REM ============================================================

set "SRC=%APPDATA%\casecue\scheduler-data.json"
set "DEST=%~dp0casecue-backup.json"

echo.
echo   CaseCue backup
echo   --------------

if not exist "%SRC%" (
  echo.
  echo   Could not find CaseCue data at:
  echo       %SRC%
  echo.
  echo   Make sure CaseCue has been opened at least once on this PC,
  echo   and that you are logged in as the same Windows user.
  echo.
  pause
  exit /b 1
)

copy /Y "%SRC%" "%DEST%" >nul
if errorlevel 1 (
  echo.
  echo   Backup FAILED to copy. Close CaseCue and try again.
  echo.
  pause
  exit /b 1
)

echo.
echo   Backup saved next to this tool:
echo       %DEST%
echo.
echo   Keep this file safe. After installing the NEW CaseCue, open it and go to:
echo       Settings  ^>  Backup ^& restore  ^>  Restore from backup
echo   then pick this file. All your cases, recipients and SMTP settings return.
echo.
pause
