import Fastify from 'fastify';
import cors from '@fastify/cors';
import { emitTelemetry } from '../../common/telemetry.js';
import { registerRoutes } from './routes.js';
import { RegistryStore } from './store.js';

const PORT = Number(process.env.REGISTRY_PORT ?? 8788);
const HOST = process.env.REGISTRY_HOST ?? '0.0.0.0';
const POINTER_SWEEP_INTERVAL_MS = Number(
  process.env.REGISTRY_POINTER_SWEEP_INTERVAL_MS ?? 5 * 60 * 1000
);

const app = Fastify({
  logger: {
    level: process.env.LOG_LEVEL ?? 'info'
  },
  bodyLimit: Number(process.env.REGISTRY_BODY_LIMIT ?? 64 * 1024 * 1024)
});

const COMPONENT_NAME = 'registry';

function emitRegistryError({ context, message, code = null, manifestId = null, domain = null } = {}) {
  if (!message) return;
  const payload = {
    component: COMPONENT_NAME,
    context,
    message,
    code
  };
  if (manifestId) {
    payload.manifestId = manifestId;
  }
  if (domain) {
    payload.domain = domain;
  }
  emitTelemetry(COMPONENT_NAME, 'error.event', payload);
}

const store = new RegistryStore();

registerRoutes(app, store, { emitRegistryError });

const apiAuth = initialiseApiAuth(app.log);
const rateLimiter = createRateLimiter(app.log);

app.addHook('onRequest', async (request, reply) => {
  if (!apiAuth.enabled) return;
  const route = request.routeOptions?.url ?? request.routerPath ?? '';
  if (String(request.method ?? '').toUpperCase() === 'OPTIONS') {
    return;
  }
  if (apiAuth.isPublicRoute(route, request.method)) {
    return;
  }

  const credential = extractCredential(request);
  if (!credential || !apiAuth.isAllowed(credential)) {
    reply.code(401);
    reply.send({ error: 'UNAUTHENTICATED' });
    return reply;
  }

  if (rateLimiter.enabled && !rateLimiter.isPublicRoute(route)) {
    const identity = credential || request.ip || 'anonymous';
    const result = rateLimiter.check(String(identity));
    if (!result.allowed) {
      request.log.warn({ identity }, 'Registry rate limit exceeded');
      reply.header('RateLimit-Limit', rateLimiter.limit);
      reply.header('RateLimit-Remaining', 0);
      reply.header('RateLimit-Reset', Math.ceil(result.resetAt / 1000));
      if (result.retryAfter !== undefined) {
        reply.header('Retry-After', result.retryAfter);
      }
      reply.code(429).send({
        error: 'RATE_LIMITED',
        retryAfter:
          result.retryAfter ?? Math.max(1, Math.ceil((result.resetAt - Date.now()) / 1000))
      });
      return reply;
    }
    reply.header('RateLimit-Limit', rateLimiter.limit);
    reply.header('RateLimit-Remaining', Math.max(0, result.remaining));
    reply.header('RateLimit-Reset', Math.ceil(result.resetAt / 1000));
  }
});

let pointerSweepTimer = null;

function startPointerSweep() {
  if (!Number.isFinite(POINTER_SWEEP_INTERVAL_MS) || POINTER_SWEEP_INTERVAL_MS <= 0) {
    app.log.info('Pointer sweep scheduler disabled.');
    return;
  }

  const runSweep = () => {
    try {
      const result = store.pruneExpiredPointers();
      if (result.cleared > 0) {
        app.log.info(
          { cleared: result.cleared, processedAt: result.processedAt },
          'Pruned expired chunk pointers.'
        );
      }
    } catch (error) {
      app.log.error({ err: error }, 'Failed to prune expired chunk pointers');
      emitRegistryError({
        context: 'pointer-sweep',
        message: error?.message ?? 'pointer_sweep_failed',
        code: 'POINTER_SWEEP_FAILED'
      });
    }
  };

  pointerSweepTimer = setInterval(runSweep, POINTER_SWEEP_INTERVAL_MS);
  runSweep();
  app.log.info(
    { intervalMs: POINTER_SWEEP_INTERVAL_MS },
    'Pointer sweep scheduler started.'
  );
}

app.setErrorHandler((error, request, reply) => {
  request.log.error(error);
  const statusCode = Number.isInteger(error?.statusCode) ? error.statusCode : 400;
  emitRegistryError({
    context: 'request',
    message: error?.message ?? 'BAD_REQUEST',
    code: error?.code ?? error?.name ?? 'BAD_REQUEST'
  });
  reply.code(statusCode).send({ error: error.message ?? 'BAD_REQUEST' });
});

app.register(cors, {
  origin: true,
  methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'X-API-Key', 'Authorization'],
  credentials: false
})
  .then(() => {
    app.addHook('onSend', (request, reply, payload, done) => {
      reply.header('Access-Control-Allow-Private-Network', 'true');
      done(null, payload);
    });
  })
  .then(() => app.listen({ port: PORT, host: HOST }))
  .then(() => {
    app.log.info(`Registry service listening on http://${HOST}:${PORT}`);
    startPointerSweep();
  })
  .catch((error) => {
    app.log.error(error, 'Failed to start registry service');
    process.exit(1);
  });

app.addHook('onClose', () => {
  if (pointerSweepTimer) {
    clearInterval(pointerSweepTimer);
    pointerSweepTimer = null;
  }
  rateLimiter.dispose?.();
});

function initialiseApiAuth(logger) {
  const raw = process.env.REGISTRY_API_KEYS ?? '';
  const keys = raw
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);

  if (!keys.length) {
    logger.warn('Registry API running without authentication (REGISTRY_API_KEYS not set)');
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

  logger.info(`Registry API keys configured (${keys.length} entries)`);

  return {
    enabled: true,
    isAllowed(token) {
      return keys.includes(token);
    },
    isPublicRoute(route, method = 'GET') {
      if (!route) return false;
      if (route === '/' || route === '/health') {
        return true;
      }
      // Allow CORS preflight without credentials.
      if (String(method).toUpperCase() === 'OPTIONS') {
        return true;
      }
      return false;
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
  const limit = Number(process.env.REGISTRY_RATE_LIMIT_MAX ?? 0);
  const rawWindowMs = Number(process.env.REGISTRY_RATE_LIMIT_WINDOW_MS ?? 60_000);
  const windowMs =
    Number.isFinite(rawWindowMs) && rawWindowMs > 0 ? rawWindowMs : 60_000;

  if (!Number.isFinite(limit) || limit <= 0) {
    logger.info('Registry rate limiter disabled.');
    return {
      enabled: false,
      limit: 0,
      isPublicRoute(route) {
        return route === '/' || route === '/health';
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

  logger.info(
    { limit, windowMs },
    'Registry rate limiter enabled.'
  );

  return {
    enabled: true,
    limit,
    isPublicRoute(route) {
      return route === '/' || route === '/health';
    },
    check(identity) {
      const now = Date.now();
      cleanupExpired(now);
      const key = identity || 'anonymous';
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
