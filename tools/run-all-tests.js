#!/usr/bin/env node

/**
 * Master Test Runner
 * Runs all automated tests to verify bug fixes
 */

import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const tests = [
  {
    name: 'API End-to-End Test',
    script: 'test-api-e2e.js',
    description: 'Tests registry, storage, and resolver APIs'
  },
  {
    name: 'Peer Count Stability Test',
    script: 'test-peer-count-stability.js',
    description: 'Verifies peer count doesn\'t increase on refresh'
  }
];

async function runTest(test) {
  return new Promise((resolve) => {
    console.log(`\n${'='.repeat(70)}`);
    console.log(`🧪 Running: ${test.name}`);
    console.log(`   ${test.description}`);
    console.log('='.repeat(70));
    
    const testPath = path.join(__dirname, test.script);
    const proc = spawn('node', [testPath], {
      stdio: 'inherit',
      shell: true
    });
    
    proc.on('close', (code) => {
      const passed = code === 0;
      resolve({
        name: test.name,
        script: test.script,
        passed,
        exitCode: code
      });
    });
    
    proc.on('error', (error) => {
      console.error(`Error running ${test.name}:`, error);
      resolve({
        name: test.name,
        script: test.script,
        passed: false,
        error: error.message
      });
    });
  });
}

async function main() {
  console.log('🚀 DWeb Hosting Network - Master Test Suite');
  console.log('='.repeat(70));
  console.log(`Running ${tests.length} test(s)...\n`);
  
  const results = [];
  
  for (const test of tests) {
    const result = await runTest(test);
    results.push(result);
  }
  
  // Summary
  console.log('\n' + '='.repeat(70));
  console.log('📊 TEST SUMMARY');
  console.log('='.repeat(70));
  
  const passed = results.filter(r => r.passed).length;
  const failed = results.filter(r => !r.passed).length;
  
  results.forEach(result => {
    const icon = result.passed ? '✅' : '❌';
    const status = result.passed ? 'PASS' : 'FAIL';
    console.log(`${icon} ${result.name}: ${status}`);
    if (result.error) {
      console.log(`   Error: ${result.error}`);
    }
  });
  
  console.log('\n' + '-'.repeat(70));
  console.log(`Total: ${passed} passed, ${failed} failed`);
  console.log('='.repeat(70));
  
  if (failed === 0) {
    console.log('\n🎉 All tests passed!\n');
    process.exit(0);
  } else {
    console.log(`\n⚠️  ${failed} test(s) failed\n`);
    process.exit(1);
  }
}

main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
