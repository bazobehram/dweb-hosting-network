# DWeb Desktop Node - Beta Testing Guide

**Version:** 1.0.0  
**Phase:** 4 - Beta Testing (Week 6-8)  
**Target:** 20 Beta Testers  
**Duration:** 2 weeks minimum  

---

## 🎯 Beta Testing Objectives

### Primary Goals:
1. **Validate** desktop node stability across different systems
2. **Measure** performance improvements vs VPS-only mode
3. **Identify** bugs and edge cases
4. **Collect** user feedback on installation/usage experience

### Success Criteria:
- ✅ Desktop node runs for 7+ days without crashes
- ✅ Latency < 10ms (vs VPS 100ms)
- ✅ 80%+ user satisfaction score
- ✅ Works on Windows, macOS, Linux
- ✅ Zero data loss or corruption

---

## 📋 Beta Tester Selection

### Ideal Beta Testers (20 total):
- **10 Power Users:** Developers, tech-savvy users
- **5 Regular Users:** Non-technical users
- **5 Edge Cases:** Users with firewalls, proxies, unique setups

### Hardware Requirements:
- **Minimum:**
  - CPU: Dual-core 2GHz+
  - RAM: 4GB
  - Disk: 1GB free space
  - Internet: Stable connection

- **Recommended:**
  - CPU: Quad-core 2.5GHz+
  - RAM: 8GB
  - Disk: 10GB free space
  - Internet: Broadband (10Mbps+)

### Supported Platforms:
- ✅ Windows 10/11 (x64)
- ✅ macOS 10.15+ (Intel & Apple Silicon)
- ✅ Linux (Ubuntu 20.04+, Debian, Fedora)

---

## 📦 Installation Instructions

### For Beta Testers:

#### Windows:
1. Download `DWeb-Desktop-Node-Setup-1.0.0.exe`
2. Run the installer (may show "Unknown publisher" warning - click "More info" → "Run anyway")
3. Choose installation directory
4. Click "Install"
5. Launch from Desktop shortcut or Start Menu

#### macOS:
1. Download `DWeb-Desktop-Node-1.0.0.dmg`
2. Open the DMG file
3. Drag "DWeb Desktop Node" to Applications folder
4. Open from Applications (may need to right-click → "Open" for first launch)
5. Grant network permissions when prompted

#### Linux (AppImage):
```bash
# Download the AppImage
wget https://github.com/[your-repo]/releases/download/v1.0.0/DWeb-Desktop-Node-1.0.0.AppImage

# Make it executable
chmod +x DWeb-Desktop-Node-1.0.0.AppImage

# Run it
./DWeb-Desktop-Node-1.0.0.AppImage
```

#### Linux (Debian/Ubuntu):
```bash
# Download the .deb package
wget https://github.com/[your-repo]/releases/download/v1.0.0/dweb-desktop-node_1.0.0_amd64.deb

# Install
sudo dpkg -i dweb-desktop-node_1.0.0_amd64.deb

# Fix dependencies if needed
sudo apt-get install -f

# Run
dweb-desktop-node
```

---

## 🧪 Testing Checklist

### Day 1: Installation & First Launch
- [ ] Download installer for your platform
- [ ] Install without errors
- [ ] Launch application
- [ ] System tray icon appears
- [ ] Dashboard opens successfully
- [ ] All 3 services show "healthy" status
- [ ] Note any warnings or errors

### Day 2-3: Basic Functionality
- [ ] Open browser extension
- [ ] Extension shows "Desktop Node: Connected"
- [ ] Publish a test domain (use panel)
- [ ] Verify domain appears in desktop node dashboard
- [ ] Resolve the domain in browser
- [ ] Content loads correctly
- [ ] Check resolution time (should be < 10ms)

### Day 4-7: Stress Testing
- [ ] Publish 10+ domains
- [ ] Resolve domains multiple times
- [ ] Leave desktop node running overnight
- [ ] Check for memory leaks (Task Manager/Activity Monitor)
- [ ] Test with poor internet connection
- [ ] Restart desktop node, verify data persists
- [ ] Check for any crashes or errors

### Week 2: Advanced Testing
- [ ] Test with VPN enabled
- [ ] Test with firewall rules
- [ ] Test with antivirus active
- [ ] Test auto-update mechanism (if available)
- [ ] Share domains with other beta testers
- [ ] Cross-platform resolution (publish on Windows, resolve on Mac)

---

## 📊 Performance Metrics to Collect

### Automatic Telemetry (Sent to us):
- Service uptime
- Request counts
- Average response times
- Error rates
- Crash reports

### Manual Testing (Please record):
1. **Domain Resolution Time:**
   ```
   Desktop Node:  ____ ms
   VPS Only:      ____ ms
   Improvement:   ____x faster
   ```

2. **Resource Usage (After 24 hours):**
   ```
   CPU:    ____ %
   RAM:    ____ MB
   Disk:   ____ MB
   ```

3. **Crash Count:**
   ```
   Total crashes in 2 weeks: ____
   Crash details: [describe if any]
   ```

---

## 🐛 Bug Reporting Template

### When You Find a Bug:

**Please report via GitHub Issues** or email: [support@dweb.network]

**Include:**
```markdown
## Bug Report

**Title:** [Short description]

**Severity:** [Critical / High / Medium / Low]

**Platform:** [Windows 11 / macOS 14 / Ubuntu 22.04 / etc.]

**Desktop Node Version:** [1.0.0]

**Steps to Reproduce:**
1. 
2. 
3. 

**Expected Behavior:**
[What should happen]

**Actual Behavior:**
[What actually happened]

**Screenshots/Logs:**
[Attach if available]

**Error Messages:**
```
[Paste any error messages]
```

**System Info:**
- CPU: 
- RAM: 
- Internet Speed: 
- Antivirus/Firewall: 
```

---

## 📝 Feedback Survey

### After 2 Weeks, Please Fill Out:

**Installation Experience (1-5 stars):**
- ⭐⭐⭐⭐⭐ How easy was installation?
- ⭐⭐⭐⭐⭐ How clear were the instructions?

**Performance (1-5 stars):**
- ⭐⭐⭐⭐⭐ How fast is domain resolution?
- ⭐⭐⭐⭐⭐ How stable is the desktop node?

**User Experience (1-5 stars):**
- ⭐⭐⭐⭐⭐ How intuitive is the dashboard?
- ⭐⭐⭐⭐⭐ How useful are the statistics shown?

**Overall Satisfaction (1-5 stars):**
- ⭐⭐⭐⭐⭐ Would you recommend to others?
- ⭐⭐⭐⭐⭐ Overall experience?

**Open-Ended Questions:**
1. What did you like most about the desktop node?
2. What frustrated you or caused problems?
3. What features are missing or should be improved?
4. Would you keep using it after beta? Why or why not?

---

## 🎁 Beta Tester Benefits

### Thank You Rewards:
- 🏆 **Beta Tester Badge** in community
- 📜 **Certificate of Contribution** (signed)
- 🎯 **Early Access** to future features
- 💬 **Direct Line** to development team
- 🎖️ **Listed as Contributor** (if you agree)

### Premium Features (6 months free):
- Priority support
- Advanced analytics
- Custom domain branding
- API rate limit increase

---

## 📞 Support & Communication

### During Beta:
- **Discord Channel:** `#beta-testing`
- **Email:** beta@dweb.network
- **GitHub:** Issues tab
- **Weekly Check-in:** Every Monday at 3pm UTC

### Emergency Contact:
If desktop node causes system issues or data loss:
- **Emergency Email:** critical@dweb.network
- **Expected Response:** < 2 hours

---

## 🚀 What Happens After Beta?

### Week 9: Public Release
- Desktop node becomes publicly available
- You get credited in release notes
- Your feedback directly shapes v1.1 features

### Long-term:
- Desktop node updates automatically
- You can continue using with all beta features enabled
- Invitation to future betas and testing programs

---

## 🔒 Privacy & Data

### What We Collect:
- ✅ Anonymous usage statistics
- ✅ Error logs (crash reports)
- ✅ Performance metrics

### What We DON'T Collect:
- ❌ Personal information
- ❌ Domain content/data
- ❌ Browsing history
- ❌ IP addresses (unless debugging)

### You Control:
- Opt-out of telemetry anytime (Settings → Privacy)
- Delete all local data (Settings → Reset)
- Export your data (Settings → Export)

---

## 📚 Additional Resources

- **Full Documentation:** `desktop-node/README.md`
- **Architecture Overview:** `docs/DISTRIBUTED_ARCHITECTURE.md`
- **Troubleshooting:** `desktop-node/TROUBLESHOOTING.md`
- **API Reference:** `desktop-node/API.md`

---

## ✅ Pre-Beta Checklist (For Organizers)

- [ ] Build installers for all platforms
- [ ] Set up GitHub Releases
- [ ] Create beta Discord channel
- [ ] Prepare welcome email for testers
- [ ] Set up telemetry backend
- [ ] Create feedback form (Google Forms/Typeform)
- [ ] Test installers on clean VMs
- [ ] Prepare emergency rollback procedure
- [ ] Set up monitoring dashboard
- [ ] Create bug triage workflow

---

**Ready to Start Beta?**  
Let's validate this system is production-ready with real users! 🚀
