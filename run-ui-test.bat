@echo off
title DWeb Network - UI Test
cd /d "%~dp0"
echo.
echo ================================================
echo   DWeb Hosting Network - UI Test Runner
echo ================================================
echo.
echo Starting Playwright UI test...
echo.
npm run test:ui
echo.
echo Test completed. Press any key to close...
pause >nul
