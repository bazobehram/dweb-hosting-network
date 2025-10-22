# Simple SSH deployment to Google Cloud VM
# Usage: .\scripts\deploy-simple.ps1

$VM_IP = "34.107.74.70"
$VM_USER = "bazob"
$REMOTE_PATH = "/home/bazob/dweb-hosting-network"

Write-Host "🚀 Deploying DWeb Backend Updates..." -ForegroundColor Cyan

# Upload crypto.js
Write-Host "📤 Uploading crypto.js..." -ForegroundColor Yellow
scp backend/common/crypto.js "${VM_USER}@${VM_IP}:${REMOTE_PATH}/backend/common/"

if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Failed to upload crypto.js" -ForegroundColor Red
    exit 1
}

# Upload routes.js
Write-Host "📤 Uploading routes.js..." -ForegroundColor Yellow
scp backend/registry-service/src/routes.js "${VM_USER}@${VM_IP}:${REMOTE_PATH}/backend/registry-service/src/"

if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Failed to upload routes.js" -ForegroundColor Red
    exit 1
}

# Restart registry service
Write-Host "🔄 Restarting registry service..." -ForegroundColor Yellow
ssh "${VM_USER}@${VM_IP}" "cd ${REMOTE_PATH}/backend/registry-service && pm2 restart registry-service"

if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Failed to restart service" -ForegroundColor Red
    exit 1
}

# Check status
Write-Host "✅ Checking service status..." -ForegroundColor Green
ssh "${VM_USER}@${VM_IP}" "pm2 list && pm2 logs registry-service --lines 10 --nostream"

Write-Host ""
Write-Host "✨ Deployment complete!" -ForegroundColor Green
Write-Host "📊 Monitor logs: ssh ${VM_USER}@${VM_IP} 'pm2 logs registry-service'" -ForegroundColor Cyan
