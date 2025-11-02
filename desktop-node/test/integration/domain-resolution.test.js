/**
 * Integration Tests for Domain Resolution
 * Tests the complete flow: Register -> Upload -> Resolve
 */

const http = require('http');

// Helper function to make HTTP requests
function makeRequest(options, data = null) {
  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          const parsed = res.headers['content-type']?.includes('json') 
            ? JSON.parse(body) 
            : body;
          resolve({ status: res.statusCode, headers: res.headers, data: parsed, raw: body });
        } catch (error) {
          resolve({ status: res.statusCode, headers: res.headers, raw: body });
        }
      });
    });
    
    req.on('error', reject);
    
    if (data) {
      req.write(JSON.stringify(data));
    }
    
    req.end();
  });
}

describe('Domain Resolution Integration Tests', () => {
  const baseUrl = 'localhost';
  const registryPort = 8788;
  const storagePort = 8789;
  
  describe('Complete Domain Publishing Flow', () => {
    test('should register domain, upload content, and resolve successfully', async () => {
      const testDomain = `integration-test-${Date.now()}.dweb`;
      const manifestId = `manifest-${Date.now()}`;
      const testContent = `
        <!DOCTYPE html>
        <html>
          <head><title>Integration Test</title></head>
          <body>
            <h1>Integration Test Success!</h1>
            <p>Domain: ${testDomain}</p>
            <p>Timestamp: ${new Date().toISOString()}</p>
          </body>
        </html>
      `;

      console.log(`\n🧪 Testing domain: ${testDomain}`);

      // Step 1: Register domain
      console.log('1. Registering domain...');
      const domainRegister = await makeRequest({
        hostname: baseUrl,
        port: registryPort,
        path: '/domains',
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      }, {
        domain: testDomain,
        owner: 'integration-tester',
        manifestId: manifestId
      });

      expect(domainRegister.status).toBe(201);
      expect(domainRegister.data.domain).toBe(testDomain);
      console.log('✅ Domain registered');

      // Step 2: Upload content
      console.log('2. Uploading content...');
      const base64Content = Buffer.from(testContent).toString('base64');
      const contentUpload = await makeRequest({
        hostname: baseUrl,
        port: storagePort,
        path: '/chunks',
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      }, {
        manifestId: manifestId,
        chunkIndex: 0,
        data: base64Content
      });

      expect(contentUpload.status).toBe(201);
      expect(contentUpload.data.manifestId).toBe(manifestId);
      console.log('✅ Content uploaded');

      // Step 3: Resolve domain
      console.log('3. Resolving domain...');
      const domainResolve = await makeRequest({
        hostname: baseUrl,
        port: registryPort,
        path: `/resolve/${testDomain}`,
        method: 'GET'
      });

      expect(domainResolve.status).toBe(200);
      expect(domainResolve.headers['content-type']).toContain('text/html');
      expect(domainResolve.headers['x-dweb-domain']).toBe(testDomain);
      expect(domainResolve.raw).toContain('Integration Test Success!');
      expect(domainResolve.raw).toContain(testDomain);
      console.log('✅ Domain resolved successfully');

      // Step 4: Test serve redirect
      console.log('4. Testing serve redirect...');
      const serveRedirect = await makeRequest({
        hostname: baseUrl,
        port: registryPort,
        path: `/serve/${testDomain}`,
        method: 'GET'
      });

      // Should redirect (302) or serve content (200)
      expect([200, 302]).toContain(serveRedirect.status);
      console.log('✅ Serve endpoint working');
    });

    test('should handle non-existent domain gracefully', async () => {
      const nonExistentDomain = `non-existent-${Date.now()}.dweb`;
      
      const response = await makeRequest({
        hostname: baseUrl,
        port: registryPort,
        path: `/resolve/${nonExistentDomain}`,
        method: 'GET'
      });

      expect(response.status).toBe(404);
      expect(response.data.error).toBe('DOMAIN_NOT_FOUND');
      console.log('✅ Non-existent domain handled correctly');
    });

    test('should handle domain without content', async () => {
      const emptyDomain = `empty-${Date.now()}.dweb`;
      
      // Register domain without content
      await makeRequest({
        hostname: baseUrl,
        port: registryPort,
        path: '/domains',
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      }, {
        domain: emptyDomain,
        owner: 'integration-tester'
        // No manifestId
      });

      const response = await makeRequest({
        hostname: baseUrl,
        port: registryPort,
        path: `/resolve/${emptyDomain}`,
        method: 'GET'
      });

      expect(response.status).toBe(404);
      expect(response.data.error).toBe('NO_CONTENT');
      console.log('✅ Domain without content handled correctly');
    });
  });

  describe('Content Type Detection', () => {
    test('should detect different content types', async () => {
      const testCases = [
        {
          content: '{"message": "Hello JSON"}',
          expectedType: 'application/json',
          name: 'JSON'
        },
        {
          content: '<svg xmlns="http://www.w3.org/2000/svg"><rect/></svg>',
          expectedType: 'image/svg+xml',
          name: 'SVG'
        },
        {
          content: 'Plain text content',
          expectedType: 'text/plain',
          name: 'Plain Text'
        }
      ];

      for (const testCase of testCases) {
        const domain = `content-type-${testCase.name.toLowerCase().replace(/\s+/g, '-')}-${Date.now()}.dweb`;
        const manifestId = `manifest-${Date.now()}`;

        // Register and upload
        await makeRequest({
          hostname: baseUrl,
          port: registryPort,
          path: '/domains',
          method: 'POST',
          headers: { 'Content-Type': 'application/json' }
        }, { domain, owner: 'tester', manifestId });

        await makeRequest({
          hostname: baseUrl,
          port: storagePort,
          path: '/chunks',
          method: 'POST',
          headers: { 'Content-Type': 'application/json' }
        }, {
          manifestId,
          chunkIndex: 0,
          data: Buffer.from(testCase.content).toString('base64')
        });

        // Test resolution
        const response = await makeRequest({
          hostname: baseUrl,
          port: registryPort,
          path: `/resolve/${domain}`,
          method: 'GET'
        });

        expect(response.status).toBe(200);
        expect(response.headers['content-type']).toContain(testCase.expectedType.split(';')[0]);
        console.log(`✅ ${testCase.name} content type detected correctly`);
      }
    });
  });
});

// Simple test framework implementation
if (typeof describe === 'undefined') {
  global.describe = (name, fn) => {
    console.log(`\n=== ${name} ===`);
    fn();
  };
  
  global.test = async (name, fn) => {
    try {
      await fn();
      console.log(`✅ ${name}`);
    } catch (error) {
      console.log(`❌ ${name}: ${error.message}`);
    }
  };
  
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
    }
  });
}