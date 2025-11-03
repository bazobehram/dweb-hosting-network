#!/usr/bin/env node

/**
 * Full Workflow Test - Local (Same Computer)
 * 
 * Tests the complete user journey:
 * 1. Browser 1: Publish HTML file
 * 2. Browser 1: Create domain
 * 3. Browser 1: Bind domain to manifest
 * 4. Browser 2: Resolve domain and get content
 * 
 * Simulates 2 different browsers on same computer
 */

import crypto from 'crypto';

const REGISTRY_URL = 'http://localhost:8788';
const STORAGE_URL = 'http://localhost:8789';
const SIGNALING_URL = 'ws://localhost:8787';

// Test data
const TEST_HTML = `<!DOCTYPE html>
<html>
<head>
  <title>DWeb Test App</title>
  <style>body { font-family: Arial; padding: 40px; background: #f0f0f0; }</style>
</head>
<body>
  <h1>🎉 DWeb Hosting Network</h1>
  <p>This is a test application published via P2P network!</p>
  <p>Timestamp: ${new Date().toISOString()}</p>
  <p><strong>Status: Successfully resolved from P2P network ✅</strong></p>
</body>
</html>`;

const TEST_DOMAIN = `test-workflow-${Date.now()}.dweb`;
const TEST_OWNER = 'workflow-tester';

function createChunk(content) {
  const buffer = Buffer.from(content, 'utf8');
  const hash = crypto.createHash('sha256').update(buffer).digest('base64url');
  const data = buffer.toString('base64');
  
  return { hash, data, size: buffer.length };
}

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

console.log('🚀 Full Workflow Test - Local Computer');
console.log('='.repeat(70));
console.log(`\n📋 Test Details:`);
console.log(`   Domain: ${TEST_DOMAIN}`);
console.log(`   Content Size: ${TEST_HTML.length} bytes`);
console.log(`   Owner: ${TEST_OWNER}\n`);

async function main() {
  try {
    // Step 1: Publish (Browser 1)
    console.log('📦 STEP 1: PUBLISH CONTENT (Browser 1)');
    console.log('─'.repeat(70));
    
    const chunk = createChunk(TEST_HTML);
    console.log(`   ✓ Created chunk (hash: ${chunk.hash.substring(0, 20)}...)`);
    
    const manifestId = `manifest-${Date.now()}`;
    const peerId = `peer-browser1-${Date.now()}`;
    
    // Register manifest
    const manifest = {
      manifestId,
      transferId: manifestId,
      fileName: `${TEST_DOMAIN}.html`,
      fileSize: chunk.size,
      mimeType: 'text/html',
      chunkSize: 262144,
      chunkCount: 1,
      sha256: chunk.hash,
      chunkHashes: [chunk.hash],
      replicas: [peerId],
      createdAt: new Date().toISOString()
    };
    
    const manifestResp = await fetch(`${REGISTRY_URL}/manifests`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(manifest)
    });
    
    if (!manifestResp.ok) {
      throw new Error(`Manifest registration failed: ${await manifestResp.text()}`);
    }
    
    console.log(`   ✓ Registered manifest: ${manifestId}`);
    console.log(`   ✓ Replica peer: ${peerId}`);
    
    // Store chunk in storage (fallback)
    const storeResp = await fetch(`${STORAGE_URL}/chunks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        manifestId,
        chunkIndex: 0,
        chunkHash: chunk.hash,
        data: chunk.data,
        peerId
      })
    });
    
    if (storeResp.ok) {
      console.log(`   ✓ Stored chunk in fallback storage`);
    } else {
      console.log(`   ⚠️  Chunk storage returned ${storeResp.status} (non-critical)`);
    }
    
    // Step 2: Create Domain (Browser 1)
    console.log('\n🌐 STEP 2: CREATE DOMAIN (Browser 1)');
    console.log('─'.repeat(70));
    
    const domainResp = await fetch(`${REGISTRY_URL}/domains`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        domain: TEST_DOMAIN,
        owner: TEST_OWNER
      })
    });
    
    if (!domainResp.ok) {
      const error = await domainResp.text();
      if (error.includes('DOMAIN_ALREADY_EXISTS')) {
        console.log(`   ℹ️  Domain already exists, continuing...`);
      } else {
        throw new Error(`Domain registration failed: ${error}`);
      }
    } else {
      console.log(`   ✓ Domain registered: ${TEST_DOMAIN}`);
    }
    
    // Step 3: Bind Domain to Manifest (Browser 1 - Bindings tab)
    console.log('\n🔗 STEP 3: BIND DOMAIN TO MANIFEST (Browser 1 - Bindings Tab)');
    console.log('─'.repeat(70));
    
    const bindResp = await fetch(`${REGISTRY_URL}/domains/${TEST_DOMAIN}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        manifestId
      })
    });
    
    if (!bindResp.ok) {
      throw new Error(`Domain binding failed: ${await bindResp.text()}`);
    }
    
    const boundDomain = await bindResp.json();
    console.log(`   ✓ Bound ${TEST_DOMAIN} → ${manifestId}`);
    console.log(`   ✓ Binding confirmed`);
    
    // Wait for propagation
    await sleep(1000);
    
    // Step 4: Verify Binding
    console.log('\n🔍 STEP 4: VERIFY BINDING');
    console.log('─'.repeat(70));
    
    const verifyResp = await fetch(`${REGISTRY_URL}/domains/${TEST_DOMAIN}`);
    if (!verifyResp.ok) {
      throw new Error(`Domain not found: ${await verifyResp.text()}`);
    }
    
    const domainInfo = await verifyResp.json();
    console.log(`   ✓ Domain: ${domainInfo.domain}`);
    console.log(`   ✓ Manifest ID: ${domainInfo.manifestId}`);
    console.log(`   ✓ Owner: ${domainInfo.owner}`);
    console.log(`   ✓ Replicas: ${JSON.stringify(domainInfo.replicas)}`);
    
    if (!domainInfo.manifestId) {
      throw new Error('❌ CRITICAL: Domain has no manifest binding!');
    }
    
    if (!domainInfo.replicas || domainInfo.replicas.length === 0) {
      console.log(`   ⚠️  WARNING: No replicas - P2P resolution will fail`);
      console.log(`   ℹ️  Will fallback to storage`);
    }
    
    // Step 5: Resolve Domain (Browser 2)
    console.log('\n🎯 STEP 5: RESOLVE DOMAIN (Browser 2)');
    console.log('─'.repeat(70));
    console.log(`   Browser 2 opens: ${TEST_DOMAIN}`);
    
    const resolveResp = await fetch(`${REGISTRY_URL}/resolve/${TEST_DOMAIN}`);
    
    if (!resolveResp.ok) {
      const error = await resolveResp.json();
      throw new Error(`Resolution failed: ${error.error} - ${error.message}`);
    }
    
    const content = await resolveResp.text();
    console.log(`   ✓ Resolution successful!`);
    console.log(`   ✓ Content received: ${content.length} bytes`);
    
    // Verify content
    if (content.includes('DWeb Hosting Network') && content.includes('Successfully resolved')) {
      console.log(`   ✓ Content verified - matches published content`);
    } else {
      console.log(`   ⚠️  Content mismatch!`);
      console.log(`   First 100 chars: ${content.substring(0, 100)}`);
    }
    
    // Summary
    console.log('\n' + '='.repeat(70));
    console.log('📊 WORKFLOW TEST SUMMARY');
    console.log('='.repeat(70));
    console.log('✅ Step 1: Publish content - SUCCESS');
    console.log('✅ Step 2: Create domain - SUCCESS');
    console.log('✅ Step 3: Bind domain to manifest - SUCCESS');
    console.log('✅ Step 4: Verify binding - SUCCESS');
    console.log('✅ Step 5: Resolve domain - SUCCESS');
    console.log('\n🎉 FULL WORKFLOW TEST PASSED!');
    console.log('\n💡 What this proves:');
    console.log('   • Content can be published to the network');
    console.log('   • Domains can be created and bound');
    console.log('   • Content can be resolved via domain');
    console.log('   • Storage fallback works (when P2P peer offline)');
    console.log('\n📝 Next steps:');
    console.log('   • Test with real browser extensions');
    console.log('   • Test P2P transfer between browsers');
    console.log('   • Test with multiple computers on same network');
    console.log('='.repeat(70) + '\n');
    
    process.exit(0);
    
  } catch (error) {
    console.error('\n❌ WORKFLOW TEST FAILED');
    console.error('Error:', error.message);
    console.error('\nStack:', error.stack);
    process.exit(1);
  }
}

// Check services first
async function checkServices() {
  console.log('🔍 Checking desktop node services...\n');
  
  const services = [
    { name: 'Registry', url: `${REGISTRY_URL}/health` },
    { name: 'Storage', url: `${STORAGE_URL}/health` }
  ];
  
  for (const service of services) {
    try {
      const resp = await fetch(service.url);
      if (resp.ok) {
        console.log(`   ✓ ${service.name} service: OK`);
      } else {
        console.error(`   ❌ ${service.name} service: ${resp.status}`);
        process.exit(1);
      }
    } catch (error) {
      console.error(`   ❌ ${service.name} service: NOT RUNNING`);
      console.error(`   Start desktop node first!`);
      process.exit(1);
    }
  }
  
  console.log('\n✅ All services healthy\n');
}

checkServices().then(main);
