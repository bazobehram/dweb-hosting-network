#!/usr/bin/env node

/**
 * Quick Test Script
 * Fast verification of basic DWeb functionality
 */

async function main() {
  console.log('⚡ DWeb Quick Test');
  console.log('=' .repeat(40));

  let allPassed = true;

  // Test 1: Desktop Registry Health
  console.log('\n1️⃣  Desktop Registry Health');
  try {
    const response = await fetch('http://localhost:8788/health');
    if (response.ok) {
      const health = await response.json();
      console.log(`   ✅ ${health.service}: ${health.status}`);
      console.log(`   📊 ${health.database.domains} domains, ${health.database.manifests} manifests`);
    } else {
      throw new Error(`HTTP ${response.status}`);
    }
  } catch (error) {
    console.log(`   ❌ Registry: ${error.message}`);
    console.log('   💡 Start with: npm run start:registry');
    allPassed = false;
  }

  // Test 2: VPS Fallback
  console.log('\n2️⃣  VPS Fallback Availability');
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 2000);
    
    const response = await fetch('http://34.107.74.70:8788/health', {
      signal: controller.signal
    });
    clearTimeout(timeout);
    
    if (response.ok) {
      console.log('   ✅ VPS registry accessible');
    } else {
      console.log('   ⚠️  VPS registry status:', response.status);
    }
  } catch (error) {
    if (error.name === 'AbortError') {
      console.log('   ⏰ VPS registry timeout (slow connection)');
    } else {
      console.log('   ⚠️  VPS registry:', error.message);
    }
    // VPS fallback issues don't fail the quick test
  }

  // Test 3: Extension Directory
  console.log('\n3️⃣  Extension Structure');
  try {
    const fs = await import('fs');
    const path = await import('path');
    const { fileURLToPath } = await import('url');
    
    const __dirname = path.dirname(fileURLToPath(import.meta.url));
    const extensionPath = path.resolve(__dirname, '../extension');
    
    const requiredFiles = [
      'manifest.json',
      'panel/index.html',
      'resolver/index.html',
      'scripts/api/multiRegistryClient.js'
    ];
    
    for (const file of requiredFiles) {
      const filePath = path.join(extensionPath, file);
      if (fs.existsSync(filePath)) {
        console.log(`   ✅ ${file}`);
      } else {
        console.log(`   ❌ Missing: ${file}`);
        allPassed = false;
      }
    }
  } catch (error) {
    console.log(`   ❌ Extension check: ${error.message}`);
    allPassed = false;
  }

  // Test 4: Playwright Availability
  console.log('\n4️⃣  Test Framework');
  try {
    await import('playwright');
    console.log('   ✅ Playwright installed');
  } catch (error) {
    console.log('   ❌ Playwright missing');
    console.log('   💡 Install: npm install playwright');
    allPassed = false;
  }

  // Results
  console.log('\n' + '='.repeat(40));
  if (allPassed) {
    console.log('🎉 Quick test PASSED');
    console.log('\n📋 Next steps:');
    console.log('   npm run setup:extension  # Setup extension');
    console.log('   npm run test:e2e         # Full E2E tests');
    console.log('   npm run test:p2p         # P2P tests');
  } else {
    console.log('❌ Quick test FAILED');
    console.log('\n🔧 Fix the issues above and rerun');
  }

  process.exit(allPassed ? 0 : 1);
}

main().catch(console.error);