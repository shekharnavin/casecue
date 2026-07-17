@echo off
REM ============================================================
REM  CaseCue - enable auto-start
REM  Run this ONCE from the CaseCue folder. It makes CaseCue launch
REM  automatically (hidden, in the background) whenever you log in
REM  to Windows, so it's always checking cases and sending emails.
REM
REM  To reveal the window afterward, run: casecue show
REM  To undo this, run: uninstall-startup.bat
REM ============================================================

set "EXE=%~dp0CaseCue.exe"
set "STARTUP=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup"
set "LNK=%STARTUP%\CaseCue.lnk"

if not exist "%EXE%" (
  echo Could not find CaseCue.exe next to this script.
  echo Run install-startup.bat from inside the CaseCue folder.
  pause
  exit /b 1
)

powershell -NoProfile -Command ^
  "$s = (New-Object -ComObject WScript.Shell).CreateShortcut('%LNK%');" ^
  "$s.TargetPath = '%EXE%';" ^
  "$s.Arguments = '--hidden';" ^
  "$s.WorkingDirectory = '%~dp0';" ^
  "$s.Description = 'CaseCue (starts hidden - run: casecue show)';" ^
  "$s.Save()"

if exist "%LNK%" (
  echo.
  echo Done. CaseCue will start automatically ^(hidden^) the next time you log in.
  echo   To see it right now, run:      casecue show
  echo   To undo auto-start, run:       uninstall-startup.bat
  echo.
) else (
  echo.
  echo Something went wrong - the startup shortcut was not created.
  echo.
)
pause
