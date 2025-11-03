# DWeb Extension Automation Workflow

This document describes the complete automation setup for the DWeb Desktop Node Extension.

## Quick Start

1. **Start Chrome with Debug Mode**
   ```powershell
   ./start-chrome-debug.ps1
   ```

2. **Start Desktop Node**
   ```bash
   npm run start:registry
   ```

3. **Setup Extension**
   ```bash
   node tools/setup-extension.js
   ```
   - Follow the manual instructions to load the extension
   - Run again after loading to test

4. **Reload Extension (after changes)**
   ```bash
   node tools/reload-extension-and-test-resolver.js
   ```

## Automation Scripts

### `start-chrome-debug.ps1`
Starts Chrome with remote debugging enabled on port 9222.
- Required for all automation scripts
- Creates a debug-enabled Chrome instance

### `setup-extension.js`
- Detects if extension is loaded
- Provides setup instructions if not
- Opens chrome://extensions automatically  
- Tests extension functionality once loaded

### `reload-extension-and-test-resolver.js`
- Finds the DWeb extension
- Reloads it via chrome://extensions
- Tests resolver integration with desktop node
- Opens test resolver page

### `full-automation.js`
- Most comprehensive script
- Handles extension loading (with manual step)
- Reloads existing extensions
- Tests complete integration

## Manual Steps Required

Due to Chrome security restrictions, the following must be done manually:

1. **Initial Extension Loading**
   - Open chrome://extensions
   - Enable Developer mode
   - Click "Load unpacked"
   - Select: `D:\Projects\dweb-hosting-network\extension`

2. **File Dialog Selection**
   - When automation opens file dialog, manually select extension folder
   - Scripts will detect once loaded

## Testing Workflow

1. **Desktop Node Registry**: Runs on `http://localhost:8788` (preferred)
2. **VPS Fallback**: `http://34.107.74.70:8788` (automatic fallback)
3. **Extension**: Uses `MultiRegistryClient` for intelligent routing
4. **Health Checks**: Automatic desktop node detection every 30s
5. **Test Domains**: Various domains registered in the registry

## Extension URLs

Once loaded, access extension at:
- **Panel**: `chrome-extension://{ID}/panel/panel.html`
- **Resolver**: `chrome-extension://{ID}/resolver/resolver.html`
- **Test**: `chrome-extension://{ID}/resolver/resolver.html?domain=testotest.dweb&view=1`

## Integration Points

1. **MultiRegistryClient**: Intelligent desktop/VPS endpoint selection
2. **Desktop Node Health**: Automatic monitoring and fallback detection  
3. **Registry API**: Domain and manifest management on localhost:8788
4. **VPS Fallback**: Seamless failover to 34.107.74.70:8788
5. **P2P Network**: Peer-to-peer content distribution with registry coordination
6. **Extension Resolver**: Pure P2P mode with registry manifest resolution

## Development Workflow

1. Make changes to extension code
2. Run `node tools/reload-extension-and-test-resolver.js`
3. Extension automatically reloads and opens test page
4. Verify functionality with desktop node integration

## Troubleshooting

### Chrome Not Connected
```
❌ Error: connect ECONNREFUSED 127.0.0.1:9222
```
**Solution**: Run `./start-chrome-debug.ps1`

### Extension Not Found
```
❌ Extension not found
```
**Solution**: Load extension manually via chrome://extensions

### Desktop Node Offline
```
❌ Desktop node not accessible
```
**Solution**: Start with `npm run start:registry`

## Architecture Overview

```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   Chrome        │    │   Desktop Node   │    │   Storage       │
│   Extension     │◄──►│   Registry       │◄──►│   Service       │
│                 │    │   :8788          │    │   :8080         │
└─────────────────┘    └──────────────────┘    └─────────────────┘
         │                        │                       │
         ▼                        ▼                       ▼
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   Resolver UI   │    │   HTTP Endpoints │    │   File System   │
│   Panel UI      │    │   /resolve/*     │    │   Content Store │
│   P2P Network   │    │   /serve/*       │    │   Metadata DB   │
└─────────────────┘    └──────────────────┘    └─────────────────┘
```

This automation provides a complete end-to-end testing environment for the DWeb extension with desktop node integration.