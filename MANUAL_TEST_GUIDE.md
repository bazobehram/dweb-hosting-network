# Manual Production Test Guide

**Goal:** Test complete P2P workflow without any cloud dependencies

---

## Prerequisites

### 1. Backend Services Running

```powershell
# Terminal 1: Registry
cd D:\Projects\dweb-hosting-network\backend\registry-service
node src/index.js

# Terminal 2: Signaling
cd D:\Projects\dweb-hosting-network\backend\signaling-service
node src/index.js

# Terminal 3: Storage
cd D:\Projects\dweb-hosting-network\backend\storage-service
node src/index.js
```

### 2. Extension Loaded

- Open Chrome/Brave
- Go to `chrome://extensions`
- Enable Developer Mode
- Load unpacked: `D:\Projects\dweb-hosting-network\extension`

---

## Test Scenario: Two Users Sharing an App

### Setup: Open Two Panels

1. Open Chrome
2. Click extension icon → Panel opens (**User A - Publisher**)
3. Right-click extension icon → "Open in new window" (**User B - Consumer**)

Or open two browser windows with extension panel

---

## Part 1: User A Publishes App

### Step 1: Authenticate
- Click **"Continue as Guest"** on auth overlay
- Note your Owner ID (e.g., `guest-abc123`)

### Step 2: Verify P2P Auto-Started
- Open DevTools (F12) → Console
- Look for: `[Panel] ✅ P2P manager auto-started`
- Check Settings tab → Background Peer Service → Should show "Connected"

### Step 3: Check Dashboard
- Dashboard should show:
  - Published Apps: 0
  - Registered Domains: (however many you have)
  - Connected Peers: 0 or 1
  - Network Status: Connected

### Step 4: Create Test HTML App

Create a simple file `test-app.html`:
```html
<!DOCTYPE html>
<html>
<head>
  <title>My DWeb App</title>
  <style>
    body {
      font-family: Arial, sans-serif;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      display: flex;
      align-items: center;
      justify-center: center;
      height: 100vh;
      margin: 0;
    }
    .container {
      text-align: center;
      background: rgba(255,255,255,0.1);
      padding: 60px;
      border-radius: 20px;
      backdrop-filter: blur(10px);
    }
    h1 { font-size: 3em; }
    .success { color: #4ade80; font-size: 2em; }
  </style>
</head>
<body>
  <div class="container">
    <h1>🚀 My DWeb App</h1>
    <p class="success">✅ Loaded from P2P!</p>
    <p>Published: <span id="time"></span></p>
  </div>
  <script>
    document.getElementById('time').textContent = new Date().toLocaleString();
  </script>
</body>
</html>
```

### Step 5: Publish App
1. Click **Hosting** tab
2. Click **"Publish New Application"**
3. Click **"Choose File"**
4. Select your `test-app.html`
5. Click **"Next"**
6. Wait for publishing to complete
7. Note the **Manifest ID** (e.g., `tr-1234567890-abc123`)

**Expected Result:**
- "✓ Published Successfully!" message
- Manifest ID shown
- Chunks: 1
- Replicated to: 0-3 peers

---

## Part 2: User A Registers Domain

### Step 6: Register Domain
1. In publish success modal, enter domain name: `myapp` (or any name)
2. Click **"Register & Bind Domain"**
3. OR go to **Domains** tab
4. Enter domain: `myapp`
5. Select your published app from dropdown
6. Click **"Register Domain"**

**Expected Result:**
- Domain registered: `myapp.dweb`
- Bound to your manifest ID
- Success message shown

### Step 7: Verify in Registry
Open PowerShell:
```powershell
curl http://localhost:8788/domains/myapp.dweb
```

**Expected Output:**
```json
{
  "domain": "myapp.dweb",
  "owner": "guest-abc123",
  "manifestId": "tr-1234567890-abc123",
  "createdAt": 1761479403774,
  "updatedAt": 1761479403774
}
```

---

## Part 3: User B Resolves Domain

### Step 8: User B Setup
- In second panel (User B), click **"Continue as Guest"**
- Verify P2P started in console
- Note: User B has different peer ID

### Step 9: Verify P2P Connection
In User B console:
```javascript
window.p2pManager.getStatus()
```

**Expected:**
- `isStarted: true`
- `peerId: "..."` (different from User A)
- Should show User A in peers list (may take a few seconds)

### Step 10: Resolve Domain
1. Click **"Open Resolver"** in sidebar (or dashboard)
2. Enter domain: `myapp.dweb`
3. Click **"Resolve"**

**Expected Result:**
- Domain found in registry
- Manifest retrieved
- Shows file info: `index.html`, size, chunks
- Lists replica peers (should include User A's peer ID)

### Step 11: Fetch Chunks via P2P
In User B console:
```javascript
// Get manifest ID from resolver
const manifestId = 'tr-1234567890-abc123';  // Replace with actual

// Request chunk 0 from User A peer
const userAPeerId = '...';  // Get from p2pManager.peers
const chunk = await window.testRequestChunk(userAPeerId, manifestId, 0);
console.log('Chunk received:', chunk.length, 'bytes');
```

**Expected Result:**
- Chunk data received
- HTML content visible in chunk
- No errors

### Step 12: Reconstruct & Display App
In User B console:
```javascript
// Get the HTML content from chunk
const text = new TextDecoder().decode(chunk);
console.log(text);  // Should show your HTML

// Or create a blob and open
const blob = new Blob([chunk], { type: 'text/html' });
const url = URL.createObjectURL(blob);
window.open(url);  // Opens app in new tab
```

**Expected Result:**
- Your app opens in new tab
- Shows "✅ Loaded from P2P!"
- Timestamp displays correctly

---

## Part 4: Verify Pure P2P (No Cloud)

### Step 13: Stop Registry Service
Stop the registry service (Ctrl+C in terminal)

### Step 14: User B Requests Chunk Again
Repeat Step 11 - fetch chunk directly from User A

**Expected Result:**
- Chunk still transfers successfully
- P2P works without registry
- Only used registry for discovery, not data transfer

### Step 15: Restart Registry & Test Another Domain
1. Restart registry service
2. User A: Publish another file
3. User A: Register as `myapp2.dweb`
4. User B: Resolve and fetch chunks

---

## Success Criteria

✅ **P2P Auto-Start**
- Both users' P2P managers start automatically
- Visible in console logs

✅ **Publishing Works**
- File chunked successfully
- Manifest created
- Chunks stored locally

✅ **Domain Registration**
- Domain registered with owner ID
- Bound to manifest
- Retrievable from registry API

✅ **Domain Resolution**
- User B can query domain
- Gets correct manifest
- Sees chunk locations (peers)

✅ **P2P Chunk Transfer**
- User B can request chunks from User A
- Chunks transfer directly (no cloud)
- Data integrity maintained

✅ **No Cloud Dependency for Data**
- Registry only for coordination
- Actual file content never touches VPS
- Works with registry offline after discovery

---

## Troubleshooting

### P2P Not Starting
```javascript
// Manual start
window.testLibp2pStart('ws://localhost:8787')
```

### Peers Not Discovering Each Other
- Check signaling service is running
- Verify WebSocket connection in Network tab
- Both users must be connected to same signaling server

### Chunk Transfer Fails
```javascript
// Check peer connection
window.p2pManager.peers

// Check chunk exists
window.chunkManager.getTransfer('tr-...')
```

### Domain Not Found
```powershell
# Verify domain registered
curl http://localhost:8788/domains

# Check specific domain
curl http://localhost:8788/domains/myapp.dweb
```

---

## Advanced: Multiple Peers (3+ Users)

1. Open 3+ browser windows with extension
2. User 1: Publishes app
3. User 1: Registers domain
4. User 2: Resolves & fetches chunks from User 1
5. User 3: Resolves & can fetch from User 1 OR User 2
6. Chunks replicate across network
7. Stop User 1 → Users 2 & 3 can still share with each other

**This proves true P2P mesh network!**

---

## Expected Console Output

### User A (Publisher)
```
[Panel] Auto-starting P2P manager...
[Panel] ✅ P2P manager auto-started
[Phase 1] ✓ libp2p node started!
[Phase 1] Peer ID: QmXxxx...
[Phase 2] Chunk transfer initialized
```

### User B (Consumer)
```
[Panel] Auto-starting P2P manager...
[Panel] ✅ P2P manager auto-started
[Phase 1] Peer connected: QmYyyy...
```

---

## Dashboard Verification

After completing tests, check User A dashboard:
- **Published Apps:** Should show your app
- **Registered Domains:** Should show `myapp.dweb`
- **Connected Peers:** Should show 1+ (User B)
- **Network Status:** Connected

Check metrics:
- **Direct Sessions:** % of direct P2P transfers
- **Replication Success:** Should show replications to peers

---

## Final Verification Command

```powershell
# List all domains
curl http://localhost:8788/domains

# Check manifest
curl http://localhost:8788/manifests/tr-1234567890-abc123

# Verify chunk replicas
curl http://localhost:8788/manifests/tr-1234567890-abc123/replicas
```

---

## Production Readiness Checklist

After completing this test:

- [ ] P2P auto-starts on both users
- [ ] File published and chunked correctly
- [ ] Domain registered and bound
- [ ] User B resolves domain successfully
- [ ] Chunks transfer via P2P (not cloud)
- [ ] App renders correctly after P2P transfer
- [ ] System works with registry offline (after discovery)
- [ ] Dashboard shows correct metrics
- [ ] No private data stored on VPS
- [ ] Multiple peers can share chunks

**If all checked:** ✅ **System is production ready!**

---

## Next Steps

1. Test with larger files (multiple chunks)
2. Test with 5+ peers
3. Test network resilience (disconnect/reconnect peers)
4. Test with VPS (not localhost)
5. Invite real users to test

## Video Tutorial

Record screen while doing this test to create:
- User onboarding video
- Demo for investors/community
- Troubleshooting reference
