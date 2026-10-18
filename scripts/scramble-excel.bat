@echo off
rem Drag Excel/CSV/ZIP files (or a folder) onto this file.
rem Scrambled copies are saved in a "scrambled" folder next to the originals. Originals are not changed.
chcp 65001 >nul
if "%~1"=="" (
  echo Drag Excel, CSV or ZIP files onto this file to scramble customer details.
  pause
  exit /b
)
cd /d "%~dp0.."
set TS_NODE_TRANSPILE_ONLY=true
set TS_NODE_COMPILER_OPTIONS={"module":"commonjs"}
set SCRAMBLE_OPEN_RESULT=1
call npx ts-node scripts/scrambleExcel.ts %*
echo.
pause
