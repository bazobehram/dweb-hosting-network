#!/usr/bin/env node

/**
 * DWeb P2P Resolution Diagnostic
 * Identifies why domains with manifests can't resolve content
 */

async function main() {
  console.log('🔍 DWeb P2P Resolution Diagnostic');
  console.log('=' .repeat(50));
  
  const problemDomain = 'heyheyhey.dweb';
  
  // 1. Check domain record
  console.log('\n1️⃣  Domain Record Analysis');
  try {
    const domainResponse = await fetch(`http://localhost:8788/domains/${problemDomain}`);
    if (domainResponse.ok) {
      const domain = await domainResponse.json();
      console.log('✅ Domain found:', domain.domain);
      console.log('📄 Manifest ID:', domain.manifestId);
      console.log('👤 Owner:', domain.owner);
      console.log('📅 Created:', domain.createdAt);
      
      // Check for replicas in domain record
      if (domain.replicas) {
        console.log('✅ Domain has replicas:', domain.replicas);
      } else {
        console.log('❌ Domain record missing replicas field');
        console.log('💡 This is likely the root issue');
      }
    } else {
      console.log('❌ Domain not found:', problemDomain);
      return;
    }
  } catch (error) {
    console.log('❌ Domain check failed:', error.message);
    return;
  }
  
  // 2. Check manifest record
  console.log('\n2️⃣  Manifest Record Analysis');
  try {
    const manifestResponse = await fetch(`http://localhost:8788/manifests/tr-1761506346291-4msrw8`);
    if (manifestResponse.ok) {
      const manifest = await manifestResponse.json();
      console.log('✅ Manifest found:', manifest.fileName);
      console.log('📊 File size:', manifest.fileSize, 'bytes');
      console.log('🧩 Chunks:', manifest.chunkCount);
      console.log('🔗 Transfer ID:', manifest.transferId);
      
      if (manifest.replicas && manifest.replicas.length > 0) {
        console.log('✅ Manifest has replicas:', manifest.replicas);
        console.log('🎯 Replica count:', manifest.replicas.length);
        
        // The issue: manifest has replicas but domain doesn't
        console.log('\n❌ ISSUE IDENTIFIED:');
        console.log('   • Manifest HAS replicas:', manifest.replicas);
        console.log('   • Domain record MISSING replicas field');
        console.log('   • Extension resolver uses domain record, not manifest');
        console.log('   • This breaks P2P chunk resolution');
      } else {
        console.log('❌ Manifest missing replicas');
      }
    } else {
      console.log('❌ Manifest not found');
    }
  } catch (error) {
    console.log('❌ Manifest check failed:', error.message);
  }
  
  // 3. Check all domains to see if this is systemic
  console.log('\n3️⃣  System-wide Analysis');
  try {
    const domainsResponse = await fetch('http://localhost:8788/domains');
    if (domainsResponse.ok) {
      const allDomains = await domainsResponse.json();
      const domains = allDomains.domains || [];
      
      console.log(`📊 Total domains in registry: ${domains.length}`);
      
      let withReplicas = 0;
      let withoutReplicas = 0;
      
      for (const domain of domains.slice(0, 10)) { // Check first 10
        if (domain.replicas && domain.replicas.length > 0) {
          withReplicas++;
        } else {
          withoutReplicas++;
          console.log(`   ⚠️  ${domain.domain} - missing replicas`);
        }
      }
      
      console.log(`✅ Domains with replicas: ${withReplicas}`);
      console.log(`❌ Domains without replicas: ${withoutReplicas}`);
      
      if (withoutReplicas > 0) {
        console.log('\n🔧 SYSTEMATIC ISSUE DETECTED:');
        console.log('   Multiple domains missing replicas in domain records');
        console.log('   This suggests a sync issue between manifest and domain data');
      }
    }
  } catch (error) {
    console.log('❌ System check failed:', error.message);
  }
  
  // 4. Check registry API endpoints
  console.log('\n4️⃣  Registry API Endpoints');
  const endpoints = [
    '/health',
    '/domains',
    '/manifests'
  ];
  
  for (const endpoint of endpoints) {
    try {
      const response = await fetch(`http://localhost:8788${endpoint}`);
      console.log(`${response.ok ? '✅' : '❌'} ${endpoint}: HTTP ${response.status}`);
    } catch (error) {
      console.log(`❌ ${endpoint}: ${error.message}`);
    }
  }
  
  // 5. Proposed solutions
  console.log('\n💡 Recommended Solutions:');
  console.log('\n🔧 IMMEDIATE FIXES:');
  console.log('   1. Modify domain registration to include replicas');
  console.log('   2. Update existing domains with manifest replica data');
  console.log('   3. Ensure domain/manifest sync during upload');
  
  console.log('\n📝 CODE CHANGES NEEDED:');
  console.log('   • Registry service: sync replicas between manifest → domain');
  console.log('   • Extension panel: verify replica propagation after upload');
  console.log('   • Extension resolver: fallback to manifest replicas if domain missing them');
  
  console.log('\n🧪 TESTING STEPS:');
  console.log('   1. Fix replica sync in registry');
  console.log('   2. Upload new content and verify domain has replicas');
  console.log('   3. Test resolution works end-to-end');
  console.log('   4. Update existing broken domains');
  
  // 6. Extension resolver patch suggestion
  console.log('\n🩹 TEMPORARY RESOLVER PATCH:');
  console.log('   In resolver.js, modify getDomain() to:');
  console.log('   ```javascript');
  console.log('   if (!record.replicas && record.manifestId) {');
  console.log('     const manifest = await getManifest(record.manifestId);');
  console.log('     record.replicas = manifest.replicas || [];');
  console.log('   }');
  console.log('   ```');
}

main().catch(console.error);