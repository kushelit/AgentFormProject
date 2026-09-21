@echo off
setlocal

REM ============================================================
REM MagicSale Runner build
REM IMPORTANT:
REM Keep this BAT inside the portalRunner project folder,
REM next to package.json and tsconfig.json.
REM ============================================================

cd /d "%~dp0"

echo.
echo ================================
echo Working directory:
echo %CD%
echo ================================
echo.

if not exist "package.json" (
    echo ERROR: package.json was not found in:
    echo %CD%
    echo.
    echo Put this BAT in the portalRunner project folder
    echo next to package.json and tsconfig.json.
    pause
    exit /b 1
)

if not exist "tsconfig.json" (
    echo ERROR: tsconfig.json was not found in:
    echo %CD%
    pause
    exit /b 1
)

if not exist "node_modules\typescript\bin\tsc" (
    echo ERROR: Local TypeScript was not found.
    echo Run:
    echo   npm install
    echo and then run this BAT again.
    pause
    exit /b 1
)

echo ================================
echo Cleaning old build...
echo ================================

rd /s /q dist 2>nul
rd /s /q bundle 2>nul

del /q MagicSaleRunner.exe 2>nul
del /q MagicSaleUpdater.exe 2>nul

echo.
echo ================================
echo TypeScript compile...
echo ================================

call npx --no-install tsc

if errorlevel 1 (
    echo.
    echo ERROR: TypeScript compilation failed
    pause
    exit /b 1
)

echo.
echo ================================
echo Building MagicSaleRunner...
echo ================================

call npx --no-install ncc build dist/runner.js -o bundle\runner

if errorlevel 1 (
    echo.
    echo ERROR: Runner NCC build failed
    pause
    exit /b 1
)

call npx --no-install pkg bundle\runner\index.js --targets node18-win-x64 --output MagicSaleRunner.exe

if errorlevel 1 (
    echo.
    echo ERROR: Runner EXE build failed
    pause
    exit /b 1
)

echo.
echo ================================
echo Building MagicSaleUpdater...
echo ================================

call npx --no-install ncc build dist/updater.js -o bundle\updater

if errorlevel 1 (
    echo.
    echo ERROR: Updater NCC build failed
    pause
    exit /b 1
)

call npx --no-install pkg bundle\updater\index.js --targets node18-win-x64 --output MagicSaleUpdater.exe

if errorlevel 1 (
    echo.
    echo ERROR: Updater EXE build failed
    pause
    exit /b 1
)

echo.
echo ================================
echo Copying files...
echo ================================

copy /Y MagicSaleRunner.exe "%USERPROFILE%\Desktop\RunnerTest\MagicSaleRunner.exe"

if errorlevel 1 (
    echo.
    echo ERROR: Could not copy MagicSaleRunner.exe to Desktop\RunnerTest
    pause
    exit /b 1
)

copy /Y MagicSaleRunner.exe "C:\BuildRunner\MagicSaleRunner.exe"

if errorlevel 1 (
    echo.
    echo ERROR: Could not copy MagicSaleRunner.exe to C:\BuildRunner
    echo The Runner may still be running and locking the destination file.
    echo Try:
    echo   taskkill /F /IM MagicSaleRunner.exe
    pause
    exit /b 1
)

copy /Y MagicSaleUpdater.exe "C:\BuildRunner\MagicSaleUpdater.exe"

if errorlevel 1 (
    echo.
    echo ERROR: Could not copy MagicSaleUpdater.exe to C:\BuildRunner
    pause
    exit /b 1
)

echo.
echo ================================
echo BUILD COMPLETED SUCCESSFULLY
echo ================================
echo.
echo Created:
echo   MagicSaleRunner.exe
echo   MagicSaleUpdater.exe
echo.
echo Copied to:
echo   %USERPROFILE%\Desktop\RunnerTest
echo   C:\BuildRunner
echo.

pause
endlocal
