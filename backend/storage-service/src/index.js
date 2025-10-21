import Fastify from 'fastify';
import cors from '@fastify/cors';
import fs from 'fs/promises';
import path from 'path';
import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { emitTelemetry } from '../../common/telemetry.js';

const PORT = Number(process.env.STORAGE_PORT ?? 8789);
const HOST = process.env.STORAGE_HOST ?? '0.0.0.0';
const STORAGE_BACKEND = (
  process.env.STORAGE_BACKEND ?? (process.env.STORAGE_S3_BUCKET ? 's3' : 'filesystem')
).toLowerCase();

const COMPONENT_NAME = 'storage';

function emitStorageError({ context, message, code = null, manifestId = null, chunkIndex = null } = {}) {
  if (!message) return;
  const payload = {
    component: COMPONENT_NAME,
    context,
    message,
    code
  };
  if (manifestId) payload.manifestId = manifestId;
  if (typeof chunkIndex === 'number' && Number.isFinite(chunkIndex)) {
    payload.chunkIndex = chunkIndex;
  }
  emitTelemetry(COMPONENT_NAME, 'error.event', payload);
}

function respondError(
  reply,
  { statusCode = 400, error, context, manifestId = null, chunkIndex = null, code = null } = {}
) {
  if (typeof statusCode === 'number') {
    reply.code(statusCode);
  }
  emitStorageError({
    context,
    message: error,
    code: code ?? error,
    manifestId,
    chunkIndex
  });
  return { error };
}

const loggerConfig = {
  level: process.env.LOG_LEVEL ?? 'info'
};

if (shouldUsePrettyLogs()) {
  try {
    await import('pino-pretty');
    loggerConfig.transport = {
      target: 'pino-pretty',
      options: { colorize: true }
    };
  } catch (error) {
    console.warn('pino-pretty not installed; falling back to JSON logs');
  }
}

const app = Fastify({ logger: loggerConfig });

const storage = await initialiseStorage(STORAGE_BACKEND, app.log);
const apiAuth = initialiseApiAuth(app.log);
const rateLimiter = createRateLimiter(app.log);

await app.register(cors, { origin: true });

app.get('/health', async () => ({
  status: 'ok',
  backend: storage.mode
}));

app.addHook('onRequest', async (request, reply) => {
  const route = request.routeOptions?.url ?? request.routerPath ?? '';
  const credential = extractCredential(request);
  if (String(request.method ?? '').toUpperCase() === 'OPTIONS') {
    return;
  }

  if (apiAuth.enabled && !apiAuth.isPublicRoute(route)) {
    if (!credential || !apiAuth.isAllowed(credential)) {
      reply.send(
        respondError(reply, {
          statusCode: 401,
          error: 'UNAUTHENTICATED',
          context: 'auth'
        })
      );
      return reply;
    }
  }

  if (rateLimiter.enabled && !rateLimiter.isPublicRoute(route)) {
    const identity = credential || request.ip || 'anonymous';
    const result = rateLimiter.check(String(identity));
    if (!result.allowed) {
      request.log.warn({ identity }, 'Storage rate limit exceeded');
      reply.header('RateLimit-Limit', rateLimiter.limit);
      reply.header('RateLimit-Remaining', 0);
      reply.header('RateLimit-Reset', Math.ceil(result.resetAt / 1000));
      if (result.retryAfter !== undefined) {
        reply.header('Retry-After', result.retryAfter);
      }
      const payload = respondError(reply, {
        statusCode: 429,
        error: 'RATE_LIMITED',
        context: 'rate-limit',
        code: 'RATE_LIMITED'
      });
      payload.retryAfter =
        result.retryAfter ?? Math.max(1, Math.ceil((result.resetAt - Date.now()) / 1000));
      reply.send(payload);
      return reply;
    }
    reply.header('RateLimit-Limit', rateLimiter.limit);
    reply.header('RateLimit-Remaining', Math.max(0, result.remaining));
    reply.header('RateLimit-Reset', Math.ceil(result.resetAt / 1000));
  }
});

app.post('/chunks', async (request, reply) => {
  const { manifestId, chunkIndex, data } = request.body ?? {};

  if (typeof manifestId !== 'string' || !manifestId.length) {
    return respondError(reply, {
      statusCode: 400,
      error: 'INVALID_MANIFEST_ID',
      context: 'upload-chunk'
    });
  }

  const index = Number(chunkIndex);
  if (!Number.isInteger(index) || index < 0) {
    return respondError(reply, {
      statusCode: 400,
      error: 'INVALID_CHUNK_INDEX',
      context: 'upload-chunk',
      chunkIndex: Number.isInteger(index) ? index : null
    });
  }

  if (typeof data !== 'string' || !data.length) {
    return respondError(reply, {
      statusCode: 400,
      error: 'INVALID_CHUNK_DATA',
      context: 'upload-chunk',
      manifestId,
      chunkIndex: index
    });
  }

  try {
    const buffer = Buffer.from(data, 'base64');
    await storage.saveChunk(manifestId, index, buffer);
    return { status: 'ok', backend: storage.mode };
  } catch (error) {
    request.log.error({ err: error, manifestId, index }, 'Failed to persist chunk');
    return respondError(reply, {
      statusCode: 500,
      error: 'CHUNK_WRITE_FAILED',
      context: 'upload-chunk',
      manifestId,
      chunkIndex: index,
      code: error?.code ?? 'CHUNK_WRITE_FAILED'
    });
  }
});

app.get('/chunks/:manifestId/:index', async (request, reply) => {
  const { manifestId, index } = request.params;
  const chunkIndex = Number(index);

  if (!Number.isInteger(chunkIndex) || chunkIndex < 0) {
    return respondError(reply, {
      statusCode: 400,
      error: 'INVALID_CHUNK_INDEX',
      context: 'download-chunk',
      manifestId
    });
  }

  try {
    const buffer = await storage.loadChunk(manifestId, chunkIndex);
    if (!buffer) {
      return respondError(reply, {
        statusCode: 404,
        error: 'CHUNK_NOT_FOUND',
        context: 'download-chunk',
        manifestId,
        chunkIndex
      });
    }
    return { data: buffer.toString('base64') };
  } catch (error) {
    request.log.error({ err: error, manifestId, chunkIndex }, 'Failed to read chunk');
    return respondError(reply, {
      statusCode: 500,
      error: 'CHUNK_READ_FAILED',
      context: 'download-chunk',
      manifestId,
      chunkIndex,
      code: error?.code ?? error?.name ?? 'CHUNK_READ_FAILED'
    });
  }
});

app.listen({ port: PORT, host: HOST })
  .then(() => {
    app.log.info(`Storage service (${storage.mode}) listening on http://${HOST}:${PORT}`);
  })
  .catch((error) => {
    app.log.error(error, 'Failed to start storage service');
    emitStorageError({
      context: 'startup',
      message: error?.message ?? 'FAILED_TO_START',
      code: error?.code ?? error?.name ?? 'FAILED_TO_START'
    });
    process.exit(1);
  });

app.addHook('onClose', () => {
  rateLimiter.dispose?.();
});

async function initialiseStorage(mode, logger) {
  switch (mode) {
    case 's3':
      return createS3Storage(logger);
    case 'filesystem':
      return createFilesystemStorage();
    case 'memory':
      logger.warn('Using in-memory storage backend – NOT recommended for production');
      return createMemoryStorage();
    default:
      logger.warn(`Unknown STORAGE_BACKEND "${mode}", falling back to filesystem.`);
      return createFilesystemStorage();
  }
}

function createMemoryStorage() {
  const chunks = new Map(); // key: `${manifestId}:${index}` -> Buffer
  return {
    mode: 'memory',
    async saveChunk(manifestId, index, buffer) {
      chunks.set(makeKey(manifestId, index), buffer);
    },
    async loadChunk(manifestId, index) {
      return chunks.get(makeKey(manifestId, index)) ?? null;
    }
  };
}

async function createFilesystemStorage() {
  const baseDir = resolveDataDir();
  await fs.mkdir(baseDir, { recursive: true });

  return {
    mode: 'filesystem',
    async saveChunk(manifestId, index, buffer) {
      const dir = path.join(baseDir, sanitise(manifestId));
      await fs.mkdir(dir, { recursive: true });
      const filePath = path.join(dir, `${index}.chunk`);
      await fs.writeFile(filePath, buffer);
    },
    async loadChunk(manifestId, index) {
      try {
        const filePath = path.join(baseDir, sanitise(manifestId), `${index}.chunk`);
        return await fs.readFile(filePath);
      } catch (error) {
        if (error?.code === 'ENOENT') {
          return null;
        }
        throw error;
      }
    }
  };
}

function resolveDataDir() {
  const target = process.env.STORAGE_DATA_DIR ?? 'storage-data';
  return path.resolve(process.cwd(), target);
}

async function createS3Storage(logger) {
  const bucket = process.env.STORAGE_S3_BUCKET;
  if (!bucket) {
    throw new Error('STORAGE_S3_BUCKET is required when STORAGE_BACKEND is set to "s3"');
  }

  const region = process.env.STORAGE_S3_REGION ?? 'us-east-1';
  const prefix = process.env.STORAGE_S3_PREFIX ?? 'dweb-chunks';
  const endpoint = process.env.STORAGE_S3_ENDPOINT;
  const forcePathStyle =
    (process.env.STORAGE_S3_FORCE_PATH_STYLE ?? 'false').toLowerCase() === 'true';

  const client = new S3Client({
    region,
    endpoint,
    forcePathStyle
  });

  const keyFor = (manifestId, index) => `${prefix}/${sanitise(manifestId)}/${index}.chunk`;

  logger.info(
    `Using S3 storage backend (bucket=${bucket}, region=${region}, prefix=${prefix}, endpoint=${endpoint ?? 'default'})`
  );

  return {
    mode: 's3',
    async saveChunk(manifestId, index, buffer) {
      const key = keyFor(manifestId, index);
      await client.send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: key,
          Body: buffer,
          ContentType: 'application/octet-stream'
        })
      );
    },
    async loadChunk(manifestId, index) {
      const key = keyFor(manifestId, index);
      try {
        const response = await client.send(
          new GetObjectCommand({
            Bucket: bucket,
            Key: key
          })
        );
        const body = await streamToBuffer(response.Body);
        return body;
      } catch (error) {
        if (error?.$metadata?.httpStatusCode === 404) {
          return null;
        }
        if (error?.name === 'NoSuchKey') {
          return null;
        }
        throw error;
      }
    }
  };
}

function makeKey(manifestId, index) {
  return `${manifestId}:${index}`;
}

function sanitise(value) {
  return String(value).replace(/[^a-zA-Z0-9-_]/g, '_');
}

async function streamToBuffer(stream) {
  const chunks = [];
  for await (const chunk of stream ?? []) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

function shouldUsePrettyLogs() {
  if (process.env.NODE_ENV === 'production') return false;
  if ((process.env.ENABLE_PRETTY_LOGS ?? 'true').toLowerCase() === 'false') return false;
  return true;
}
function initialiseApiAuth(logger) {
  const raw = process.env.STORAGE_API_KEYS ?? '';
  const keys = raw
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);

  if (!keys.length) {
    logger.info('Storage API running without authentication (STORAGE_API_KEYS not set)');
    return {
      enabled: false,
      isAllowed() {
        return true;
      },
      isPublicRoute() {
        return false;
      }
    };
  }

  logger.info(`Storage API keys configured (${keys.length} entries)`);

  return {
    enabled: true,
    isAllowed(token) {
      return keys.includes(token);
    },
    isPublicRoute(route) {
      return route === '/health';
    }
  };
}

function extractCredential(request) {
  const headerKey = request.headers['x-api-key'];
  if (typeof headerKey === 'string' && headerKey.trim()) {
    return headerKey.trim();
  }
  const authHeader = request.headers.authorization ?? request.headers.Authorization;
  if (typeof authHeader === 'string') {
    const parts = authHeader.trim().split(/\s+/);
    if (parts.length === 2 && /^Bearer$/i.test(parts[0])) {
      return parts[1];
    }
  }
  return null;
}

function createRateLimiter(logger) {
  const limit = Number(process.env.STORAGE_RATE_LIMIT_MAX ?? 0);
  const rawWindowMs = Number(process.env.STORAGE_RATE_LIMIT_WINDOW_MS ?? 60_000);
  const windowMs =
    Number.isFinite(rawWindowMs) && rawWindowMs > 0 ? rawWindowMs : 60_000;

  if (!Number.isFinite(limit) || limit <= 0) {
    logger.info('Storage rate limiter disabled.');
    return {
      enabled: false,
      limit: 0,
      isPublicRoute(route) {
        return route === '/health';
      },
      check() {
        return { allowed: true, remaining: Infinity, resetAt: Date.now() + windowMs };
      },
      dispose() {}
    };
  }

  const buckets = new Map();

  const cleanupExpired = (now) => {
    for (const [key, bucket] of buckets) {
      if (bucket.resetAt <= now) {
        buckets.delete(key);
      }
    }
  };

  const cleanupInterval = setInterval(() => {
    cleanupExpired(Date.now());
  }, Math.max(windowMs, 60_000));
  if (typeof cleanupInterval.unref === 'function') {
    cleanupInterval.unref();
  }

  return {
    enabled: true,
    limit,
    isPublicRoute(route) {
      return route === '/health';
    },
    check(rawKey) {
      const now = Date.now();
      cleanupExpired(now);
      const key = rawKey || 'anonymous';
      let bucket = buckets.get(key);
      if (!bucket || bucket.resetAt <= now) {
        bucket = { count: 1, resetAt: now + windowMs };
        buckets.set(key, bucket);
        return { allowed: true, remaining: limit - 1, resetAt: bucket.resetAt };
      }
      if (bucket.count >= limit) {
        return {
          allowed: false,
          remaining: 0,
          resetAt: bucket.resetAt,
          retryAfter: Math.max(1, Math.ceil((bucket.resetAt - now) / 1000))
        };
      }
      bucket.count += 1;
      return {
        allowed: true,
        remaining: limit - bucket.count,
        resetAt: bucket.resetAt
      };
    },
    dispose() {
      clearInterval(cleanupInterval);
    }
  };
}
