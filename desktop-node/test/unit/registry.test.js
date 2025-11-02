/**
 * Unit Tests for Registry Service
 */

const RegistryService = require('../../services/registry');
const MemoryAdapter = require('../../database/memory-adapter');

describe('Registry Service Unit Tests', () => {
  let registry;
  
  beforeEach(() => {
    // Create registry with random port to avoid conflicts
    registry = new RegistryService({ port: 0 });
  });
  
  afterEach(async () => {
    if (registry && registry.server) {
      await registry.stop();
    }
  });

  describe('Domain Registration', () => {
    test('should create domain successfully', async () => {
      const domainData = {
        domain: 'test-unit.dweb',
        owner: 'unit-tester',
        manifestId: 'unit-test-manifest'
      };
      
      const result = await registry.db.createDomain(domainData);
      
      expect(result.domain).toBe(domainData.domain);
      expect(result.owner).toBe(domainData.owner);
    });

    test('should reject duplicate domain', async () => {
      const domainData = {
        domain: 'duplicate.dweb',
        owner: 'tester'
      };
      
      await registry.db.createDomain(domainData);
      
      await expect(
        registry.db.createDomain(domainData)
      ).rejects.toThrow('Domain already exists');
    });

    test('should validate domain format', () => {
      const invalidDomains = [
        '',
        'invalid..dweb',
        '.dweb',
        'dweb.',
        'very-long-domain-name-that-exceeds-limits'.repeat(10) + '.dweb'
      ];
      
      invalidDomains.forEach(domain => {
        const isValid = /^[a-z0-9][a-z0-9.-]*[a-z0-9]$/.test(domain) || /^[a-z0-9]$/.test(domain);
        expect(isValid).toBe(false);
      });
    });
  });

  describe('Content Type Detection', () => {
    test('should detect HTML content', () => {
      const htmlContent = '<!DOCTYPE html><html><head></head><body>Test</body></html>';
      const contentType = registry.getContentType(htmlContent);
      expect(contentType).toBe('text/html; charset=utf-8');
    });

    test('should detect JSON content', () => {
      const jsonContent = '{"message": "Hello DWeb"}';
      const contentType = registry.getContentType(jsonContent);
      expect(contentType).toBe('application/json');
    });

    test('should detect SVG content', () => {
      const svgContent = '<svg xmlns="http://www.w3.org/2000/svg"><rect/></svg>';
      const contentType = registry.getContentType(svgContent);
      expect(contentType).toBe('image/svg+xml');
    });

    test('should default to plain text', () => {
      const plainContent = 'This is just plain text';
      const contentType = registry.getContentType(plainContent);
      expect(contentType).toBe('text/plain; charset=utf-8');
    });
  });

  describe('Database Operations', () => {
    test('should retrieve all domains', async () => {
      // Create test domains
      await registry.db.createDomain({ domain: 'test1.dweb', owner: 'user1' });
      await registry.db.createDomain({ domain: 'test2.dweb', owner: 'user2' });
      
      const domains = await registry.db.getAllDomains();
      expect(domains.length).toBeGreaterThanOrEqual(2);
      
      const domainNames = domains.map(d => d.domain);
      expect(domainNames).toContain('test1.dweb');
      expect(domainNames).toContain('test2.dweb');
    });

    test('should get specific domain', async () => {
      const testDomain = { domain: 'specific.dweb', owner: 'specific-user' };
      await registry.db.createDomain(testDomain);
      
      const retrieved = await registry.db.getDomain('specific.dweb');
      expect(retrieved.domain).toBe('specific.dweb');
      expect(retrieved.owner).toBe('specific-user');
    });

    test('should update domain manifest', async () => {
      await registry.db.createDomain({ domain: 'update.dweb', owner: 'user' });
      
      const updated = await registry.db.updateDomain('update.dweb', { 
        manifestId: 'new-manifest-id' 
      });
      
      expect(updated.manifest_id).toBe('new-manifest-id');
    });
  });

  describe('Health Check', () => {
    test('should return healthy status', async () => {
      const health = await registry.db.healthCheck();
      expect(health.status).toBe('healthy');
      expect(health.database).toBeDefined();
    });
  });
});

// Mock global test framework functions if not using Jest
if (typeof describe === 'undefined') {
  global.describe = (name, fn) => {
    console.log(`\n=== ${name} ===`);
    fn();
  };
  
  global.test = global.it = async (name, fn) => {
    try {
      await fn();
      console.log(`✅ ${name}`);
    } catch (error) {
      console.log(`❌ ${name}: ${error.message}`);
    }
  };
  
  global.beforeEach = (fn) => { /* Setup before each test */ };
  global.afterEach = (fn) => { /* Cleanup after each test */ };
  
  global.expect = (actual) => ({
    toBe: (expected) => {
      if (actual !== expected) {
        throw new Error(`Expected ${expected}, got ${actual}`);
      }
    },
    toContain: (expected) => {
      if (!actual.includes(expected)) {
        throw new Error(`Expected ${actual} to contain ${expected}`);
      }
    },
    toBeGreaterThanOrEqual: (expected) => {
      if (actual < expected) {
        throw new Error(`Expected ${actual} to be >= ${expected}`);
      }
    },
    toBeDefined: () => {
      if (actual === undefined) {
        throw new Error('Expected value to be defined');
      }
    },
    rejects: {
      toThrow: async (expected) => {
        try {
          await actual;
          throw new Error('Expected promise to reject');
        } catch (error) {
          if (!error.message.includes(expected)) {
            throw new Error(`Expected error containing "${expected}", got "${error.message}"`);
          }
        }
      }
    }
  });
}