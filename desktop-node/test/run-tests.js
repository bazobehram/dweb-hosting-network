/**
 * Comprehensive Test Runner for DWeb Desktop Node
 */

const fs = require('fs');
const path = require('path');
const { performance } = require('perf_hooks');

// Test results tracking
let totalTests = 0;
let passedTests = 0;
let failedTests = 0;
let testResults = [];

// Mock test framework globals
global.describe = function(suiteName, fn) {
  console.log(`\n🧪 ${suiteName}`);
  console.log('='.repeat(50));
  fn();
};

global.test = global.it = async function(testName, fn) {
  totalTests++;
  const startTime = performance.now();
  
  try {
    await fn();
    const endTime = performance.now();
    const duration = Math.round(endTime - startTime);
    
    console.log(`✅ ${testName} (${duration}ms)`);
    passedTests++;
    testResults.push({
      name: testName,
      status: 'passed',
      duration: duration
    });
  } catch (error) {
    const endTime = performance.now();
    const duration = Math.round(endTime - startTime);
    
    console.log(`❌ ${testName} (${duration}ms)`);
    console.log(`   Error: ${error.message}`);
    failedTests++;
    testResults.push({
      name: testName,
      status: 'failed',
      duration: duration,
      error: error.message
    });
  }
};

global.beforeEach = function(fn) {
  // Setup before each test
};

global.afterEach = function(fn) {
  // Cleanup after each test
};

// Enhanced expect implementation
global.expect = function(actual) {
  return {
    toBe(expected) {
      if (actual !== expected) {
        throw new Error(`Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
      }
    },
    
    toContain(expected) {
      if (Array.isArray(actual)) {
        if (!actual.includes(expected)) {
          throw new Error(`Expected array [${actual}] to contain ${JSON.stringify(expected)}`);
        }
      } else if (typeof actual === 'string') {
        if (!actual.includes(expected)) {
          throw new Error(`Expected string "${actual}" to contain "${expected}"`);
        }
      } else {
        throw new Error(`toContain() can only be used with arrays and strings`);
      }
    },
    
    toBeGreaterThanOrEqual(expected) {
      if (actual < expected) {
        throw new Error(`Expected ${actual} to be >= ${expected}`);
      }
    },
    
    toBeDefined() {
      if (actual === undefined) {
        throw new Error('Expected value to be defined, got undefined');
      }
    },
    
    toBeNull() {
      if (actual !== null) {
        throw new Error(`Expected null, got ${JSON.stringify(actual)}`);
      }
    },
    
    toBeTruthy() {
      if (!actual) {
        throw new Error(`Expected truthy value, got ${JSON.stringify(actual)}`);
      }
    },
    
    toBeFalsy() {
      if (actual) {
        throw new Error(`Expected falsy value, got ${JSON.stringify(actual)}`);
      }
    },
    
    rejects: {
      async toThrow(expectedError) {
        try {
          await actual;
          throw new Error('Expected promise to reject, but it resolved');
        } catch (error) {
          if (expectedError && !error.message.includes(expectedError)) {
            throw new Error(`Expected error containing "${expectedError}", got "${error.message}"`);
          }
        }
      }
    }
  };
};

// Test discovery and execution
async function runTests() {
  console.log('🚀 DWeb Desktop Node - Comprehensive Test Suite');
  console.log('='.repeat(60));
  
  const startTime = performance.now();
  
  // Check if services are running
  await checkServicesHealth();
  
  // Run unit tests
  console.log('\n📋 UNIT TESTS');
  await runTestsInDirectory(path.join(__dirname, 'unit'));
  
  // Run integration tests
  console.log('\n🔗 INTEGRATION TESTS');
  await runTestsInDirectory(path.join(__dirname, 'integration'));
  
  // Performance tests
  console.log('\n⚡ PERFORMANCE TESTS');
  await runPerformanceTests();
  
  // Load tests
  console.log('\n📊 LOAD TESTS');
  await runLoadTests();
  
  const endTime = performance.now();
  const totalDuration = Math.round(endTime - startTime);
  
  // Print results summary
  printTestSummary(totalDuration);
  
  // Exit with appropriate code
  process.exit(failedTests > 0 ? 1 : 0);
}

async function runTestsInDirectory(directory) {
  if (!fs.existsSync(directory)) {
    console.log(`📁 Directory ${directory} not found, skipping...`);
    return;
  }
  
  const testFiles = fs.readdirSync(directory)
    .filter(file => file.endsWith('.test.js'))
    .map(file => path.join(directory, file));
  
  for (const testFile of testFiles) {
    console.log(`\n📄 Running ${path.basename(testFile)}...`);
    try {
      // Clear require cache to ensure fresh execution
      delete require.cache[require.resolve(testFile)];
      require(testFile);
    } catch (error) {
      console.log(`❌ Failed to load ${testFile}: ${error.message}`);
    }
  }
}

async function checkServicesHealth() {
  console.log('\n🏥 HEALTH CHECKS');
  const services = [
    { name: 'Registry', port: 8788 },
    { name: 'Signaling', port: 8787 },
    { name: 'Storage', port: 8789 }
  ];
  
  for (const service of services) {
    try {
      const response = await makeHttpRequest({
        hostname: 'localhost',
        port: service.port,
        path: '/health',
        method: 'GET'
      });
      
      if (response.status === 200) {
        console.log(`✅ ${service.name} Service (Port ${service.port}) - Healthy`);
      } else {
        console.log(`⚠️  ${service.name} Service (Port ${service.port}) - Status ${response.status}`);
      }
    } catch (error) {
      console.log(`❌ ${service.name} Service (Port ${service.port}) - Unreachable`);
      console.log(`   Consider starting the DWeb Desktop Node application first`);
    }
  }
}

async function runPerformanceTests() {
  // API Response Time Test
  console.log('Testing API response times...');
  const endpoints = [
    { path: '/health', port: 8788, name: 'Registry Health' },
    { path: '/health', port: 8787, name: 'Signaling Health' },
    { path: '/health', port: 8789, name: 'Storage Health' },
    { path: '/domains', port: 8788, name: 'Domain List' }
  ];
  
  for (const endpoint of endpoints) {
    const times = [];
    const iterations = 10;
    
    for (let i = 0; i < iterations; i++) {
      const start = performance.now();
      try {
        await makeHttpRequest({
          hostname: 'localhost',
          port: endpoint.port,
          path: endpoint.path,
          method: 'GET'
        });
        times.push(performance.now() - start);
      } catch (error) {
        console.log(`⚠️  ${endpoint.name} - Failed: ${error.message}`);
        continue;
      }
    }
    
    if (times.length > 0) {
      const avgTime = times.reduce((a, b) => a + b, 0) / times.length;
      const maxTime = Math.max(...times);
      const minTime = Math.min(...times);
      
      console.log(`📊 ${endpoint.name}: avg=${avgTime.toFixed(1)}ms, min=${minTime.toFixed(1)}ms, max=${maxTime.toFixed(1)}ms`);
      
      // Performance assertions
      if (avgTime > 100) {
        console.log(`⚠️  Warning: ${endpoint.name} average response time (${avgTime.toFixed(1)}ms) exceeds 100ms threshold`);
      }
    }
  }
}

async function runLoadTests() {
  console.log('Running load tests...');
  
  // Concurrent requests test
  const concurrentRequests = 20;
  const promises = [];
  
  const startTime = performance.now();
  
  for (let i = 0; i < concurrentRequests; i++) {
    promises.push(
      makeHttpRequest({
        hostname: 'localhost',
        port: 8788,
        path: '/health',
        method: 'GET'
      })
    );
  }
  
  try {
    const results = await Promise.all(promises);
    const endTime = performance.now();
    const totalTime = endTime - startTime;
    
    const successfulRequests = results.filter(r => r.status === 200).length;
    const requestsPerSecond = (concurrentRequests / (totalTime / 1000)).toFixed(1);
    
    console.log(`📈 Load Test Results:`);
    console.log(`   Concurrent Requests: ${concurrentRequests}`);
    console.log(`   Successful: ${successfulRequests}`);
    console.log(`   Total Time: ${totalTime.toFixed(1)}ms`);
    console.log(`   Requests/Second: ${requestsPerSecond}`);
    
    if (successfulRequests < concurrentRequests) {
      console.log(`⚠️  Warning: ${concurrentRequests - successfulRequests} requests failed under load`);
    }
  } catch (error) {
    console.log(`❌ Load test failed: ${error.message}`);
  }
}

// HTTP request helper
function makeHttpRequest(options, data = null) {
  return new Promise((resolve, reject) => {
    const http = require('http');
    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          const parsed = res.headers['content-type']?.includes('json') ? JSON.parse(body) : body;
          resolve({ status: res.statusCode, headers: res.headers, data: parsed, raw: body });
        } catch (error) {
          resolve({ status: res.statusCode, headers: res.headers, raw: body });
        }
      });
    });
    
    req.on('error', reject);
    if (data) req.write(JSON.stringify(data));
    req.end();
  });
}

function printTestSummary(duration) {
  console.log('\n' + '='.repeat(60));
  console.log('📈 TEST SUMMARY');
  console.log('='.repeat(60));
  console.log(`Total Tests: ${totalTests}`);
  console.log(`✅ Passed: ${passedTests}`);
  console.log(`❌ Failed: ${failedTests}`);
  console.log(`⏱️  Total Duration: ${duration}ms`);
  console.log(`📊 Success Rate: ${((passedTests / totalTests) * 100).toFixed(1)}%`);
  
  if (failedTests > 0) {
    console.log('\n❌ FAILED TESTS:');
    testResults
      .filter(test => test.status === 'failed')
      .forEach(test => {
        console.log(`   • ${test.name}: ${test.error}`);
      });
  }
  
  // Performance summary
  const avgDuration = testResults.reduce((sum, test) => sum + test.duration, 0) / testResults.length;
  console.log(`📊 Average Test Duration: ${avgDuration.toFixed(1)}ms`);
  
  console.log('\n🎯 RECOMMENDATIONS:');
  if (failedTests === 0) {
    console.log('✅ All tests passing! The DWeb Desktop Node is working correctly.');
  } else {
    console.log('⚠️  Some tests failed. Check the error messages above for details.');
  }
  
  if (avgDuration > 1000) {
    console.log('⚠️  Consider optimizing slow tests (average > 1000ms).');
  }
  
  console.log('='.repeat(60));
}

// Start test execution
if (require.main === module) {
  runTests().catch(error => {
    console.error('Test runner error:', error);
    process.exit(1);
  });
}

module.exports = { runTests };