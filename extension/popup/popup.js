const STATUS_KEY = 'lastLoadStatus';

const statusBadge = document.getElementById('statusBadge');
const nodeStatusBadge = document.getElementById('nodeStatusBadge');
const resolveForm = document.getElementById('resolveForm');
const domainInput = document.getElementById('domainInput');
const openPanelBtn = document.getElementById('openPanelBtn');
const settingsBtn = document.getElementById('settingsBtn');
const preferDesktopNodeCheckbox = document.getElementById('preferDesktopNode');
const nodeInfo = document.getElementById('nodeInfo');

const STATUS_LABELS = {
  peer: { text: 'Peer', className: 'badge-peer' },
  relay: { text: 'Relay', className: 'badge-relay' },
  fallback: { text: 'Fallback', className: 'badge-fallback' },
  unknown: { text: 'Unknown', className: 'badge-unknown' }
};

const NODE_STATUS_LABELS = {
  available: { text: 'Desktop Node: Available', className: 'badge-available' },
  unavailable: { text: 'Desktop Node: Unavailable', className: 'badge-unavailable' },
  checking: { text: 'Desktop Node: Checking...', className: 'badge-checking' },
  error: { text: 'Desktop Node: Error', className: 'badge-error' }
};

function updateStatusBadge(status) {
  const normalized = (status ?? 'unknown').toLowerCase();
  const config = STATUS_LABELS[normalized] ?? STATUS_LABELS.unknown;

  statusBadge.textContent = `Status: ${config.text}`;
  statusBadge.className = `badge ${config.className}`;
}

function updateNodeStatusBadge(status) {
  const normalized = (status ?? 'checking').toLowerCase();
  const config = NODE_STATUS_LABELS[normalized] ?? NODE_STATUS_LABELS.checking;

  nodeStatusBadge.textContent = config.text;
  nodeStatusBadge.className = `badge ${config.className}`;
  
  // Update info text based on status
  if (status === 'available') {
    nodeInfo.innerHTML = '<small>✅ Using fast local desktop node</small>';
  } else if (status === 'unavailable') {
    nodeInfo.innerHTML = '<small>⚠️ Using VPS fallback - <a href="#" id="downloadLink">Download Desktop Node</a></small>';
  } else {
    nodeInfo.innerHTML = '<small>Desktop node provides better privacy and performance</small>';
  }
}

async function checkDesktopNodeHealth() {
  try {
    updateNodeStatusBadge('checking');
    
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 2000);
    
    const response = await fetch('http://localhost:8788/health', {
      signal: controller.signal,
      cache: 'no-cache'
    });
    
    clearTimeout(timeout);
    
    if (response.ok) {
      const data = await response.json();
      if (data.status === 'healthy' && data.service === 'registry') {
        updateNodeStatusBadge('available');
        return true;
      }
    }
    
    updateNodeStatusBadge('unavailable');
    return false;
    
  } catch (error) {
    updateNodeStatusBadge('unavailable');
    return false;
  }
}

async function loadSettings() {
  try {
    const result = await chrome.storage.local.get([
      'dweb-prefer-desktop-node',
      STATUS_KEY
    ]);
    
    // Load desktop node preference (default: true)
    const preferDesktop = result['dweb-prefer-desktop-node'] !== false;
    preferDesktopNodeCheckbox.checked = preferDesktop;
    
    // Load status
    updateStatusBadge(result[STATUS_KEY]);
    
    // Check desktop node health
    await checkDesktopNodeHealth();
    
  } catch (error) {
    updateStatusBadge('unknown');
    updateNodeStatusBadge('error');
  }
}

resolveForm.addEventListener('submit', (event) => {
  event.preventDefault();
  const domain = domainInput.value.trim();
  if (!domain) return;

  const url = new URL(chrome.runtime.getURL('resolver/index.html'));
  url.searchParams.set('domain', domain);

  chrome.tabs.create({ url: url.toString() });
});

openPanelBtn.addEventListener('click', () => {
  const panelUrl = chrome.runtime.getURL('panel/index.html');
  chrome.tabs.create({ url: panelUrl });
});

settingsBtn.addEventListener('click', () => {
  const settingsUrl = chrome.runtime.getURL('resolver/index.html');
  chrome.tabs.create({ url: settingsUrl });
});

preferDesktopNodeCheckbox.addEventListener('change', async () => {
  const prefer = preferDesktopNodeCheckbox.checked;
  
  try {
    await chrome.storage.local.set({ 'dweb-prefer-desktop-node': prefer });
    
    // Notify background script of preference change
    chrome.runtime.sendMessage({
      type: 'desktop-node-preference-changed',
      preferDesktopNode: prefer
    });
    
    console.log(`Desktop node preference set to: ${prefer}`);
  } catch (error) {
    console.error('Failed to save desktop node preference:', error);
  }
});

// Handle download link clicks
document.addEventListener('click', (event) => {
  if (event.target.id === 'downloadLink') {
    event.preventDefault();
    // Open GitHub releases or website for desktop node download
    chrome.tabs.create({ url: 'https://github.com/dweb-network/desktop-node/releases' });
  }
});

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== 'local') return;
  
  if (changes[STATUS_KEY]) {
    updateStatusBadge(changes[STATUS_KEY].newValue);
  }
  
  if (changes['dweb-prefer-desktop-node']) {
    preferDesktopNodeCheckbox.checked = changes['dweb-prefer-desktop-node'].newValue !== false;
  }
});

// Periodic desktop node health check
setInterval(checkDesktopNodeHealth, 30000); // Check every 30 seconds

// Initialize
loadSettings();
