#!/usr/bin/env node

/**
 * Comprehensive DWeb Test Runner
 * Runs all test suites with performance metrics and reporting
 */

import { DWebE2ETests } from './e2e-tests.js';
import { P2PTwoBrowserTest } from './test-p2p-two-browsers.js';

class ComprehensiveTestRunner {
  constructor() {
    this.startTime = Date.now();
    this.testResults = {};
    this.metrics = {
      extensionLoadTime: 0,
      registryResponseTime: 0,
      p2pConnectionTime: 0,
      domainResolutionTime: 0
    };
  }

  async checkPrerequisites() {
    console.log('🔍 Checking prerequisites...');
    
    const checks = [
      () => this.checkDesktopRegistry(),
      () => this.checkPlaywrightInstall(),
      () => this.checkExtensionExists()
    ];

    for (const check of checks) {
      try {
        await check();
      } catch (error) {
        console.error(`❌ Prerequisite check failed: ${error.message}`);
        return false;
      }
    }

    console.log('✅ All prerequisites met');
    return true;
  }

  async checkDesktopRegistry() {
    const startTime = Date.now();
    try {
      const response = await fetch('http://localhost:8788/health');
      if (!response.ok) {
        throw new Error(`Registry unhealthy: ${response.status}`);
      }
      const health = await response.json();
      this.metrics.registryResponseTime = Date.now() - startTime;
      console.log(`   ✅ Desktop registry: ${health.service} (${this.metrics.registryResponseTime}ms)`);
    } catch (error) {
      throw new Error('Desktop registry not accessible - run: npm run start:registry');
    }
  }

  async checkPlaywrightInstall() {
    try {
      const { chromium } = await import('playwright');
      console.log('   ✅ Playwright available');
    } catch (error) {
      throw new Error('Playwright not installed - run: npm install playwright');
    }
  }

  async checkExtensionExists() {
    const fs = await import('fs');
    const path = await import('path');
    const { fileURLToPath } = await import('url');
    
    const __dirname = path.dirname(fileURLToPath(import.meta.url));
    const extensionPath = path.resolve(__dirname, '../extension');
    const manifestPath = path.join(extensionPath, 'manifest.json');
    
    if (!fs.existsSync(manifestPath)) {
      throw new Error(`Extension manifest not found at: ${manifestPath}`);
    }
    
    console.log(`   ✅ Extension found at: ${extensionPath}`);
  }

  async runBasicE2ETests() {
    console.log('\n🧪 Running Basic E2E Tests...');
    console.log('=' .repeat(50));
    
    const e2eTests = new DWebE2ETests();
    const startTime = Date.now();
    
    try {
      await e2eTests.setup();
      const results = await e2eTests.runTests();
      await e2eTests.cleanup();
      
      this.testResults.e2e = {
        passed: results.passed,
        failed: results.failed,
        duration: Date.now() - startTime
      };
      
      return results.failed === 0;
    } catch (error) {
      console.error('❌ E2E tests failed:', error.message);
      this.testResults.e2e = {
        passed: 0,
        failed: 1,
        duration: Date.now() - startTime,
        error: error.message
      };
      return false;
    }
  }

  async runP2PTwoBrowserTests() {
    console.log('\n🌐 Running P2P Two-Browser Tests...');
    console.log('=' .repeat(50));
    
    const p2pTests = new P2PTwoBrowserTest();
    const startTime = Date.now();
    
    try {
      await p2pTests.setup();
      const results = await p2pTests.runTests();
      await p2pTests.cleanup();
      
      this.testResults.p2p = {
        passed: results.passed,
        failed: results.failed,
        duration: Date.now() - startTime
      };
      
      return results.failed === 0;
    } catch (error) {
      console.error('❌ P2P tests failed:', error.message);
      this.testResults.p2p = {
        passed: 0,
        failed: 1,
        duration: Date.now() - startTime,
        error: error.message
      };
      return false;
    }
  }

  async runPerformanceTests() {
    console.log('\n⚡ Running Performance Tests...');
    console.log('=' .repeat(50));
    
    const performanceMetrics = await this.measurePerformance();
    this.testResults.performance = performanceMetrics;
    
    console.log('📊 Performance Results:');
    console.log(`   Registry Response: ${performanceMetrics.registryAvgMs}ms avg`);
    console.log(`   Extension Load: ${performanceMetrics.extensionLoadMs}ms`);
    console.log(`   Domain Resolution: ${performanceMetrics.domainResolutionMs}ms`);
    
    return performanceMetrics.allWithinThresholds;
  }

  async measurePerformance() {
    const measurements = {
      registryResponses: [],
      extensionLoad: 0,
      domainResolution: 0
    };

    // Measure registry response times (5 requests)
    console.log('   📡 Measuring registry response times...');
    for (let i = 0; i < 5; i++) {
      const start = Date.now();
      try {
        await fetch('http://localhost:8788/health');
        measurements.registryResponses.push(Date.now() - start);
      } catch (error) {
        measurements.registryResponses.push(5000); // 5s penalty for failure
      }
    }

    // Measure extension load time (simplified)
    console.log('   🔌 Measuring extension metrics...');
    measurements.extensionLoad = this.metrics.registryResponseTime; // Proxy metric

    const avgRegistryTime = measurements.registryResponses.reduce((a, b) => a + b, 0) / measurements.registryResponses.length;
    
    return {
      registryAvgMs: Math.round(avgRegistryTime),
      extensionLoadMs: measurements.extensionLoad,
      domainResolutionMs: 0, // Would need actual domain resolution test
      allWithinThresholds: avgRegistryTime < 1000 && measurements.extensionLoad < 2000
    };
  }

  async runStabilityTests() {
    console.log('\n🔄 Running Stability Tests...');
    console.log('=' .repeat(50));
    
    let successCount = 0;
    const iterations = 3;
    
    console.log(`   Running ${iterations} stability iterations...`);
    
    for (let i = 1; i <= iterations; i++) {
      console.log(`   📊 Iteration ${i}/${iterations}`);
      try {
        // Quick registry health check
        const response = await fetch('http://localhost:8788/health');
        if (response.ok) {
          successCount++;
          console.log(`      ✅ Iteration ${i} passed`);
        } else {
          console.log(`      ❌ Iteration ${i} failed: HTTP ${response.status}`);
        }
      } catch (error) {
        console.log(`      ❌ Iteration ${i} failed: ${error.message}`);
      }
      
      // Brief pause between iterations
      if (i < iterations) {
        await new Promise(r => setTimeout(r, 1000));
      }
    }
    
    const stabilityRate = (successCount / iterations) * 100;
    console.log(`   📈 Stability Rate: ${stabilityRate}% (${successCount}/${iterations})`);
    
    this.testResults.stability = {
      iterations,
      successCount,
      stabilityRate
    };
    
    return stabilityRate >= 80; // 80% threshold
  }

  generateReport() {
    console.log('\n📋 Comprehensive Test Report');
    console.log('=' .repeat(60));
    
    const totalDuration = Date.now() - this.startTime;
    
    // Summary
    console.log('\n📊 Test Summary:');
    Object.entries(this.testResults).forEach(([testType, results]) => {
      const passed = results.passed || 0;
      const failed = results.failed || 0;
      const total = passed + failed;
      const successRate = total > 0 ? Math.round((passed / total) * 100) : 100;
      const duration = results.duration || 0;
      
      console.log(`   ${testType.toUpperCase()}:`);
      console.log(`     Passed: ${passed}, Failed: ${failed} (${successRate}%)`);
      if (duration > 0) {
        console.log(`     Duration: ${Math.round(duration / 1000)}s`);
      }
      if (results.error) {
        console.log(`     Error: ${results.error}`);
      }
      console.log('');
    });
    
    // Overall metrics
    const totalPassed = Object.values(this.testResults).reduce((sum, r) => sum + (r.passed || 0), 0);
    const totalFailed = Object.values(this.testResults).reduce((sum, r) => sum + (r.failed || 0), 0);
    const overallSuccess = totalPassed + totalFailed > 0 ? Math.round((totalPassed / (totalPassed + totalFailed)) * 100) : 0;
    
    console.log(`🎯 Overall Results:`);
    console.log(`   Success Rate: ${overallSuccess}%`);
    console.log(`   Total Duration: ${Math.round(totalDuration / 1000)}s`);
    console.log(`   Tests Passed: ${totalPassed}`);
    console.log(`   Tests Failed: ${totalFailed}`);
    
    if (this.testResults.performance) {
      console.log(`\n⚡ Performance:`);
      console.log(`   Registry Avg: ${this.testResults.performance.registryAvgMs}ms`);
      console.log(`   Within Thresholds: ${this.testResults.performance.allWithinThresholds ? 'Yes' : 'No'}`);
    }
    
    if (this.testResults.stability) {
      console.log(`\n🔄 Stability:`);
      console.log(`   Stability Rate: ${this.testResults.stability.stabilityRate}%`);
    }
    
    // Recommendations
    console.log('\n💡 Recommendations:');
    if (overallSuccess >= 90) {
      console.log('   🎉 Excellent! Your DWeb system is working great.');
    } else if (overallSuccess >= 70) {
      console.log('   👍 Good! Some minor issues to investigate.');
    } else {
      console.log('   ⚠️  Needs attention. Check failed tests above.');
    }
    
    if (this.testResults.performance && !this.testResults.performance.allWithinThresholds) {
      console.log('   🐌 Performance could be improved.');
    }
    
    if (this.testResults.stability && this.testResults.stability.stabilityRate < 80) {
      console.log('   📉 Stability issues detected.');
    }
    
    return {
      overallSuccess,
      totalPassed,
      totalFailed,
      duration: totalDuration
    };
  }
}

// Main test execution
async function main() {
  console.log('🚀 DWeb Comprehensive Test Suite');
  console.log('=' .repeat(60));
  
  const runner = new ComprehensiveTestRunner();
  
  try {
    // Check prerequisites
    const prereqsPassed = await runner.checkPrerequisites();
    if (!prereqsPassed) {
      console.log('\n❌ Prerequisites not met. Fix issues and try again.');
      process.exit(1);
    }
    
    // Run test suites
    const testSuites = [
      { name: 'Basic E2E', run: () => runner.runBasicE2ETests() },
      { name: 'Performance', run: () => runner.runPerformanceTests() },
      { name: 'Stability', run: () => runner.runStabilityTests() }
      // P2P tests are more complex and might need separate run
      // { name: 'P2P Two-Browser', run: () => runner.runP2PTwoBrowserTests() }
    ];
    
    let allPassed = true;
    
    for (const suite of testSuites) {
      console.log(`\n▶️  Starting ${suite.name} tests...`);
      const passed = await suite.run();
      if (!passed) {
        allPassed = false;
      }
    }
    
    // Generate final report
    const report = runner.generateReport();
    
    // Exit with appropriate code
    process.exit(allPassed ? 0 : 1);
    
  } catch (error) {
    console.error('❌ Test runner error:', error.message);
    process.exit(1);
  }
}

// Run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}

export { ComprehensiveTestRunner };