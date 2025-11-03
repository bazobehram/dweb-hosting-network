# DWeb Extension Testing Guide

Comprehensive end-to-end testing suite using Playwright for the DWeb Desktop Node Extension.

## 🚀 Quick Start

```bash
# Quick system check
npm run test:quick

# Setup extension manually
npm run setup:extension

# Full test suite
npm test
```

## 📋 Test Suites Available

### 1. Quick Test (`npm run test:quick`)
- ✅ Desktop registry health check
- ✅ VPS fallback availability  
- ✅ Extension file structure
- ✅ Playwright installation

**Duration:** ~5 seconds

### 2. E2E Test Suite (`npm run test:e2e`)
- ✅ Extension loading and discovery
- ✅ Panel UI access and functionality
- ✅ Resolver UI access and functionality
- ✅ MultiRegistryClient behavior testing
- ✅ Content upload simulation
- ✅ Domain resolution with real data
- ✅ P2P connectivity indicators
- ✅ Fallback behavior verification

**Duration:** ~60-90 seconds

### 3. P2P Two-Browser Test (`npm run test:p2p`)
- ✅ Dual browser extension loading
- ✅ Signaling connection testing
- ✅ MultiRegistryClient synchronization
- ✅ P2P upload and resolve simulation
- ✅ Cross-browser communication

**Duration:** ~120-180 seconds

### 4. Comprehensive Test (`npm run test:comprehensive`)
- ✅ All E2E tests
- ✅ Performance metrics (registry response times)
- ✅ Stability testing (multiple iterations)
- ✅ Detailed reporting with recommendations

**Duration:** ~90-120 seconds

## 🏗️ Test Architecture

```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   Playwright    │    │   Desktop Node   │    │   Extension     │
│   Test Runner   │◄──►│   Registry       │◄──►│   Chrome        │
│                 │    │   :8788          │    │   Extension     │
└─────────────────┘    └──────────────────┘    └─────────────────┘
         │                        │                       │
         ▼                        ▼                       ▼
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   Browser       │    │   Health Checks  │    │   UI Elements   │
│   Automation    │    │   /health        │    │   Panel/Resolver│
│   Multi-Context │    │   /domains       │    │   P2P Status    │
└─────────────────┘    └──────────────────┘    └─────────────────┘
```

## 🧪 Test Coverage

### Extension Components
- [x] **Panel UI**: Upload form, domain input, file selection
- [x] **Resolver UI**: Domain resolution, preview iframe, status badges
- [x] **MultiRegistryClient**: Desktop/VPS switching, health monitoring
- [x] **P2P Network**: Peer connectivity, signaling, chunk resolution
- [x] **Background Scripts**: Extension messaging, service worker

### Backend Integration  
- [x] **Desktop Registry**: Health checks, domain lookup, manifest fetch
- [x] **VPS Fallback**: Connectivity, automatic switching
- [x] **Domain Resolution**: Registry API, manifest resolution
- [x] **Performance**: Response times, load metrics
- [x] **Stability**: Multiple request handling, error recovery

### User Workflows
- [x] **Content Upload**: Domain registration, file processing
- [x] **Content Resolution**: Domain lookup, P2P retrieval, display
- [x] **Multi-Browser P2P**: Peer discovery, content sharing
- [x] **Error Handling**: Fallbacks, network failures, invalid domains

## 📊 Test Reports

### Metrics Collected
- **Performance**: Registry response times, extension load times
- **Success Rates**: Test pass/fail ratios, stability percentages  
- **Coverage**: UI elements tested, API endpoints verified
- **P2P Stats**: Peer connections, resolution success, fallback usage

### Report Format
```
🎯 Overall Results:
   Success Rate: 95%
   Total Duration: 85s  
   Tests Passed: 19
   Tests Failed: 1

⚡ Performance:
   Registry Avg: 45ms
   Within Thresholds: Yes

🔄 Stability:
   Stability Rate: 100%
```

## 🛠️ Prerequisites

1. **Desktop Node Running**
   ```bash
   npm run start:registry
   ```

2. **Extension Available**
   - Extension files in `./extension/`
   - Valid `manifest.json`

3. **Playwright Installed**
   ```bash
   npm install playwright
   ```

## ⚙️ Configuration

### Test Environment Variables
```javascript
// Extension path
const extensionPath = path.resolve(__dirname, '../extension');

// Desktop node endpoints
const DESKTOP_NODE_ENDPOINTS = {
  registry: 'http://localhost:8788',
  signaling: 'ws://localhost:8787'
};

// VPS fallback endpoints  
const VPS_ENDPOINTS = {
  registry: 'http://34.107.74.70:8788',
  signaling: 'ws://34.107.74.70:8787'
};
```

### Browser Configuration
```javascript
const browser = await chromium.launch({
  headless: false, // Show browser for debugging
  args: [
    `--disable-extensions-except=${extensionPath}`,
    `--load-extension=${extensionPath}`,
    '--disable-web-security'
  ]
});
```

## 🔍 Debugging Tests

### Visual Debugging
Tests run with `headless: false` by default to show browser windows. This allows:
- Visual verification of UI elements
- Manual inspection of extension behavior  
- Real-time log monitoring
- Step-by-step debugging

### Log Monitoring
- Extension logs visible in browser console
- Registry health via `/health` endpoint
- Playwright test output with detailed steps
- Performance metrics in real-time

### Common Issues

#### Extension Not Found
```
❌ DWeb extension not found in chrome://extensions
```
**Solution**: Load extension manually first via `npm run setup:extension`

#### Registry Offline
```
❌ Desktop registry not accessible
```
**Solution**: Start registry with `npm run start:registry`

#### Test Timeouts
```
❌ Test failed: waiting for selector timeout
```
**Solution**: Increase timeout or check element selectors

## 📈 Performance Benchmarks

### Target Metrics
- **Registry Response**: < 500ms average
- **Extension Load**: < 2000ms
- **Domain Resolution**: < 5000ms  
- **P2P Connection**: < 10000ms
- **Test Suite Duration**: < 180s total

### Threshold Alerts
- Registry response > 1000ms: ⚠️ Performance warning
- Test failure rate > 20%: ❌ Stability issue
- P2P connection failure: ⚠️ Network/signaling issue

## 🔄 CI/CD Integration

### GitHub Actions Example
```yaml
name: DWeb E2E Tests
on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
      - run: npm install
      - run: npm run start:registry &
      - run: sleep 5
      - run: npm run test:quick
      - run: npm run test:comprehensive
```

### Test Artifacts
- Screenshots on failure
- Browser console logs
- Performance metrics JSON
- Coverage reports

## 🎯 Future Enhancements

- [ ] Visual regression testing
- [ ] Mobile extension testing  
- [ ] Load testing with multiple peers
- [ ] Security testing (CSP, XSS)
- [ ] Accessibility testing
- [ ] Real P2P content transfer tests
- [ ] Network condition simulation
- [ ] Cross-browser compatibility (Firefox, Edge)

This comprehensive testing suite ensures your DWeb extension works reliably across all use cases and provides detailed metrics for performance optimization.