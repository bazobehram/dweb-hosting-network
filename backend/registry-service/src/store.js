import fs from 'fs';
import path from 'path';
import initSqlJs from 'sql.js';
import { nanoid } from 'nanoid';

const SQL = await initSqlJs({
  locateFile: locateSqlWasm
});

const DEFAULT_HISTORY_LIMIT = 100;

function safeExec(db, statement) {
  try {
    db.exec(statement);
  } catch (error) {
    if (!String(error).toLowerCase().includes('duplicate column name')) {
      throw error;
    }
  }
}

const KNOWN_MANIFEST_FIELDS = [
  'transferId',
  'fileName',
  'fileSize',
  'mimeType',
  'chunkSize',
  'chunkCount',
  'sha256',
  'chunkHashes',
  'chunkData',
  'chunkPointers',
  'chunkPointerExpiresAt',
  'chunkReplicas',
  'replicas',
  'metadata',
  'createdAt',
  'updatedAt',
  'manifestId'
];

export class RegistryStore {
  constructor(options = {}) {
    this.dbPath =
      options.dbPath ?? process.env.REGISTRY_DB_PATH ?? path.resolve(process.cwd(), 'registry-data/registry.sqlite');
    ensureDirectory(path.dirname(this.dbPath));

    const initialData = fs.existsSync(this.dbPath) ? fs.readFileSync(this.dbPath) : null;
    this.db = initialData ? new SQL.Database(initialData) : new SQL.Database();

    this.prepareSchema();

    this.lastPointerHistoryStamp = 0;
  }

  prepareSchema() {
    this.db.exec(`PRAGMA foreign_keys = ON;`);
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS manifests (
        manifest_id TEXT PRIMARY KEY,
        transfer_id TEXT,
        file_name TEXT,
        file_size INTEGER,
        mime_type TEXT,
        chunk_size INTEGER,
        chunk_count INTEGER,
        sha256 TEXT,
        chunk_hashes TEXT,
        replicas TEXT,
        metadata TEXT,
        additional_data TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS manifest_chunks (
        manifest_id TEXT NOT NULL,
        chunk_index INTEGER NOT NULL,
        data TEXT,
        pointer TEXT,
        expires_at INTEGER,
        PRIMARY KEY (manifest_id, chunk_index)
      );

      CREATE TABLE IF NOT EXISTS manifest_chunk_replicas (
        manifest_id TEXT NOT NULL,
        chunk_index INTEGER NOT NULL,
        peer_id TEXT NOT NULL,
        PRIMARY KEY (manifest_id, chunk_index, peer_id)
      );

      CREATE TABLE IF NOT EXISTS manifest_chunk_pointer_history (
        manifest_id TEXT NOT NULL,
        chunk_index INTEGER NOT NULL,
        pointer TEXT,
        expires_at INTEGER,
        recorded_at INTEGER NOT NULL,
        PRIMARY KEY (manifest_id, chunk_index, recorded_at)
      );

      CREATE TABLE IF NOT EXISTS domains (
        domain TEXT PRIMARY KEY,
        owner TEXT NOT NULL,
        manifest_id TEXT NOT NULL,
        replicas TEXT,
        metadata TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_manifest_chunks_manifest
        ON manifest_chunks (manifest_id);

      CREATE INDEX IF NOT EXISTS idx_manifest_chunk_replicas_manifest
        ON manifest_chunk_replicas (manifest_id);

      CREATE INDEX IF NOT EXISTS idx_manifest_chunk_history_manifest
        ON manifest_chunk_pointer_history (manifest_id);

      CREATE INDEX IF NOT EXISTS idx_domains_manifest
        ON domains (manifest_id);
    `);
    safeExec(this.db, 'ALTER TABLE manifest_chunks ADD COLUMN expires_at INTEGER');
    safeExec(
      this.db,
      'CREATE INDEX IF NOT EXISTS idx_manifest_chunk_history_pointer ON manifest_chunk_pointer_history (manifest_id, chunk_index, recorded_at DESC)'
    );
    this.persist();
  }

  createManifest(manifest) {
    const manifestId = manifest.transferId ?? manifest.manifestId ?? `mf-${Date.now()}-${nanoid(5)}`;
    const chunkReplicas = manifest.chunkReplicas && Array.isArray(manifest.chunkReplicas)
      ? normalizeChunkReplicas(manifest)
      : buildChunkReplicas(manifest);
    const chunkData = normalizeArray(manifest.chunkData, manifest.chunkCount);
    const rawPointers = normalizeArray(manifest.chunkPointers, manifest.chunkCount);
    const chunkPointerExpires = Array.isArray(manifest.chunkPointerExpiresAt)
      ? manifest.chunkPointerExpiresAt
      : [];
    const chunkPointers = rawPointers.map((entry, index) =>
      normalizePointerEntry(entry, chunkPointerExpires[index])
    );
    const chunkHashes = Array.isArray(manifest.chunkHashes) ? manifest.chunkHashes : [];
    const replicas = Array.isArray(manifest.replicas) ? uniqStrings(manifest.replicas) : [];
    const metadataJson = manifest.metadata !== undefined ? JSON.stringify(manifest.metadata) : null;
    const additionalData = extractAdditionalManifestFields(manifest);
    const additionalJson = Object.keys(additionalData).length ? JSON.stringify(additionalData) : null;
    const createdAt = Date.now();

    this.run('DELETE FROM manifest_chunk_replicas WHERE manifest_id = ?', [manifestId]);
    this.run('DELETE FROM manifest_chunks WHERE manifest_id = ?', [manifestId]);
    this.run('DELETE FROM manifests WHERE manifest_id = ?', [manifestId]);

    this.run(
      `INSERT INTO manifests (
        manifest_id,
        transfer_id,
        file_name,
        file_size,
        mime_type,
        chunk_size,
        chunk_count,
        sha256,
        chunk_hashes,
        replicas,
        metadata,
        additional_data,
        created_at,
        updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        manifestId,
        manifest.transferId ?? manifestId,
        manifest.fileName ?? null,
        manifest.fileSize ?? null,
        manifest.mimeType ?? null,
        manifest.chunkSize ?? null,
        manifest.chunkCount ?? (chunkData?.length ?? 0),
        manifest.sha256 ?? null,
        JSON.stringify(chunkHashes),
        JSON.stringify(replicas),
        metadataJson,
        additionalJson,
        createdAt,
        createdAt
      ]
    );

    const totalChunks = manifest.chunkCount ?? chunkData.length ?? 0;
    for (let index = 0; index < totalChunks; index += 1) {
      const pointerEntry = chunkPointers[index] ?? { pointer: null, expiresAt: null };
      this.run(
        `INSERT INTO manifest_chunks (manifest_id, chunk_index, data, pointer, expires_at) VALUES (?, ?, ?, ?, ?)`,
        [manifestId, index, chunkData[index] ?? null, pointerEntry.pointer, pointerEntry.expiresAt]
      );

      this.recordChunkPointerHistory(manifestId, index, pointerEntry.pointer, pointerEntry.expiresAt, {
        force: Boolean(pointerEntry.pointer)
      });

      const peers = Array.isArray(chunkReplicas[index]) ? chunkReplicas[index] : [];
      peers.forEach((peerId) => {
        if (peerId) {
          this.run(
            `INSERT OR IGNORE INTO manifest_chunk_replicas (manifest_id, chunk_index, peer_id) VALUES (?, ?, ?)`,
            [manifestId, index, peerId]
          );
        }
      });
    }

    this.persist();
    return this.getManifest(manifestId);
  }

  getManifest(manifestId) {
    const row = this.getOne(`SELECT * FROM manifests WHERE manifest_id = ?`, [manifestId]);
    if (!row) return null;
    const chunkRows = this.getAll(
      `SELECT chunk_index, data, pointer, expires_at FROM manifest_chunks WHERE manifest_id = ? ORDER BY chunk_index ASC`,
      [manifestId]
    );
    const replicaRows = this.getAll(
      `SELECT chunk_index, peer_id FROM manifest_chunk_replicas WHERE manifest_id = ? ORDER BY chunk_index ASC`,
      [manifestId]
    );

    const chunkCount = row.chunk_count ?? chunkRows.length ?? 0;
    const chunkData = new Array(chunkCount).fill(null);
    const chunkPointers = new Array(chunkCount).fill(null);
    const chunkPointerExpiresAt = new Array(chunkCount).fill(null);
    const chunkReplicas = new Array(chunkCount).fill(null).map(() => []);

    chunkRows.forEach((chunk) => {
      if (chunk.chunk_index < chunkCount) {
        chunkData[chunk.chunk_index] = chunk.data ?? null;
        chunkPointers[chunk.chunk_index] = chunk.pointer ?? null;
        chunkPointerExpiresAt[chunk.chunk_index] = chunk.expires_at ?? null;
      }
    });

    replicaRows.forEach((replica) => {
      if (replica.chunk_index < chunkCount) {
        chunkReplicas[replica.chunk_index].push(replica.peer_id);
      }
    });

    const manifest = {
      manifestId: row.manifest_id,
      transferId: row.transfer_id ?? row.manifest_id,
      fileName: row.file_name ?? undefined,
      fileSize: row.file_size ?? undefined,
      mimeType: row.mime_type ?? undefined,
      chunkSize: row.chunk_size ?? undefined,
      chunkCount,
      sha256: row.sha256 ?? undefined,
      chunkHashes: parseJSON(row.chunk_hashes, []),
      replicas: parseJSON(row.replicas, []),
      chunkData,
      chunkPointers,
      chunkPointerExpiresAt,
      chunkReplicas,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };

    const metadata = parseJSON(row.metadata, null);
    if (metadata !== null) {
      manifest.metadata = metadata;
    }

    const additional = parseJSON(row.additional_data, {});
    Object.entries(additional).forEach(([key, value]) => {
      if (!(key in manifest)) {
        manifest[key] = value;
      }
    });

    return manifest;
  }

  listManifests() {
    const rows = this.getAll(`SELECT manifest_id FROM manifests ORDER BY created_at DESC`);
    return rows.map((row) => this.getManifest(row.manifest_id));
  }

  getManifestChunk(manifestId, index) {
    const chunk = this.getOne(
      `SELECT data, pointer, expires_at FROM manifest_chunks WHERE manifest_id = ? AND chunk_index = ?`,
      [manifestId, index]
    );
    if (!chunk) return null;

    const replicas = this.getAll(
      `SELECT peer_id FROM manifest_chunk_replicas WHERE manifest_id = ? AND chunk_index = ?`,
      [manifestId, index]
    ).map((row) => row.peer_id);

    return {
      data: chunk.data ?? null,
      pointer: chunk.pointer ?? null,
      pointerExpiresAt: chunk.expires_at ?? null,
      replicas
    };
  }

  updateChunkPointer(manifestId, index, options = {}) {
    const manifestRow = this.getOne('SELECT * FROM manifests WHERE manifest_id = ?', [manifestId]);
   if (!manifestRow) {
      throw new Error('MANIFEST_NOT_FOUND');
    }

    const existingChunk = this.getOne('SELECT pointer, expires_at FROM manifest_chunks WHERE manifest_id = ? AND chunk_index = ?', [manifestId, index]);
    const removeData = options.removeData === true;
    const pointerProvided = Object.prototype.hasOwnProperty.call(options, 'pointer');

    const pointerEntry = pointerProvided
      ? normalizePointerEntry(options.pointer, options.expiresAt ?? options.pointerExpiresAt ?? null)
      : existingChunk
        ? { pointer: existingChunk.pointer ?? null, expiresAt: existingChunk.expires_at ?? null }
        : { pointer: null, expiresAt: parseTimestamp(options.expiresAt ?? options.pointerExpiresAt ?? null) };

    const now = Date.now();

    if (!existingChunk) {
      this.run(
        'INSERT INTO manifest_chunks (manifest_id, chunk_index, data, pointer, expires_at) VALUES (?, ?, ?, ?, ?)',
        [manifestId, index, null, pointerEntry.pointer, pointerEntry.expiresAt]
      );
    } else {
      this.run(
        'UPDATE manifest_chunks SET pointer = ?, expires_at = ?, data = CASE WHEN ? THEN NULL ELSE data END WHERE manifest_id = ? AND chunk_index = ?',
        [pointerEntry.pointer, pointerEntry.expiresAt, removeData ? 1 : 0, manifestId, index]
      );
    }

    const oldPointer = existingChunk ? existingChunk.pointer ?? null : null;
    const oldExpires = existingChunk ? existingChunk.expires_at ?? null : null;
    const pointerChanged = oldPointer !== pointerEntry.pointer;
    const expiryChanged = oldExpires !== pointerEntry.expiresAt;

    if (pointerChanged || expiryChanged) {
      this.recordChunkPointerHistory(manifestId, index, pointerEntry.pointer, pointerEntry.expiresAt);
    }

    this.run('UPDATE manifests SET updated_at = ? WHERE manifest_id = ?', [now, manifestId]);
    this.persist();
    return this.getManifestChunk(manifestId, index);
  }

  pruneExpiredPointers(now = Date.now()) {
    const expired = this.getAll(
      'SELECT manifest_id, chunk_index FROM manifest_chunks WHERE pointer IS NOT NULL AND expires_at IS NOT NULL AND expires_at <= ?',
      [now]
    );

    expired.forEach((row) => {
      this.run(
        'UPDATE manifest_chunks SET pointer = NULL, expires_at = NULL WHERE manifest_id = ? AND chunk_index = ?',
        [row.manifest_id, row.chunk_index]
      );
    });

    if (expired.length) {
      this.persist();
    }

    return { cleared: expired.length, processedAt: now };
  }

  getChunkPointerHistory(manifestId, index, { limit = DEFAULT_HISTORY_LIMIT } = {}) {
    const boundedLimit = Number.isInteger(limit) && limit > 0 ? Math.min(limit, DEFAULT_HISTORY_LIMIT) : DEFAULT_HISTORY_LIMIT;
    const rows = this.getAll(
      `SELECT pointer, expires_at, recorded_at FROM manifest_chunk_pointer_history
       WHERE manifest_id = ? AND chunk_index = ?
       ORDER BY recorded_at DESC
       LIMIT ?`,
      [manifestId, index, boundedLimit]
    );

    return rows.map((row) => ({
      pointer: row.pointer ?? null,
      expiresAt: row.expires_at ?? null,
      recordedAt: row.recorded_at
    }));
  }

  recordChunkPointerHistory(manifestId, index, pointer, expiresAt, { force = false } = {}) {
    if (!force && pointer == null && expiresAt == null) {
      return;
    }

    let recordedAt = Date.now();
    if (recordedAt <= this.lastPointerHistoryStamp) {
      recordedAt = this.lastPointerHistoryStamp + 1;
    }
    this.lastPointerHistoryStamp = recordedAt;

    this.run(
      `INSERT INTO manifest_chunk_pointer_history (manifest_id, chunk_index, pointer, expires_at, recorded_at)
       VALUES (?, ?, ?, ?, ?)`,
      [manifestId, index, pointer ?? null, expiresAt ?? null, recordedAt]
    );
  }

  registerDomain(domainName, data) {
    const normalized = normalizeDomain(domainName);
    const now = Date.now();

    try {
      this.run(
        `INSERT INTO domains (domain, owner, manifest_id, replicas, metadata, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          normalized,
          data.owner,
          data.manifestId,
          JSON.stringify(Array.isArray(data.replicas) ? data.replicas : []),
          data.metadata !== undefined ? JSON.stringify(data.metadata) : null,
          now,
          now
        ]
      );
    } catch (error) {
      if (String(error).includes('PRIMARY KEY')) {
        throw new Error('DOMAIN_ALREADY_REGISTERED');
      }
      throw error;
    }

    this.persist();
    return this.getDomain(normalized);
  }

  updateDomain(domainName, patch) {
    const normalized = normalizeDomain(domainName);
    const existing = this.getOne(`SELECT * FROM domains WHERE domain = ?`, [normalized]);
    if (!existing) {
      throw new Error('DOMAIN_NOT_FOUND');
    }

    const replicasJson = JSON.stringify(
      Array.isArray(patch.replicas) ? patch.replicas : parseJSON(existing.replicas, [])
    );
    const metadataJson =
      patch.metadata !== undefined ? JSON.stringify(patch.metadata) : existing.metadata ?? null;

    this.run(
      `UPDATE domains
       SET owner = ?, manifest_id = ?, replicas = ?, metadata = ?, updated_at = ?
       WHERE domain = ?`,
      [
        patch.owner ?? existing.owner,
        patch.manifestId ?? patch.contentId ?? existing.manifest_id,
        replicasJson,
        metadataJson,
        Date.now(),
        normalized
      ]
    );

    this.persist();
    return this.getDomain(normalized);
  }

  getDomain(domainName) {
    const normalized = normalizeDomain(domainName);
    const row = this.getOne(`SELECT * FROM domains WHERE domain = ?`, [normalized]);
    if (!row) return null;

    const record = {
      domain: row.domain,
      owner: row.owner,
      manifestId: row.manifest_id,
      replicas: parseJSON(row.replicas, []),
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };

    const metadata = parseJSON(row.metadata, null);
    if (metadata !== null) {
      record.metadata = metadata;
    }

    return record;
  }

  deleteDomain(domainName) {
    const normalized = normalizeDomain(domainName);
    const existing = this.getOne(`SELECT domain FROM domains WHERE domain = ?`, [normalized]);
    if (!existing) {
      throw new Error('DOMAIN_NOT_FOUND');
    }
    this.run(`DELETE FROM domains WHERE domain = ?`, [normalized]);
    this.persist();
    return { domain: normalized };
  }

  listDomains() {
    return this.getAll(`SELECT * FROM domains ORDER BY domain ASC`).map((row) => {
      const record = {
        domain: row.domain,
        owner: row.owner,
        manifestId: row.manifest_id,
        replicas: parseJSON(row.replicas, []),
        createdAt: row.created_at,
        updatedAt: row.updated_at
      };
      const metadata = parseJSON(row.metadata, null);
      if (metadata !== null) {
        record.metadata = metadata;
      }
      return record;
    });
  }

  updateManifestReplicas(manifestId, payload) {
    const manifestRow = this.getOne(`SELECT * FROM manifests WHERE manifest_id = ?`, [manifestId]);
    if (!manifestRow) {
      throw new Error('MANIFEST_NOT_FOUND');
    }

    const peerId = typeof payload.peerId === 'string' ? payload.peerId.trim() : '';
    if (!peerId) {
      throw new Error('INVALID_PEER_ID');
    }

    const chunkCount = manifestRow.chunk_count ?? 0;
    const indexes = Array.isArray(payload.chunkIndexes) && payload.chunkIndexes.length
      ? payload.chunkIndexes
      : Array.from({ length: chunkCount }, (_, index) => index);

    const validIndexes = uniqNumbers(
      indexes
        .map((value) => Number(value))
        .filter((idx) => Number.isInteger(idx) && idx >= 0 && idx < chunkCount)
    );

    validIndexes.forEach((idx) => {
      this.run(
        `INSERT OR IGNORE INTO manifest_chunk_replicas (manifest_id, chunk_index, peer_id) VALUES (?, ?, ?)`,
        [manifestId, idx, peerId]
      );
    });

    const existingReplicas = new Set(parseJSON(manifestRow.replicas, []));
    existingReplicas.add(peerId);

    this.run(
      `UPDATE manifests SET replicas = ?, updated_at = ? WHERE manifest_id = ?`,
      [JSON.stringify([...existingReplicas]), Date.now(), manifestId]
    );

    this.persist();
    return this.getManifest(manifestId);
  }

  run(sql, params = []) {
    this.db.run(sql, params);
  }

  getAll(sql, params = []) {
    const stmt = this.db.prepare(sql);
    stmt.bind(params);
    const rows = [];
    while (stmt.step()) {
      rows.push(stmt.getAsObject());
    }
    stmt.free();
    return rows;
  }

  getOne(sql, params = []) {
    const stmt = this.db.prepare(sql);
    stmt.bind(params);
    const row = stmt.step() ? stmt.getAsObject() : null;
    stmt.free();
    return row;
  }

  persist() {
    const data = this.db.export();
    fs.writeFileSync(this.dbPath, Buffer.from(data));
  }
}

function locateSqlWasm(file) {
  const candidates = [
    path.resolve(process.cwd(), 'node_modules/sql.js/dist', file),
    path.resolve(process.cwd(), '../node_modules/sql.js/dist', file),
    path.resolve(process.cwd(), '../../node_modules/sql.js/dist', file),
    path.resolve(process.cwd(), '../../../node_modules/sql.js/dist', file)
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  return path.resolve('node_modules/sql.js/dist', file);
}

function ensureDirectory(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function normalizeDomain(domain) {
  return String(domain ?? '').trim().toLowerCase();
}

function normalizeArray(value, lengthHint) {
  if (!Array.isArray(value)) {
    if (Number.isInteger(lengthHint) && lengthHint > 0) {
      return new Array(lengthHint).fill(null);
    }
    return [];
  }
  return value.slice();
}

function uniqStrings(values) {
  return [...new Set((values ?? []).filter((value) => typeof value === 'string' && value.trim().length))];
}

function uniqNumbers(values) {
  return [...new Set(values)];
}

function parseJSON(payload, fallback) {
  if (payload === null || payload === undefined) return fallback;
  try {
    return JSON.parse(payload);
  } catch {
    return fallback;
  }
}

function buildChunkReplicas(manifest) {
  const replicas = Array.isArray(manifest.replicas) ? uniqStrings(manifest.replicas) : [];
  const count = manifest.chunkCount ?? (Array.isArray(manifest.chunkData) ? manifest.chunkData.length : 0);
  if (!count || count <= 0) return [];
  return Array.from({ length: count }, () => [...replicas]);
}

function normalizePointerEntry(entry, fallbackExpires) {
  const result = { pointer: null, expiresAt: parseTimestamp(fallbackExpires) };

  if (entry === null || entry === undefined) {
    return result;
  }

  if (typeof entry === 'string') {
    const trimmed = entry.trim();
    result.pointer = trimmed.length ? trimmed : null;
    return result;
  }

  if (typeof entry === 'object') {
    const pointerCandidate = entry.pointer ?? entry.url ?? entry.href ?? null;
    if (typeof pointerCandidate === 'string' && pointerCandidate.trim().length) {
      result.pointer = pointerCandidate.trim();
    }
    const expiresCandidate = entry.expiresAt ?? entry.expireAt ?? entry.expires ?? fallbackExpires ?? null;
    result.expiresAt = parseTimestamp(expiresCandidate);
    return result;
  }

  return result;
}

function parseTimestamp(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.floor(value);
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed.length) return null;
    const numeric = Number(trimmed);
    if (!Number.isNaN(numeric)) {
      return Math.floor(numeric);
    }
    const parsed = Date.parse(trimmed);
    if (!Number.isNaN(parsed)) {
      return parsed;
    }
  }
  return null;
}

function normalizeChunkReplicas(manifest) {
  if (!Array.isArray(manifest.chunkReplicas) || manifest.chunkReplicas.length !== manifest.chunkCount) {
    return buildChunkReplicas(manifest);
  }
  return manifest.chunkReplicas.map((entry) =>
    Array.isArray(entry) ? uniqStrings(entry) : []
  );
}

function extractAdditionalManifestFields(manifest) {
  const copy = { ...manifest };
  KNOWN_MANIFEST_FIELDS.forEach((field) => {
    if (field in copy) {
      delete copy[field];
    }
  });
  return copy;
}
