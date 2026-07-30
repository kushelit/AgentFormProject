@echo off
rem ============================================
rem build.bat - Build for TESTING (no signing)
rem Run from: C:\projects\AgentFormProject\scripts\portalRunner
rem ============================================

rd /s /q dist 2>nul
rd /s /q bundle 2>nul

npx tsc && npx ncc build dist/runner.js -o bundle && npx pkg bundle/index.js --targets node18-win-x64 --output MagicSaleRunner.exe

copy /Y MagicSaleRunner.exe "%USERPROFILE%\Desktop\RunnerTest\MagicSaleRunner.exe"
copy /Y MagicSaleRunner.exe "C:\BuildRunner\MagicSaleRunner.exe"

echo.
echo Build complete - NOT signed. For testing only.
echo When ready for release, run build-and-sign.bat instead.
