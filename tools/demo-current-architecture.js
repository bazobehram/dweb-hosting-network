#!/usr/bin/env node

/**
 * DWeb Desktop Node + Extension Architecture Demo
 * Shows how MultiRegistryClient works with desktop node detection
 */

async function main() {
  console.log('🏗️  DWeb Current Architecture Demo');
  console.log('=' .repeat(60));

  // 1. Desktop Node Registry Status
  console.log('\n1. 🖥️  Desktop Node Registry Status');
  await checkDesktopRegistry();

  // 2. VPS Fallback Status
  console.log('\n2. ☁️  VPS Fallback Status');
  await checkVPSRegistry();

  // 3. MultiRegistryClient Logic
  console.log('\n3. 🔌 MultiRegistryClient Behavior');
  demonstrateMultiRegistryLogic();

  // 4. Extension Integration
  console.log('\n4. 🧩 Extension Integration Points');
  showExtensionIntegration();

  // 5. P2P + Registry Flow
  console.log('\n5. 🌐 P2P + Registry Resolution Flow');
  showResolutionFlow();

  console.log('\n✅ Architecture Demo Complete!');
  console.log('\n💡 Key Benefits:');
  console.log('   • Seamless desktop/cloud switching');
  console.log('   • Health monitoring every 30s'); 
  console.log('   • Pure P2P with registry coordination');
  console.log('   • Automatic fallback on desktop node failure');
}

async function checkDesktopRegistry() {
  try {
    const response = await fetch('http://localhost:8788/health');
    if (response.ok) {
      const health = await response.json();
      console.log(`   ✅ Status: ${health.status}`);
      console.log(`   🔧 Service: ${health.service} v${health.version}`);
      console.log(`   💾 Database: ${health.database.database}`);
      console.log(`   📊 Domains: ${health.database.domains}, Manifests: ${health.database.manifests}`);
      
      // Show some domains if available
      try {
        const domainsResponse = await fetch('http://localhost:8788/domains');
        if (domainsResponse.ok) {
          const domains = await domainsResponse.json();
          const count = domains?.domains?.length || 0;
          console.log(`   🌐 Registered Domains: ${count}`);
          if (count > 0) {
            const samples = domains.domains.slice(0, 3).map(d => d.domain).join(', ');
            console.log(`      Samples: ${samples}${count > 3 ? '...' : ''}`);
          }
        }
      } catch {}
      
    } else {
      console.log(`   ❌ Unhealthy: HTTP ${response.status}`);
    }
  } catch (error) {
    console.log(`   ❌ Not accessible: ${error.message}`);
    console.log('   💡 Start with: npm run start:registry');
  }
}

async function checkVPSRegistry() {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000); // 3s timeout

    const response = await fetch('http://34.107.74.70:8788/health', {
      signal: controller.signal
    });
    clearTimeout(timeout);
    
    if (response.ok) {
      const health = await response.json();
      console.log(`   ✅ VPS Registry: ${health.status}`);
      console.log(`   🌍 Service: ${health.service} v${health.version}`);
    } else {
      console.log(`   ⚠️  VPS Registry: HTTP ${response.status}`);
    }
  } catch (error) {
    if (error.name === 'AbortError') {
      console.log('   ⏰ VPS Registry: Timeout (slow connection)');
    } else {
      console.log(`   ❌ VPS Registry: ${error.message}`);
    }
  }
}

function demonstrateMultiRegistryLogic() {
  console.log('   🔍 Health Check Logic:');
  console.log('      • Checks localhost:8788/health every 30s');
  console.log('      • If healthy → use desktop node');
  console.log('      • If unhealthy → fallback to VPS');
  console.log('      • Real-time switching during operations');
  
  console.log('\n   ⚡ Fallback Scenarios:');
  console.log('      • Desktop node offline → VPS automatically');
  console.log('      • Network timeout → VPS fallback');
  console.log('      • API errors → Retry with VPS');
  console.log('      • Extension detects and adapts');
}

function showExtensionIntegration() {
  console.log('   📱 Resolver Integration:');
  console.log('      • MultiRegistryClient detects best endpoint');
  console.log('      • Domain lookup: /domains/{domain}');
  console.log('      • Manifest fetch: /manifests/{id}');
  console.log('      • Health status visible in UI');
  
  console.log('\n   🔧 Panel Integration:');
  console.log('      • Upload uses active registry endpoint');
  console.log('      • Domain registration auto-routed');
  console.log('      • Status indicators show desktop/VPS');
  console.log('      • Settings allow manual preference override');
}

function showResolutionFlow() {
  console.log('   1️⃣  Domain Request (testotest.dweb)');
  console.log('      └─ MultiRegistryClient → localhost:8788/domains/testotest.dweb');
  
  console.log('\n   2️⃣  Manifest Lookup');
  console.log('      └─ Registry returns manifestId + replica list');
  
  console.log('\n   3️⃣  P2P Chunk Resolution');
  console.log('      └─ Try peers first (pure P2P mode)');
  console.log('      └─ No registry fallback for chunks');
  
  console.log('\n   4️⃣  Content Assembly');
  console.log('      └─ Combine chunks → display in iframe');
  
  console.log('\n   📊 Telemetry & Stats');
  console.log('      └─ Track peer hits, resolution times, fallbacks');
}

// Run demo
main().catch(console.error);