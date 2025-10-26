# AI-Browser Bridge

Autonomous browser monitoring and debugging tool using Chrome DevTools Protocol.

## Quick Start

1. **Start Chrome with debugging enabled:**
   ```powershell
   # Windows
   "C:\Program Files\Google\Chrome\Application\chrome.exe" --remote-debugging-port=9222 --user-data-dir="C:\chrome-debug-profile"
   ```

2. **Install dependencies:**
   ```bash
   cd tools
   npm install
   ```

3. **Run the bridge:**
   ```bash
   npm start
   ```

The tool will automatically:
- Monitor console errors, network failures, and runtime exceptions
- Analyze patterns and suggest fixes
- Generate patch files in `./patches/`
- Provide real-time insights without manual intervention

## Features

- ✅ Autonomous error detection
- ✅ Pattern-based fix suggestions
- ✅ Auto-generated patches
- ✅ Network monitoring
- ✅ DOM change detection
- ✅ Runtime script execution
- ✅ Session reports

## Usage

The tool runs continuously and monitors all browser activity. Press Ctrl+C to stop and generate a final report.
