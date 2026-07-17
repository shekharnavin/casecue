@echo off
REM Removes CaseCue's Windows auto-start entry (added by install-startup.bat).

set "LNK=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\CaseCue.lnk"

if exist "%LNK%" (
  del "%LNK%"
  echo Removed CaseCue from Windows startup.
) else (
  echo CaseCue was not set to start automatically - nothing to do.
)
pause
