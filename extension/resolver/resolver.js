import { RegistryClient } from "../scripts/api/registryClient.js";
import { settings } from "./settings.js";

const domainInput = document.getElementById("domainInput");
const registryUrlInput = document.getElementById("registryUrl");
const registryApiKeyInput = document.getElementById("registryApiKey");
const storageServiceUrlInput = document.getElementById("storageServiceUrl");
const storageApiKeyInput = document.getElementById("storageApiKey");
const resolveBtn = document.getElementById("resolveBtn");
const logOutput = document.getElementById("logOutput");
const previewFrame = document.getElementById("previewFrame");
const statusModeEl = document.getElementById("statusMode");
const statusLastEl = document.getElementById("statusLast");
const statusTotalsEl = document.getElementById("statusTotals");
const statusFallbackEl = document.getElementById("statusFallback");

const REGISTRY_API_KEY_STORAGE_KEY = "dweb-registry-api-key";
const STORAGE_API_KEY_STORAGE_KEY = "dweb-storage-api-key";
const STORAGE_SERVICE_URL_STORAGE_KEY = "dweb-storage-service-url";
const DEFAULT_STORAGE_SERVICE_URL = "http://localhost:8789";
const SOURCE_LABELS = {
  peer: "Peer",
  pointer: "Storage pointer",
  registry: "Registry",
  cache: "Cache"
};

let currentRegistryApiKey = loadRegistryApiKey();
let storageApiKey = loadStorageApiKey();
let storageServiceUrl =
  normaliseStorageServiceUrl(loadStorageServiceUrl()) || DEFAULT_STORAGE_SERVICE_URL;
let storageServiceOrigin = computeOrigin(storageServiceUrl);
let registryClient = new RegistryClient(registryUrlInput.value, {
  apiKey: currentRegistryApiKey,
});
let currentResolveStats = createResolveStats();

if (registryApiKeyInput) {
  registryApiKeyInput.value = currentRegistryApiKey;
  registryApiKeyInput.addEventListener("change", () => {
    currentRegistryApiKey = registryApiKeyInput.value.trim();
    registryClient.setApiKey(currentRegistryApiKey);
    persistRegistryApiKey(currentRegistryApiKey);
    appendLog(
      currentRegistryApiKey ? "Registry API key applied." : "Registry API key cleared."
    );
  });
}

if (storageServiceUrlInput) {
  storageServiceUrlInput.value = storageServiceUrl;
  storageServiceUrlInput.addEventListener("change", () => {
    applyStorageServiceUrl(storageServiceUrlInput.value.trim());
  });
}

if (storageApiKeyInput) {
  storageApiKeyInput.value = storageApiKey;
  storageApiKeyInput.addEventListener("change", () => {
    storageApiKey = storageApiKeyInput.value.trim();
    persistStorageApiKey(storageApiKey);
    appendLog(
      storageApiKey ? "Storage API key applied." : "Storage API key cleared."
    );
  });
}

if ("serviceWorker" in navigator) {
  navigator.serviceWorker
    .register("./serviceWorker.js")
    .then(() => appendLog("Service worker registered"))
    .catch((error) =>
      appendLog(`Service worker registration failed: ${error.message}`)
    );
}

resetResolveStats();

registryUrlInput.addEventListener("change", () => {
  registryClient = new RegistryClient(registryUrlInput.value.trim(), {
    apiKey: currentRegistryApiKey,
  });
  appendLog(`Registry URL set to ${registryUrlInput.value.trim()}`);
});

resolveBtn.addEventListener("click", async () => {
  const domain = domainInput.value.trim();
  if (!domain) {
    appendLog("Enter a domain to resolve.");
    return;
  }

  resetResolveStats();
  appendLog(`Resolving ${domain} ...`);

  try {
    const record = await registryClient.getDomain(domain);
    if (!record) {
      appendLog(`Domain not found: ${domain}`);
      return;
    }

    appendLog(
      `Manifest ${record.manifestId} with ${record.replicas?.length ?? 0} replicas`
    );

    const manifestId = record.manifestId;
    const manifest = await registryClient.getManifest(manifestId);
    if (!manifest) {
      appendLog(`Manifest not found: ${manifestId}`);
      return;
    }

    appendLog(
      `Manifest fetched: ${manifest.fileName} (${manifest.chunkCount} chunks)`
    );

    const chunks = [];
    for (let i = 0; i < manifest.chunkCount; i += 1) {
      const chunkData = await fetchChunk(manifestId, i, record.replicas ?? []);
      if (!chunkData) {
        appendLog(`Failed to fetch chunk ${i}`);
        return;
      }
      chunks.push(chunkData);
      appendLog(`Chunk ${i + 1}/${manifest.chunkCount} fetched.`);
    }

    const blob = new Blob(chunks, { type: manifest.mimeType });
    const url = URL.createObjectURL(blob);
    previewFrame.src = url;
    previewFrame.onload = () => URL.revokeObjectURL(url);
    appendLog(`Content rendered. (${manifest.fileName})`);
  } catch (error) {
    appendLog(`Resolve error: ${error.message}`);
    console.error(error);
  }
});

function appendLog(text) {
  const time = new Date().toLocaleTimeString();
  logOutput.textContent += `[${time}] ${text}\n`;
  logOutput.scrollTop = logOutput.scrollHeight;
}

function createResolveStats() {
  return {
    total: 0,
    peer: 0,
    pointer: 0,
    registry: 0,
    cache: 0,
    fallback: false,
    fallbackReasons: new Set(),
    last: null
  };
}

function resetResolveStats() {
  currentResolveStats = createResolveStats();
  updateStatusModeBadge();
  updateStatusDisplay();
}

function updateStatusModeBadge() {
  if (!statusModeEl) return;
  const fallbackEnabled = settings.fallbackToRegistry;
  statusModeEl.textContent = fallbackEnabled
    ? "Peer-first (fallback enabled)"
    : "Peer-only";
  statusModeEl.className = `badge ${fallbackEnabled ? "badge-info" : "badge-success"}`;
}

function updateStatusDisplay() {
  if (statusTotalsEl) {
    statusTotalsEl.className = "badge badge-muted";
    statusTotalsEl.textContent = `Peer ${currentResolveStats.peer} · Pointer ${currentResolveStats.pointer} · Registry ${currentResolveStats.registry} · Cache ${currentResolveStats.cache}`;
  }
  if (statusLastEl) {
    const last = currentResolveStats.last;
    let tone = "badge-muted";
    if (last === "peer") tone = "badge-success";
    else if (last === "pointer") tone = "badge-info";
    const label = last ? SOURCE_LABELS[last] ?? last : "Waiting";
    statusLastEl.className = `badge ${tone}`;
    statusLastEl.textContent = label;
  }
  if (statusFallbackEl) {
    if (currentResolveStats.fallback) {
      const reasons = Array.from(currentResolveStats.fallbackReasons);
      const detail = reasons.length ? reasons.join(", ") : "engaged";
      statusFallbackEl.classList.remove("hidden");
      statusFallbackEl.innerHTML = `<strong>Fallback</strong>: ${detail}`;
    } else {
      statusFallbackEl.classList.add("hidden");
      statusFallbackEl.textContent = "";
    }
  }
}

function recordChunkSource(source) {
  if (!currentResolveStats) return;
  if (!["peer", "pointer", "registry", "cache"].includes(source)) return;
  currentResolveStats.total += 1;
  currentResolveStats[source] += 1;
  currentResolveStats.last = source;
  updateStatusDisplay();
}

function recordFallback(reason) {
  if (!currentResolveStats) return;
  currentResolveStats.fallback = true;
  if (reason) {
    currentResolveStats.fallbackReasons.add(reason);
  }
  updateStatusDisplay();
}

async function fetchChunk(manifestId, index, replicas) {
  if (settings.preferCache && navigator.serviceWorker.controller) {
    const cacheResponse = await caches
      .open("dweb-resolver-cache-v1")
      .then((cache) =>
        cache.match(`${registryClient.baseUrl}/manifests/${manifestId}/chunks/${index}`)
      );
    if (cacheResponse) {
      const payload = await cacheResponse.json();
      if (payload?.data) {
        appendLog(`Chunk ${index} served from cache.`);
        recordChunkSource("cache");
        return base64ToUint8Array(payload.data);
      }
    }
  }

  if (replicas && replicas.length) {
    appendLog(`Replica candidates: ${replicas.join(", ")}`);
    try {
      const peerResponse = await chrome.runtime.sendMessage({
        type: "peer-chunk-request",
        manifestId,
        chunkIndex: index,
        replicas,
      });
      if (peerResponse?.status === "success" && peerResponse.data) {
        appendLog(`Chunk ${index} fetched from peer.`);
        recordChunkSource("peer");
        return base64ToUint8Array(peerResponse.data);
      }
      if (peerResponse?.status === "in-progress") {
        appendLog(`Chunk ${index} pending peer response; falling back.`);
      }
      if (peerResponse?.status === "timeout") {
        appendLog(`Chunk ${index} peer request timed out.`);
      }
      if (peerResponse?.status === "unavailable") {
        appendLog(`Chunk ${index} peer unavailable.`);
      }
      if (peerResponse?.status === "error") {
        appendLog(
          `Peer reported error for chunk ${index}: ${peerResponse.reason ?? "unknown"}`
        );
      }
      const status = peerResponse?.status;
      if (status && status !== "success") {
        recordFallback(`peer-${status}`);
      }
    } catch (error) {
      appendLog(`Peer request failed: ${error.message}`);
      recordFallback("peer-exception");
    }
  }

  if (!settings.fallbackToRegistry) {
    appendLog(`Skipping registry fallback for chunk ${index}.`);
    recordFallback("registry-fallback-disabled");
    return null;
  }

  try {
    const chunkRecord = await registryClient.getManifestChunk(manifestId, index);
    if (!chunkRecord) {
      appendLog(`Registry chunk ${index} not found.`);
      return null;
    }

    if (Array.isArray(chunkRecord.replicas) && chunkRecord.replicas.length) {
      appendLog(`Chunk ${index} replicas: ${chunkRecord.replicas.join(", ")}`);
    }

    if (chunkRecord.data) {
      appendLog(`Chunk ${index} served from registry.`);
      recordChunkSource("registry");
      return base64ToUint8Array(chunkRecord.data);
    }

    if (chunkRecord.pointer) {
      appendLog(`Chunk ${index} missing inline data, following pointer.`);
      try {
        const headers = shouldAttachStorageHeaders(chunkRecord.pointer)
          ? buildStorageHeaders({ Accept: "application/json" })
          : { Accept: "application/json" };
        const pointerResponse = await fetch(chunkRecord.pointer, {
          headers,
        });
        if (pointerResponse.ok) {
          const payload = await pointerResponse.json();
          if (payload?.data) {
            appendLog(`Chunk ${index} served via storage pointer.`);
            recordChunkSource("pointer");
            return base64ToUint8Array(payload.data);
          }
        } else {
          appendLog(
            `Pointer request failed for chunk ${index}: ${pointerResponse.status}`
          );
          recordFallback(`pointer-${pointerResponse.status}`);
        }
      } catch (error) {
        appendLog(`Pointer fetch failed for chunk ${index}: ${error.message}`);
        recordFallback("pointer-error");
      }
    } else {
      appendLog(`Chunk ${index} has no data or storage pointer.`);
      recordFallback("chunk-missing");
    }
  } catch (error) {
    appendLog(`Registry chunk fetch failed: ${error.message}`);
    recordFallback("registry-error");
  }

  appendLog(`Chunk ${index} unavailable.`);
  recordFallback("chunk-unavailable");
  return null;
}

function base64ToUint8Array(base64) {
  const binary = atob(base64);
  const length = binary.length;
  const bytes = new Uint8Array(length);
  for (let i = 0; i < length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function loadRegistryApiKey() {
  try {
    return localStorage.getItem(REGISTRY_API_KEY_STORAGE_KEY) ?? "";
  } catch {
    return "";
  }
}

function persistRegistryApiKey(value) {
  try {
    if (value) {
      localStorage.setItem(REGISTRY_API_KEY_STORAGE_KEY, value);
    } else {
      localStorage.removeItem(REGISTRY_API_KEY_STORAGE_KEY);
    }
  } catch {
    // ignore persistence issues
  }
}

function loadStorageServiceUrl() {
  try {
    return localStorage.getItem(STORAGE_SERVICE_URL_STORAGE_KEY) ?? "";
  } catch {
    return "";
  }
}

function persistStorageServiceUrl(value) {
  try {
    if (value) {
      localStorage.setItem(STORAGE_SERVICE_URL_STORAGE_KEY, value);
    } else {
      localStorage.removeItem(STORAGE_SERVICE_URL_STORAGE_KEY);
    }
  } catch {
    // ignore persistence issues
  }
}

function loadStorageApiKey() {
  try {
    return localStorage.getItem(STORAGE_API_KEY_STORAGE_KEY) ?? "";
  } catch {
    return "";
  }
}

function persistStorageApiKey(value) {
  try {
    if (value) {
      localStorage.setItem(STORAGE_API_KEY_STORAGE_KEY, value);
    } else {
      localStorage.removeItem(STORAGE_API_KEY_STORAGE_KEY);
    }
  } catch {
    // ignore persistence issues
  }
}

function buildStorageHeaders(extra = {}) {
  if (!storageApiKey) return { ...extra };
  const trimmed = storageApiKey.trim();
  const headers = {
    ...extra,
    "X-API-Key": trimmed,
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

function normaliseStorageServiceUrl(url) {
  if (!url) return "";
  const trimmed = url.trim();
  if (!trimmed) return "";
  return trimmed.replace(/\/+$/, "");
}

function computeOrigin(url) {
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
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
  appendLog(`Storage service URL set to ${storageServiceUrl}.`);
}
