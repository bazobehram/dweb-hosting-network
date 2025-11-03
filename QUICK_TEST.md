# Quick Test Guide - Bug Fixes

## 🚀 Quick Start (5 minutes)

### Prerequisites
- Desktop node running (with services on ports 8787, 8788, 8789)
- Chrome extension loaded

### Run Automated Tests

```bash
# From project root
node tools/test-bug-fixes.js
```

That's it! The test will automatically:
1. ✅ Check peer count stability on refresh
2. ✅ Verify domain registration is blocked without peers  
3. ✅ Confirm services remain healthy

---

## 📊 Expected Output

```
🚀 Setting up test environment...
🔍 Checking desktop services...
   ✅ Registry service running
   ✅ Storage service running
✅ Extension panel loaded

🧪 Test #1: Peer Count on Refresh
   📊 Initial peer count: 3
   🔄 Refreshing page...
   📊 Peer count after refresh: 3
   ✅ PASS: Peer count remained stable

🧪 Test #2: Domain Registration Without Peers
   🚫 Attempting domain registration without peers...
   ✅ PASS: Domain registration blocked without peers

🧪 Test #3: Desktop Node Restart Button
   ✅ PASS: Services remain healthy

============================================================
📊 TEST RESULTS SUMMARY
============================================================
✅ Peer Count on Refresh: PASS
✅ No Peers Validation: PASS
✅ Restart Button: PASS

Total: 3 passed, 0 failed
============================================================
```

---

## 🔧 If Tests Fail

### Issue: "Desktop node not accessible"
**Solution:** Start your desktop node application first

### Issue: "Extension not found"
**Solution:** 
1. Open chrome://extensions
2. Enable "Developer mode"
3. Click "Load unpacked"
4. Select `D:\Projects\dweb-hosting-network\extension`

### Issue: "Could not connect to Chrome"
**Solution:** 
```powershell
# Start Chrome in debug mode (optional)
./tools/start-chrome-debug.ps1
```

---

## 🎯 Manual Quick Test

If you prefer manual testing:

### Test #1: Peer Count (30 seconds)
1. Open extension panel
2. Connect to signaling
3. Note peer count (e.g., "3 CONNECTED PEERS")
4. Press F5 to refresh
5. Reconnect
6. **✅ Pass:** Peer count should be the same

### Test #2: No Peers (30 seconds)
1. Open extension panel (disconnected)
2. Go to "Publish" tab
3. Fill domain: `test.dweb`
4. Fill owner: `test-owner`
5. Click "Register Domain"
6. **✅ Pass:** Should show error "No peers connected"

### Test #3: Restart Button (30 seconds)
1. Open desktop node dashboard
2. Click "⚡ Restart Services"
3. **✅ Pass:** Button should show "⏳ Restarting..." then "✅ Restarted" within 10 seconds

---

## 📄 Reports

Test results are saved in:
```
tools/reports/bug-fixes-{timestamp}.json
```

---

## 📚 More Info

- **Detailed fixes:** `BUG_FIXES_SUMMARY.md`
- **Manual testing:** `BUG_FIXES_TESTING.md`
- **Automation workflow:** `tools/AUTOMATION_WORKFLOW.md`

---

**Ready to test! 🎉**
