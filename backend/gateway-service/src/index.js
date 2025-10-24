import Fastify from 'fastify';

const PORT = Number(process.env.GATEWAY_PORT ?? 8790);
const HOST = process.env.GATEWAY_HOST ?? '127.0.0.1';
const REGISTRY_URL = process.env.REGISTRY_URL ?? 'http://34.107.74.70:8788';
const REGISTRY_API_KEY = process.env.REGISTRY_API_KEY ?? 'registry-test-key';
const STORAGE_SERVICE_URL = process.env.STORAGE_SERVICE_URL ?? 'http://34.107.74.70:8789';
const STORAGE_API_KEY = process.env.STORAGE_API_KEY ?? 'storage-test-key';

const app = Fastify({ logger: { level: process.env.LOG_LEVEL ?? 'info' } });

function buildRegistryHeaders(extra = {}) {
  const headers = { ...extra, Accept: 'application/json' };
  if (REGISTRY_API_KEY) {
    headers['X-API-Key'] = REGISTRY_API_KEY;
    headers.Authorization = /^Bearer\s+/i.test(REGISTRY_API_KEY)
      ? REGISTRY_API_KEY
      : `Bearer ${REGISTRY_API_KEY}`;
  }
  return headers;
}

function buildStorageHeaders(extra = {}) {
  if (!STORAGE_API_KEY) return { ...extra };
  const headers = { ...extra, 'X-API-Key': STORAGE_API_KEY };
  headers.Authorization = /^Bearer\s+/i.test(STORAGE_API_KEY)
    ? STORAGE_API_KEY
    : `Bearer ${STORAGE_API_KEY}`;
  return headers;
}

function getRequestedDomain(request) {
  // Prefer explicit query (useful for http://localhost:8790/?domain=example.dweb)
  const q = request.query?.domain;
  if (typeof q === 'string' && q.trim()) return q.trim().toLowerCase();
  const host = String(request.headers.host || '').toLowerCase();
  // Support native host header direct: example.dweb
  if (host.endsWith('.dweb')) {
    return host;
  }
  // Also support pattern <domain>.dweb.localhost
  if (host.endsWith('.localhost')) {
    const domain = host.slice(0, -'.localhost'.length);
    if (domain.endsWith('.dweb')) return domain;
  }
  return null;
}

async function fetchJson(url, options = {}) {
  const res = await fetch(url, options);
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    const err = new Error(`HTTP ${res.status} ${res.statusText} for ${url} :: ${text}`);
    err.statusCode = res.status;
    throw err;
  }
  return res.json();
}

async function getDomainRecord(domain) {
  const url = `${REGISTRY_URL}/domains/${encodeURIComponent(domain)}`;
  return fetchJson(url, { headers: buildRegistryHeaders() });
}

async function getManifest(manifestId) {
  const url = `${REGISTRY_URL}/manifests/${encodeURIComponent(manifestId)}`;
  return fetchJson(url, { headers: buildRegistryHeaders() });
}

async function getChunkRecord(manifestId, index) {
  const url = `${REGISTRY_URL}/manifests/${encodeURIComponent(manifestId)}/chunks/${index}`;
  return fetchJson(url, { headers: buildRegistryHeaders() });
}

async function fetchPointer(pointerUrl) {
  const headers = pointerUrl.startsWith(STORAGE_SERVICE_URL)
    ? buildStorageHeaders({ Accept: 'application/json' })
    : { Accept: 'application/json' };
  return fetchJson(pointerUrl, { headers });
}

function b64ToBuffer(b64) {
  return Buffer.from(b64, 'base64');
}

app.get('/health', async () => ({ status: 'ok', mode: 'gateway', registry: REGISTRY_URL }));

app.get('/*', async (request, reply) => {
  const domain = getRequestedDomain(request);
  if (!domain) {
    reply.code(400).send({ error: 'INVALID_HOST', hint: 'Use http://<name>.dweb.localhost:8790/' });
    return;
  }

  try {
    const record = await getDomainRecord(domain);
    if (!record || !record.manifestId || String(record.manifestId).toLowerCase() === 'unbound') {
      reply.code(404).send({ error: 'DOMAIN_UNBOUND', domain });
      return;
    }

    const manifestId = record.manifestId;
    const manifest = await getManifest(manifestId);

    const mime = manifest?.mimeType || 'application/octet-stream';
    reply.header('Content-Type', mime);
    reply.header('Cache-Control', 'no-store');

    // Stream chunks in order
    const count = Number(manifest?.chunkCount ?? 0);
    if (!Number.isFinite(count) || count <= 0) {
      reply.code(500).send({ error: 'INVALID_MANIFEST', manifestId });
      return;
    }

    // Switch to raw streaming mode
    reply.raw.writeHead(200, { 'Content-Type': mime });

    for (let i = 0; i < count; i += 1) {
      // Pure P2P mode: no inline data, no storage fallback, only peer replicas
      // Query per-chunk record for replica info
      let rec = null;
      try {
        rec = await getChunkRecord(manifestId, i);
      } catch (err) {
        // Not found or error
      }
      
      // Gateway does NOT serve data directly; clients must fetch from peers
      // This endpoint only validates that content is registered
      if (!rec || (!Array.isArray(rec.replicas) || rec.replicas.length === 0)) {
        // No replicas available - pure P2P failure
        reply.raw.end();
        reply.code(502).send({ error: 'NO_PEER_REPLICAS', chunkIndex: i });
        return;
      }
      
      // In pure P2P mode, gateway cannot serve chunks
      // Clients must resolve via extension/peers
      reply.raw.end();
      reply.code(501).send({ 
        error: 'GATEWAY_PEER_ONLY_MODE', 
        message: 'This gateway does not serve content; use P2P resolver with peer connections',
        replicas: rec.replicas 
      });
      return;
    }

    reply.raw.end();
  } catch (error) {
    request.log.error({ err: error }, 'Gateway error');
    reply.code(error.statusCode ?? 500).send({ error: error.message ?? 'GATEWAY_ERROR' });
  }
});

app.listen({ port: PORT, host: HOST })
  .then(() => app.log.info(`DWeb Gateway listening on http://${HOST}:${PORT}`))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
