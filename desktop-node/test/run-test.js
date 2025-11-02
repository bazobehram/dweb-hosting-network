/**
 * Test Runner for Desktop Node
 * Starts all services and runs API compatibility tests
 */

const RegistryService = require('../services/registry');
const SignalingService = require('../services/signaling');
const StorageService = require('../services/storage');

class TestRunner {
  constructor() {
    this.services = [];
  }

  async startServices() {
    console.log('🚀 Starting desktop node services for testing...\n');

    // Start registry service
    const registry = new RegistryService({ port: 8788 });
    await registry.start();
    this.services.push(registry);

    // Start signaling service
    const signaling = new SignalingService({ port: 8787 });
    await signaling.start();
    this.services.push(signaling);

    // Start storage service
    const storage = new StorageService({ port: 8789 });
    await storage.start();
    this.services.push(storage);

    console.log('\n✅ All services started successfully!\n');
    
    // Give services a moment to fully initialize
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  async stopServices() {
    console.log('\n🛑 Stopping services...');
    
    for (const service of this.services) {
      try {
        await service.stop();
      } catch (error) {
        console.error('Error stopping service:', error.message);
      }
    }
    
    console.log('✅ All services stopped');
  }

  async runTests() {
    try {
      await this.startServices();
      
      console.log('🧪 Running API compatibility tests...\n');
      
      // Import and run the API test
      const { APITester } = require('./api-test.js');
      const tester = new APITester();
      await tester.runAllTests();
      
    } catch (error) {
      console.error('❌ Test runner failed:', error);
      process.exit(1);
    } finally {
      await this.stopServices();
    }
  }
}

// Standalone execution
if (require.main === module) {
  const runner = new TestRunner();
  
  runner.runTests().then(() => {
    console.log('\n🎉 All tests completed!');
    process.exit(0);
  }).catch(error => {
    console.error('\n❌ Test runner failed:', error);
    process.exit(1);
  });
  
  // Graceful shutdown on interruption
  process.on('SIGINT', async () => {
    console.log('\n\n⚠️ Test interrupted, cleaning up...');
    await runner.stopServices();
    process.exit(130);
  });
}

module.exports = TestRunner;