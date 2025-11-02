@echo off
echo Starting DWeb Desktop Node Services...

start "Registry Service" cmd /c "node services/registry.js"
start "Signaling Service" cmd /c "node services/signaling.js" 
start "Storage Service" cmd /c "node services/storage.js"

echo All services started in separate windows.
echo Close these windows to stop the services.
pause