export function registerRoutes(app, store) {
  app.get('/', async () => ({
    status: 'ok',
    service: 'registry',
    version: '0.1.0'
  }));

  app.get('/health', async () => ({
    status: 'healthy',
    timestamp: Date.now()
  }));

  app.post('/manifests', async (request, reply) => {
    const manifest = request.body;
    validateManifest(manifest);
    const record = store.createManifest(manifest);
    reply.code(201);
    return record;
  });

  app.get('/manifests', async () => store.listManifests());

  app.get('/manifests/:manifestId', async (request, reply) => {
    const record = store.getManifest(request.params.manifestId);
    if (!record) {
      reply.code(404);
      return { error: 'MANIFEST_NOT_FOUND' };
    }
    return record;
  });

  app.patch('/manifests/:manifestId/replicas', async (request, reply) => {
    const manifestId = request.params.manifestId;
    const payload = request.body ?? {};
    try {
      validateReplicaPatch(payload);
      const record = store.updateManifestReplicas(manifestId, payload);
      return {
        manifestId: record.manifestId,
        chunkReplicas: record.chunkReplicas,
        updatedAt: record.updatedAt
      };
    } catch (error) {
      if (error.message === 'MANIFEST_NOT_FOUND') {
        reply.code(404);
        return { error: 'MANIFEST_NOT_FOUND' };
      }
      if (error.message === 'INVALID_PEER_ID') {
        reply.code(400);
        return { error: 'INVALID_PEER_ID' };
      }
      if (error.message === 'INVALID_CHUNK_INDEXES') {
        reply.code(400);
        return { error: 'INVALID_CHUNK_INDEXES' };
      }
      throw error;
    }
  });

  app.get('/manifests/:manifestId/chunks/:index', async (request, reply) => {
    const { manifestId, index } = request.params;
    const chunkIndex = Number.parseInt(index, 10);
    if (Number.isNaN(chunkIndex)) {
      reply.code(400);
      return { error: 'INVALID_CHUNK_INDEX' };
    }
    const chunk = store.getManifestChunk(manifestId, chunkIndex);
    if (!chunk) {
      reply.code(404);
      return { error: 'CHUNK_NOT_FOUND' };
    }
    return {
      manifestId,
      chunkIndex,
      data: chunk.data,
      pointerExpiresAt: chunk.pointerExpiresAt ?? null,
      pointer: chunk.pointer ?? null,
      replicas: chunk.replicas ?? []
    };
  });

  app.get('/manifests/:manifestId/chunks/:index/pointers', async (request, reply) => {
    const { manifestId, index } = request.params;
    const chunkIndex = Number.parseInt(index, 10);
    if (Number.isNaN(chunkIndex)) {
      reply.code(400);
      return { error: 'INVALID_CHUNK_INDEX' };
    }

    const limitParam = request.query?.limit;
    const limit = Number.parseInt(limitParam, 10);
    const history = store.getChunkPointerHistory(manifestId, chunkIndex, {
      limit: Number.isNaN(limit) ? undefined : limit
    });

    return {
      manifestId,
      chunkIndex,
      history
    };
  });

  app.patch('/manifests/:manifestId/chunks/:index', async (request, reply) => {
    const { manifestId, index } = request.params;
    const chunkIndex = Number.parseInt(index, 10);
    if (Number.isNaN(chunkIndex)) {
      reply.code(400);
      return { error: 'INVALID_CHUNK_INDEX' };
    }

    const payload = request.body ?? {};
    try {
      validatePointerPatch(payload);
      const result = store.updateChunkPointer(manifestId, chunkIndex, payload);
      if (!result) {
        reply.code(404);
        return { error: 'CHUNK_NOT_FOUND' };
      }
      return {
        manifestId,
        chunkIndex,
        data: result.data,
        pointer: result.pointer,
        pointerExpiresAt: result.pointerExpiresAt,
        replicas: result.replicas
      };
    } catch (error) {
      if (error.message === 'MANIFEST_NOT_FOUND') {
        reply.code(404);
        return { error: 'MANIFEST_NOT_FOUND' };
      }
      throw error;
    }
  });

  app.post('/domains', async (request, reply) => {
    const payload = request.body;
    validateDomainPayload(payload);

    try {
      const record = store.registerDomain(payload.domain, {
        owner: payload.owner,
        manifestId: payload.manifestId,
        replicas: payload.replicas ?? [],
        metadata: payload.metadata ?? {}
      });
      reply.code(201);
      return record;
    } catch (error) {
      if (error.message === 'DOMAIN_ALREADY_REGISTERED') {
        reply.code(409);
        return { error: 'DOMAIN_ALREADY_REGISTERED' };
      }
      throw error;
    }
  });

  app.patch('/domains/:domain', async (request, reply) => {
    const { domain } = request.params;
    const patch = request.body ?? {};
    try {
      const record = store.updateDomain(domain, {
        manifestId: patch.manifestId ?? patch.contentId ?? patch.manifest,
        replicas: patch.replicas,
        metadata: patch.metadata
      });
      return record;
    } catch (error) {
      if (error.message === 'DOMAIN_NOT_FOUND') {
        reply.code(404);
        return { error: 'DOMAIN_NOT_FOUND' };
      }
      throw error;
    }
  });

  app.get('/domains', async () => store.listDomains());

  app.get('/domains/:domain', async (request, reply) => {
    const record = store.getDomain(request.params.domain);
    if (!record) {
      reply.code(404);
      return { error: 'DOMAIN_NOT_FOUND' };
    }
    return record;
  });

  app.post('/maintenance/prune-pointers', async (request) => {
    const now = request.body?.now;
    const timestamp = typeof now === 'number' && Number.isFinite(now) ? now : Date.now();
    return store.pruneExpiredPointers(timestamp);
  });
}

function validateManifest(manifest) {
  const requiredFields = [
    'transferId',
    'fileName',
    'fileSize',
    'mimeType',
    'chunkSize',
    'chunkCount',
    'sha256'
  ];

  for (const field of requiredFields) {
    if (manifest[field] === undefined || manifest[field] === null) {
      throw new Error(`Invalid manifest: missing ${field}`);
    }
  }

  if (!Array.isArray(manifest.chunkHashes)) {
    throw new Error('Invalid manifest: chunkHashes must be array');
  }
  const chunkCount = Number(manifest.chunkCount);
  if (manifest.chunkData === undefined || manifest.chunkData === null) {
    if (!Number.isFinite(chunkCount) || chunkCount < 0) {
      throw new Error('Invalid manifest: chunkCount must be a non-negative number');
    }
    manifest.chunkData = Array.from({ length: chunkCount }, () => null);
  }
  if (!Array.isArray(manifest.chunkData)) {
    throw new Error('Invalid manifest: chunkData must be array');
  }
  if (
    !manifest.chunkData.every(
      (chunk) => chunk === null || typeof chunk === 'string'
    )
  ) {
    throw new Error('Invalid manifest: chunkData entries must be base64 strings or null');
  }
  if (manifest.chunkReplicas) {
    if (!Array.isArray(manifest.chunkReplicas)) {
      throw new Error('Invalid manifest: chunkReplicas must be array');
    }
    if (manifest.chunkReplicas.length !== manifest.chunkCount) {
      throw new Error('Invalid manifest: chunkReplicas length mismatch');
    }
    if (!manifest.chunkReplicas.every((entry) => Array.isArray(entry))) {
      throw new Error('Invalid manifest: chunkReplicas entries must be arrays');
    }
  }
  if (manifest.chunkData.length !== manifest.chunkCount) {
    throw new Error('Invalid manifest: chunkData length mismatch');
  }
}

function validateDomainPayload(payload) {
  if (!payload || typeof payload !== 'object') {
    throw new Error('Invalid domain payload');
  }
  if (!payload.domain || typeof payload.domain !== 'string') {
    throw new Error('Domain name is required');
  }
  if (!payload.owner || typeof payload.owner !== 'string') {
    throw new Error('Owner identifier is required');
  }
  if (!payload.manifestId || typeof payload.manifestId !== 'string') {
    throw new Error('Manifest ID is required');
  }
  if (payload.replicas && !Array.isArray(payload.replicas)) {
    throw new Error('Replicas must be an array');
  }
}

function validateReplicaPatch(payload) {
  if (!payload || typeof payload !== 'object') {
    throw new Error('INVALID_PEER_ID');
  }
  if (typeof payload.peerId !== 'string' || !payload.peerId.trim()) {
    throw new Error('INVALID_PEER_ID');
  }

  if (payload.chunkIndexes !== undefined) {
    if (!Array.isArray(payload.chunkIndexes)) {
      throw new Error('INVALID_CHUNK_INDEXES');
    }
    const invalid = payload.chunkIndexes.some(
      (index) => !Number.isInteger(Number(index)) || Number(index) < 0
    );
    if (invalid) {
      throw new Error('INVALID_CHUNK_INDEXES');
    }
  }
}

function validatePointerPatch(payload) {
  if (!payload || typeof payload !== 'object') {
    throw new Error('INVALID_POINTER_PAYLOAD');
  }

  if (payload.pointer !== undefined) {
    if (
      typeof payload.pointer !== 'string' &&
      !(payload.pointer && typeof payload.pointer === 'object')
    ) {
      throw new Error('INVALID_POINTER_PAYLOAD');
    }
  }

  if (payload.expiresAt !== undefined && typeof payload.expiresAt !== 'number' && typeof payload.expiresAt !== 'string') {
    throw new Error('INVALID_POINTER_PAYLOAD');
  }

  if (payload.removeData !== undefined && typeof payload.removeData !== 'boolean') {
    throw new Error('INVALID_POINTER_PAYLOAD');
  }
}
