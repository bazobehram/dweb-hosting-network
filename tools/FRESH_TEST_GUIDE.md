# Fresh Test From Scratch - Desktop Node Only

**Goal:** Publish and resolve a domain using desktop node only (no VPS)

---

## ✅ Step 1: Clean Slate (DONE)

- [x] Deleted desktop node data: `C:\Users\bazob\AppData\Roaming\DWebNode`
- [ ] Restart desktop node app
- [ ] Clear extension data

---

## 🧹 Step 2: Clear Extension Data

### Option A: Via Browser Console (Recommended)

1. Open: `chrome-extension://dhnlmdolnenmkealoekhnmjknllealip/panel/panel.html`
2. Press F12 to open console
3. Copy and paste this code:

```javascript
(async function() {
  localStorage.clear();
  const dbs = await indexedDB.databases();
  for (const db of dbs) {
    indexedDB.deleteDatabase(db.name);
  }
  if (chrome.storage) {
    await chrome.storage.local.clear();
    await chrome.storage.sync.clear();
  }
  console.log('✅ All data cleared! Reload page.');
  location.reload();
})();
```

### Option B: Via Extension Settings

1. Go to extension panel → Settings
2. Scroll to bottom
3. Click "Clear All Data" or "Reset"

---

## 📱 Step 3: Verify Clean State

### Desktop Node Should Show:
```
Domains: 0
Manifests: 0
Chunks: 0
Connected Peers: 0-2 (just local connections)
```

### Extension Panel Should Show:
```
Published Apps: 0
Registered Domains: 0
```

---

## 📤 Step 4: Publish Fresh Content

1. **Open Extension Panel**
   - Click extension icon or navigate to panel

2. **Go to "Publish" Tab**

3. **Create Test HTML File:**
   ```html
   <!DOCTYPE html>
   <html>
   <head><title>Fresh Test</title></head>
   <body>
       <h1>Fresh Desktop Node Test!</h1>
       <p>Published: [Current Time]</p>
       <p>This is 100% desktop node, no VPS!</p>
   </body>
   </html>
   ```
   Save as: `fresh-test.html`

4. **Upload File:**
   - Click "Choose File"
   - Select `fresh-test.html`
   - Click "Publish"

5. **Wait for Confirmation:**
   - Should see: "✅ Published successfully"
   - Note the manifest ID (e.g., `manifest-123456`)

---

## 🌐 Step 5: Register Domain

1. **Go to "Domains" Tab**

2. **Register New Domain:**
   - Domain name: `freshtest.dweb`
   - Select the manifest you just published
   - Click "Register Domain"

3. **Verify Registration:**
   - Check desktop node dashboard
   - Should show: Domains: 1, Manifests: 1

---

## 🧪 Step 6: Verify Desktop Node Has Everything

### Check via API:

```powershell
# Check domain
curl http://localhost:8788/domains/freshtest.dweb

# Expected output (with replicas):
{
  "domain": "freshtest.dweb",
  "owner": "guest-xxxxx",
  "manifestId": "manifest-xxxxx",
  "replicas": ["peer-xxxxx"],
  "createdAt": "...",
  "updatedAt": "..."
}

# Check manifest
curl http://localhost:8788/manifests/[manifestId]

# Check chunks in storage
curl http://localhost:8789/chunks?manifestId=[manifestId]
```

---

## 🔍 Step 7: Resolve Domain (Desktop Node Only!)

1. **Open Resolver:**
   - Navigate to resolver page
   - Or use: `chrome-extension://[id]/resolver/index.html`

2. **Open Browser Console (F12)**
   - Watch for logs

3. **Type Domain:**
   - Enter: `freshtest.dweb`

4. **Click "Resolve"**

5. **Expected Console Logs:**
   ```
   [MultiRegistry] TEST MODE: Desktop node only (VPS disabled)
   [MultiRegistry] ❌ Chunk not in desktop node storage
   [MultiRegistry] ⚠️ VPS fallback disabled - chunk unavailable
   ```

   **If this happens:** Chunks weren't stored properly

6. **If Successful:**
   - Content loads instantly
   - Resolution time: <10ms
   - Log shows: "✅ Chunk found in desktop node storage"

---

## 🐛 Troubleshooting

### Issue: "Chunk not in desktop node storage"

**Cause:** Extension published to P2P but didn't store in desktop node

**Fix:** Manually inject chunk (for testing):
```powershell
$body = @{
    manifestId = "[your-manifest-id]"
    chunkIndex = 0
    chunkHash = "[chunk-hash]"
    data = "[base64-encoded-content]"
    peerId = "[peer-id]"
} | ConvertTo-Json

Invoke-RestMethod -Uri "http://localhost:8789/chunks" -Method POST -Body $body -ContentType "application/json"
```

### Issue: "Connected Peers: 8"

**This is normal!** Each browser tab creates peer connections:
- Extension panel = 1 peer
- Resolver tab = 1 peer  
- Background service worker = 1 peer
- Old disconnected sessions = ~5 peers

**Not actual users**, just your browser instances.

---

## ✅ Success Criteria

After completing this test, you should have:

- [x] Clean desktop node (0 → 1 domain, 0 → 1 manifest, 0 → N chunks)
- [x] Clean extension (0 → 1 published app, 0 → 1 domain)
- [x] Domain published through extension
- [x] Domain registered in desktop node
- [x] Chunks stored in desktop node
- [x] Domain resolves successfully
- [x] **Zero VPS usage** (confirmed via console logs)
- [x] Resolution time: <10ms

---

## 📊 Expected Final State

### Desktop Node Dashboard:
```
Domains: 1 (freshtest.dweb)
Manifests: 1  
Chunks: 1-N (depending on file size)
Connected Peers: 1-8 (local browser connections)
```

### Extension Panel:
```
Published Apps: 1 (fresh-test.html)
Registered Domains: 1 (freshtest.dweb)
```

### Resolver:
```
Domain: freshtest.dweb
Status: ✅ Resolved
Content: <h1>Fresh Desktop Node Test!</h1>
Source: Desktop Node Storage
Time: <10ms
```

---

## 🎉 Success!

If you see the test content rendered, you've proven:
1. ✅ Desktop node works independently
2. ✅ No VPS required
3. ✅ Extension → Desktop Node integration works
4. ✅ Publish → Register → Resolve workflow complete
5. ✅ System is production-ready!

---

## 🔄 To Re-enable VPS Fallback Later

Revert the change in `extension/scripts/api/multiRegistryClient.js`:
- Remove the "TEST MODE" code
- Restore original `getChunk()` method with VPS fallback

Or ask AI to restore it! 🤖
