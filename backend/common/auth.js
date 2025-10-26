/**
 * Authentication & Authorization Module
 * 
 * Provides JWT token management, API key validation, and rate limiting
 */

import crypto from 'crypto';

/**
 * Generate a JWT token (simplified implementation)
 * For production, use jsonwebtoken library
 */
export function generateToken(payload, secret, expiresInSeconds = 86400) {
  const header = { alg: 'HS256', typ: 'JWT' };
  const now = Math.floor(Date.now() / 1000);
  
  const claims = {
    ...payload,
    iat: now,
    exp: now + expiresInSeconds
  };
  
  const headerB64 = Buffer.from(JSON.stringify(header)).toString('base64url');
  const payloadB64 = Buffer.from(JSON.stringify(claims)).toString('base64url');
  
  const signature = crypto
    .createHmac('sha256', secret)
    .update(`${headerB64}.${payloadB64}`)
    .digest('base64url');
  
  return `${headerB64}.${payloadB64}.${signature}`;
}

/**
 * Verify and decode JWT token
 */
export function verifyToken(token, secret) {
  try {
    const [headerB64, payloadB64, signature] = token.split('.');
    
    if (!headerB64 || !payloadB64 || !signature) {
      throw new Error('Invalid token format');
    }
    
    // Verify signature
    const expectedSignature = crypto
      .createHmac('sha256', secret)
      .update(`${headerB64}.${payloadB64}`)
      .digest('base64url');
    
    if (signature !== expectedSignature) {
      throw new Error('Invalid signature');
    }
    
    // Decode and validate payload
    const payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString());
    
    const now = Math.floor(Date.now() / 1000);
    if (payload.exp && payload.exp < now) {
      throw new Error('Token expired');
    }
    
    return payload;
  } catch (error) {
    throw new Error(`Token verification failed: ${error.message}`);
  }
}

/**
 * Generate a cryptographically secure API key
 */
export function generateApiKey(prefix = 'dweb') {
  const random = crypto.randomBytes(32).toString('hex');
  return `${prefix}_${random}`;
}

/**
 * Hash API key for secure storage
 */
export function hashApiKey(apiKey) {
  return crypto.createHash('sha256').update(apiKey).digest('hex');
}

/**
 * Verify API key against stored hash (timing-safe)
 */
export function verifyApiKey(apiKey, hash) {
  const computed = hashApiKey(apiKey);
  return crypto.timingSafeEqual(
    Buffer.from(computed),
    Buffer.from(hash)
  );
}

/**
 * Rate limiter with sliding window
 */
export class RateLimiter {
  constructor(options = {}) {
    this.maxRequests = options.maxRequests || 100;
    this.windowMs = options.windowMs || 60000; // 1 minute
    this.requests = new Map(); // key -> [timestamps]
  }
  
  /**
   * Check if request is allowed
   * Returns { allowed, remaining, resetAt }
   */
  check(key) {
    const now = Date.now();
    const windowStart = now - this.windowMs;
    
    // Get and clean old timestamps
    let timestamps = this.requests.get(key) || [];
    timestamps = timestamps.filter(ts => ts > windowStart);
    
    if (timestamps.length >= this.maxRequests) {
      const oldestTimestamp = timestamps[0];
      const resetAt = oldestTimestamp + this.windowMs;
      return {
        allowed: false,
        remaining: 0,
        resetAt,
        retryAfter: Math.ceil((resetAt - now) / 1000)
      };
    }
    
    // Add current request
    timestamps.push(now);
    this.requests.set(key, timestamps);
    
    return {
      allowed: true,
      remaining: this.maxRequests - timestamps.length,
      resetAt: now + this.windowMs
    };
  }
  
  /**
   * Reset rate limit for a key
   */
  reset(key) {
    this.requests.delete(key);
  }
  
  /**
   * Clean up expired entries
   */
  cleanup() {
    const now = Date.now();
    const windowStart = now - this.windowMs;
    
    for (const [key, timestamps] of this.requests.entries()) {
      const filtered = timestamps.filter(ts => ts > windowStart);
      if (filtered.length === 0) {
        this.requests.delete(key);
      } else {
        this.requests.set(key, filtered);
      }
    }
  }
}

/**
 * Fastify authentication decorator
 * Usage: fastify.decorate('authenticate', createAuthDecorator({ secret, type: 'jwt' }))
 */
export function createAuthDecorator(options = {}) {
  const { secret, type = 'jwt', keyHashes = [] } = options;
  
  return async function authenticate(request, reply) {
    if (type === 'jwt') {
      // JWT Bearer token authentication
      const authHeader = request.headers.authorization;
      
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return reply.code(401).send({
          error: 'Unauthorized',
          message: 'Missing or invalid authorization header'
        });
      }
      
      const token = authHeader.substring(7);
      
      try {
        const payload = verifyToken(token, secret);
        request.user = payload;
      } catch (error) {
        return reply.code(401).send({
          error: 'Unauthorized',
          message: error.message
        });
      }
    } else if (type === 'apikey') {
      // API Key authentication
      const apiKey = request.headers['x-api-key'];
      
      if (!apiKey) {
        return reply.code(401).send({
          error: 'Unauthorized',
          message: 'Missing x-api-key header'
        });
      }
      
      const keyHash = hashApiKey(apiKey);
      const isValid = keyHashes.some(hash => {
        try {
          return crypto.timingSafeEqual(Buffer.from(keyHash), Buffer.from(hash));
        } catch {
          return false;
        }
      });
      
      if (!isValid) {
        return reply.code(401).send({
          error: 'Unauthorized',
          message: 'Invalid API key'
        });
      }
      
      request.authenticated = true;
    }
  };
}

/**
 * Fastify rate limiting hook
 * Usage: fastify.addHook('onRequest', createRateLimitHook({ maxRequests: 100 }))
 */
export function createRateLimitHook(options = {}) {
  const limiter = new RateLimiter(options);
  
  // Cleanup every minute
  setInterval(() => limiter.cleanup(), 60000);
  
  return async function rateLimitHook(request, reply) {
    const key = options.keyGenerator 
      ? options.keyGenerator(request) 
      : request.ip;
    
    const result = limiter.check(key);
    
    // Add rate limit headers
    reply.header('X-RateLimit-Limit', limiter.maxRequests);
    reply.header('X-RateLimit-Remaining', result.remaining);
    reply.header('X-RateLimit-Reset', Math.ceil(result.resetAt / 1000));
    
    if (!result.allowed) {
      reply.header('Retry-After', result.retryAfter);
      return reply.code(429).send({
        error: 'Too Many Requests',
        message: `Rate limit exceeded. Try again in ${result.retryAfter} seconds.`,
        retryAfter: result.retryAfter
      });
    }
  };
}

/**
 * Generate a secure random secret (for JWT/encryption)
 */
export function generateSecret(length = 64) {
  return crypto.randomBytes(length).toString('hex');
}

export default {
  generateToken,
  verifyToken,
  generateApiKey,
  hashApiKey,
  verifyApiKey,
  RateLimiter,
  createAuthDecorator,
  createRateLimitHook,
  generateSecret
};
