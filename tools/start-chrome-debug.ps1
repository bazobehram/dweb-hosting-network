# Start Chrome with Remote Debugging
# This allows the AI-Browser Bridge to connect via CDP

$chromePaths = @(
    "C:\Program Files\Google\Chrome\Application\chrome.exe",
    "C:\Program Files (x86)\Google\Chrome\Application\chrome.exe",
    "$env:LOCALAPPDATA\Google\Chrome\Application\chrome.exe"
)

$chromePath = $null
foreach ($path in $chromePaths) {
    if (Test-Path $path) {
        $chromePath = $path
        break
    }
}

if (-not $chromePath) {
    Write-Host "❌ Chrome not found in standard locations" -ForegroundColor Red
    Write-Host "Please specify the path to chrome.exe" -ForegroundColor Yellow
    exit 1
}

Write-Host "🚀 Starting Chrome with remote debugging..." -ForegroundColor Green
Write-Host "   Path: $chromePath" -ForegroundColor Cyan
Write-Host "   Debug Port: 9222" -ForegroundColor Cyan
Write-Host ""
Write-Host "After Chrome opens, run in another terminal:" -ForegroundColor Yellow
Write-Host "   cd D:\Projects\dweb-hosting-network\tools" -ForegroundColor White
Write-Host "   npm start" -ForegroundColor White
Write-Host ""

# Start Chrome with debugging enabled
& $chromePath --remote-debugging-port=9222 --user-data-dir="$env:TEMP\chrome-debug-profile"
