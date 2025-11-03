#!/usr/bin/env node

/**
 * Inject Test Content into Storage Service
 * Creates actual stored content for the heyheyhey.dweb domain
 */

async function injectContent() {
  console.log('💉 Injecting Test Content into Storage');
  console.log('=' .repeat(50));

  const manifestId = 'tr-1761506346291-4msrw8'; // heyheyhey.dweb manifest
  const testContent = `<html>
<head><title>Fixed Content Test</title></head>
<body>
  <h1>✅ DWeb Resolution Working!</h1>
  <p>This content was served via storage fallback</p>
  <p>Generated: ${new Date().toISOString()}</p>
  <p>Domain: heyheyhey.dweb</p>
  <div id="success-marker">STORAGE_FALLBACK_SUCCESS</div>
</body>
</html>`;

  try {
    // Check storage service
    const healthResponse = await fetch('http://localhost:8789/health');
    if (!healthResponse.ok) {
      console.log('❌ Storage service not running');
      return;
    }
    console.log('✅ Storage service healthy');

    // Inject content as chunk 0
    const chunkData = {
      manifestId,
      chunkIndex: 0,
      data: Buffer.from(testContent).toString('base64')
    };

    const storeResponse = await fetch(`http://localhost:8789/chunks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(chunkData)
    });

    if (storeResponse.ok) {
      console.log('✅ Content injected into storage');
      console.log(`   Manifest: ${manifestId}`);
      console.log(`   Chunk: 0`);
      console.log(`   Size: ${testContent.length} bytes`);
      
      // Verify storage
      const verifyResponse = await fetch(`http://localhost:8789/chunks/${manifestId}/0`);
      if (verifyResponse.ok) {
        const stored = await verifyResponse.json();
        console.log('✅ Content verified in storage');
        
        // Test registry resolver
        console.log('\n🔧 Testing Registry Resolver...');
        const resolverResponse = await fetch('http://localhost:8788/resolve/heyheyhey.dweb');
        if (resolverResponse.ok) {
          const content = await resolverResponse.text();
          console.log('🎉 Registry resolver now working!');
          console.log(`   Content: ${content.length} bytes`);
          
          if (content.includes('STORAGE_FALLBACK_SUCCESS')) {
            console.log('✅ Correct content served');
          }
        } else {
          const error = await resolverResponse.text();
          console.log('❌ Registry resolver still failing:', error);
        }
        
      } else {
        console.log('⚠️  Could not verify stored content');
      }
      
    } else {
      const error = await storeResponse.text();
      console.log('❌ Failed to inject content:', error);
    }

  } catch (error) {
    console.error('❌ Injection failed:', error.message);
  }
}

injectContent().catch(console.error);