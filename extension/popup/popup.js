const STATUS_KEY = 'lastLoadStatus';

const statusBadge = document.getElementById('statusBadge');
const resolveForm = document.getElementById('resolveForm');
const domainInput = document.getElementById('domainInput');
const openPanelBtn = document.getElementById('openPanelBtn');

const STATUS_LABELS = {
  peer: { text: 'Peer', className: 'badge-peer' },
  relay: { text: 'Relay', className: 'badge-relay' },
  fallback: { text: 'Fallback', className: 'badge-fallback' },
  unknown: { text: 'Unknown', className: 'badge-unknown' }
};

function updateStatusBadge(status) {
  const normalized = (status ?? 'unknown').toLowerCase();
  const config = STATUS_LABELS[normalized] ?? STATUS_LABELS.unknown;

  statusBadge.textContent = `Status: ${config.text}`;
  statusBadge.className = `badge ${config.className}`;
}

async function loadStatus() {
  try {
    const result = await chrome.storage.local.get(STATUS_KEY);
    updateStatusBadge(result[STATUS_KEY]);
  } catch {
    updateStatusBadge('unknown');
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

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== 'local') return;
  if (changes[STATUS_KEY]) {
    updateStatusBadge(changes[STATUS_KEY].newValue);
  }
});

loadStatus();
