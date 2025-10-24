import { WebRTCConnectionManager } from '../scripts/webrtc/connectionManager.js';
import { ChunkManager } from '../scripts/webrtc/chunkManager.js';
import { RegistryClient } from '../scripts/api/registryClient.js';
import { TelemetryClient } from '../scripts/telemetry/telemetryClient.js';
import {
  generateKeypair,
  deriveOwnerIdFromPublicKey,
  exportPublicKey,
  signMessage,
  storeKeypair,
  loadKeypair
} from '../scripts/crypto/identity.js';

const navButtons = document.querySelectorAll('.nav-item');
const views = document.querySelectorAll('.view');
const sidebarStatusBadge = document.getElementById('sidebarStatusBadge');
const sidebarOwnerId = document.getElementById('sidebarOwnerId');
const openResolverFromSidebar = document.getElementById('openResolverFromSidebar');
const authOverlay = document.getElementById('authOverlay');
const authGuestBtn = document.getElementById('authGuestBtn');
const authPasskeyBtn = document.getElementById('authPasskeyBtn');
const authMagicLinkBtn = document.getElementById('authMagicLinkBtn');

const VIEW_STORAGE_KEY = 'dweb-panel-active-view';
const AUTH_STORAGE_KEY = 'dweb-auth-state';
const STATUS_STORAGE_KEY = 'lastLoadStatus';
const APPS_STORAGE_KEY = 'dweb-published-apps';
const APPS_BACKUP_STORAGE_KEY = 'dweb-published-apps-backup';

const signalingInput = document.getElementById('signalingUrl');
const peerIdInput = document.getElementById('peerId');
const signalingAuthTokenInput = document.getElementById('signalingAuthToken');
const connectBtn = document.getElementById('connectBtn');
const statusLog = document.getElementById('statusLog');
const peerList = document.getElementById('peerList');
const peerSelect = document.getElementById('peerSelect');
const openChannelBtn = document.getElementById('openChannelBtn');
const messageInput = document.getElementById('messageInput');
const sendMessageBtn = document.getElementById('sendMessageBtn');
const sendFileBtn = document.getElementById('sendFileBtn');
const fileInput = document.getElementById('fileInput');
const channelStatus = document.getElementById('channelStatus');
const channelLog = document.getElementById('channelLog');
const downloadArea = document.getElementById('downloadArea');

const registryUrlInput = document.getElementById('registryUrl');
const registryApiKeyInput = document.getElementById('registryApiKey');
const domainInput = document.getElementById('domainInput');
const ownerInput = document.getElementById('ownerInput');
const registerDomainBtn = document.getElementById('registerDomainBtn');
const registryLog = document.getElementById('registryLog');
const autoReplicaToggle = document.getElementById('autoReplicaToggle');
const replicaTargetCountInput = document.getElementById('replicaTargetCount');
const manualReplicaContainer = document.getElementById('manualReplicaContainer');
const manualReplicaList = document.getElementById('manualReplicaList');
const replicationStatusContainer = document.getElementById('replicationStatus');
const clearManualReplicasBtn = document.getElementById('clearManualReplicasBtn');
const resetReplicationSettingsBtn = document.getElementById('resetReplicationSettingsBtn');
const storageServiceUrlInput = document.getElementById('storageServiceUrl');
const inlineRegistryDataToggle = document.getElementById('inlineRegistryDataToggle');
const storageFallbackToggle = document.getElementById('storageFallbackToggle');
const peerTableBody = document.getElementById('peerTableBody');
const peerAutoSelectToggle = document.getElementById('peerAutoSelectToggle');
const selectionLogContainer = document.getElementById('selectionLogContainer');
const selectionExportJson = document.getElementById('selectionExportJson');
const selectionExportCsv = document.getElementById('selectionExportCsv');
const togglePeerFirst = document.getElementById('togglePeerFirst');
const toggleHealthScoring = document.getElementById('toggleHealthScoring');
const toggleE2EAuto = document.getElementById('toggleE2EAuto');
const toggleRegistryFallback = document.getElementById('toggleRegistryFallback');
const domainBindStatus = document.getElementById('domainBindStatus');
const REPLICATION_STORAGE_KEY = 'dweb-replication-settings';
const REGISTRY_API_KEY_STORAGE_KEY = 'dweb-registry-api-key';
const SIGNALING_AUTH_STORAGE_KEY = 'dweb-signaling-auth-token';
const STORAGE_API_KEY_STORAGE_KEY = 'dweb-storage-api-key';
const STORAGE_SERVICE_URL_STORAGE_KEY = 'dweb-storage-service-url';
const PERSISTENCE_SETTINGS_STORAGE_KEY = 'dweb-persistence-settings';
const PEER_FIRST_TOGGLE_STORAGE_KEY = 'dweb-peer-first-toggle';
const HEALTH_SCORING_TOGGLE_STORAGE_KEY = 'dweb-health-scoring-toggle';
const E2E_AUTORUN_TOGGLE_STORAGE_KEY = 'dweb-e2e-autorun-toggle';
const REGISTRY_FALLBACK_TOGGLE_STORAGE_KEY = 'dweb-registry-fallback-toggle';

let telemetry = null;
let registryClient = null;
let chunkManager = null;
let connectionManager = null;
let localPeerId = null;
let peers = [];
let outgoingTransfer = null;
let incomingTransfer = null;
let lastManifestRecord = null;

// Early initialization for apps list
function loadAppsFromStorage() {
  try {
    const raw = window.localStorage.getItem(APPS_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    }
    // Try backup if main is missing/corrupt
    const backupRaw = window.localStorage.getItem(APPS_BACKUP_STORAGE_KEY);
    if (backupRaw) {
      const parsed = JSON.parse(backupRaw);
      if (Array.isArray(parsed?.apps)) {
        // Restore from backup
        window.localStorage.setItem(APPS_STORAGE_KEY, JSON.stringify(parsed.apps));
        return parsed.apps;
      }
    }
    return [];
  } catch {
    return [];
  }
}

async function loadPublishedApps() {
  publishedApps = loadAppsFromStorage();
  return publishedApps;
}

let publishedApps = loadAppsFromStorage();

if (domainBindStatus) {
  domainBindStatus.textContent = 'No domain bound';
}

function generateOwnerId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return `guest-${crypto.randomUUID().slice(0, 8)}`;
  }
  return `guest-${Date.now().toString(36)}`;
}

function loadAuthState() {
  try {
    const raw = window.localStorage.getItem(AUTH_STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function persistAuthState(state) {
  try {
    window.localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(state));
  } catch {
    // ignore
  }
}

function updateOwnerBadge(ownerId) {
  if (sidebarOwnerId) {
    sidebarOwnerId.textContent = ownerId ? `Owner: ${ownerId}` : 'Owner: —';
  }
  if (ownerInput && ownerId && ownerInput.value !== ownerId) {
    ownerInput.value = ownerId;
  }
}

function hideAuthOverlay() {
  authOverlay?.classList.add('hidden');
}

function showAuthOverlay() {
  authOverlay?.classList.remove('hidden');
}

let authState = loadAuthState();
if (authState?.ownerId) {
  updateOwnerBadge(authState.ownerId);
  hideAuthOverlay();
} else {
  showAuthOverlay();
}

authGuestBtn?.addEventListener('click', async () => {
  try {
    // Generate cryptographic keypair
    const keypair = await generateKeypair();
    const ownerId = await deriveOwnerIdFromPublicKey(keypair.publicKey);
    const publicKeyBase64 = await exportPublicKey(keypair.publicKey);
    
    // Store keypair securely
    await storeKeypair(ownerId, keypair);
    
    authState = {
      method: 'cryptographic',
      ownerId,
      publicKey: publicKeyBase64,
      authenticatedAt: Date.now()
    };
    
    persistAuthState(authState);
    updateOwnerBadge(ownerId);
    hideAuthOverlay();
    
    console.log('[Auth] Cryptographic identity created:', ownerId);
  } catch (error) {
    console.error('[Auth] Failed to create identity:', error);
    alert(`Failed to create identity: ${error.message}`);
  }
});

authPasskeyBtn?.addEventListener('click', () => {
  const ownerId = authState?.ownerId ?? generateOwnerId();
  authState = { method: 'passkey', ownerId, authenticatedAt: Date.now() };
  persistAuthState(authState);
  updateOwnerBadge(ownerId);
  hideAuthOverlay();
  try {
    registryClient?.listDomains?.().then((res) => {
      const all = Array.isArray(res) ? res : (Array.isArray(res?.domains) ? res.domains : []);
      populateDomainSuggestionLists(all);
    }).catch(() => {});
  } catch {}
});

authMagicLinkBtn?.addEventListener('click', () => {
  const ownerId = authState?.ownerId ?? generateOwnerId();
  authState = { method: 'magic-link', ownerId, authenticatedAt: Date.now() };
  persistAuthState(authState);
  updateOwnerBadge(ownerId);
  hideAuthOverlay();
  try {
    registryClient?.listDomains?.().then((res) => {
      const all = Array.isArray(res) ? res : (Array.isArray(res?.domains) ? res.domains : []);
      populateDomainSuggestionLists(all);
    }).catch(() => {});
  } catch {}
});

ownerInput?.addEventListener('change', () => {
  const value = ownerInput.value.trim();
  if (!value) return;
  authState = { ...(authState ?? {}), ownerId: value, updatedAt: Date.now() };
  persistAuthState(authState);
  updateOwnerBadge(value);
});

function setSidebarStatus(status, { persist = true } = {}) {
  const normalized = (status ?? 'unknown').toLowerCase();
  sidebarStatusBadge?.classList.remove('status-peer', 'status-relay', 'status-fallback', 'status-unknown');
  switch (normalized) {
    case 'peer':
      sidebarStatusBadge?.classList.add('status-peer');
      sidebarStatusBadge.textContent = 'Peer';
      break;
    case 'relay':
      sidebarStatusBadge?.classList.add('status-relay');
      sidebarStatusBadge.textContent = 'Relay';
      break;
    case 'fallback':
      sidebarStatusBadge?.classList.add('status-fallback');
      sidebarStatusBadge.textContent = 'Fallback';
      break;
  default:
      sidebarStatusBadge?.classList.add('status-unknown');
      sidebarStatusBadge.textContent = 'Unknown';
      break;
  }
  if (persist && chrome?.storage?.local) {
    chrome.storage.local.set({ [STATUS_STORAGE_KEY]: normalized }, () => {
      // ignore errors
    });
  }
}

openResolverFromSidebar?.addEventListener('click', () => {
  const url = chrome.runtime.getURL('resolver/index.html');
  chrome.tabs.create({ url });
});

async function refreshDashboardOverview() {
  console.log('[Dashboard] Refreshing overview... peers:', peers ? peers.length : 0);
  // Update stats
  const appsCountEl = document.getElementById('dashboardAppsCount');
  const domainsCountEl = document.getElementById('dashboardDomainsCount');
  const peersCountEl = document.getElementById('dashboardPeersCount');
  const networkStatusEl = document.getElementById('dashboardNetworkStatus');
  
  if (appsCountEl) appsCountEl.textContent = publishedApps.length;
  
  if (domainsCountEl) {
    try {
      const result = await registryClient.listDomains();
      const allDomains = Array.isArray(result) ? result : (Array.isArray(result?.domains) ? result.domains : []);
      // Filter to only show current user's domains
      const myDomains = authState?.ownerId 
        ? allDomains.filter(d => d.owner === authState.ownerId)
        : allDomains;
      domainsCountEl.textContent = myDomains.length;
    } catch {
      domainsCountEl.textContent = '0';
    }
  }
  
  if (peersCountEl) {
    peersCountEl.textContent = peers ? peers.length : '0';
  }
  
  if (networkStatusEl) {
    const status = sidebarStatusBadge?.textContent || 'Unknown';
    networkStatusEl.textContent = status;
    networkStatusEl.className = 'stat-value ' + (sidebarStatusBadge?.className.split(' ').find(c => c.startsWith('status-')) || '');
  }
  
  // Add recent activity
  const activityEl = document.getElementById('dashboardActivity');
  if (activityEl && publishedApps.length > 0) {
    const recentApps = publishedApps.slice(-3).reverse();
    activityEl.innerHTML = recentApps.map(app => `
      <div class="activity-item">
        <span class="activity-icon">📦</span>
        <span class="activity-text">Published ${app.fileName || app.manifestId.slice(0, 12)}</span>
        <span class="activity-time">${timeAgo(app.publishedAt)}</span>
      </div>
    `).join('');
  }
}

async function refreshDashboardMetrics() {
  const directRatioCard = document.getElementById('metricDirectRate');
  const ttfbP50Card = document.getElementById('metricTtfb');
  const replicationSuccessCard = document.getElementById('metricReplication');
  const e2eStatusCard = document.getElementById('metricE2ERun');

  const applyLocalMetrics = () => new Promise((resolve) => {
    try {
      chrome?.storage?.local?.get(['dweb-local-metrics', 'dweb-local-replication'], (res) => {
        const list = Array.isArray(res?.['dweb-local-metrics']) ? res['dweb-local-metrics'] : [];
        const now = Date.now();
        const windowed = list.filter((e) => typeof e?.ts === 'number' && now - e.ts <= 24 * 60 * 60 * 1000);
        if (windowed.length === 0) {
          if (directRatioCard) directRatioCard.textContent = '—';
          if (ttfbP50Card) ttfbP50Card.textContent = '—';
        } else {
          const peer = windowed.reduce((a, b) => a + (Number(b.peerHits) || 0), 0);
          const fb = windowed.reduce((a, b) => a + (Number(b.fallbackHits) || 0), 0);
          const ratio = (peer + fb) > 0 ? Math.round((peer / (peer + fb)) * 100) : 0;
          if (directRatioCard) directRatioCard.textContent = `${ratio}%`;

          const ttfbs = windowed.map((e) => Number(e.ttfbMs) || 0).filter((v) => v > 0).sort((a,b)=>a-b);
          const p50 = ttfbs.length ? ttfbs[Math.floor(ttfbs.length * 0.5)] : null;
          if (ttfbP50Card) ttfbP50Card.textContent = p50 !== null ? `${Math.round(p50)} ms` : '—';
        }
        // Replication success
        const repl = Array.isArray(res?.['dweb-local-replication']) ? res['dweb-local-replication'] : [];
        const rwin = repl.filter((e) => typeof e?.ts === 'number' && now - e.ts <= 24 * 60 * 60 * 1000);
        if (replicationSuccessCard) {
          if (rwin.length === 0) replicationSuccessCard.textContent = '—';
          else {
            const succ = rwin.filter((e) => e?.ok === true).length;
            replicationSuccessCard.textContent = `${Math.round((succ / rwin.length) * 100)}%`;
          }
        }
        if (e2eStatusCard) e2eStatusCard.textContent = 'No telemetry';
        resolve();
      });
    } catch {
      if (directRatioCard) directRatioCard.textContent = '—';
      if (ttfbP50Card) ttfbP50Card.textContent = '—';
      if (replicationSuccessCard) replicationSuccessCard.textContent = '—';
      if (e2eStatusCard) e2eStatusCard.textContent = 'No telemetry';
      resolve();
    }
  });

  if (!telemetry || !telemetry.endpoint) {
    await applyLocalMetrics();
    return;
  }

  try {
    const base = telemetry.endpoint.replace(/\/[^\/]*$/, '');
    const metricsUrl = `${base}/reports/metrics/summary?hours=24`;
    const response = await fetch(metricsUrl, { headers: { Accept: 'application/json' } });
    if (!response.ok) throw new Error(`Metrics fetch failed: ${response.status}`);

    const data = await response.json();
    if (directRatioCard && typeof data.directRatio === 'number') {
      directRatioCard.textContent = `${Math.round(data.directRatio * 100)}%`;
      directRatioCard.title = 'Share served directly by peers (24h)';
    }
    if (ttfbP50Card && (typeof data.ttfbP50 === 'number' || typeof data.ttfbP95 === 'number')) {
      const p50 = typeof data.ttfbP50 === 'number' ? `${Math.round(data.ttfbP50)} ms` : '—';
      const p95 = typeof data.ttfbP95 === 'number' ? `${Math.round(data.ttfbP95)} ms` : null;
      ttfbP50Card.textContent = p95 ? `${p50} (p95 ${p95})` : p50;
    }
    if (replicationSuccessCard && typeof data.replicationSuccess === 'number') {
      replicationSuccessCard.textContent = `${Math.round(data.replicationSuccess * 100)}%`;
    }
    if (e2eStatusCard && data.latestE2E) {
      const ts = data.latestE2E.timestamp || data.latestE2E.time || null;
      const age = ts ? timeAgo(Number(new Date(ts))) : null;
      e2eStatusCard.textContent = age ? `${data.latestE2E.status} • ${age}` : (data.latestE2E.status ?? 'Unknown');
      if (ts) e2eStatusCard.title = new Date(ts).toLocaleString();
    }
  } catch (error) {
    if (typeof console !== 'undefined') console.warn('[metrics]', error);
    await applyLocalMetrics();
  }
}

async function updateNetworkHealthStrip() {
  const strip = document.getElementById('networkHealthStrip');
  if (!strip) return;
  const el = (id) => document.getElementById(id);
  const set = (id, text, cls) => {
    const s = el(id);
    if (!s) return;
    s.textContent = text;
    s.classList.remove('ok','warn','err');
    if (cls) s.classList.add(cls);
  };

  // Mode and peers (local, no network call)
  const mode = sidebarStatusBadge?.textContent || 'Unknown';
  set('nhMode', `Mode: ${mode}`);
  set('nhPeers', `Peers: ${peers?.length ?? 0}`);

  // Signaling: treat as OK when we have a connection manager instance
  if (connectionManager) set('nhSignaling', 'Signaling: OK', 'ok'); else set('nhSignaling', 'Signaling: —');

  // Registry connectivity
  try {
    await Promise.race([
      registryClient.listDomains(),
      new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 4000))
    ]);
    set('nhRegistry', 'Registry: OK', 'ok');
  } catch {
    set('nhRegistry', 'Registry: ERR', 'err');
  }

  // Storage health (optional). Only mark OK if /health responds with 200
  try {
    const url = `${storageServiceUrl}/health`;
    const headers = buildStorageHeaders({ Accept: 'application/json' });
    const res = await Promise.race([
      fetch(url, { headers }),
      new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 4000))
    ]);
    if (res && res.ok) set('nhStorage', 'Storage: OK', 'ok'); else set('nhStorage', 'Storage: ERR', 'err');
  } catch {
    set('nhStorage', 'Storage: ERR', 'err');
  }
}

async function refreshDomainsList() {
  const domainsTableBody = document.getElementById('domainsTableBody');
  if (!domainsTableBody) return;
  
  try {
    const result = await registryClient.listDomains();
    domainsTableBody.innerHTML = '';
    
const allDomains = Array.isArray(result) ? result : (Array.isArray(result?.domains) ? result.domains : []);
    
    // Keep apps view in sync with latest bindings
    syncAppDomainsFromList(allDomains);

    // Update datalists for search/inputs
    populateDomainSuggestionLists(allDomains);
    
    // Filter to only show current user's domains
    const myDomains = authState?.ownerId 
      ? allDomains.filter(d => d.owner === authState.ownerId)
      : [];
    
    if (myDomains.length === 0) {
      const message = authState?.ownerId 
        ? 'No domains registered yet. Register your first .dweb domain!'
        : 'Sign in to manage your domains';
      domainsTableBody.innerHTML = `<tr><td colspan="5" style="text-align:center;color:#8c93ab;">${message}</td></tr>`;
      return;
    }
    
    const list = myDomains;
    
    list.forEach((domain) => {
      const row = domainsTableBody.insertRow();
      const isBound = Boolean(domain.manifestId && domain.manifestId !== 'unbound');
      const statusClass = isBound ? 'status-bound' : 'status-unbound';
      const statusText = isBound ? 'Bound' : 'Reserved';
      const updatedDate = domain.updatedAt ? new Date(domain.updatedAt).toLocaleString() : '—';
      const manifestIdShort = domain.manifestId ? domain.manifestId.slice(0, 12) + '...' : '—';
      
      row.innerHTML = `
        <td><strong>${escapeHtml(domain.domain ?? '—')}</strong></td>
        <td><span class="status-badge ${statusClass}">${statusText}</span></td>
        <td title="${escapeHtml(domain.manifestId ?? '')}">${escapeHtml(manifestIdShort)}</td>
        <td>${updatedDate}</td>
        <td>
          <button class="secondary small" data-action="edit" data-domain="${escapeHtml(domain.domain ?? '')}">Edit</button>
          ${isBound ? `<button class="secondary small" data-action="open" data-domain="${escapeHtml(domain.domain ?? '')}">Open</button>` : ''}
        </td>
      `;
      
      // Attach event listeners
      const buttons = row.querySelectorAll('button[data-action]');
      buttons.forEach(btn => {
        btn.addEventListener('click', () => {
          const action = btn.dataset.action;
          const domainName = btn.dataset.domain;
          if (action === 'edit') {
            window.editDomain(domainName);
          } else if (action === 'open') {
            window.openAppDomain(domainName);
          }
        });
      });
    });
  } catch (error) {
    domainsTableBody.innerHTML = `<tr><td colspan="5" style="color:var(--danger);text-align:center;">Error: ${escapeHtml(error.message ?? error)}</td></tr>`;
  }
}

function populateDomainSuggestionLists(allDomains) {
  try {
    const owned = authState?.ownerId
      ? allDomains.filter(d => d.owner === authState.ownerId).map(d => d.domain)
      : [];
    const all = allDomains.map(d => d.domain);
    
    const toNameOnly = (arr) => Array.from(new Set(arr))
      .map(d => String(d || ''))
      .filter(Boolean)
      .map(d => d.replace(/\.dweb$/i, ''))
      .sort((a, b) => a.localeCompare(b));
    
    const fill = (id, items) => {
      const el = document.getElementById(id);
      if (!el) return;
      el.innerHTML = items.map(v => `<option value="${escapeHtml(v)}"></option>`).join('');
    };
    
    fill('quickDomainsList', toNameOnly(owned));
    fill('bindingDomainsList', toNameOnly(owned));
    fill('searchDomainsList', toNameOnly(all));
  } catch (e) {
    // ignore
  }
}

async function refreshPeersTable() {
  const peerTableBody = document.getElementById('peerTableBody');
  if (!peerTableBody) return;
  
  if (!connectionManager || !peers || peers.length === 0) {
    peerTableBody.innerHTML = '<tr><td colspan="4" style="text-align:center;">Not connected</td></tr>';
    return;
  }
  
  peerTableBody.innerHTML = '';
  peers.forEach((peer) => {
    const row = peerTableBody.insertRow();
    row.innerHTML = `
      <td>${escapeHtml(peer.peerId)}</td>
      <td>—</td>
      <td>—</td>
      <td>—</td>
    `;
  });
}

async function refreshBindingsView() {
  // Load published apps from storage first
  await loadPublishedApps();
  
  // Populate app selector
  const bindingAppSelect = document.getElementById('bindingAppSelect');
  const bindingDomainInput = document.getElementById('bindingDomainInput');
  const createBindingBtn = document.getElementById('createBindingBtn');
  
  if (bindingAppSelect) {
    bindingAppSelect.innerHTML = '<option value="">-- Choose published app --</option>';
    if (publishedApps && publishedApps.length > 0) {
      publishedApps.forEach(app => {
        const option = document.createElement('option');
        option.value = app.manifestId;
        option.textContent = `${app.fileName || 'Unnamed'} (${app.manifestId.slice(0, 12)}...)`;
        bindingAppSelect.appendChild(option);
      });
    }
  }
  
  // Enable/disable create button based on current values
  if (createBindingBtn) {
    const hasApp = bindingAppSelect?.value;
    const hasDomain = bindingDomainInput?.value?.trim();
    createBindingBtn.disabled = !hasApp || !hasDomain;
  }
  
  // Populate domain suggestions for inputs
  try {
    const result = await registryClient.listDomains();
    const allDomains = Array.isArray(result) ? result : (Array.isArray(result?.domains) ? result.domains : []);
    populateDomainSuggestionLists(allDomains);
  } catch {}
  
  // Render bindings list
  await renderBindingsList();
}

async function renderBindingsList() {
  const container = document.getElementById('bindingsTableContainer');
  if (!container) return;
  
  try {
    // Get all domains
    const result = await registryClient.listDomains();
    const allDomains = Array.isArray(result) ? result : (Array.isArray(result?.domains) ? result.domains : []);
    
    // Filter to user's bound domains
    const myBindings = authState?.ownerId 
      ? allDomains.filter(d => d.owner === authState.ownerId && d.manifestId && d.manifestId !== 'unbound')
      : [];
    
    if (myBindings.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <p class="empty-icon">🔗</p>
          <p class="empty-text">No bindings yet</p>
          <p class="empty-hint">Create a binding above to connect an app to a domain</p>
        </div>
      `;
      return;
    }
    
    container.innerHTML = '';
    myBindings.forEach(binding => {
      const app = publishedApps.find(a => a.manifestId === binding.manifestId);
      const appName = app?.fileName || 'Unknown App';
      
      const bindingItem = document.createElement('div');
      bindingItem.className = 'binding-item';
      bindingItem.innerHTML = `
        <div class="binding-info">
          <div class="binding-app">
            <div class="binding-app-name">📄 ${escapeHtml(appName)}</div>
            <div class="binding-app-id">${escapeHtml(binding.manifestId.slice(0, 24))}...</div>
          </div>
          <div class="binding-connector">→</div>
          <div class="binding-domain">
            <div class="binding-domain-name">🌐 ${escapeHtml(binding.domain)}</div>
            <div class="binding-domain-status">Bound • Updated ${new Date(binding.updatedAt || Date.now()).toLocaleDateString()}</div>
          </div>
        </div>
        <div class="binding-actions">
          <button class="secondary small" data-action="open" data-domain="${escapeHtml(binding.domain)}">Open</button>
          <button class="secondary small" data-action="unbind" data-domain="${escapeHtml(binding.domain)}">Unbind</button>
        </div>
      `;
      
      // Add event listeners
      bindingItem.querySelectorAll('button[data-action]').forEach(btn => {
        btn.addEventListener('click', () => {
          const action = btn.dataset.action;
          const domain = btn.dataset.domain;
          if (action === 'open') {
            window.openAppDomain(domain);
          } else if (action === 'unbind') {
            unbindDomainFromBindingsView(domain);
          }
        });
      });
      
      container.appendChild(bindingItem);
    });
  } catch (error) {
    container.innerHTML = `<div class="empty-state"><p style="color:var(--danger);">Error loading bindings: ${escapeHtml(error.message || error)}</p></div>`;
  }
}

async function unbindDomainFromBindingsView(domainName) {
  if (!confirm(`Unbind domain ${domainName}? The domain will be reserved but not connected to any app.`)) return;
  
  try {
    await registryClient.updateDomainBinding(domainName, { manifestId: 'unbound' });
    alert(`Domain ${domainName} has been unbound`);
    updateLocalBindingsForDomainChange(domainName, null);
    await renderBindingsList();
  } catch (error) {
    alert(`Failed to unbind: ${error.message || error}`);
  }
}

function escapeHtml(unsafe) {
  if (!unsafe) return '';
  return String(unsafe)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

window.unbindDomain = async function (button) {
  const domain = button?.dataset?.domain;
  if (!domain) return;
  if (!confirm(`Unbind domain ${domain}?`)) return;
  
try {
    await registryClient.updateDomainBinding(domain, { manifestId: 'unbound' });
    appendRegistryLog(`Domain ${domain} unbound`);
    updateLocalBindingsForDomainChange(domain, null);
    await refreshDomainsList();
  } catch (error) {
    appendRegistryLog(`Failed to unbind ${domain}: ${error.message ?? error}`);
  }
};

let currentEditingDomain = null;
let selectedManifestId = null;

window.editDomain = async function(domainName) {
  if (!domainName) return;
  
  try {
    // Load published apps from storage first
    await loadPublishedApps();
    
    const domain = await registryClient.getDomain(domainName);
    if (!domain) {
      alert(`Domain ${domainName} not found`);
      return;
    }
    
    currentEditingDomain = domain;
    selectedManifestId = domain.manifestId && domain.manifestId !== 'unbound' ? domain.manifestId : null;
    
    // Show modal
    const modal = document.getElementById('domainBindModal');
    const domainNameEl = document.getElementById('bindModalDomainName');
    const appsContainer = document.getElementById('bindAppsContainer');
    
    domainNameEl.textContent = domainName;
    modal.classList.remove('hidden');
    
    // Populate apps list
    if (!publishedApps || publishedApps.length === 0) {
      appsContainer.innerHTML = '<p class="empty-hint">No published apps available.<br/>Go to Hosting tab and publish an app first!</p>';
    } else {
      appsContainer.innerHTML = publishedApps.map((app, idx) => {
        const isSelected = app.manifestId === selectedManifestId;
        return `
          <div class="bind-app-item ${isSelected ? 'selected' : ''}" data-manifest-id="${escapeHtml(app.manifestId)}">
            <input type="radio" name="bindAppRadio" class="bind-app-radio" value="${escapeHtml(app.manifestId)}" ${isSelected ? 'checked' : ''} />
            <div class="bind-app-details">
              <div class="bind-app-name">${escapeHtml(app.fileName || 'Unnamed App')}</div>
              <div class="bind-app-manifest" title="${escapeHtml(app.manifestId)}">${escapeHtml(app.manifestId)}</div>
              <div class="bind-app-meta">${app.chunks || 0} chunks • Published ${timeAgo(app.publishedAt)}</div>
            </div>
          </div>
        `;
      }).join('');
      
      // Add click handlers to app items
      appsContainer.querySelectorAll('.bind-app-item').forEach(item => {
        item.addEventListener('click', () => {
          const radio = item.querySelector('input[type="radio"]');
          radio.checked = true;
          selectedManifestId = item.dataset.manifestId;
          
          // Update UI
          appsContainer.querySelectorAll('.bind-app-item').forEach(i => i.classList.remove('selected'));
          item.classList.add('selected');
        });
      });
    }
  } catch (error) {
    alert(`Failed to load domain: ${error.message || error}`);
  }
};

async function fetchSelectionLog(limit = 50) {
  if (!telemetry || !telemetry.endpoint) return [];
  
  try {
    const base = telemetry.endpoint.replace(/\/[^\/]*$/, '');
    const logUrl = `${base}/telemetry/selection-log?limit=${limit}`;
    const response = await fetch(logUrl, { headers: { Accept: 'application/json' } });
    if (!response.ok) throw new Error(`Selection log fetch failed: ${response.status}`);
    
    const data = await response.json();
    return Array.isArray(data.log) ? data.log : [];
  } catch (error) {
    if (typeof console !== 'undefined') console.warn('[selection-log]', error);
    return [];
  }
}

async function refreshActivityView() {
  const logContainer = document.getElementById('selectionLogContainer');
  if (!logContainer) return;
  
  const log = await fetchSelectionLog(50);
  logContainer.innerHTML = '';
  
  if (log.length === 0) {
    logContainer.innerHTML = '<p style="color:var(--text-muted);text-align:center;">No selection records</p>';
    return;
  }
  
  log.forEach((entry) => {
    const item = document.createElement('div');
    item.className = 'selection-log-item';
    item.innerHTML = `
      <div class="log-time">${entry.timestamp ?? '—'}</div>
      <div class="log-component">${escapeHtml(entry.component ?? '')}</div>
      <div class="log-chosen">Chosen: <strong>${escapeHtml(entry.chosen?.peerId ?? '—')}</strong> (score: ${entry.chosen?.score ?? '—'})</div>
      <div class="log-reason">${escapeHtml(entry.chosen?.reason ?? '')}</div>
    `;
    logContainer.appendChild(item);
  });
}

function exportSelectionLogAsJson() {
  fetchSelectionLog(500).then((log) => {
    const blob = new Blob([JSON.stringify(log, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `selection-log-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  });
}

function exportSelectionLogAsCsv() {
  fetchSelectionLog(500).then((log) => {
    const rows = [['Timestamp', 'Component', 'Chosen Peer', 'Score', 'Reason']];
    log.forEach((entry) => {
      rows.push([
        entry.timestamp ?? '',
        entry.component ?? '',
        entry.chosen?.peerId ?? '',
        String(entry.chosen?.score ?? ''),
        entry.chosen?.reason ?? ''
      ]);
    });
    const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `selection-log-${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  });
}

function activateView(viewId, { persist = true } = {}) {
  const target = document.getElementById(`view-${viewId}`);
  if (!target) return;
  views.forEach((view) => view.classList.toggle('active', view === target));
  navButtons.forEach((button) => button.classList.toggle('active', button.dataset.view === viewId));
  
if (viewId === 'dashboard') {
    refreshDashboardOverview();
    refreshDashboardMetrics();
    updateNetworkHealthStrip();
  } else if (viewId === 'hosting') {
    updateAppsPeerCounts().then(() => renderAppsList());
  } else if (viewId === 'domains') {
    refreshDomainsList();
  } else if (viewId === 'bindings') {
    refreshBindingsView();
  } else if (viewId === 'settings') {
    const settingsOwnerIdEl = document.getElementById('settingsOwnerId');
    if (settingsOwnerIdEl && authState?.ownerId) {
      settingsOwnerIdEl.textContent = authState.ownerId;
    }
  }
  
  if (persist) {
    try {
      window.localStorage.setItem(VIEW_STORAGE_KEY, viewId);
    } catch {
      // ignore
    }
  }
}

navButtons.forEach((button) => {
  button.addEventListener('click', () => {
    activateView(button.dataset.view);
  });
});

selectionExportJson?.addEventListener('click', exportSelectionLogAsJson);
selectionExportCsv?.addEventListener('click', exportSelectionLogAsCsv);

// Quick action buttons on dashboard
document.querySelectorAll('.action-btn[data-goto]').forEach(btn => {
  btn.addEventListener('click', () => {
    const targetView = btn.dataset.goto;
    if (targetView) activateView(targetView);
  });
});

const openResolverDashboard = document.getElementById('openResolverDashboard');
openResolverDashboard?.addEventListener('click', () => {
  const url = chrome.runtime.getURL('resolver/index.html');
  chrome.tabs.create({ url });
});

const storedView = (() => {
  try {
    return window.localStorage.getItem(VIEW_STORAGE_KEY);
  } catch {
    return null;
  }
})();

if (storedView && document.getElementById(`view-${storedView}`)) {
  activateView(storedView, { persist: false });
} else {
  activateView('dashboard', { persist: false });
}

if (chrome?.storage?.local) {
  chrome.storage.local.get(STATUS_STORAGE_KEY, (result) => {
    if (chrome.runtime.lastError) return;
    if (result && result[STATUS_STORAGE_KEY]) {
      setSidebarStatus(result[STATUS_STORAGE_KEY], { persist: false });
    }
  });
} else {
  setSidebarStatus('unknown', { persist: false });
}

function loadBooleanSetting(key, fallback) {
  try {
    const raw = window.localStorage.getItem(key);
    if (raw === null) return fallback;
    return raw === 'true';
  } catch {
    return fallback;
  }
}

function saveBooleanSetting(key, value) {
  try {
    window.localStorage.setItem(key, value ? 'true' : 'false');
  } catch {
    // ignore
  }
}

function initBooleanToggle(element, storageKey, defaultValue, onChange) {
  if (!element) return;
  const stored = loadBooleanSetting(storageKey, defaultValue);
  element.checked = stored;
  if (typeof onChange === 'function') {
    onChange(stored);
  }
  element.addEventListener('change', () => {
    const value = element.checked;
    saveBooleanSetting(storageKey, value);
    if (typeof onChange === 'function') {
      onChange(value);
    }
  });
}

function notifyToggle(flag, value) {
  try {
    chrome.runtime.sendMessage({ type: 'panel-toggle', flag, value });
  } catch {
    // ignore
  }
}

initBooleanToggle(togglePeerFirst, PEER_FIRST_TOGGLE_STORAGE_KEY, true, (value) =>
  notifyToggle('peer-first', value)
);
initBooleanToggle(toggleHealthScoring, HEALTH_SCORING_TOGGLE_STORAGE_KEY, true, (value) =>
  notifyToggle('health-scoring', value)
);
initBooleanToggle(toggleE2EAuto, E2E_AUTORUN_TOGGLE_STORAGE_KEY, true, (value) =>
  notifyToggle('e2e-auto', value)
);
initBooleanToggle(toggleRegistryFallback, REGISTRY_FALLBACK_TOGGLE_STORAGE_KEY, false, (value) =>
  notifyToggle('registry-fallback', value)
);

const oldPublishFileInput = document.getElementById('publishFileInput');
const publishFileHint = document.getElementById('publishFileHint');
const createManifestBtn = document.getElementById('createManifestBtn');
const startReplicationBtn = document.getElementById('startReplicationBtn');
const replicationProgress = document.getElementById('replicationProgress');
const replicationProgressPill = document.getElementById('replicationProgressPill');

let currentManifest = null;
let replicationState = { acks: 0, target: 3, peers: [] };

oldPublishFileInput?.addEventListener('change', () => {
  const files = oldPublishFileInput.files;
  if (!files || files.length === 0) {
    publishFileHint.textContent = 'No file selected';
    createManifestBtn.disabled = true;
    return;
  }
  
  const totalSize = Array.from(files).reduce((sum, f) => sum + f.size, 0);
  publishFileHint.textContent = `${files.length} file(s), ${formatBytes(totalSize)}`;
  createManifestBtn.disabled = false;
  replicationProgressPill.textContent = 'Ready to create manifest';
});

createManifestBtn?.addEventListener('click', async () => {
  const files = oldPublishFileInput.files;
  if (!files || files.length === 0) return;
  
  createManifestBtn.disabled = true;
  replicationProgressPill.textContent = 'Creating manifest...';
  
  try {
    const file = files[0];
    const { manifest, transfer } = await chunkManager.prepareTransfer(file);
    currentManifest = { ...manifest, transfer, fileName: file.name };
    
    replicationProgress.innerHTML = `
      <p><strong>Manifest ID:</strong> ${escapeHtml(manifest.transferId)}</p>
      <p><strong>Chunks:</strong> ${transfer.totalChunks}</p>
      <p><strong>Size:</strong> ${formatBytes(file.size)}</p>
    `;
    
    startReplicationBtn.disabled = false;
    replicationProgressPill.textContent = 'Manifest ready';
  } catch (error) {
    replicationProgress.innerHTML = `<p style="color:var(--danger);">Error: ${escapeHtml(error.message ?? error)}</p>`;
    replicationProgressPill.textContent = 'Failed';
    createManifestBtn.disabled = false;
  }
});

startReplicationBtn?.addEventListener('click', async () => {
  if (!currentManifest || !connectionManager) {
    appendRegistryLog('❌ Pure P2P mode: You must connect to signaling first');
    replicationProgress.innerHTML = '<p style="color:var(--danger);">Connect to peers before uploading</p>';
    return;
  }
  
  if (!peers || peers.length === 0) {
    appendRegistryLog('❌ Pure P2P mode: No peers available. Content cannot be stored.');
    replicationProgress.innerHTML = '<p style="color:var(--danger);">No peers online. Upload blocked in pure P2P mode.</p>';
    return;
  }
  
  startReplicationBtn.disabled = true;
  replicationProgressPill.textContent = 'Replicating...';
  replicationState = { acks: 0, target: Math.min(peers.length, 3), peers: [] };
  
  try {
    // First register manifest to get manifestId
    await registerManifestWithRegistry(currentManifest);
    appendRegistryLog(`✓ Manifest ${currentManifest.transferId} registered (metadata only)`);
    
    const targetPeers = peers.slice(0, 3);
    replicationProgress.innerHTML = `<p>Sending chunks to ${targetPeers.length} peer(s)...</p>`;
    
    // Send chunks to peers
    for (const peer of targetPeers) {
      const peerId = peer.peerId;
      replicationState.peers.push({ peerId, status: 'pending' });
      
      // Send each chunk
      const transfer = currentManifest.transfer;
      if (transfer) {
        for (let i = 0; i < transfer.totalChunks; i++) {
          connectionManager.sendJson({
            type: 'chunk-upload',
            manifestId: currentManifest.transferId,
            chunkIndex: i,
            data: transfer.getChunkBase64(i),
            hash: transfer.getChunkHash(i)
          });
        }
      }
    }
    
    updateReplicationDisplay();
    appendRegistryLog(`Chunks sent to ${targetPeers.length} peer(s). Awaiting ACKs...`);
    
  } catch (error) {
    replicationProgress.innerHTML += `<p style="color:var(--danger);">Error: ${escapeHtml(error.message ?? error)}</p>`;
    replicationProgressPill.textContent = 'Failed';
    startReplicationBtn.disabled = false;
  }
});

function updateReplicationDisplay() {
  if (!replicationProgress) return;
  
  const ackCount = replicationState.acks;
  const target = replicationState.target;
  // Pure P2P: need at least 1 peer replica
  const minQuorum = 1;
  const quorumMet = ackCount >= minQuorum;
  
  let html = `<p><strong>Peer Replicas:</strong> ${ackCount} / ${target}</p>`;
  html += '<ul class="peer-replica-list">';
  
  replicationState.peers.forEach((p) => {
    const icon = p.status === 'acked' ? '✓' : p.status === 'failed' ? '✗' : '⏳';
    html += `<li>${icon} ${escapeHtml(p.peerId.slice(0, 12))}... (${p.status})</li>`;
  });
  
  html += '</ul>';
  
  if (quorumMet) {
    html += '<p style="color:var(--success);"><strong>✓ Min replica reached!</strong> You can now bind domain.</p>';
    replicationProgressPill.textContent = `${ackCount}/${target} replicas ✓`;
    registerDomainBtn.disabled = false;
    // Record local replication success
    try {
      chrome?.storage?.local?.get('dweb-local-replication', (res) => {
        const list = Array.isArray(res?.['dweb-local-replication']) ? res['dweb-local-replication'] : [];
        list.push({ ts: Date.now(), ok: true });
        chrome.storage.local.set({ 'dweb-local-replication': list.slice(-200) });
      });
    } catch {}
  } else {
    html += `<p class="hint">⏳ Waiting for at least ${minQuorum} peer replica(s)... (Pure P2P mode)</p>`;
    replicationProgressPill.textContent = `${ackCount}/${target} replicas`;
    registerDomainBtn.disabled = true;
  }
  
  replicationProgress.innerHTML = html;
}

function handleReplicationAck(message) {
  if (!currentManifest || message.manifestId !== currentManifest.transferId) return;
  
  const peer = replicationState.peers.find((p) => p.peerId === message.peerId);
  if (peer && peer.status === 'pending') {
    peer.status = 'acked';
    replicationState.acks += 1;
    updateReplicationDisplay();
    
    telemetry.emit('replication.chunk', {
      manifestId: currentManifest.transferId,
      peerId: message.peerId,
      status: 'acked',
      timestamp: new Date().toISOString()
    });
  }
}


const publishNewAppBtn = document.getElementById('publishNewAppBtn');
const publishModal = document.getElementById('publishModal');
const closePublishModal = document.getElementById('closePublishModal');
const publishFolderInput = document.getElementById('publishFolderInput');
const publishFileInput = document.getElementById('publishFileInput');
const selectFolderBtn = document.getElementById('selectFolderBtn');
const selectFileBtn = document.getElementById('selectFileBtn');
const selectedContentName = document.getElementById('selectedContentName');
const startPublishBtn = document.getElementById('startPublishBtn');
const cancelPublishBtn = document.getElementById('cancelPublishBtn');
const modalDomainInput = document.getElementById('modalDomainInput');
const checkDomainBtn = document.getElementById('checkDomainBtn');
const bindDomainBtn = document.getElementById('bindDomainBtn');
const skipDomainBtn = document.getElementById('skipDomainBtn');
const domainAvailability = document.getElementById('domainAvailability');
const appsList = document.getElementById('appsList');

const domainSearchInput = document.getElementById('domainSearchInput');
const registerNewDomainBtn = document.getElementById('registerNewDomainBtn');
const refreshDomainsBtn = document.getElementById('refreshDomainsBtn');

let selectedContent = null; // Can be file or folder
let selectedContentType = null; // 'file' or 'folder'
let currentPublishManifest = null;

function saveAppsToStorage(apps) {
  try {
    const safe = Array.isArray(apps) ? apps : [];
    window.localStorage.setItem(APPS_STORAGE_KEY, JSON.stringify(safe));
    window.localStorage.setItem(
      APPS_BACKUP_STORAGE_KEY,
      JSON.stringify({ apps: safe, savedAt: Date.now() })
    );
  } catch {
    // ignore
  }
}

// Keep publishedApps.domain values in sync with registry domain bindings
function updateLocalBindingsForDomainChange(domainName, newManifestId) {
  try {
    if (!domainName) return false;
    const normalized = String(domainName).toLowerCase();
    let changed = false;

    // 1) Remove this domain from any app that currently claims it
    for (const app of publishedApps) {
      if (typeof app.domain === 'string' && app.domain.toLowerCase() === normalized) {
        delete app.domain;
        changed = true;
      }
    }

    // 2) Optionally assign to a new manifestId
    if (newManifestId && newManifestId !== 'unbound') {
      const target = publishedApps.find(a => a.manifestId === newManifestId);
      if (target && target.domain !== domainName) {
        target.domain = domainName;
        changed = true;
      }
    }

    if (changed) {
      saveAppsToStorage(publishedApps);
      renderAppsList();
    }
    return changed;
  } catch {
    return false;
  }
}

function syncAppDomainsFromList(allDomains) {
  try {
    if (!Array.isArray(allDomains) || !authState?.ownerId) return false;

    // Build map manifestId -> first owned bound domain
    const map = new Map();
    for (const d of allDomains) {
      if (!d) continue;
      const mid = d.manifestId;
      if (!mid || mid === 'unbound') continue;
      if (d.owner !== authState.ownerId) continue;
      if (!map.has(mid)) map.set(mid, d.domain);
    }

    let changed = false;
    for (const app of publishedApps) {
      const desired = map.get(app.manifestId) || null;
      const current = app.domain || null;
      if (current !== desired) {
        if (desired) app.domain = desired; else delete app.domain;
        changed = true;
      }
    }

    if (changed) {
      saveAppsToStorage(publishedApps);
      renderAppsList();
    }
    return changed;
  } catch {
    return false;
  }
}

async function reconcilePublishedAppsWithRegistry() {
  try {
    if (!registryClient || !authState?.ownerId) return false;
    const result = await registryClient.listDomains();
    const allDomains = Array.isArray(result) ? result : (Array.isArray(result?.domains) ? result.domains : []);
    return syncAppDomainsFromList(allDomains);
  } catch {
    return false;
  }
}

async function updateAppsPeerCounts() {
  for (const app of publishedApps) {
    if (!app.manifestId) continue;
    try {
      const manifest = await registryClient.getManifest(app.manifestId);
      if (manifest && Array.isArray(manifest.replicas)) {
        app.peerCount = manifest.replicas.length;
      }
    } catch {
      // Silently ignore errors
    }
  }
  saveAppsToStorage(publishedApps);
}

function renderAppsList() {
  if (!appsList) return;
  
  if (publishedApps.length === 0) {
    appsList.innerHTML = `
      <div class="empty-state">
        <p class="empty-icon">📦</p>
        <p class="empty-text">No apps yet</p>
        <p class="empty-hint">Click "Publish New Application" to get started!</p>
      </div>
    `;
    return;
  }
  
  appsList.innerHTML = '';
  publishedApps.forEach((app) => {
    const item = document.createElement('div');
    item.className = 'app-item';
    
    const domainDisplay = app.domain ? `🌐 ${app.domain}` : '📦 Unnamed App';
    const domainClass = app.domain ? '' : 'no-domain';
    
    const timeSince = Math.floor((Date.now() - app.publishedAt) / 1000 / 60);
    const timeText = timeSince < 60 ? `${timeSince}m ago` : `${Math.floor(timeSince / 60)}h ago`;
    
    const statusBadge = app.domain 
      ? '<span class="status-badge status-bound">Bound</span>' 
      : '<span class="status-badge status-unbound">Unbound</span>';
    
    item.innerHTML = `
      <div class="app-info">
        <div class="app-header">
          <div class="app-name ${domainClass}">${escapeHtml(domainDisplay)}</div>
          ${statusBadge}
        </div>
        <div class="app-meta">
          <span title="Published time">📅 ${timeText}</span>
          <span title="Total chunks">${app.chunks || 0} chunks</span>
          <span title="Connected peers">👥 ${app.peerCount || 0} peers</span>
        </div>
        ${app.manifestId ? `<div class="app-manifest-id" title="Manifest ID">ID: ${escapeHtml(app.manifestId.slice(0, 16))}...</div>` : ''}
      </div>
      <div class="app-actions">
        ${app.domain ? `<button class="secondary small" data-action="open" data-domain="${escapeHtml(app.domain)}">Open</button>` : `<button class="secondary small" data-action="bind" data-manifest="${escapeHtml(app.manifestId)}">Bind Domain</button>`}
        <button class="secondary small" data-action="details" data-manifest="${escapeHtml(app.manifestId)}" title="Details">ⓘ</button>
        <button class="secondary small" data-action="remove" data-manifest="${escapeHtml(app.manifestId)}" title="Remove">🗑</button>
      </div>
    `;
    
    // Attach event listeners to buttons
    const buttons = item.querySelectorAll('button[data-action]');
    buttons.forEach(btn => {
      btn.addEventListener('click', () => {
        const action = btn.dataset.action;
        const domain = btn.dataset.domain;
        const manifestId = btn.dataset.manifest;
        
        if (action === 'open' && domain) {
          window.openAppDomain(domain);
        } else if (action === 'bind' && manifestId) {
          window.bindAppDomain(manifestId);
        } else if (action === 'details' && manifestId) {
          window.showAppDetails(manifestId);
        } else if (action === 'remove' && manifestId) {
          window.removeApp(manifestId);
        }
      });
    });
    
    appsList.appendChild(item);
  });
}

window.openAppDomain = function(domain) {
  const url = chrome.runtime.getURL(`resolver/index.html?view=1&domain=${encodeURIComponent(domain)}`);
  chrome.tabs.create({ url });
};

window.bindAppDomain = function(manifestId) {
  const app = publishedApps.find(a => a.manifestId === manifestId);
  if (app) {
    currentPublishManifest = app;
    showPublishStep(3);
    showPublishModal();
  }
};

window.removeApp = function(manifestId) {
  if (!confirm('Remove this app from the list? This will not delete the manifest from the network.')) return;
  publishedApps = publishedApps.filter(a => a.manifestId !== manifestId);
  saveAppsToStorage(publishedApps);
  renderAppsList();
};

window.showAppDetails = async function(manifestId) {
  const app = publishedApps.find(a => a.manifestId === manifestId);
  if (!app) return;
  
  let details = `Manifest ID: ${app.manifestId}\n`;
  details += `Published: ${new Date(app.publishedAt).toLocaleString()}\n`;
  details += `Chunks: ${app.chunks || 0}\n`;
  details += `Domain: ${app.domain || 'Not bound'}\n`;
  details += `Connected Peers: ${app.peerCount || 0}\n`;
  
  try {
    const manifest = await registryClient.getManifest(manifestId);
    if (manifest) {
      details += `\nFile Name: ${manifest.fileName || 'N/A'}\n`;
      details += `File Size: ${formatBytes(manifest.fileSize || 0)}\n`;
      details += `MIME Type: ${manifest.mimeType || 'N/A'}\n`;
      if (Array.isArray(manifest.replicas)) {
        details += `\nReplica Peers:\n${manifest.replicas.map(p => `  - ${p}`).join('\n')}`;
      }
    }
  } catch (error) {
    details += `\nError fetching details: ${error.message}`;
  }
  
  alert(details);
};

function showPublishModal() {
  publishModal?.classList.remove('hidden');
}

function hidePublishModal() {
  publishModal?.classList.add('hidden');
  resetPublishModal();
}

function resetPublishModal() {
  showPublishStep(1);
  selectedContent = null;
  selectedContentType = null;
  if (selectedContentName) selectedContentName.textContent = 'No content selected';
  if (startPublishBtn) startPublishBtn.disabled = true;
  if (modalDomainInput) modalDomainInput.value = '';
  if (domainAvailability) domainAvailability.textContent = '';
  if (bindDomainBtn) bindDomainBtn.disabled = true;
}

function showPublishStep(step) {
  document.querySelectorAll('.publish-step-view').forEach((el, i) => {
    el.classList.toggle('active', i + 1 === step);
  });
}

renderAppsList();

publishNewAppBtn?.addEventListener('click', () => {
  showPublishModal();
  
  // Check and show connection status
  const connectionBanner = document.getElementById('publishConnectionStatus');
  if (connectionBanner) {
    const hasPeers = connectionManager && peers && peers.length > 0;
    if (!hasPeers) {
      connectionBanner.classList.remove('hidden');
    } else {
      connectionBanner.classList.add('hidden');
    }
  }
});

closePublishModal?.addEventListener('click', hidePublishModal);
cancelPublishBtn?.addEventListener('click', hidePublishModal);

selectFolderBtn?.addEventListener('click', () => {
  publishFolderInput?.click();
});

selectFileBtn?.addEventListener('click', () => {
  publishFileInput?.click();
});

publishFolderInput?.addEventListener('change', () => {
  const files = publishFolderInput.files;
  if (!files || files.length === 0) {
    selectedContent = null;
    selectedContentType = null;
    selectedContentName.textContent = 'No content selected';
    startPublishBtn.disabled = true;
    return;
  }
  
  selectedContent = files;
  selectedContentType = 'folder';
  const folderName = files[0].webkitRelativePath.split('/')[0] || 'Selected folder';
  selectedContentName.textContent = `📁 ${folderName} (${files.length} files)`;
  startPublishBtn.disabled = false;
});

publishFileInput?.addEventListener('change', () => {
  const files = publishFileInput.files;
  if (!files || files.length === 0) {
    selectedContent = null;
    selectedContentType = null;
    selectedContentName.textContent = 'No content selected';
    startPublishBtn.disabled = true;
    return;
  }
  
  selectedContent = files[0]; // Single file
  selectedContentType = 'file';
  const fileName = files[0].name;
  const fileSize = formatBytes(files[0].size);
  selectedContentName.textContent = `📄 ${fileName} (${fileSize})`;
  startPublishBtn.disabled = false;
});

startPublishBtn?.addEventListener('click', async () => {
  if (!selectedContent) return;
  
  showPublishStep(2);
  
  try {
    let fileToPublish;
    
    if (selectedContentType === 'folder') {
      const files = Array.from(selectedContent);
      fileToPublish = files[0];
    } else {
      fileToPublish = selectedContent;
    }
    
    document.getElementById('progressIcon1').textContent = '⏳';
    document.getElementById('progressText1').textContent = 'Preparing manifest...';
    
    const { manifest, transfer } = await chunkManager.prepareTransfer(fileToPublish);
    
    document.getElementById('progressIcon1').textContent = '✓';
    document.getElementById('progressText1').textContent = 'Manifest created';
    
    currentPublishManifest = {
      manifestId: manifest.transferId,
      transferId: manifest.transferId,
      fileName: fileToPublish.name,
      chunks: transfer.totalChunks,
      publishedAt: Date.now(),
      peerCount: 0,
      _transfer: transfer,
      _manifest: manifest
    };
    
    document.getElementById('progressIcon2').textContent = '⏳';
    document.getElementById('progressText2').textContent = 'Replicating to network...';
    
    // Try to replicate to peers if connected
    const hasPeers = connectionManager && peers && peers.length > 0;
    if (hasPeers) {
      const targetPeers = peers.slice(0, 3);
      for (const peer of targetPeers) {
        try {
          connectionManager.sendJson({
            type: 'replication-request',
            manifestId: manifest.transferId,
            manifest,
            timestamp: Date.now()
          }, peer.peerId);
        } catch (err) {
          console.warn(`Failed to send to peer ${peer.peerId}:`, err);
        }
      }
      currentPublishManifest.peerCount = targetPeers.length;
      document.getElementById('progressPeers').textContent = `${targetPeers.length}/3 peers`;
    } else {
      document.getElementById('progressPeers').textContent = '0 peers (no connections)';
    }
    
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    document.getElementById('progressIcon2').textContent = hasPeers ? '✓' : '⚠️';
    document.getElementById('progressText2').textContent = hasPeers ? 'Replicated' : 'No peers connected';
    
    document.getElementById('progressIcon3').textContent = '⏳';
    document.getElementById('progressText3').textContent = 'Registering manifest...';
    
    // Register with registry server (doesn't require peer connections)
    await registerManifestWithRegistry(manifest, transfer);
    
    document.getElementById('progressIcon3').textContent = '✓';
    document.getElementById('progressText3').textContent = 'Registered';
    
    // Show success step
    document.getElementById('publishedManifestId').textContent = manifest.transferId;
    document.getElementById('publishedChunks').textContent = transfer.totalChunks;
    document.getElementById('publishedPeers').textContent = currentPublishManifest.peerCount || 0;
    
    await new Promise(resolve => setTimeout(resolve, 500));
    
    showPublishStep(3);
    
    // Populate quick binding suggestions
    try {
      const result = await registryClient.listDomains();
      const allDomains = Array.isArray(result) ? result : (Array.isArray(result?.domains) ? result.domains : []);
      populateDomainSuggestionLists(allDomains);
    } catch {}
    
  } catch (error) {
    console.error('Publish error:', error);
    
    // Show more helpful error message
    let errorMsg = error.message || String(error);
    if (errorMsg.includes('Data channel is not open')) {
      errorMsg = 'Connection error: Please ensure you\'re connected to the network.\n\nTip: The background peer service should auto-connect. Check Settings > Background Peer Service.';
    }
    
    alert(`Publish failed: ${errorMsg}`);
    hidePublishModal();
  }
});

const closeSuccessBtn = document.getElementById('closeSuccessBtn');
const goToDomainsBtn = document.getElementById('goToDomainsBtn');

closeSuccessBtn?.addEventListener('click', () => {
  if (currentPublishManifest) {
    publishedApps.push(currentPublishManifest);
    saveAppsToStorage(publishedApps);
    renderAppsList();
  }
  hidePublishModal();
});

goToDomainsBtn?.addEventListener('click', () => {
  if (currentPublishManifest) {
    publishedApps.push(currentPublishManifest);
    saveAppsToStorage(publishedApps);
    renderAppsList();
  }
  hidePublishModal();
  activateView('domains');
});

// Quick domain binding from publish success
const quickDomainInput = document.getElementById('quickDomainInput');
const quickBindDomainBtn = document.getElementById('quickBindDomainBtn');

quickBindDomainBtn?.addEventListener('click', async () => {
  if (!currentPublishManifest) return;
  
  let domainName = quickDomainInput?.value.trim();
  if (!domainName) {
    alert('Please enter a domain name');
    return;
  }
  
  // Remove .dweb if user typed it
  domainName = domainName.replace(/\.dweb$/i, '');
  
  // Validate domain name
  if (!/^[a-z0-9][a-z0-9-]*[a-z0-9]$/i.test(domainName) && !/^[a-z0-9]$/i.test(domainName)) {
    alert('Domain name can only contain letters, numbers, and hyphens\n(must start and end with letter or number)');
    return;
  }
  
  domainName = `${domainName}.dweb`;
  
  if (!authState?.ownerId) {
    alert('Please authenticate first (click "Continue as guest" in welcome screen)');
    return;
  }
  
  try {
    quickBindDomainBtn.disabled = true;
    quickBindDomainBtn.textContent = 'Registering...';
    
    // Check if domain exists
    const existing = await registryClient.getDomain(domainName);
    if (existing) {
      if (existing.owner === authState.ownerId) {
        // If it's ours, just update the binding (reserved/unbound → bound)
await registryClient.updateDomainBinding(domainName, { manifestId: currentPublishManifest.manifestId });
        currentPublishManifest.domain = domainName;
        publishedApps.push(currentPublishManifest);
        saveAppsToStorage(publishedApps);
        // Ensure no other app still claims this domain locally
        updateLocalBindingsForDomainChange(domainName, currentPublishManifest.manifestId);
        renderAppsList();
        alert(`✅ Domain ${domainName} bound to your app.`);
        hidePublishModal();
        quickBindDomainBtn.disabled = false;
        quickBindDomainBtn.textContent = 'Register & Bind Domain';
        return;
      }
      alert(`Domain ${domainName} is already registered by another owner`);
      quickBindDomainBtn.disabled = false;
      quickBindDomainBtn.textContent = 'Register & Bind Domain';
      return;
    }
    
    // Register and bind to current manifest
    const payload = {
      domain: domainName,
      owner: authState.ownerId,
      manifestId: currentPublishManifest.manifestId,
      timestamp: Date.now()
    };
    
    let finalPayload = payload;
    try {
      finalPayload = await signDomainOperation(payload);
    } catch (signError) {
      console.warn('[Domain] Crypto signing failed, registering without signature:', signError.message);
    }
    
    await registryClient.registerDomain(finalPayload);
    
// Update the published app with domain
    currentPublishManifest.domain = domainName;
    publishedApps.push(currentPublishManifest);
    saveAppsToStorage(publishedApps);
    // Ensure no other app still claims this domain locally
    updateLocalBindingsForDomainChange(domainName, currentPublishManifest.manifestId);
    renderAppsList();
    
    alert(`✅ Success!\n\nDomain ${domainName} is now bound to your app!\n\nYou can access it by navigating to: ${domainName}`);
    hidePublishModal();
    
  } catch (error) {
    alert(`Failed to register domain: ${error.message || error}`);
    quickBindDomainBtn.disabled = false;
    quickBindDomainBtn.textContent = 'Register & Bind Domain';
  }
});

// Bindings page handlers
const bindingAppSelect = document.getElementById('bindingAppSelect');
const bindingDomainInput = document.getElementById('bindingDomainInput');
const createBindingBtn = document.getElementById('createBindingBtn');
const refreshBindingsBtn = document.getElementById('refreshBindingsBtn');

// Update button state when inputs change
const updateCreateBindingButton = () => {
  if (createBindingBtn) {
    const hasApp = bindingAppSelect?.value;
    const hasDomain = bindingDomainInput?.value?.trim();
    createBindingBtn.disabled = !hasApp || !hasDomain;
  }
};

bindingAppSelect?.addEventListener('change', updateCreateBindingButton);
bindingDomainInput?.addEventListener('input', updateCreateBindingButton);

createBindingBtn?.addEventListener('click', async () => {
  const manifestId = bindingAppSelect?.value;
  let domainName = bindingDomainInput?.value?.trim();
  
  if (!manifestId || !domainName) return;
  
  // Remove .dweb if typed
  domainName = domainName.replace(/\.dweb$/i, '');
  
  // Validate
  if (!/^[a-z0-9][a-z0-9-]*[a-z0-9]$/i.test(domainName) && !/^[a-z0-9]$/i.test(domainName)) {
    alert('Domain name can only contain letters, numbers, and hyphens\n(must start and end with letter or number)');
    return;
  }
  
  domainName = `${domainName}.dweb`;
  
  if (!authState?.ownerId) {
    alert('Please authenticate first');
    return;
  }
  
  try {
    createBindingBtn.disabled = true;
    createBindingBtn.textContent = 'Creating...';
    
    // Check if domain exists
    const existing = await registryClient.getDomain(domainName);
    if (existing) {
      // Domain exists - check if it's ours and update binding
      if (existing.owner === authState.ownerId) {
        await registryClient.updateDomainBinding(domainName, { manifestId });
        alert(`✅ Domain ${domainName} bound to your app!`);
      } else {
        alert(`Domain ${domainName} is owned by someone else`);
        createBindingBtn.disabled = false;
        createBindingBtn.textContent = 'Register Domain & Create Binding';
        return;
      }
    } else {
      // Register new domain
      const payload = {
        domain: domainName,
        owner: authState.ownerId,
        manifestId,
        timestamp: Date.now()
      };
      
      let finalPayload = payload;
      try {
        finalPayload = await signDomainOperation(payload);
      } catch (signError) {
        console.warn('[Domain] Crypto signing failed:', signError.message);
      }
      
      await registryClient.registerDomain(finalPayload);
      alert(`✅ Domain ${domainName} registered and bound!`);
    }
    
    // Update local apps list to reflect the new binding
    updateLocalBindingsForDomainChange(domainName, manifestId);
    
    // Reset form
    bindingAppSelect.value = '';
    bindingDomainInput.value = '';
    createBindingBtn.disabled = true;
    createBindingBtn.textContent = 'Register Domain & Create Binding';
    
    // Refresh bindings list
    await renderBindingsList();
    
  } catch (error) {
    alert(`Failed to create binding: ${error.message || error}`);
    createBindingBtn.disabled = false;
    createBindingBtn.textContent = 'Register Domain & Create Binding';
  }
});

refreshBindingsBtn?.addEventListener('click', renderBindingsList);

// Domain bind modal handlers
const domainBindModal = document.getElementById('domainBindModal');
const closeDomainBindModal = document.getElementById('closeDomainBindModal');
const cancelDomainBindBtn = document.getElementById('cancelDomainBindBtn');
const saveDomainBindBtn = document.getElementById('saveDomainBindBtn');
const unbindDomainModalBtn = document.getElementById('unbindDomainModalBtn');
const transferDomainModalBtn = document.getElementById('transferDomainModalBtn');
const deleteDomainModalBtn = document.getElementById('deleteDomainModalBtn');

function closeDomainBindModalFn() {
  domainBindModal?.classList.add('hidden');
  currentEditingDomain = null;
  selectedManifestId = null;
}

closeDomainBindModal?.addEventListener('click', closeDomainBindModalFn);
cancelDomainBindBtn?.addEventListener('click', closeDomainBindModalFn);

saveDomainBindBtn?.addEventListener('click', async () => {
  if (!currentEditingDomain) return;
  
  const domainName = currentEditingDomain.domain;
  
  try {
    saveDomainBindBtn.disabled = true;
    
    // Update binding if selection changed
    const currentBinding = currentEditingDomain.manifestId && currentEditingDomain.manifestId !== 'unbound' 
      ? currentEditingDomain.manifestId 
      : null;
    
if (selectedManifestId !== currentBinding) {
      const newManifestId = selectedManifestId || 'unbound';
      await registryClient.updateDomainBinding(domainName, { manifestId: newManifestId });
      
      // Sync local apps state with this change
      updateLocalBindingsForDomainChange(domainName, selectedManifestId);
      
      if (selectedManifestId) {
        alert(`✅ Domain ${domainName} bound to:\n${selectedManifestId}`);
      } else {
        alert(`Domain ${domainName} is now unbound`);
      }
    }
    
    closeDomainBindModalFn();
    await refreshDomainsList();
  } catch (error) {
    alert(`Failed to update domain: ${error.message || error}`);
  } finally {
    saveDomainBindBtn.disabled = false;
  }
});

unbindDomainModalBtn?.addEventListener('click', async () => {
  if (!currentEditingDomain) return;
  
  const domainName = currentEditingDomain.domain;
  if (!confirm(`Unbind domain ${domainName}? It will become reserved (unbound).`)) return;
  
try {
    await registryClient.updateDomainBinding(domainName, { manifestId: 'unbound' });
    updateLocalBindingsForDomainChange(domainName, null);
    alert(`Domain ${domainName} is now unbound`);
    closeDomainBindModalFn();
    await refreshDomainsList();
  } catch (error) {
    alert(`Failed to unbind domain: ${error.message || error}`);
  }
});

transferDomainModalBtn?.addEventListener('click', async () => {
  if (!currentEditingDomain) return;
  
  const domainName = currentEditingDomain.domain;
  const newOwner = prompt('Enter new owner ID:', currentEditingDomain.owner || '');
  
  if (!newOwner || !newOwner.trim()) return;
  
try {
    await registryClient.updateDomainBinding(domainName, { owner: newOwner.trim() });
    // Remove from our local mapping since ownership changed
    updateLocalBindingsForDomainChange(domainName, null);
    alert(`Domain ${domainName} transferred to ${newOwner}`);
    closeDomainBindModalFn();
    await refreshDomainsList();
  } catch (error) {
    alert(`Failed to transfer domain: ${error.message || error}`);
  }
});

deleteDomainModalBtn?.addEventListener('click', async () => {
  if (!currentEditingDomain) return;
  
  const domainName = currentEditingDomain.domain;
  if (!confirm(`Permanently delete domain ${domainName}? This cannot be undone.`)) return;
  
try {
    await registryClient.deleteDomain(domainName);
    updateLocalBindingsForDomainChange(domainName, null);
    alert(`Domain ${domainName} deleted`);
    closeDomainBindModalFn();
    await refreshDomainsList();
  } catch (error) {
    alert(`Failed to delete domain: ${error.message || error}`);
  }
});

// Domain binding removed from publish flow - now done via Domains page

registerNewDomainBtn?.addEventListener('click', async () => {
  let domainName = domainSearchInput?.value.trim();
  if (!domainName) {
    alert('Please enter a domain name');
    return;
  }
  
  // Remove .dweb if user typed it (we'll add it)
  domainName = domainName.replace(/\.dweb$/i, '');
  
  // Validate domain name (alphanumeric and hyphens only)
  if (!/^[a-z0-9][a-z0-9-]*[a-z0-9]$/i.test(domainName) && !/^[a-z0-9]$/i.test(domainName)) {
    alert('Domain name can only contain letters, numbers, and hyphens\n(must start and end with letter or number)');
    return;
  }
  
  // Add .dweb extension
  domainName = `${domainName}.dweb`;
  
  if (!authState?.ownerId) {
    alert('Please authenticate first (click "Continue as guest" in welcome screen)');
    return;
  }
  
  try {
    registerNewDomainBtn.disabled = true;
    
    // Check if domain exists
    const existing = await registryClient.getDomain(domainName);
    if (existing) {
      alert(`Domain ${domainName} is already registered`);
      registerNewDomainBtn.disabled = false;
      return;
    }
    
    // Ask user to select a manifest to bind (optional)
    let manifestId = null;
    if (publishedApps.length > 0) {
      const bindNow = confirm(`Domain ${domainName} is available!\n\nBind it to a published app now?\n(You can skip and bind later)`);
      if (bindNow) {
        const appChoices = publishedApps.map((app, idx) => 
          `${idx + 1}. ${app.manifestId.slice(0, 16)}... (${app.fileName || 'Unknown'})`
        ).join('\n');
        const choice = prompt(`Select app (1-${publishedApps.length}):\n\n${appChoices}`, '1');
        const index = parseInt(choice) - 1;
        if (index >= 0 && index < publishedApps.length) {
          manifestId = publishedApps[index].manifestId;
        }
      }
    } else {
      alert(`Domain ${domainName} is available!\n\nRegistering as unbound (no app yet).\nYou can bind an app to it later from the Domains page.`);
    }
    
    // Try to sign domain registration (optional - falls back to unsigned)
    const payload = {
      domain: domainName,
      owner: authState.ownerId,
      manifestId: manifestId || 'unbound',
      timestamp: Date.now()
    };
    
    let finalPayload = payload;
    try {
      finalPayload = await signDomainOperation(payload);
      console.log('[Domain] Using cryptographic signature');
    } catch (signError) {
      console.warn('[Domain] Crypto signing failed, registering without signature:', signError.message);
      // Continue with unsigned payload
    }
    
    await registryClient.registerDomain(finalPayload);
    const status = manifestId ? `✅ Domain registered and bound!\nManifest: ${manifestId}` : `✅ Domain reserved!\n\nYou can bind an app to it from the Edit menu.`;
    alert(status);
    
    await refreshDomainsList();
    domainSearchInput.value = '';
    
  } catch (error) {
    alert(`Failed to register domain: ${error.message ?? error}`);
  } finally {
    registerNewDomainBtn.disabled = false;
  }
});

refreshDomainsBtn?.addEventListener('click', refreshDomainsList);

registerDomainBtn?.addEventListener('click', async () => {
  let domain = domainInput?.value.trim();
  const owner = ownerInput?.value.trim() || authState?.ownerId;
  
  if (!domain || !owner) {
    appendRegistryLog('Domain and Owner are required');
    return;
  }
  
  // Validate .dweb domain
  if (!domain.includes('.')) {
    domain = `${domain}.dweb`;
    domainInput.value = domain;
  } else if (!domain.endsWith('.dweb')) {
    appendRegistryLog('Error: Only .dweb domains are allowed');
    return;
  }
  
  if (!currentManifest) {
    appendRegistryLog('Create and replicate manifest first');
    return;
  }
  
  if (replicationState.acks < 2) {
    appendRegistryLog('Wait for quorum (≥2 ACKs) before binding');
    return;
  }
  
  try {
    registerDomainBtn.disabled = true;
    
    const existing = await registryClient.getDomain(domain);
    if (!existing) {
      const reservePayload = {
        domain,
        ownerPubKey: owner,
        status: 'reserved',
        timestamp: new Date().toISOString()
      };
      await registryClient.registerDomain(reservePayload);
      appendRegistryLog(`Domain ${domain} reserved`);
    }
    
    const bindPayload = {
      manifestId: currentManifest.transferId,
      status: 'bound'
    };
    
    await registryClient.updateDomainBinding(domain, bindPayload);
    appendRegistryLog(`Domain ${domain} bound to ${currentManifest.transferId}`);
    
    domainBindStatus.textContent = `Bound: ${domain}`;
    domainBindStatus.classList.remove('pill');
    domainBindStatus.classList.add('pill', 'pill-success');
    
    telemetry.emit('domain.bound', {
      domain,
      manifestId: currentManifest.transferId,
      owner,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    appendRegistryLog(`Failed to bind domain: ${error.message ?? error}`);
  } finally {
    registerDomainBtn.disabled = false;
  }
});

const DEFAULT_SIGNALING_URL = 'ws://34.107.74.70:8787';
const DEFAULT_SIGNALING_SECRET = 'choose-a-strong-secret';
const DEFAULT_REGISTRY_URL = 'http://34.107.74.70:8788';
const DEFAULT_REGISTRY_API_KEY = 'registry-test-key';
const DEFAULT_STORAGE_SERVICE_URL = 'http://34.107.74.70:8789';
const DEFAULT_STORAGE_API_KEY = 'storage-test-key';

if (signalingInput && !signalingInput.value) {
  signalingInput.value = DEFAULT_SIGNALING_URL;
}
if (registryUrlInput && !registryUrlInput.value) {
  registryUrlInput.value = DEFAULT_REGISTRY_URL;
}

chunkManager = new ChunkManager();
let storedRegistryApiKey = loadRegistryApiKey();
if (!storedRegistryApiKey && DEFAULT_REGISTRY_API_KEY) {
  storedRegistryApiKey = DEFAULT_REGISTRY_API_KEY;
  persistRegistryApiKey(storedRegistryApiKey);
}
let storedSignalingAuthToken = loadSignalingAuthToken();
if (!storedSignalingAuthToken && DEFAULT_SIGNALING_SECRET) {
  storedSignalingAuthToken = DEFAULT_SIGNALING_SECRET;
  persistSignalingAuthToken(storedSignalingAuthToken);
}
let storedStorageApiKey = loadStorageApiKey();
if (!storedStorageApiKey && DEFAULT_STORAGE_API_KEY) {
  storedStorageApiKey = DEFAULT_STORAGE_API_KEY;
  persistStorageApiKey(storedStorageApiKey);
}
registryClient = new RegistryClient(registryUrlInput.value || DEFAULT_REGISTRY_URL, {
  apiKey: storedRegistryApiKey
});
// Reconcile local app domain badges with live registry data on load
reconcilePublishedAppsWithRegistry().catch(() => {});
const chunkCache = new Map();
const manifestReplicationState = new Map();
const rawStorageServiceUrl = loadStorageServiceUrl();
let storageServiceUrl =
  normaliseStorageServiceUrl(rawStorageServiceUrl) || DEFAULT_STORAGE_SERVICE_URL;
if (!rawStorageServiceUrl) {
  persistStorageServiceUrl(storageServiceUrl);
}
let storageServiceOrigin = computeOrigin(storageServiceUrl);
telemetry = new TelemetryClient({ component: 'panel' });
const PERSISTENCE_DEFAULTS = {
  storeChunkData: true,  // Changed to true for reliability
  uploadChunksToStorage: false
};
let persistenceSettings = {
  storeChunkData: PERSISTENCE_DEFAULTS.storeChunkData,
  uploadChunksToStorage: PERSISTENCE_DEFAULTS.uploadChunksToStorage
};
const storedPersistence = loadPersistenceSettings();
if (typeof storedPersistence.storeChunkData === 'boolean') {
  persistenceSettings.storeChunkData = storedPersistence.storeChunkData;
}
if (typeof storedPersistence.uploadChunksToStorage === 'boolean') {
  persistenceSettings.uploadChunksToStorage = storedPersistence.uploadChunksToStorage;
}
applyPersistenceToggleState();
const DEFAULT_MAX_REPLICA_TARGETS = 3;
const MAX_REPLICATION_RETRIES = 3;
const REPLICATION_ACK_TIMEOUT = 8_000;
const REPLICATION_MAX_INFLIGHT = 2;
const MANUAL_REPLICA_LIMIT = 5;
const REPLICATION_ACK_QUORUM = 2;
let replicationUpdateHandler = () => {};
function setReplicationUpdateHandler(handler) {
  replicationUpdateHandler = typeof handler === 'function' ? handler : () => {};
}

function loadReplicationSettings() {
  if (typeof localStorage === 'undefined') return {};
  try {
    const raw = localStorage.getItem(REPLICATION_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return {};
    const settings = {};
    if (typeof parsed.autoSelect === 'boolean') settings.autoSelect = parsed.autoSelect;
    if (Number.isFinite(parsed.limit)) settings.limit = parsed.limit;
    if (Array.isArray(parsed.manualPeers)) {
      settings.manualPeers = parsed.manualPeers
        .filter((entry) => entry && typeof entry.peerId === 'string')
        .map((entry) => ({ peerId: entry.peerId, ts: Number(entry.ts) || Date.now() }));
    }
    return settings;
  } catch {
    return {};
  }
}

function persistReplicationSettings() {
  if (typeof localStorage === 'undefined') return;
  try {
    const manualPeers = getManualReplicaEntries().map(({ peerId, ts }) => ({ peerId, ts }));
    const payload = {
      autoSelect: autoReplicaSelection,
      limit: maxReplicaTargets,
      manualPeers
    };
    localStorage.setItem(REPLICATION_STORAGE_KEY, JSON.stringify(payload));
  } catch {
    // ignore persistence errors
  }
}

function getManualReplicaEntries() {
  return Array.from(manualReplicaPrefs.entries())
    .map(([peerId, ts]) => ({ peerId, ts: Number(ts) || 0 }))
    .sort((a, b) => a.ts - b.ts);
}

function loadRegistryApiKey() {
  if (typeof localStorage === 'undefined') return '';
  try {
    return localStorage.getItem(REGISTRY_API_KEY_STORAGE_KEY) ?? '';
  } catch {
    return '';
  }
}

function persistRegistryApiKey(value) {
  if (typeof localStorage === 'undefined') return;
  try {
    if (value) {
      localStorage.setItem(REGISTRY_API_KEY_STORAGE_KEY, value);
    } else {
      localStorage.removeItem(REGISTRY_API_KEY_STORAGE_KEY);
    }
  } catch {
    // ignore persistence errors
  }
}

function loadSignalingAuthToken() {
  if (typeof localStorage === 'undefined') return '';
  try {
    return localStorage.getItem(SIGNALING_AUTH_STORAGE_KEY) ?? '';
  } catch {
    return '';
  }
}

function persistSignalingAuthToken(value) {
  if (typeof localStorage === 'undefined') return;
  try {
    if (value) {
      localStorage.setItem(SIGNALING_AUTH_STORAGE_KEY, value);
    } else {
      localStorage.removeItem(SIGNALING_AUTH_STORAGE_KEY);
    }
  } catch {
    // ignore storage errors
  }
}

function loadStorageApiKey() {
  if (typeof localStorage === 'undefined') return '';
  try {
    return localStorage.getItem(STORAGE_API_KEY_STORAGE_KEY) ?? '';
  } catch {
    return '';
  }
}

function persistStorageApiKey(value) {
  if (typeof localStorage === 'undefined') return;
  try {
    if (value) {
      localStorage.setItem(STORAGE_API_KEY_STORAGE_KEY, value);
    } else {
      localStorage.removeItem(STORAGE_API_KEY_STORAGE_KEY);
    }
  } catch {
    // ignore storage errors
  }
}

function loadStorageServiceUrl() {
  if (typeof localStorage === 'undefined') return '';
  try {
    return localStorage.getItem(STORAGE_SERVICE_URL_STORAGE_KEY) ?? '';
  } catch {
    return '';
  }
}

function persistStorageServiceUrl(value) {
  if (typeof localStorage === 'undefined') return;
  try {
    if (value) {
      localStorage.setItem(STORAGE_SERVICE_URL_STORAGE_KEY, value);
    } else {
      localStorage.removeItem(STORAGE_SERVICE_URL_STORAGE_KEY);
    }
  } catch {
    // ignore storage errors
  }
}

function loadPersistenceSettings() {
  if (typeof localStorage === 'undefined') return {};
  try {
    const raw = localStorage.getItem(PERSISTENCE_SETTINGS_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function persistPersistenceSettings() {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(
      PERSISTENCE_SETTINGS_STORAGE_KEY,
      JSON.stringify({
        storeChunkData: shouldStoreChunkDataInRegistry(),
        uploadChunksToStorage: shouldUploadChunksToStorage()
      })
    );
  } catch {
    // ignore persistence errors
  }
}

function applyPersistenceToggleState() {
  if (inlineRegistryDataToggle) {
    inlineRegistryDataToggle.checked = shouldStoreChunkDataInRegistry();
  }
  if (storageFallbackToggle) {
    storageFallbackToggle.checked = shouldUploadChunksToStorage();
  }
}

function shouldStoreChunkDataInRegistry() {
  return Boolean(persistenceSettings.storeChunkData);
}

function shouldUploadChunksToStorage() {
  return Boolean(persistenceSettings.uploadChunksToStorage);
}

function getReplicaTargetCapacity() {
  if (autoReplicaSelection) {
    return Math.max(1, maxReplicaTargets);
  }
  const selected = manualReplicaPrefs.size;
  return Math.max(1, selected || 0);
}

function getEffectiveAckQuorum() {
  return Math.max(1, Math.min(REPLICATION_ACK_QUORUM, getReplicaTargetCapacity()));
}

function resolveManifestId(manifest) {
  if (!manifest || typeof manifest !== 'object') return null;
  return manifest.manifestId ?? manifest.transferId ?? null;
}

function resetManifestReplicationState(manifest) {
  const manifestId = resolveManifestId(manifest);
  if (!manifestId) return;
  manifestReplicationState.clear();
  manifestReplicationState.set(manifestId, {
    required: getEffectiveAckQuorum(),
    remoteAcks: new Set(),
    updatedAt: Date.now()
  });
  refreshRegisterButtonState();
  renderReplicationStatus();
}

function clearManifestReplicationState(manifestId) {
  if (!manifestId) return;
  manifestReplicationState.delete(manifestId);
  refreshRegisterButtonState();
  renderReplicationStatus();
}

function markManifestReplica(manifestId, peerId) {
  if (!manifestId || !peerId || peerId === localPeerId) return;
  const state = manifestReplicationState.get(manifestId);
  if (!state) return;
  if (!state.remoteAcks.has(peerId)) {
    state.remoteAcks.add(peerId);
    state.updatedAt = Date.now();
    appendRegistryLog(
      `Replica quorum progress: ${state.remoteAcks.size}/${state.required} remote peers confirmed (${peerId}).`
    );
  }
  const required = getEffectiveAckQuorum();
  if (state.required !== required) {
    state.required = required;
  }
  if (state.remoteAcks.size >= state.required) {
    appendRegistryLog('Replication quorum reached. Domain registration unlocked.');
  }
  refreshRegisterButtonState();
  renderReplicationStatus();
}

function manifestHasReplicationQuorum(manifestId) {
  const state = manifestReplicationState.get(manifestId);
  if (!state) return false;
  return state.remoteAcks.size >= state.required;
}

function getManifestReplicationSummary(manifestId) {
  const state = manifestReplicationState.get(manifestId);
  if (!state) {
    return {
      required: getEffectiveAckQuorum(),
      remoteAckCount: 0,
      peers: [],
      updatedAt: null
    };
  }
  return {
    required: state.required,
    remoteAckCount: state.remoteAcks.size,
    peers: Array.from(state.remoteAcks),
    updatedAt: state.updatedAt ?? null
  };
}

function updateManifestQuorumTargets() {
  const required = getEffectiveAckQuorum();
  manifestReplicationState.forEach((state) => {
    state.required = required;
  });
  refreshRegisterButtonState();
  renderReplicationStatus();
}

function computeOrigin(url) {
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
}

function normaliseStorageServiceUrl(url) {
  if (!url) return '';
  const trimmed = url.trim();
  if (!trimmed) return '';
  return trimmed.replace(/\/+$/, '');
}

function applyStorageServiceUrl(value) {
  const normalised =
    normaliseStorageServiceUrl(value) || DEFAULT_STORAGE_SERVICE_URL;
  storageServiceUrl = normalised;
  storageServiceOrigin = computeOrigin(storageServiceUrl);
  persistStorageServiceUrl(storageServiceUrl);
  if (storageServiceUrlInput && storageServiceUrlInput.value.trim() !== storageServiceUrl) {
    storageServiceUrlInput.value = storageServiceUrl;
  }
  appendChannelLog(`Storage service URL set to ${storageServiceUrl}.`);
}

function buildStorageHeaders(extra = {}) {
  if (!storageApiKey) return { ...extra };
  const trimmed = storageApiKey.trim();
  const headers = {
    ...extra,
    'X-API-Key': trimmed
  };
  if (/^Bearer\s+/i.test(trimmed)) {
    headers.Authorization = trimmed;
  } else {
    headers.Authorization = `Bearer ${trimmed}`;
  }
  return headers;
}

function shouldAttachStorageHeaders(targetUrl) {
  if (!storageApiKey) return false;
  if (!storageServiceOrigin) return false;
  try {
    const origin = new URL(targetUrl).origin;
    return origin === storageServiceOrigin;
  } catch {
    return false;
  }
}

const pendingPeerRequests = new Map();
const replicationManager = createReplicationManager();

function setupReplicationAckListener() {
  if (connectionManager) {
    connectionManager.addEventListener('channel-message', (event) => {
      if (event.detail.kind === 'text') {
        try {
          const msg = JSON.parse(event.detail.data);
          if (msg.type === 'replication-ack') {
            handleReplicationAck(msg);
          }
        } catch {
          // ignore parse errors
        }
      }
    });
  }
}

// Auto-connect on panel load
async function attemptAutoConnect() {
  console.log('[Panel] attemptAutoConnect called');
  if (connectionManager) {
    console.log('[Panel] Already connected, skipping');
    return; // Already connected
  }
  
  const url = signalingInput?.value?.trim() || DEFAULT_SIGNALING_URL;
  console.log('[Panel] Signaling URL:', url);
  if (!url || (!url.startsWith('ws://') && !url.startsWith('wss://'))) {
    console.log('[Panel] Invalid signaling URL, setting status to unknown');
    setSidebarStatus('unknown');
    return;
  }
  
  const authToken = signalingAuthTokenInput?.value?.trim() || storedSignalingAuthToken || '';
  const requestedPeerId = peerIdInput?.value?.trim() || generatePeerId();
  
  console.log('[Panel] Attempting connection with peer ID:', requestedPeerId);
  
  try {
    connectionManager = new WebRTCConnectionManager({
      signalingUrl: url,
      peerId: requestedPeerId,
      authToken: authToken || null
    });
    
    console.log('[Panel] WebRTCConnectionManager created, registering events...');
    registerManagerEvents(connectionManager);
    
    console.log('[Panel] Connecting to signaling server...');
    await connectionManager.connect();
console.log('[Panel] ✅ Connected successfully');
    if (connectionManager.updateRelayMode) {
      await connectionManager.updateRelayMode();
    }
    setSidebarStatus(connectionManager.getRelayMode?.() === 'relay' ? 'relay' : 'peer');
    updateNetworkHealthStrip();
    telemetry.setContext('signalingUrl', url);
    telemetry.emit('connection.attempt', {
      role: 'panel',
      signalingUrl: url,
      iceTransport: connectionManager.getIcePolicy?.() ?? 'all',
      startTime: new Date().toISOString(),
      endTime: new Date().toISOString(),
      result: 'success',
      relay: connectionManager.getRelayMode?.() === 'relay',
      autoConnect: true
    });
    if (connectBtn) connectBtn.disabled = true;
    
    // Refresh dashboard after successful connection
    refreshDashboardOverview().catch(err => console.warn('[Dashboard] Initial refresh failed:', err));
  } catch (error) {
    setSidebarStatus('unknown');
    connectionManager = null;
    telemetry.emit('error.event', {
      component: 'panel',
      context: 'auto-connect',
      message: error?.message ?? String(error)
    });
  }
}

setReplicationUpdateHandler((snapshot) => renderReplicationStatus(snapshot));
let maxReplicaTargets = DEFAULT_MAX_REPLICA_TARGETS;
let autoReplicaSelection = true;
const manualReplicaPrefs = new Map();
let signalingAuthToken = storedSignalingAuthToken;
let storageApiKey = storedStorageApiKey;
initializeReplicationControls();

if (registryApiKeyInput) {
  registryApiKeyInput.value = storedRegistryApiKey;
  if (storedRegistryApiKey) {
    appendRegistryLog('Loaded registry API key from local storage.');
  }
  registryApiKeyInput.addEventListener('change', () => {
    const value = registryApiKeyInput.value.trim();
    registryClient.setApiKey(value);
    persistRegistryApiKey(value);
    appendRegistryLog(value ? 'Registry API key updated.' : 'Registry API key cleared.');
  });
}

if (signalingAuthTokenInput) {
  signalingAuthTokenInput.value = storedSignalingAuthToken;
  signalingAuthTokenInput.addEventListener('change', () => {
    signalingAuthToken = signalingAuthTokenInput.value.trim();
    persistSignalingAuthToken(signalingAuthToken);
    appendLog(
      signalingAuthToken
        ? 'Signaling shared secret stored locally.'
        : 'Signaling shared secret cleared.'
    );
  });
}

const storageApiKeyInput = document.getElementById('storageApiKey');
if (storageApiKeyInput) {
  storageApiKeyInput.value = storedStorageApiKey;
  storageApiKeyInput.addEventListener('change', () => {
    storageApiKey = storageApiKeyInput.value.trim();
    persistStorageApiKey(storageApiKey);
    appendChannelLog(
      storageApiKey ? 'Storage API key applied for uploads.' : 'Storage API key cleared.'
    );
  });
}

if (storageServiceUrlInput) {
  storageServiceUrlInput.value = storageServiceUrl;
  storageServiceUrlInput.addEventListener('change', () => {
    applyStorageServiceUrl(storageServiceUrlInput.value.trim());
  });
}

inlineRegistryDataToggle?.addEventListener('change', handleInlineRegistryToggle);
storageFallbackToggle?.addEventListener('change', handleStorageFallbackToggle);

chrome.runtime.onMessage.addListener((message) => {
  if (!message || typeof message !== 'object') {
    return;
  }
  if (message.type === 'peer-chunk-request-dispatch') {
    handlePeerChunkDispatch(message).catch((error) => {
      chrome.runtime.sendMessage({
        type: 'peer-chunk-response',
        requestId: message.requestId,
        status: 'error',
        reason: error.message
      });
    });
  }
});

// Periodically refresh dashboard metrics and network health
setInterval(() => {
  refreshDashboardMetrics();
  updateNetworkHealthStrip();
}, 30000);

registryUrlInput.addEventListener('change', () => {
  registryClient.setBaseUrl(registryUrlInput.value.trim());
  appendRegistryLog(`Registry URL set to ${registryUrlInput.value.trim()}`);
  refreshRegisterButtonState();
});

domainInput.addEventListener('input', refreshRegisterButtonState);
ownerInput.addEventListener('input', refreshRegisterButtonState);

autoReplicaToggle?.addEventListener('change', handleAutoReplicaToggle);
replicaTargetCountInput?.addEventListener('change', handleReplicaTargetChange);
clearManualReplicasBtn?.addEventListener('click', clearManualReplicaSelections);
resetReplicationSettingsBtn?.addEventListener('click', resetReplicationSettings);

connectBtn.addEventListener('click', async () => {
  if (connectionManager) {
    appendLog('Already connected.');
    return;
  }

  const url = signalingInput.value.trim();
  if (!url.startsWith('ws://') && !url.startsWith('wss://')) {
    appendLog('Please provide a ws:// or wss:// URL.');
    return;
  }

  signalingAuthToken = signalingAuthTokenInput?.value.trim() ?? signalingAuthToken ?? '';
  if (signalingAuthTokenInput) {
    persistSignalingAuthToken(signalingAuthToken);
  }

  const requestedPeerId = peerIdInput.value.trim() || generatePeerId();
  connectionManager = new WebRTCConnectionManager({
    signalingUrl: url,
    peerId: requestedPeerId,
    authToken: signalingAuthToken || null
  });

  registerManagerEvents(connectionManager);

  connectBtn.disabled = true;
  appendLog(`Connecting to ${url} ...`);
  const attemptStartIso = new Date();
  const attemptStartClock =
    typeof performance !== 'undefined' ? performance.now() : Date.now();

  try {
    await connectionManager.connect();
    if (connectionManager.updateRelayMode) {
      await connectionManager.updateRelayMode();
    }
    setSidebarStatus(connectionManager.getRelayMode?.() === 'relay' ? 'relay' : 'peer');
    const durationMs = Math.round(
      (typeof performance !== 'undefined' ? performance.now() : Date.now()) -
        attemptStartClock
    );
    telemetry.setContext('signalingUrl', url);
    telemetry.emit('connection.attempt', {
      role: 'panel',
      signalingUrl: url,
      iceTransport: connectionManager.getIcePolicy?.() ?? 'all',
      startTime: attemptStartIso.toISOString(),
      endTime: new Date().toISOString(),
      durationMs,
      result: 'success',
      relay: connectionManager.getRelayMode?.() === 'relay'
    });
  } catch (error) {
    appendLog(`Failed to connect: ${error.message ?? error}`);
    const durationMs = Math.round(
      (typeof performance !== 'undefined' ? performance.now() : Date.now()) -
        attemptStartClock
    );
    telemetry.emit('connection.attempt', {
      role: 'panel',
      signalingUrl: url,
      iceTransport: connectionManager?.getIcePolicy?.() ?? 'all',
      startTime: attemptStartIso.toISOString(),
      endTime: new Date().toISOString(),
      durationMs,
      result: 'error',
      relay: false,
      errorCode: error?.code ?? error?.message ?? 'connect-error'
    });
    telemetry.emit('error.event', {
      component: 'panel',
      context: 'connect',
      message: error?.message ?? String(error)
    });
    setSidebarStatus('unknown');
    connectBtn.disabled = false;
    connectionManager = null;
  }
});

openChannelBtn?.addEventListener('click', async () => {
  if (!connectionManager) {
    appendLog('Connect to signaling first.');
    return;
  }

  const targetPeerId = peerSelect.value;
  if (!targetPeerId) {
    appendLog('Select a peer to connect.');
    return;
  }

  appendLog(`Opening data channel to ${targetPeerId} ...`);
  try {
    await connectionManager.initiateConnection(targetPeerId);
  } catch (error) {
    appendLog(`Failed to initiate connection: ${error.message ?? error}`);
  }
});

sendMessageBtn?.addEventListener('click', () => {
  if (!connectionManager) return;
  const text = messageInput?.value.trim();
  if (!text) {
    appendLog('Type a message before sending.');
    return;
  }

  try {
    connectionManager.sendJson({
      type: 'chat',
      text,
      timestamp: Date.now(),
      peerId: localPeerId
    });
    appendChannelLog(`You -> ${text}`);
    if (messageInput) messageInput.value = '';
  } catch (error) {
    appendLog(`Failed to send message: ${error.message ?? error}`);
  }
});

sendFileBtn?.addEventListener('click', async () => {
  if (!connectionManager) {
    appendLog('Connect first before sending files.');
    return;
  }
  const file = fileInput.files?.[0];
  if (!file) {
    appendLog('Select a file to send.');
    return;
  }

  appendChannelLog(
    `Preparing transfer: ${file.name} (${formatBytes(file.size)})`
  );

  try {
    const { manifest, transfer } = await chunkManager.prepareTransfer(file);
    outgoingTransfer = { manifest, transfer, sentChunks: 0 };

    connectionManager.sendJson(manifest);
    appendChannelLog(
      `Manifest sent (${transfer.totalChunks} chunks, transferId: ${manifest.transferId})`
    );

    for (let i = 0; i < transfer.totalChunks; i += 1) {
      await waitForBufferDrain();
      const chunk = transfer.getChunk(i);
      const header = {
        type: 'chunk',
        transferId: manifest.transferId,
        chunkIndex: i,
        totalChunks: transfer.totalChunks,
        byteLength: chunk.byteLength
      };
      connectionManager.sendJson(header);
      connectionManager.sendBinary(chunk);
      outgoingTransfer.sentChunks = i + 1;
      appendChannelLog(`Sent chunk ${i + 1}/${transfer.totalChunks}`);
    }

    connectionManager.sendJson({
      type: 'transfer-complete',
      transferId: manifest.transferId,
      fileName: manifest.fileName
    });
    appendChannelLog(`Transfer complete: ${manifest.fileName}`);

    await registerManifestWithRegistry(manifest);
  } catch (error) {
    appendLog(`Failed to send file: ${error.message ?? error}`);
  }
});

registerDomainBtn?.addEventListener('click', async () => {
  if (!lastManifestRecord) {
    appendRegistryLog('No manifest registered yet.');
    return;
  }
  const domain = domainInput.value.trim();
  const owner = ownerInput.value.trim();
  if (!domain) {
    appendRegistryLog('Domain name is required.');
    return;
  }
  if (!owner) {
    appendRegistryLog('Owner ID is required.');
    return;
  }

  if (domainBindStatus) {
    domainBindStatus.textContent = `Binding ${domain}…`;
    domainBindStatus.classList.remove('pill-success', 'pill-error');
  }

  try {
    const payload = {
      domain,
      owner,
      manifestId: lastManifestRecord.manifestId ?? lastManifestRecord.transferId,
      replicas: lastManifestRecord.replicas ?? []
    };
    appendRegistryLog(`Registering domain ${domain} ...`);
    const record = await registryClient.registerDomain(payload);
    appendRegistryLog(`Domain registered: ${record.domain} -> ${record.manifestId}`);
    telemetry.setContext('domain', record.domain);
    if (domainBindStatus) {
      domainBindStatus.textContent = `Bound to ${record.domain}`;
      domainBindStatus.classList.remove('pill-error');
      domainBindStatus.classList.add('pill-success');
    }

    const lookup = await registryClient.getDomain(domain);
    if (lookup) {
      appendRegistryLog(`Domain lookup: ${lookup.domain} maps to manifest ${lookup.manifestId}`);
      if (lookup.replicas?.length) {
        appendRegistryLog(`Replicas: ${lookup.replicas.join(', ')}`);
      }
    }
  } catch (error) {
    appendRegistryLog(`Domain registration failed: ${error.message}`);
    console.error('Registry domain error', error);
    if (domainBindStatus) {
      domainBindStatus.textContent = `Binding failed`;
      domainBindStatus.classList.remove('pill-success');
      domainBindStatus.classList.add('pill-error');
    }
    telemetry.emit('error.event', {
      component: 'panel',
      context: 'registerDomain',
      message: error?.message ?? String(error)
    });
  }
});

function registerManagerEvents(manager) {
  setupReplicationAckListener();
  
  manager.addEventListener('registered', (event) => {
    const payload = event.detail;
    localPeerId = payload.peerId;
    telemetry.setContext('peerId', localPeerId);
    telemetry.emit('peer.heartbeat', {
      peerId: localPeerId,
      lastSeen: new Date().toISOString(),
      capabilities: payload.capabilities ?? [],
      latencyMs: payload.metadata?.latencyMs ?? null,
      successRate: payload.metadata?.successRate ?? null
    });
    appendLog(`Registered as ${payload.peerId}`);
    updatePeerList(payload.peers ?? []);
    manager.requestPeerList();
    // Refresh dashboard when registered (we now have peer list)
    refreshDashboardOverview().catch(err => console.warn('[Dashboard] Refresh on register failed:', err));
  });

  manager.addEventListener('signaling', (event) => {
    const message = event.detail;
    if (message.type === 'peer-list') {
      appendLog(`Discovered ${message.peers.length} peers.`);
      updatePeerList(message.peers);
      // Update dashboard in real-time
      refreshDashboardOverview().catch(err => console.warn('[Dashboard] Refresh failed:', err));
      return;
    }

    if (message.type === 'peer-joined') {
      appendLog(`Peer joined: ${message.peerId}`);
      upsertPeerEntry({
        peerId: message.peerId,
        capabilities: message.capabilities ?? [],
        metadata: message.metadata ?? {},
        lastSeen: message.lastSeen
      });
      telemetry.emit('peer.heartbeat', {
        peerId: message.peerId,
        lastSeen:
          typeof message.lastSeen === 'number'
            ? new Date(message.lastSeen).toISOString()
            : new Date().toISOString(),
        capabilities: message.capabilities ?? [],
        latencyMs: message.metadata?.latencyMs ?? null,
        successRate: message.metadata?.successRate ?? null
      });
      // Update dashboard in real-time
      refreshDashboardOverview().catch(err => console.warn('[Dashboard] Refresh failed:', err));
      return;
    }

    if (message.type === 'peer-left') {
      appendLog(`Peer left: ${message.peerId}`);
      removePeer(message.peerId);
      telemetry.emit('peer.heartbeat', {
        peerId: message.peerId,
        lastSeen: new Date().toISOString(),
        capabilities: [],
        latencyMs: null,
        successRate: 0
      });
      // Update dashboard in real-time
      refreshDashboardOverview().catch(err => console.warn('[Dashboard] Refresh failed:', err));
      return;
    }

    if (message.type === 'peer-metadata') {
      applyPeerMetadataUpdate(
        message.peerId,
        message.metadata ?? {},
        message.lastSeen
      );
      telemetry.emit('peer.heartbeat', {
        peerId: message.peerId,
        lastSeen:
          typeof message.lastSeen === 'number'
            ? new Date(message.lastSeen).toISOString()
            : new Date().toISOString(),
        capabilities: message.capabilities ?? [],
        latencyMs: message.metadata?.latencyMs ?? null,
        successRate: message.metadata?.successRate ?? null
      });
    }
  });

  manager.addEventListener('connectionstatechange', (event) => {
    appendLog(`Connection state: ${event.detail}`);
    channelStatus.textContent = `Connection: ${event.detail}`;
  });

  manager.addEventListener('icegatheringstatechange', (event) => {
    appendLog(`ICE gathering state: ${event.detail}`);
  });

  manager.addEventListener('iceconnectionstatechange', (event) => {
    appendLog(`ICE connection state: ${event.detail}`);
    if (event.detail === 'failed') {
      appendChannelLog('ICE connection reached failed state.');
    }
  });

  manager.addEventListener('icecandidateerror', (event) => {
    appendLog(`ICE candidate error: ${formatIceCandidateError(event.detail)}`);
    appendChannelLog(
      `ICE candidate error encountered: ${formatIceCandidateError(event.detail)}`
    );
  });

  manager.addEventListener('icefailure', () => {
    appendChannelLog('ICE negotiation failed; resetting peer connection.');
    channelStatus.textContent = 'Channel unavailable (ICE failure)';
    replicationManager.handleChannelClosed(connectionManager?.targetPeerId ?? null);
    connectionManager?.resetPeerConnection();
  });

  manager.addEventListener('channel-open', () => {
    channelStatus.textContent = 'Channel open';
    sendMessageBtn.disabled = false;
    messageInput.disabled = false;
    sendFileBtn.disabled = false;
    fileInput.disabled = false;
    messageInput.focus();
    appendChannelLog('Data channel opened.');
    replicationManager.handleChannelOpen();
    // Update dashboard when channel opens
    refreshDashboardOverview().catch(err => console.warn('[Dashboard] Refresh failed:', err));
  });

  manager.addEventListener('channel-close', () => {
    channelStatus.textContent = 'Channel closed';
    sendMessageBtn.disabled = true;
    sendFileBtn.disabled = true;
    fileInput.disabled = true;
    messageInput.disabled = true;
    messageInput.value = '';
    outgoingTransfer = null;
    incomingTransfer = null;
    registerDomainBtn.disabled = true;
    lastManifestRecord = null;
    appendChannelLog('Data channel closed.');
    refreshRegisterButtonState();
    if (connectionManager) {
      replicationManager.handleChannelClosed(connectionManager.targetPeerId ?? null);
    }
    // Update dashboard when channel closes
    refreshDashboardOverview().catch(err => console.warn('[Dashboard] Refresh failed:', err));
  });

  manager.addEventListener('channel-message', (event) => {
    handleChannelMessage(event.detail).catch((error) => {
      appendLog(`Failed to handle message: ${error.message ?? error}`);
    });
  });

  manager.addEventListener('error', (event) => {
    appendLog(`Error: ${event.detail?.message ?? event.detail}`);
  });
}

async function handleChannelMessage(detail) {
  if (detail.kind === 'text') {
    await handleTextMessage(detail.data);
    return;
  }

  if (detail.kind === 'binary') {
    await handleBinaryPayload(detail.data);
    return;
  }

  appendChannelLog('Received unknown data payload.');
}

async function handleTextMessage(raw) {
  let message;
  try {
    message = JSON.parse(raw);
  } catch {
    appendChannelLog(`Peer -> ${raw}`);
    return;
  }

  switch (message.type) {
    case 'chat':
      appendChannelLog(`${message.peerId ?? 'Peer'} -> ${message.text}`);
      break;

    case 'manifest':
      incomingTransfer = {
        manifest: message,
        chunks: new Array(message.chunkCount),
        received: 0,
        pendingChunk: null
      };
      downloadArea.innerHTML = '';
      appendChannelLog(
        `Manifest received: ${message.fileName} (${message.chunkCount} chunks)`
      );
      break;

    case 'chunk':
      if (!incomingTransfer || incomingTransfer.manifest.transferId !== message.transferId) {
        appendChannelLog('Unexpected chunk header received.');
        return;
      }
      incomingTransfer.pendingChunk = message;
      break;

    case 'chunk-response':
      if (message.requestId) {
        chrome.runtime.sendMessage({
          type: 'peer-chunk-response',
          requestId: message.requestId,
          status: 'success',
          data: message.data
        });
        appendChannelLog(`Peer chunk response received for request ${message.requestId}.`);
      }
      break;

    case 'chunk-request':
      respondToChunkRequest(message);
      break;

    case 'chunk-error':
      if (message.requestId) {
        chrome.runtime.sendMessage({
          type: 'peer-chunk-response',
          requestId: message.requestId,
          status: 'error',
          reason: message.reason ?? 'unknown'
        });
        appendChannelLog(`Peer reported error for request ${message.requestId}: ${message.reason ?? 'unknown'}`);
      }
      break;

    case 'chunk-upload-ack': {
      if (typeof message.chunkIndex === 'number') {
        // Handle peer ACK for chunk upload
        const manifestId = message.manifestId ?? message.transferId ?? currentManifest?.transferId;
        if (manifestId && currentManifest && manifestId === currentManifest.transferId) {
          const peer = replicationState.peers.find((p) => p.peerId === message.peerId);
          if (peer && peer.status === 'pending') {
            peer.status = 'acked';
            replicationState.acks += 1;
            appendChannelLog(`✓ Peer ${message.peerId?.slice(0,8)} ACKed chunk ${message.chunkIndex}`);
            updateReplicationDisplay();
            
            // Notify registry
            try {
              registryClient.updateChunkReplica(manifestId, {
                peerId: message.peerId,
                chunkIndexes: [message.chunkIndex]
              }).catch(err => {
                console.warn('[Registry] Replica update failed:', err);
              });
            } catch {}
          }
        }
        
        replicationManager.handleAck({
          manifestId,
          peerId: message.peerId ?? null,
          chunkIndex: message.chunkIndex
        });
      }
      break;
    }

    case 'chunk-upload-nack': {
      if (typeof message.chunkIndex === 'number') {
        replicationManager.handleNack({
          manifestId:
            message.manifestId ?? message.transferId ?? incomingTransfer?.manifest?.transferId ?? null,
          peerId: message.peerId ?? null,
          chunkIndex: message.chunkIndex,
          reason: message.reason ?? null
        });
      }
      break;
    }

    case 'transfer-complete':
      appendChannelLog(`Transfer complete signal for ${message.fileName ?? message.transferId}`);
      if (
        incomingTransfer &&
        incomingTransfer.manifest.transferId === message.transferId &&
        incomingTransfer.received === incomingTransfer.manifest.chunkCount
      ) {
        finalizeIncomingTransfer();
      }
      break;

    case 'chunk-ack':
      appendChannelLog(
        `Peer acknowledged chunk ${message.chunkIndex + 1} of ${message.transferId}`
      );
      break;

    default:
      appendChannelLog(`Peer -> ${raw}`);
  }
}

async function handleBinaryPayload(buffer) {
  if (!incomingTransfer || !incomingTransfer.pendingChunk) {
    appendChannelLog('Received binary data without pending chunk header.');
    return;
  }

  const chunkInfo = incomingTransfer.pendingChunk;
  incomingTransfer.pendingChunk = null;

  const expectedHash =
    incomingTransfer.manifest.chunkHashes[chunkInfo.chunkIndex];
  const actualHash = await chunkManager.computeHash(buffer);

  if (actualHash !== expectedHash) {
    appendChannelLog(
      `Hash mismatch on chunk ${chunkInfo.chunkIndex + 1}. Transfer aborted.`
    );
    incomingTransfer = null;
    return;
  }

  incomingTransfer.chunks[chunkInfo.chunkIndex] = new Uint8Array(buffer);
  incomingTransfer.received += 1;

  appendChannelLog(
    `Received chunk ${chunkInfo.chunkIndex + 1}/${incomingTransfer.manifest.chunkCount}`
  );

  if (
    incomingTransfer.received === incomingTransfer.manifest.chunkCount
  ) {
    finalizeIncomingTransfer();
  }
}

function handlePeerChunkDispatch({ requestId, manifestId, chunkIndex, replicas }) {
  if (!connectionManager || !connectionManager.isChannelReady()) {
    chrome.runtime.sendMessage({
      type: 'peer-chunk-response',
      requestId,
      status: 'unavailable',
      reason: 'data-channel-closed'
    });
    return;
  }

  try {
    pendingPeerRequests.set(requestId, { manifestId, chunkIndex, replicas });
    connectionManager.requestChunk({
      requestId,
      manifestId,
      chunkIndex
    });
    appendChannelLog(`Forwarded chunk request ${chunkIndex} (${requestId}) to peer.`);
  } catch (error) {
    chrome.runtime.sendMessage({
      type: 'peer-chunk-response',
      requestId,
      status: 'error',
      reason: error.message
    });
  }
}

function finalizeIncomingTransfer() {
  if (!incomingTransfer) return;

  const { manifest, chunks } = incomingTransfer;
  const blob = new Blob(chunks, { type: manifest.mimeType });
  const url = URL.createObjectURL(blob);

  downloadArea.innerHTML = '';
  const link = document.createElement('a');
  link.href = url;
  link.download = manifest.fileName || `download-${manifest.transferId}`;
  link.textContent = `Download ${manifest.fileName} (${formatBytes(manifest.fileSize)})`;
  downloadArea.appendChild(link);

  appendChannelLog(`File ready: ${manifest.fileName}`);
  incomingTransfer = null;
}

function updatePeerList(nextPeers) {
  peers = (nextPeers ?? [])
    .filter((peer) => peer && peer.peerId && peer.peerId !== localPeerId)
    .map((peer) => normalizePeer(peer));
  pruneManualReplicaPrefs();
  renderPeerList();
}

function upsertPeerEntry(peer) {
  if (!peer || !peer.peerId || peer.peerId === localPeerId) {
    return;
  }

  const capabilitiesProvided = Array.isArray(peer.capabilities);
  const lastSeenProvided = typeof peer.lastSeen === 'number';

  const updated = normalizePeer(peer);
  const index = peers.findIndex((existing) => existing.peerId === updated.peerId);
  if (index >= 0) {
    const current = peers[index];
    peers[index] = {
      peerId: current.peerId,
      capabilities: capabilitiesProvided ? updated.capabilities : current.capabilities,
      lastSeen: lastSeenProvided ? updated.lastSeen : current.lastSeen,
      metadata: { ...current.metadata, ...updated.metadata }
    };
  } else {
    peers.push(updated);
  }
  renderPeerList();
}

function applyPeerMetadataUpdate(peerId, metadata, lastSeen) {
  const index = peers.findIndex((peer) => peer.peerId === peerId);
  if (index === -1) return;

  const current = peers[index];
  const mergedMetadata =
    metadata && typeof metadata === 'object'
      ? { ...current.metadata, ...metadata }
      : current.metadata;

  peers[index] = {
    ...current,
    metadata: mergedMetadata,
    lastSeen: typeof lastSeen === 'number' ? lastSeen : current.lastSeen
  };
  renderPeerList();
}

function removePeer(peerId) {
  const nextPeers = peers.filter((peer) => peer.peerId !== peerId);
  if (nextPeers.length === peers.length) return;
  peers = nextPeers;
  renderPeerList();
}

function normalizePeer(peer) {
  const metadata =
    peer && typeof peer.metadata === 'object' && peer.metadata !== null
      ? { ...peer.metadata }
      : {};

  return {
    peerId: peer.peerId,
    capabilities: Array.isArray(peer.capabilities) ? [...peer.capabilities] : [],
    lastSeen: typeof peer.lastSeen === 'number' ? peer.lastSeen : Date.now(),
    metadata
  };
}

function renderPeerList() {
  peerList.innerHTML = '';
  peerSelect.innerHTML = '<option value="">-- choose peer --</option>';

  peers.forEach((peer) => {
    const item = document.createElement('li');
    item.textContent = formatPeerListEntry(peer);
    peerList.appendChild(item);

    const option = document.createElement('option');
    option.value = peer.peerId;
    option.textContent = formatPeerSelectEntry(peer);
    peerSelect.appendChild(option);
  });

  openChannelBtn.disabled = peers.length === 0;
  renderManualReplicaList();
}

function formatPeerListEntry(peer) {
  const metadata = peer.metadata ?? {};
  const details = [];

  if (typeof metadata.latencyMs === 'number') {
    details.push(`${metadata.latencyMs}ms`);
  }

  if (metadata.region && metadata.region !== 'unknown') {
    details.push(metadata.region);
  }

  if (typeof metadata.capacity === 'number' && metadata.capacity > 0) {
    details.push(`${metadata.capacity} cores`);
  }

  if (metadata.version) {
    details.push(`v${metadata.version}`);
  }

  if (metadata.platform) {
    details.push(metadata.platform);
  }

  const descriptor = details.length ? ` (${details.join(' | ')})` : '';
  return `${peer.peerId}${descriptor} - last seen ${timeAgo(peer.lastSeen)}`;
}

function formatPeerSelectEntry(peer) {
  const metadata = peer.metadata ?? {};
  if (typeof metadata.latencyMs === 'number') {
    return `${peer.peerId} (${metadata.latencyMs}ms)`;
  }
  return peer.peerId;
}

function createReplicationManager() {
  const jobs = new Map();
  let processing = false;
  const schedule =
    typeof queueMicrotask === 'function'
      ? queueMicrotask
      : (fn) => Promise.resolve().then(fn);

  function getSnapshot() {
    return Array.from(jobs.values()).map((job) => {
      const total = job.chunks.length;
      let acked = 0;
      let failed = 0;
      let inflight = 0;
      let pending = 0;

      for (const chunk of job.chunks) {
        switch (chunk.status) {
          case "acked":
            acked += 1;
            break;
          case "failed":
            failed += 1;
            break;
          case "in-flight":
            inflight += 1;
            break;
          default:
            pending += 1;
        }
      }

      let state = 'active';
      if (acked === total && total > 0) {
        state = "completed";
      } else if (failed === total && total > 0) {
        state = "failed";
      } else if (failed > 0) {
        state = "degraded";
      }

      return {
        jobId: job.id,
        manifestId: job.manifestId,
        peerId: job.targetPeerId,
        total,
        acked,
        failed,
        inflight,
        pending,
        createdAt: job.createdAt,
        state
      };
    });
  }

  function emit() {
    replicationUpdateHandler(getSnapshot());
  }


  function scheduleReplication(manifest, transfer) {
    if (!manifest || !transfer) {
      appendChannelLog('Replication skipped: manifest or transfer missing.');
      return;
    }

    const transferId = manifest.transferId ?? manifest.manifestId;
    if (!transferId) {
      appendChannelLog('Replication skipped: manifest transferId unavailable.');
      return;
    }

    const limit = getReplicaCandidateLimit();
    if (limit <= 0) {
      if (!autoReplicaSelection) {
        appendChannelLog('Replication skipped: select at least one replica peer in manual mode.');
      } else {
        appendChannelLog('Replication skipped: replica target limit is zero.');
      }
      return;
    }

    const candidates = selectReplicaCandidates(limit);
    if (!candidates.length) {
      appendChannelLog('Replication queue idle: no eligible peers discovered.');
      return;
    }

    let added = false;
    for (const target of candidates) {
      const jobId = `${transferId}:${target.peerId}`;
      if (jobs.has(jobId)) continue;

      const totalChunks = Number(transfer.totalChunks ?? manifest.chunkCount ?? 0);
      if (!Number.isFinite(totalChunks) || totalChunks <= 0) {
        appendChannelLog('Replication skipped: transfer has no chunk metadata.');
        break;
      }

    const job = {
      id: jobId,
      transferId,
      manifest,
      manifestId: manifest.manifestId ?? manifest.transferId ?? transferId,
      transfer,
      targetPeerId: target.peerId,
      createdAt: Date.now(),
      startedAt: null,
      replicaTarget: limit,
      connectionRequested: false,
      chunks: Array.from({ length: totalChunks }, () => ({
        status: 'queued',
        attempts: 0,
        timeoutId: null,
          lastError: null,
          sentAt: null
        })),
        stats: {
          completed: 0,
          failed: 0
        }
      };

      jobs.set(jobId, job);
      added = true;
      telemetry.emit('replication.job', {
        manifestId: job.manifestId,
        targetPeerId: job.targetPeerId,
        state: 'scheduled',
        replicaCount: limit,
        totalChunks,
        ackedChunks: 0,
        retryCount: 0,
        quorumReached: manifestHasReplicationQuorum(job.manifestId)
      });
      appendChannelLog(
        `Replication job queued for ${target.peerId} (score ${target.score.toFixed(1)}).`
      );
    }

    if (added) {
      emit();
    }

    if (!added) {
      appendChannelLog('Replication queue unchanged: all candidate peers already pending.');
      return;
    }

    schedule(processQueue);
  }

  async function processQueue() {
    if (processing) return;
    processing = true;
    try {
      const iterator = jobs.values();
      const next = iterator.next();
      if (next.done) return;
      await processJob(next.value);
    } finally {
      processing = false;
    }
  }

  async function processJob(job) {
    if (!connectionManager) return;

    if (!job.startedAt) {
      job.startedAt = Date.now();
      telemetry.emit('replication.job', {
        manifestId: job.manifestId,
        targetPeerId: job.targetPeerId,
        state: 'in_progress',
        replicaCount: job.replicaTarget,
        totalChunks: job.chunks.length,
        ackedChunks: job.stats.completed,
        retryCount: job.stats.failed,
        quorumReached: manifestHasReplicationQuorum(job.manifestId)
      });
    }

    if (connectionManager.targetPeerId !== job.targetPeerId) {
      if (!job.connectionRequested) {
        job.connectionRequested = true;
        try {
          await connectionManager.initiateConnection(job.targetPeerId);
        } catch (error) {
          job.connectionRequested = false;
          appendChannelLog(
            `Failed to initiate replication connection to ${job.targetPeerId}: ${error.message ?? error}`
          );
        }
      }
      return;
    }

    if (!connectionManager.isChannelReady()) {
      return;
    }

    job.connectionRequested = false;

    let inflight = countInFlight(job);
    if (inflight >= REPLICATION_MAX_INFLIGHT) return;

    for (let index = 0; index < job.chunks.length; index += 1) {
      if (inflight >= REPLICATION_MAX_INFLIGHT) break;
      const chunkState = job.chunks[index];
      if (chunkState.status === 'queued' || chunkState.status === 'retry') {
        const dispatched = await sendChunk(job, index, chunkState);
        if (dispatched) {
          inflight += 1;
        }
      }
    }
  }

  async function sendChunk(job, chunkIndex, chunkState) {
    const base64Chunk = safeGetChunkBase64(job.transfer, chunkIndex);
    if (!base64Chunk) {
      chunkState.status = 'failed';
      chunkState.lastError = 'chunk-not-found';
      job.stats.failed += 1;
      appendChannelLog(
        `Replication skipped chunk ${chunkIndex + 1}: chunk data unavailable.`
      );
      maybeFinalize(job);
      return false;
    }

    if (chunkState.attempts >= MAX_REPLICATION_RETRIES) {
      chunkState.status = 'failed';
      chunkState.lastError = 'max-attempts';
      job.stats.failed += 1;
      appendChannelLog(
        `Replication aborted for chunk ${chunkIndex + 1}: retry budget exhausted.`
      );
      maybeFinalize(job);
      return false;
    }

    try {
      await waitForBufferDrain();
      connectionManager.sendJson({
        type: 'chunk-upload',
        manifestId: job.transferId,
        chunkIndex,
        data: base64Chunk,
        hash: job.transfer.getChunkHash(chunkIndex)
      });
      chunkState.status = 'in-flight';
      chunkState.attempts += 1;
      chunkState.sentAt = Date.now();
      if (chunkState.timeoutId) {
        clearTimeout(chunkState.timeoutId);
      }
      chunkState.timeoutId = setTimeout(
        () => handleTimeout(job.id, chunkIndex),
        REPLICATION_ACK_TIMEOUT
      );
      appendChannelLog(
        `Replication sent chunk ${chunkIndex + 1}/${job.chunks.length} to ${job.targetPeerId} (attempt ${chunkState.attempts}).`
      );
      emit();
      return true;
    } catch (error) {
      chunkState.lastError = error?.message ?? String(error);
      telemetry.emit('error.event', {
        component: 'panel',
        context: 'replication-send-chunk',
        message: chunkState.lastError ?? 'chunk-send-error'
      });
      if (chunkState.timeoutId) {
        clearTimeout(chunkState.timeoutId);
        chunkState.timeoutId = null;
      }
      if (chunkState.attempts >= MAX_REPLICATION_RETRIES) {
        chunkState.status = 'failed';
        job.stats.failed += 1;
        appendChannelLog(
          `Replication permanently failed for chunk ${chunkIndex + 1}: ${chunkState.lastError}`
        );
        maybeFinalize(job);
      } else {
        chunkState.status = 'retry';
        appendChannelLog(
          `Replication will retry chunk ${chunkIndex + 1} due to send error: ${chunkState.lastError}`
        );
        schedule(processQueue);
      }
      emit();
      return false;
    }
  }

function handleTimeout(jobId, chunkIndex) {
  const job = jobs.get(jobId);
  if (!job) return;
  const chunkState = job.chunks[chunkIndex];
  if (!chunkState || chunkState.status !== 'in-flight') return;

  chunkState.timeoutId = null;
  chunkState.lastError = 'ack-timeout';

  if (chunkState.attempts >= MAX_REPLICATION_RETRIES) {
    chunkState.status = 'failed';
    job.stats.failed += 1;
    appendChannelLog(
      `Replication timed out on chunk ${chunkIndex + 1}; giving up after ${chunkState.attempts} attempts.`
    );
    maybeFinalize(job);
  } else {
    chunkState.status = 'retry';
    appendChannelLog(
      `Replication timed out on chunk ${chunkIndex + 1}; retry scheduled.`
    );
    schedule(processQueue);
  }
  telemetry.emit('replication.chunk', {
    manifestId: job.manifestId,
    targetPeerId: job.targetPeerId,
    chunkIndex,
    status: 'timeout',
    attempt: chunkState.attempts,
    elapsedMs: chunkState.sentAt ? Date.now() - chunkState.sentAt : null,
    reason: chunkState.lastError
  });
  emit();
}

  function handleAck({ manifestId, peerId, chunkIndex }) {
    const job = findJob(manifestId, peerId);
    if (!job) return;
    const chunkState = job.chunks[chunkIndex];
    if (!chunkState) return;

    if (chunkState.timeoutId) {
      clearTimeout(chunkState.timeoutId);
      chunkState.timeoutId = null;
    }

    chunkState.status = 'acked';
    chunkState.lastError = null;
    if (!job.firstAckAt) {
      job.firstAckAt = Date.now();
      if (job.startedAt) {
        const ttfbMs = job.firstAckAt - job.startedAt;
        telemetry.emit('ttfb.measure', {
          flow: 'publish',
          ttfbMs,
          totalTimeMs: null,
          networkProfile: connectionManager?.getRelayMode?.() === 'relay' ? 'relay' : 'direct'
        });
      }
    }
    job.stats.completed += 1;
    appendChannelLog(
      `Replica ${peerId ?? job.targetPeerId} acknowledged chunk ${chunkIndex + 1}.`
    );
    telemetry.emit('replication.chunk', {
      manifestId: job.manifestId,
      targetPeerId: job.targetPeerId,
      chunkIndex,
      status: 'ack',
      attempt: chunkState.attempts,
      elapsedMs: chunkState.sentAt ? Date.now() - chunkState.sentAt : null
    });
    emit();
    maybeFinalize(job);
    schedule(processQueue);
  }

  function handleNack({ manifestId, peerId, chunkIndex, reason }) {
    const job = findJob(manifestId, peerId);
    if (!job) return;
    const chunkState = job.chunks[chunkIndex];
    if (!chunkState) return;

    if (chunkState.timeoutId) {
      clearTimeout(chunkState.timeoutId);
      chunkState.timeoutId = null;
    }

    chunkState.lastError = reason ?? 'nack';
    if (chunkState.attempts >= MAX_REPLICATION_RETRIES) {
      chunkState.status = 'failed';
      job.stats.failed += 1;
      appendChannelLog(
        `Replica ${peerId ?? job.targetPeerId} rejected chunk ${chunkIndex + 1}; max retries reached.`
      );
      emit();
      maybeFinalize(job);
    } else {
      chunkState.status = 'retry';
      appendChannelLog(
        `Replica ${peerId ?? job.targetPeerId} rejected chunk ${chunkIndex + 1}; retry scheduled.`
      );
      emit();
      schedule(processQueue);
    }
    telemetry.emit('replication.chunk', {
      manifestId: job.manifestId,
      targetPeerId: job.targetPeerId,
      chunkIndex,
      status: 'nack',
      attempt: chunkState.attempts,
      elapsedMs: chunkState.sentAt ? Date.now() - chunkState.sentAt : null,
      reason: chunkState.lastError
    });
  }

  function handleChannelOpen() {
    schedule(processQueue);
  }

  function handleChannelClosed(peerId) {
    for (const job of jobs.values()) {
      if (peerId && job.targetPeerId !== peerId) continue;
      job.connectionRequested = false;
      job.chunks.forEach((chunk) => {
        if (chunk.timeoutId) {
          clearTimeout(chunk.timeoutId);
          chunk.timeoutId = null;
        }
        if (chunk.status === 'in-flight') {
          chunk.status = 'retry';
          chunk.lastError = 'channel-closed';
        }
      });
    }
    emit();
    schedule(processQueue);
  }

  function syncManualTargets() {
    if (autoReplicaSelection) return;
    let removed = false;
    for (const [jobId, job] of Array.from(jobs.entries())) {
      if (!manualReplicaPrefs.has(job.targetPeerId)) {
        job.chunks.forEach((chunk) => {
          if (chunk.timeoutId) {
            clearTimeout(chunk.timeoutId);
            chunk.timeoutId = null;
          }
        });
        jobs.delete(jobId);
        removed = true;
        appendChannelLog(
          `Manual selection updated: cancelled replication job for ${job.targetPeerId}.`
        );
      }
    }
    if (removed) {
      emit();
      schedule(processQueue);
    }
  }

  function maybeFinalize(job) {
    const allAcknowledged = job.chunks.every((chunk) => chunk.status === 'acked');
    if (allAcknowledged) {
      finalizeJob(job, true);
      return true;
    }

    const anyPending = job.chunks.some((chunk) =>
      chunk.status === 'queued' || chunk.status === 'retry' || chunk.status === 'in-flight'
    );
    if (!anyPending) {
      finalizeJob(job, false);
      return true;
    }

    return false;
  }

  function finalizeJob(job, success) {
    jobs.delete(job.id);
    emit();
    const latencyMs =
      job.startedAt !== null ? Date.now() - job.startedAt : Date.now() - job.createdAt;
    telemetry.emit('replication.job', {
      manifestId: job.manifestId,
      targetPeerId: job.targetPeerId,
      state: success ? 'completed' : 'failed',
      replicaCount: job.replicaTarget,
      totalChunks: job.chunks.length,
      ackedChunks: job.stats.completed,
      retryCount: job.stats.failed,
      quorumReached: manifestHasReplicationQuorum(job.manifestId),
      latencyMs,
      failureReason: success
        ? null
        : job.chunks.find((chunk) => chunk.status === 'failed')?.lastError ?? 'partial-failure'
    });

    if (success) {
      appendChannelLog(
        `Replication to ${job.targetPeerId} completed (${job.stats.completed}/${job.chunks.length} chunks).`
      );
      notifyRegistry(job).catch((error) => {
        appendRegistryLog(
          `Registry update failed for replica ${job.targetPeerId}: ${error.message ?? error}`
        );
      });
    } else {
      appendChannelLog(
        `Replication to ${job.targetPeerId} finished with partial success (${job.stats.completed}/${job.chunks.length}).`
      );
      attemptStorageFallback(job).catch((error) => {
        appendRegistryLog(
          `Storage fallback error for manifest ${job.manifestId}: ${error.message ?? error}`
        );
      });
    }

    schedule(processQueue);
  }

  async function notifyRegistry(job) {
    const manifestId = job.manifestId;
    if (!manifestId) return;
    const ackedIndexes = job.chunks
      .map((chunk, index) => (chunk.status === 'acked' ? index : null))
      .filter((index) => index !== null);
    if (!ackedIndexes.length) return;
    await registryClient.updateChunkReplica(manifestId, {
      peerId: job.targetPeerId,
      replicatedAt: Date.now(),
      chunkIndexes: ackedIndexes,
      status: 'available'
    });
    appendRegistryLog(
      `Registry updated: ${job.targetPeerId} now serves manifest ${manifestId}.`
    );
    markManifestReplica(manifestId, job.targetPeerId);
  }

  async function attemptStorageFallback(job) {
    if (!shouldUploadChunksToStorage()) {
      appendChannelLog('Storage fallback disabled; skipping pointer upload.');
      return;
    }

    const manifestId = job.manifestId;
    const transferId = job.transferId ?? manifestId;
    if (!manifestId || !transferId) {
      appendChannelLog('Storage fallback skipped: manifest identifiers unavailable.');
      return;
    }

    const degradedIndexes = job.chunks
      .map((chunk, index) => (chunk.status === 'acked' ? null : index))
      .filter((index) => index !== null);

    if (!degradedIndexes.length) {
      return;
    }

    appendChannelLog(
      `Attempting storage fallback for ${degradedIndexes.length} chunk${degradedIndexes.length === 1 ? '' : 's'} of manifest ${manifestId}.`
    );

    for (const index of degradedIndexes) {
      try {
        const existingPointer = getManifestPointer(manifestId, index);
        if (existingPointer) {
          appendChannelLog(
            `Storage fallback skipped for chunk ${index + 1}: pointer already exists.`
          );
          continue;
        }

        const base64Chunk = await getChunkBase64(transferId, index);
        if (!base64Chunk) {
          appendChannelLog(
            `Storage fallback failed for chunk ${index + 1}: chunk data unavailable.`
          );
          continue;
        }

        await uploadChunkToStorage(transferId, index, base64Chunk);
        const pointer = `${storageServiceUrl}/chunks/${transferId}/${index}`;
        updateManifestPointerCache(manifestId, index, pointer);
        if (manifestId !== transferId) {
          updateManifestPointerCache(transferId, index, pointer);
        }

        await registryClient.updateChunkPointer(manifestId, index, {
          pointer,
          removeData: !shouldStoreChunkDataInRegistry(),
          expiresAt: null
        });
        appendRegistryLog(
          `Storage fallback pointer registered for chunk ${index + 1} (manifest ${manifestId}).`
        );
      } catch (error) {
        appendRegistryLog(
          `Storage fallback failed for chunk ${index + 1} (manifest ${manifestId}): ${error.message ?? error}`
        );
      }
    }
  }

  function countInFlight(job) {
    return job.chunks.reduce(
      (count, chunk) => (chunk.status === 'in-flight' ? count + 1 : count),
      0
    );
  }

  function safeGetChunkBase64(transfer, index) {
    try {
      return transfer.getChunkBase64(index);
    } catch (error) {
      console.warn('Failed to retrieve chunk base64', error);
      return null;
    }
  }

  function findJob(manifestId, peerId) {
    if (!manifestId) return null;
    if (peerId) {
      const job = jobs.get(`${manifestId}:${peerId}`);
      if (job) return job;
    }
    for (const job of jobs.values()) {
      if (job.manifestId === manifestId) {
        return job;
      }
    }
    return null;
  }

  return {
    scheduleReplication,
    handleAck,
    handleNack,
    handleChannelOpen,
    handleChannelClosed,
    getSnapshot,
    syncManualTargets
  };
}

function selectReplicaCandidates(limit) {
  if (!Number.isFinite(limit) || limit <= 0) return [];
  const now = Date.now();

  if (!autoReplicaSelection) {
    pruneManualReplicaPrefs();
    const manualPeers = peers
      .filter((peer) => manualReplicaPrefs.has(peer.peerId))
      .map((peer) => ({
        ...peer,
        score: manualReplicaPrefs.get(peer.peerId) ?? 0
      }))
      .sort((a, b) => (a.score ?? 0) - (b.score ?? 0));

    return manualPeers.slice(0, limit);
  }

  return peers
    .filter((peer) => isPeerEligibleForReplication(peer, now))
    .map((peer) => ({
      ...peer,
      score: scorePeerForReplication(peer, now)
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, Math.max(1, limit));
}

function handleInlineRegistryToggle(event) {
  const enabled = Boolean(event?.target?.checked);
  persistenceSettings.storeChunkData = enabled;
  persistPersistenceSettings();
  appendRegistryLog(
    enabled
      ? 'Registry inline chunk copies enabled for new uploads.'
      : 'Registry inline chunk copies disabled; relying on peer replicas.'
  );
}

function handleStorageFallbackToggle(event) {
  const enabled = Boolean(event?.target?.checked);
  persistenceSettings.uploadChunksToStorage = enabled;
  persistPersistenceSettings();
  appendChannelLog(
    enabled
      ? 'Storage fallback enabled for degraded replicas.'
      : 'Storage fallback disabled; degraded replicas will not upload to storage.'
  );
}

function handleAutoReplicaToggle() {
  autoReplicaSelection = Boolean(autoReplicaToggle?.checked);
  updateManualReplicaUI();
  replicationManager.syncManualTargets();
  persistReplicationSettings();
  updateManifestQuorumTargets();
  appendLog(
    `Replication mode set to ${autoReplicaSelection ? 'auto-select' : 'manual selection'}.`
  );
  if (!autoReplicaSelection && manualReplicaPrefs.size === 0) {
    appendLog('Manual replication enabled. Select peers below to replicate content.');
  }
  queueMicrotask(() => replicationManager.handleChannelOpen());
  renderReplicationStatus();
}

function handleReplicaTargetChange() {
  if (!replicaTargetCountInput) return;
  const clamped = clampReplicaTarget(replicaTargetCountInput.value);
  maxReplicaTargets = clamped;
  replicaTargetCountInput.value = String(clamped);
  appendLog(`Replication target limit set to ${clamped} peer${clamped === 1 ? '' : 's'}.`);
  persistReplicationSettings();
  updateManifestQuorumTargets();
  queueMicrotask(() => replicationManager.handleChannelOpen());
  renderReplicationStatus();
}

function updateManualActionButtons() {
  if (clearManualReplicasBtn) {
    clearManualReplicasBtn.disabled = autoReplicaSelection || manualReplicaPrefs.size === 0;
  }
  if (resetReplicationSettingsBtn) {
    resetReplicationSettingsBtn.disabled = false;
  }
}

function updateManualReplicaUI() {
  if (manualReplicaContainer) {
    manualReplicaContainer.classList.toggle('disabled', autoReplicaSelection);
  }
  updateManualActionButtons();
  renderManualReplicaList();
  renderReplicationStatus();
}

function renderManualReplicaList() {
  if (!manualReplicaList) return;
  manualReplicaList.innerHTML = '';

  const peerMap = new Map(peers.map((peer) => [peer.peerId, peer]));

  if (peers.length === 0 && manualReplicaPrefs.size === 0) {
    const empty = document.createElement('p');
    empty.className = 'hint';
    empty.textContent = 'No peers available.';
    manualReplicaList.appendChild(empty);
    return;
  }

  const sortedPeers = [...peers].sort((a, b) => {
    const aSelected = manualReplicaPrefs.has(a.peerId);
    const bSelected = manualReplicaPrefs.has(b.peerId);
    if (aSelected && bSelected) {
      return (manualReplicaPrefs.get(a.peerId) ?? 0) - (manualReplicaPrefs.get(b.peerId) ?? 0);
    }
    if (aSelected) return -1;
    if (bSelected) return 1;
    return a.peerId.localeCompare(b.peerId);
  });

  sortedPeers.forEach((peer) => {
    const option = document.createElement('label');
    option.className = 'manual-replica-option';

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.value = peer.peerId;
    checkbox.checked = manualReplicaPrefs.has(peer.peerId);
    checkbox.disabled = autoReplicaSelection;
    checkbox.addEventListener('change', (event) => {
      setManualReplicaSelection(peer.peerId, event.target.checked);
    });

    const span = document.createElement('span');
    span.textContent = formatManualPeerDescriptor(peer);

    option.appendChild(checkbox);
    option.appendChild(span);
    manualReplicaList.appendChild(option);
  });

  const offlineSelections = getManualReplicaEntries().filter(({ peerId }) => !peerMap.has(peerId));
  offlineSelections.forEach(({ peerId }) => {
    const option = document.createElement('label');
    option.className = 'manual-replica-option offline';

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.value = peerId;
    checkbox.checked = true;
    checkbox.disabled = autoReplicaSelection;
    checkbox.addEventListener('change', (event) => {
      setManualReplicaSelection(peerId, event.target.checked);
    });

    const span = document.createElement('span');
    span.textContent = `${peerId} (offline)`;

    option.appendChild(checkbox);
    option.appendChild(span);
    manualReplicaList.appendChild(option);
  });

  if (!autoReplicaSelection && manualReplicaPrefs.size === 0) {
    const hint = document.createElement('p');
    hint.className = 'hint';
    hint.textContent = 'Select peers above to enable manual replication.';
    manualReplicaList.appendChild(hint);
  }

  updateManualActionButtons();
}

function setManualReplicaSelection(peerId, selected) {
  if (!peerId) return;
  if (selected) {
    manualReplicaPrefs.set(peerId, Date.now());
  } else {
    manualReplicaPrefs.delete(peerId);
  }

  persistReplicationSettings();
  renderManualReplicaList();
  updateManifestQuorumTargets();

  if (!autoReplicaSelection) {
    if (manualReplicaPrefs.size === 0) {
      appendLog('Manual replication: no peers selected.');
    } else {
      appendLog(
        `Manual replication peers: ${Array.from(manualReplicaPrefs.keys()).join(', ')}.`
      );
    }
  }
  replicationManager.syncManualTargets();
  renderReplicationStatus();
}

function clearManualReplicaSelections() {
  if (manualReplicaPrefs.size === 0) return;
  manualReplicaPrefs.clear();
  persistReplicationSettings();
  updateManualReplicaUI();
  updateManifestQuorumTargets();
  if (!autoReplicaSelection) {
    replicationManager.syncManualTargets();
  }
  queueMicrotask(() => replicationManager.handleChannelOpen());
  appendLog('Manual replica selections cleared.');
}

function resetReplicationSettings() {
  manualReplicaPrefs.clear();
  maxReplicaTargets = DEFAULT_MAX_REPLICA_TARGETS;
  if (replicaTargetCountInput) {
    replicaTargetCountInput.value = String(maxReplicaTargets);
  }
  autoReplicaSelection = true;
  if (autoReplicaToggle) {
    autoReplicaToggle.checked = true;
  }
  persistReplicationSettings();
  updateManualReplicaUI();
  updateManifestQuorumTargets();
  replicationManager.syncManualTargets();
  queueMicrotask(() => replicationManager.handleChannelOpen());
  appendLog('Replication settings reset to defaults.');
}


function pruneManualReplicaPrefs() {
  let changed = false;
  for (const peerId of Array.from(manualReplicaPrefs.keys())) {
    if (!peerId || peerId === localPeerId) {
      manualReplicaPrefs.delete(peerId);
      changed = true;
    }
  }
  if (changed) {
    persistReplicationSettings();
    renderManualReplicaList();
    renderReplicationStatus();
    updateManifestQuorumTargets();
    if (!autoReplicaSelection) {
      replicationManager.syncManualTargets();
    }
  }
  return changed;
}

function getReplicaCandidateLimit() {
  if (autoReplicaSelection) {
    return maxReplicaTargets;
  }
  pruneManualReplicaPrefs();
  if (manualReplicaPrefs.size === 0) {
    return 0;
  }
  return Math.min(maxReplicaTargets, manualReplicaPrefs.size);
}

function clampReplicaTarget(value) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) return DEFAULT_MAX_REPLICA_TARGETS;
  return Math.min(MANUAL_REPLICA_LIMIT, Math.max(1, parsed));
}

function formatManualPeerDescriptor(peer) {
  const details = [];
  const metadata = peer.metadata ?? {};
  if (typeof metadata.latencyMs === 'number') {
    details.push(`${metadata.latencyMs}ms`);
  }
  if (metadata.region && metadata.region !== 'unknown') {
    details.push(metadata.region);
  }
  if (typeof metadata.capacity === 'number' && metadata.capacity > 0) {
    details.push(`${metadata.capacity} cores`);
  }
  return details.length ? `${peer.peerId} (${details.join(' | ')})` : peer.peerId;
}

function renderReplicationStatus(snapshot = (replicationManager?.getSnapshot?.() ?? [])) {
  if (!replicationStatusContainer) return;
  const list = Array.isArray(snapshot) ? [...snapshot] : [];
  replicationStatusContainer.innerHTML = '';

  const manifestId = resolveManifestId(lastManifestRecord);
  if (manifestId) {
    const summary = getManifestReplicationSummary(manifestId);
    const summaryItem = document.createElement('div');
    summaryItem.className = 'status-summary';
    const headline = document.createElement('div');
    headline.className = 'summary-heading';
    headline.textContent = `Remote replicas ${summary.remoteAckCount}/${summary.required}`;
    summaryItem.appendChild(headline);
    if (summary.peers.length) {
      const peerLine = document.createElement('div');
      peerLine.className = 'summary-detail';
      peerLine.textContent = `Peers: ${summary.peers.join(', ')}`;
      summaryItem.appendChild(peerLine);
    } else {
      const pendingLine = document.createElement('div');
      pendingLine.className = 'summary-detail';
      pendingLine.textContent = 'Waiting for remote replicas...';
      summaryItem.appendChild(pendingLine);
    }
    if (summary.updatedAt) {
      const updatedLine = document.createElement('div');
      updatedLine.className = 'summary-detail';
      updatedLine.textContent = `Updated ${timeAgo(summary.updatedAt)}.`;
      summaryItem.appendChild(updatedLine);
    }
    replicationStatusContainer.appendChild(summaryItem);
  }

  if (!list.length) {
    const empty = document.createElement('p');
    empty.className = 'status-empty';
    empty.textContent = 'No replication jobs pending.';
    replicationStatusContainer.appendChild(empty);
    return;
  }

  list
    .sort((a, b) => (a.createdAt ?? 0) - (b.createdAt ?? 0))
    .forEach((job) => {
      const item = document.createElement('div');
      item.className = 'status-item';

      const heading = document.createElement('div');
      heading.className = 'heading';
      const peerSpan = document.createElement('span');
      peerSpan.textContent = job.peerId ?? 'unknown-peer';
      const stateSpan = document.createElement('span');
      stateSpan.textContent = formatReplicationState(job.state);
      heading.append(peerSpan, stateSpan);

      const progress = document.createElement('div');
      progress.className = 'progress';
      progress.textContent = `Chunks ${job.acked}/${job.total} acked | ${job.inflight} in-flight | ${job.pending} pending | ${job.failed} failed`;

      item.append(heading, progress);
      if (job.manifestId) {
        const manifestLine = document.createElement('div');
        manifestLine.className = 'progress';
        manifestLine.textContent = `Manifest ${job.manifestId}`;
        item.appendChild(manifestLine);
      }

      replicationStatusContainer.appendChild(item);
    });
}

function formatReplicationState(state) {
  switch (state) {
    case "completed":
      return 'Completed';
    case "failed":
      return 'Failed';
    case "degraded":
      return 'Degraded';
    case "active":
    default:
      return 'Active';
  }
}

function initializeReplicationControls() {
  const stored = loadReplicationSettings();

  if (replicaTargetCountInput) {
    const limit = stored.limit;
    if (Number.isFinite(limit)) {
      maxReplicaTargets = clampReplicaTarget(limit);
      replicaTargetCountInput.value = String(maxReplicaTargets);
    } else {
      maxReplicaTargets = clampReplicaTarget(replicaTargetCountInput.value);
      replicaTargetCountInput.value = String(maxReplicaTargets);
    }
  } else {
    maxReplicaTargets = clampReplicaTarget(maxReplicaTargets);
  }

  if (autoReplicaToggle) {
    if (typeof stored.autoSelect === 'boolean') {
      autoReplicaToggle.checked = stored.autoSelect;
      autoReplicaSelection = stored.autoSelect;
    } else {
      autoReplicaSelection = Boolean(autoReplicaToggle.checked);
    }
  } else if (typeof stored.autoSelect === 'boolean') {
    autoReplicaSelection = stored.autoSelect;
  }

  manualReplicaPrefs.clear();
  if (Array.isArray(stored.manualPeers)) {
    stored.manualPeers.forEach(({ peerId, ts }, index) => {
      if (typeof peerId === 'string' && peerId) {
        manualReplicaPrefs.set(peerId, Number(ts) || Date.now() + index);
      }
    });
  }

  updateManifestQuorumTargets();
  updateManualReplicaUI();
  renderReplicationStatus();
  queueMicrotask(() => replicationManager.syncManualTargets());
  queueMicrotask(() => replicationManager.handleChannelOpen());
}

function isPeerEligibleForReplication(peer, now = Date.now()) {
  if (!peer || peer.peerId === localPeerId) {
    return false;
  }

  const lastSeen = typeof peer.lastSeen === 'number' ? peer.lastSeen : null;
  if (lastSeen && now - lastSeen > 60_000) {
    return false;
  }

  if (Array.isArray(peer.capabilities) && peer.capabilities.length > 0) {
    return peer.capabilities.includes('store');
  }
  return true;
}

function scorePeerForReplication(peer, now = Date.now()) {
  const metadata = peer.metadata ?? {};
  let score = 0;

  if (Array.isArray(peer.capabilities) && peer.capabilities.includes('store')) {
    score += 40;
  } else {
    score += 10;
  }

  if (typeof metadata.latencyMs === 'number') {
    const latencyScore = Math.max(0, 200 - metadata.latencyMs);
    score += latencyScore / 5;
  }

  if (typeof metadata.capacity === 'number') {
    score += Math.min(metadata.capacity, 16) * 2;
  }

  if (typeof metadata.deviceMemoryGb === 'number') {
    score += Math.min(metadata.deviceMemoryGb, 16);
  }

  if (metadata.region && metadata.region !== 'unknown') {
    score += 5;
  }

  if (typeof metadata.uptimeMs === 'number') {
    score += Math.min(metadata.uptimeMs / 60_000, 10);
  }

  if (typeof peer.lastSeen === 'number') {
    const stalenessMs = now - peer.lastSeen;
    score -= Math.min(stalenessMs / 1_000, 120) / 2;
  }

  return score;
}

function formatIceCandidateError(detail) {
  if (!detail) {
    return 'unknown';
  }
  const parts = [];
  if (detail.errorCode !== null && detail.errorCode !== undefined) {
    parts.push(`code ${detail.errorCode}`);
  }
  if (detail.errorDetail) {
    parts.push(detail.errorDetail);
  } else if (detail.errorText) {
    parts.push(detail.errorText);
  }
  if (detail.url) {
    parts.push(`url=${detail.url}`);
  }
  if (detail.address) {
    parts.push(
      `address=${detail.address}${detail.port ? `:${detail.port}` : ''}`
    );
  } else if (detail.port) {
    parts.push(`port=${detail.port}`);
  }
  if (detail.protocol) {
    parts.push(`protocol=${detail.protocol}`);
  }
  if (detail.relatedAddress) {
    parts.push(
      `related=${detail.relatedAddress}${
        detail.relatedPort ? `:${detail.relatedPort}` : ''
      }`
    );
  }

  return parts.length ? parts.join(' | ') : 'unknown';
}

function appendLog(text) {
  const time = new Date().toLocaleTimeString();
  statusLog.textContent += `[${time}] ${text}\n`;
  statusLog.scrollTop = statusLog.scrollHeight;
}

function appendChannelLog(text) {
  const time = new Date().toLocaleTimeString();
  channelLog.textContent += `[${time}] ${text}\n`;
  channelLog.scrollTop = channelLog.scrollHeight;
}

function appendRegistryLog(text) {
  const time = new Date().toLocaleTimeString();
  registryLog.textContent += `[${time}] ${text}\n`;
  registryLog.scrollTop = registryLog.scrollHeight;
}

async function respondToChunkRequest(message) {
  const { requestId, manifestId, chunkIndex } = message;
  const base64Chunk = await getChunkBase64(manifestId, chunkIndex);

  if (!connectionManager || !connectionManager.isChannelReady()) {
    chrome.runtime.sendMessage({
      type: 'peer-chunk-response',
      requestId,
      status: 'unavailable',
      reason: 'data-channel-closed'
    });
    return;
  }

  if (!base64Chunk) {
    connectionManager.sendJson({
      type: 'chunk-error',
      requestId,
      manifestId,
      chunkIndex,
      reason: 'chunk-not-found'
    });
    appendChannelLog(`Chunk ${chunkIndex} not found for manifest ${manifestId}.`);
    return;
  }

  connectionManager.sendJson({
    type: 'chunk-response',
    requestId,
    manifestId,
    chunkIndex,
    data: base64Chunk
  });
  appendChannelLog(`Served chunk ${chunkIndex} for request ${requestId}.`);
}

async function handleChunkUpload(message) {
  const { manifestId, chunkIndex, data, hash } = message;
  if (typeof manifestId !== 'string' || typeof chunkIndex !== 'number' || !data) {
    throw new Error('invalid chunk-upload payload');
  }

  const chunkBytes = base64ToUint8Array(data);
  if (!chunkBytes) {
    throw new Error('invalid chunk data');
  }

  if (hash) {
    const computed = await chunkManager.computeHash(chunkBytes.buffer);
    if (computed !== hash) {
      connectionManager?.sendJson({
        type: 'chunk-upload-nack',
        manifestId,
        chunkIndex,
        peerId: localPeerId,
        reason: 'hash-mismatch'
      });
      throw new Error('hash mismatch');
    }
  }

  cacheChunk(manifestId, chunkIndex, data);
  appendChannelLog(`Stored replicated chunk ${chunkIndex} for manifest ${manifestId}.`);

  connectionManager?.sendJson({
    type: 'chunk-upload-ack',
    manifestId,
    chunkIndex,
    peerId: localPeerId,
    status: 'ok'
  });
}

function cacheChunk(manifestId, chunkIndex, base64Data) {
  if (!manifestId || !Number.isInteger(chunkIndex) || chunkIndex < 0) {
    return;
  }
  if (!chunkCache.has(manifestId)) {
    chunkCache.set(manifestId, []);
  }
  const arr = chunkCache.get(manifestId);
  arr[chunkIndex] = base64Data;
}

function getCachedChunk(manifestId, chunkIndex) {
  const arr = chunkCache.get(manifestId);
  if (!arr) return null;
  return arr[chunkIndex] ?? null;
}

function recordMatchesManifest(manifestId) {
  if (!lastManifestRecord) return false;
  const ids = [
    lastManifestRecord.manifestId,
    lastManifestRecord.transferId
  ].filter(Boolean);
  return ids.includes(manifestId);
}

function getManifestPointer(manifestId, chunkIndex) {
  if (
    !recordMatchesManifest(manifestId) ||
    !Array.isArray(lastManifestRecord.chunkPointers)
  ) {
    return null;
  }
  return lastManifestRecord.chunkPointers[chunkIndex] ?? null;
}

function updateManifestPointerCache(manifestId, chunkIndex, pointer) {
  if (!recordMatchesManifest(manifestId)) {
    return;
  }
  if (!Array.isArray(lastManifestRecord.chunkPointers)) {
    lastManifestRecord.chunkPointers = [];
  }
  lastManifestRecord.chunkPointers[chunkIndex] = pointer;
  if (Array.isArray(lastManifestRecord.chunkData)) {
    lastManifestRecord.chunkData[chunkIndex] = null;
  }
}

async function getChunkBase64(manifestId, chunkIndex) {
  const cached = getCachedChunk(manifestId, chunkIndex);
  if (cached) {
    return cached;
  }

  const transfer = chunkManager.getTransfer(manifestId);
  if (transfer) {
    if (chunkIndex < 0 || chunkIndex >= transfer.totalChunks) {
      return null;
    }
    const chunk = transfer.getChunkBase64(chunkIndex);
    cacheChunk(manifestId, chunkIndex, chunk);
    return chunk;
  }

  if (lastManifestRecord && lastManifestRecord.manifestId === manifestId) {
    const manifestChunk = lastManifestRecord.chunkData?.[chunkIndex] ?? null;
    if (manifestChunk) {
      cacheChunk(manifestId, chunkIndex, manifestChunk);
      return manifestChunk;
    }

    const pointer = lastManifestRecord.chunkPointers?.[chunkIndex];
    if (pointer) {
      try {
        const headers = shouldAttachStorageHeaders(pointer)
          ? buildStorageHeaders({ Accept: 'application/json' })
          : { Accept: 'application/json' };
        const response = await fetch(pointer, { headers });
        if (response.ok) {
          const payload = await response.json();
          if (payload?.data) {
            cacheChunk(manifestId, chunkIndex, payload.data);
            return payload.data;
          }
        }
      } catch (error) {
        appendChannelLog(`Storage fetch failed for chunk ${chunkIndex}: ${error.message}`);
      }
    }
  }

  return null;
}

async function uploadChunkToStorage(manifestId, chunkIndex, base64Data) {
  const response = await fetch(`${storageServiceUrl}/chunks`, {
    method: 'POST',
    headers: buildStorageHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ manifestId, chunkIndex, data: base64Data })
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body?.error ?? `storage returned ${response.status}`);
  }
}

function base64ToUint8Array(base64) {
  try {
    const binary = atob(base64);
    const length = binary.length;
    const bytes = new Uint8Array(length);
    for (let i = 0; i < length; i += 1) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  } catch {
    return null;
  }
}

function uint8ToBase64(uint8Array) {
  if (!uint8Array) return null;
  let binary = '';
  for (let i = 0; i < uint8Array.byteLength; i += 1) {
    binary += String.fromCharCode(uint8Array[i]);
  }
  return btoa(binary);
}
async function registerManifestWithRegistry(manifest, transferOverride = null) {
  try {
    const transfer = transferOverride || chunkManager.getTransfer(manifest.transferId);
    const chunkData = [];
    const chunkReplicas = [];
    const chunkPointers = [];
    // Pure P2P mode: never store inline data, never upload to storage
    const storeInline = false;
    const uploadToStorage = false;
    if (transfer) {
      for (let i = 0; i < transfer.totalChunks; i += 1) {
        const base64Chunk = transfer.getChunkBase64(i);
        
        // Pure P2P: always null for chunkData (no inline VPS storage)
        chunkData.push(null);
        chunkPointers.push(null);

        // Cache locally in extension for serving to peers
        cacheChunk(manifest.transferId, i, base64Chunk);
        // Initially only local peer has the chunk
        chunkReplicas.push([localPeerId]);
      }
    } else {
      // No transfer available - populate with nulls based on manifest.chunkCount
      const chunkCount = manifest.chunkCount || 0;
      for (let i = 0; i < chunkCount; i += 1) {
        chunkData.push(null);
        chunkReplicas.push([localPeerId]);
        chunkPointers.push(null);
      }
    }

    // Validate chunkData: must be array of (null | string)
    const validatedChunkData = chunkData.map((chunk, idx) => {
      if (chunk === null || chunk === undefined) return null;
      if (typeof chunk === 'string') return chunk;
      console.warn(`[registerManifest] Invalid chunk at index ${idx}:`, typeof chunk, chunk);
      return null; // Fallback to null for invalid types
    });
    
    const payload = {
      ...manifest,
      chunkData,
      chunkReplicas,
      chunkPointers,
      replicas: [localPeerId, ...(incomingTransfer?.manifest?.replicas ?? [])]
    };
    
    console.log('[registerManifest] Pure P2P payload:', {
      transferId: payload.transferId,
      chunkDataLength: payload.chunkData?.length,
      allNull: payload.chunkData?.every(c => c === null),
      chunkReplicasLength: payload.chunkReplicas?.length
    });
    
    const record = await registryClient.registerManifest(payload);
    lastManifestRecord = record;
    telemetry.setContext(
      'manifestId',
      record.manifestId ?? record.transferId ?? manifest.transferId
    );
    resetManifestReplicationState(record);
    const quorum = getEffectiveAckQuorum();
    appendRegistryLog(
      `Pure P2P mode: need at least ${quorum} peer replica${quorum === 1 ? '' : 's'} before binding domain.`
    );
    appendRegistryLog(`Manifest registered: ${record.manifestId ?? record.transferId}`);
    replicationManager.scheduleReplication(record, transfer);
    refreshRegisterButtonState();
  } catch (error) {
    appendRegistryLog(`Manifest registration failed: ${error.message}`);
    console.error('Registry manifest error', error);
    telemetry.emit('error.event', {
      component: 'panel',
      context: 'registerManifestWithRegistry',
      message: error?.message ?? String(error)
    });
    telemetry.setContext('manifestId', null);
    clearManifestReplicationState(resolveManifestId(manifest));
    lastManifestRecord = null;
    refreshRegisterButtonState();
  }
}

async function signDomainOperation(payload) {
  if (!authState?.ownerId) {
    throw new Error('Not authenticated');
  }
  
  // Load keypair
  const keypair = await loadKeypair(authState.ownerId);
  if (!keypair) {
    throw new Error('Keypair not found. Please re-authenticate.');
  }
  
  // Create signed message
  const message = JSON.stringify(payload);
  const signature = await signMessage(keypair.privateKey, message);
  
  return {
    ...payload,
    publicKey: authState.publicKey,
    signature,
    signedMessage: message
  };
}

function generatePeerId() {
  const randomSegment = () => Math.random().toString(36).slice(2, 6);
  return `peer-${randomSegment()}${randomSegment()}`;
}

function timeAgo(timestamp) {
  const delta = Date.now() - Number(timestamp ?? 0);
  if (Number.isNaN(delta) || delta < 0) return 'just now';
  if (delta < 5_000) return 'just now';
  if (delta < 60_000) return `${Math.round(delta / 1_000)}s ago`;
  const minutes = Math.round(delta / 60_000);
  return `${minutes}m ago`;
}

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KiB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MiB`;
}

async function waitForBufferDrain() {
  while (connectionManager && connectionManager.getBufferedAmount() > 512_000) {
    await delay(25);
  }
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function refreshRegisterButtonState() {
  const manifestId = resolveManifestId(lastManifestRecord);
  const hasManifest = Boolean(manifestId);
  const hasDomain = Boolean(domainInput.value.trim());
  const hasOwner = Boolean(ownerInput.value.trim());
  const hasQuorum = manifestId ? manifestHasReplicationQuorum(manifestId) : false;
  const enabled = hasManifest && hasDomain && hasOwner && hasQuorum;
  registerDomainBtn.disabled = !enabled;
  if (!enabled && hasManifest && hasDomain && hasOwner && manifestId) {
    const summary = getManifestReplicationSummary(manifestId);
    const remaining = Math.max(0, summary.required - summary.remoteAckCount);
    registerDomainBtn.title =
      remaining > 0
        ? `Waiting for ${remaining} more remote replica${remaining === 1 ? '' : 's'} before binding domain.`
        : '';
  } else {
    registerDomainBtn.title = '';
  }
}

// Attempt auto-connection (always, not just when authenticated)
setTimeout(() => attemptAutoConnect(), 500);

// Query background peer status instead
function refreshBackgroundPeerStatus() {
  chrome.runtime.sendMessage({ type: 'background-peer-status' }, (response) => {
    if (chrome.runtime.lastError) {
      console.error('[Panel] Background peer status error:', chrome.runtime.lastError);
      if (document.getElementById('bgPeerStatusText')) {
        document.getElementById('bgPeerStatusText').textContent = 'Error';
      }
      return;
    }
    
    if (response?.connected) {
      console.log('[Panel] Background peer is active:', response.peerId);
      setSidebarStatus(response.relayMode ? 'relay' : 'peer');
      
      if (document.getElementById('bgPeerStatusText')) {
        document.getElementById('bgPeerStatusText').textContent = 'Connected';
      }
      if (document.getElementById('bgPeerIdText')) {
        document.getElementById('bgPeerIdText').textContent = response.peerId || '—';
      }
      if (document.getElementById('bgPeerCountText')) {
        document.getElementById('bgPeerCountText').textContent = response.peerCount || '0';
      }
    } else {
      if (document.getElementById('bgPeerStatusText')) {
        document.getElementById('bgPeerStatusText').textContent = 'Disconnected';
      }
    }
  });
}

refreshBackgroundPeerStatus();

// Refresh button
const refreshBgPeerStatus = document.getElementById('refreshBgPeerStatus');
refreshBgPeerStatus?.addEventListener('click', refreshBackgroundPeerStatus);

// Sign out button
const signOutBtn = document.getElementById('signOutBtn');
signOutBtn?.addEventListener('click', async () => {
  const confirmed = confirm(
    'Are you sure you want to sign out?\n\n' +
    'This will:\n' +
    '- Delete your cryptographic identity\n' +
    '- Clear all published apps\n' +
    '- Clear all settings\n\n' +
    'You cannot undo this action!'
  );
  
  if (!confirmed) return;
  
  try {
    // Clear all storage
    window.localStorage.clear();
    window.sessionStorage.clear();
    
    // Clear IndexedDB (keypair)
    if (authState?.ownerId) {
      const dbRequest = indexedDB.deleteDatabase('dweb-identity');
      dbRequest.onsuccess = () => console.log('[Auth] Keypair database deleted');
    }
    
    // Clear chrome storage
    chrome.storage.local.clear(() => {
      console.log('[Auth] Chrome storage cleared');
    });
    
    // Reset state
    authState = null;
    publishedApps = [];
    
    // Show auth overlay
    showAuthOverlay();
    updateOwnerBadge(null);
    
    alert('Signed out successfully. Please reload the extension.');
    
    // Reload extension
    chrome.runtime.reload();
  } catch (error) {
    console.error('[Auth] Sign out error:', error);
    alert(`Sign out failed: ${error.message}`);
  }
});
















