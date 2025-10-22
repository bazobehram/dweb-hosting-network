# Deploy DWeb Backend to Google Cloud
# Usage: .\scripts\deploy-to-gcloud.ps1

$VM_NAME = "dweb-vm"
$ZONE = "us-central1-a"
$VM_USER = "bazob"
$PROJECT_PATH = "/home/$VM_USER/dweb-hosting-network"

Write-Host "🚀 Deploying to Google Cloud..." -ForegroundColor Cyan

# Step 1: Upload common crypto module
Write-Host "📤 Uploading crypto.js..." -ForegroundColor Yellow
gcloud compute scp backend/common/crypto.js "${VM_NAME}:${PROJECT_PATH}/backend/common/crypto.js" --zone=$ZONE

# Step 2: Upload updated routes
Write-Host "📤 Uploading routes.js..." -ForegroundColor Yellow
gcloud compute scp backend/registry-service/src/routes.js "${VM_NAME}:${PROJECT_PATH}/backend/registry-service/src/routes.js" --zone=$ZONE

# Step 3: Restart services
Write-Host "🔄 Restarting registry service..." -ForegroundColor Yellow
gcloud compute ssh $VM_NAME --zone=$ZONE --command="cd $PROJECT_PATH/backend/registry-service && pm2 restart registry-service"

# Step 4: Check status
Write-Host "✅ Checking service status..." -ForegroundColor Green
gcloud compute ssh $VM_NAME --zone=$ZONE --command="pm2 list && pm2 logs registry-service --lines 10 --nostream"

Write-Host "✨ Deployment complete!" -ForegroundColor Green
Write-Host "📊 Check logs: gcloud compute ssh $VM_NAME --zone=$ZONE --command='pm2 logs registry-service'" -ForegroundColor Cyan
