# DWeb Hosting Network - Testing Guide

## System Status Check

### Backend Services
1. **Registry Service**: http://34.107.74.70:8788/health
2. **Signaling Service**: http://34.107.74.70:8787/ (should return "Upgrade Required")
3. **Storage Service**: http://34.107.74.70:8789/health

### Test Publishing an App

1. **Create a simple HTML app** (test-app/index.html already created)

2. **Open Extension Panel**
   - Click extension icon or go to `chrome-extension://[id]/panel/index.html`

3. **Publish the App**
   - Go to "Hosting" tab
   - Click "Publish New Application"
   - Select the HTML file from `test-app/index.html`
   - Wait for manifest ID to be generated
   - The app should be automatically stored in registry (inline storage enabled)

4. **Register a Domain**
   - Go to "Domains" tab
   - Enter domain name: `test.dweb`
   - Click "Register Domain"
   - Then bind it to the manifest ID from step 3

5. **Access the App**
   - Type `test.dweb` in browser address bar
   - Extension should intercept and redirect to resolver
   - Resolver should fetch app from P2P network or registry fallback
   - You should see the test app loaded

### Check Background Peer Service

1. **View Offscreen Document Console**
   - Go to `chrome://extensions`
   - Find "DWeb Hosting Network"
   - Click "inspect views: offscreen/peer-offscreen.html"
   - Check console for logs like:
     - `[Offscreen] Background peer connected: bg-peer-...`
     - `[Offscreen] Discovered peers: N`
     - `[Offscreen] Data channel opened with ...`

2. **Check Service Worker**
   - Click "service worker" link
   - Should see messages from offscreen document

3. **Dashboard Peer Count**
   - Open panel
   - Dashboard should show "Connected Peers: N" where N > 0 if multiple browsers are running

### Debug Common Issues

#### Domain not resolving
- Check manifest exists: `curl -H "X-API-Key: registry-test-key" http://34.107.74.70:8788/manifests/[manifestId]`
- Check domain binding: `curl -H "X-API-Key: registry-test-key" http://34.107.74.70:8788/domains`
- Verify inline storage is enabled in Settings

#### Zero connected peers
- Check offscreen document console
- Verify signaling server is accessible
- Try reloading extension

#### Manifest not found
- Ensure "Inline Registry Data" is enabled in Settings
- This stores chunks directly in registry for MVP
- Without it, chunks need P2P replication

### Current System State

**Registered Domains** (as of last check):
- heyyyy.dweb
- testo.dweb
- testo1.dweb
- testos.dweb

All bound to manifests, but manifests may not have data stored.

## Next Steps for Improvement

1. **Dashboard Enhancements**
   - Show network health (✅ already has network status)
   - Show total nodes in network (not just connected peers)
   - Show domain health status (active/inactive)
   - Show chunk replication status

2. **Domain Management**
   - Add status indicators (✅ green if accessible, ⚠️ if issues)
   - Add "Test" button to verify domain works
   - Show replica count per domain

3. **Network Visualization**
   - Show peer connections graphically
   - Show chunk distribution across network
   - Real-time connection status updates

4. **Auto-testing**
   - Periodic health checks for published domains
   - Alert if domain becomes unavailable
   - Auto-republish if needed
