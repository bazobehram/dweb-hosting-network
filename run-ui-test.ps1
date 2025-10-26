#!/usr/bin/env pwsh

Write-Host ""
Write-Host "================================================" -ForegroundColor Cyan
Write-Host "  DWeb Hosting Network - UI Test Runner" -ForegroundColor Cyan
Write-Host "================================================" -ForegroundColor Cyan
Write-Host ""

Set-Location $PSScriptRoot

Write-Host "Starting Playwright UI test..." -ForegroundColor Yellow
Write-Host ""

npm run test:ui

Write-Host ""
Write-Host "Test completed. Press any key to close..." -ForegroundColor Green
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
