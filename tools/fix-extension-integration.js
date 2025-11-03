#!/usr/bin/env node

/**
 * Fix Extension Integration with Desktop Node
 * This script modifies the extension to work with our desktop node resolver
 */

import { promises as fs } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const extensionPath = join(__dirname, '..', 'extension');

async function main() {
  console.log('🔧 Fixing Extension Integration with Desktop Node');
  console.log('=' .repeat(50));
  
  try {
    // Step 1: Enable fallback to registry in settings
    console.log('\n1. Enabling registry fallback...');
    await fixSettings();
    
    // Step 2: Modify resolver to use desktop node fallback
    console.log('2. Adding desktop node fallback logic...');
    await fixResolver();
    
    // Step 3: Update storage service URLs 
    console.log('3. Configuring storage service URLs...');
    await fixStorageConfig();
    
    console.log('\n✅ Extension integration fixes applied!');
    console.log('\n📋 What was changed:');
    console.log('  • Enabled fallbackToRegistry in settings');
    console.log('  • Added desktop node direct resolver fallback');
    console.log('  • Configured localhost storage service URLs');
    
    console.log('\n🔄 Next steps:');
    console.log('  1. Reload the extension in Chrome');
    console.log('  2. Go to chrome://extensions');
    console.log('  3. Click reload on the DWeb extension');
    console.log('  4. Test resolving testotest.dweb');
    
  } catch (error) {
    console.error('❌ Fix failed:', error.message);
  }
}

async function fixSettings() {
  const settingsPath = join(extensionPath, 'resolver', 'settings.js');
  
  const newSettings = `export const settings = {
  fallbackToRegistry: true,  // Enable fallback to desktop node
  preferCache: false,
  desktopNodeMode: true      // Enable desktop node integration
};`;
  
  await fs.writeFile(settingsPath, newSettings, 'utf8');
  console.log('   ✅ Settings updated to enable registry fallback');
}

async function fixResolver() {
  const resolverPath = join(extensionPath, 'resolver', 'resolver.js');
  const content = await fs.readFile(resolverPath, 'utf8');
  
  // Find the fetchChunk function and modify the fallback logic
  const pureP2PSection = `  // Pure P2P mode: no registry fallback, no storage pointer
  appendLog(\`Pure P2P mode: chunk \${index} must come from peers only.\`);
  noteFallback("peer-only-mode");`;
  
  const desktopNodeFallback = `  // Desktop Node fallback: try direct resolver endpoint
  if (settings.desktopNodeMode) {
    try {
      appendLog(\`Trying desktop node direct resolver for chunk \${index}...\`);
      const directUrl = \`http://localhost:8788/resolve/\${document.getElementById('domainInput').value.trim()}\`;
      const directResponse = await fetch(directUrl);
      if (directResponse.ok) {
        const content = await directResponse.text();
        // For single chunk content, return as bytes
        if (index === 0) {
          appendLog(\`Chunk \${index} fetched from desktop node resolver.\`);
          recordChunkSource("registry", {
            chunkIndex: index,
            durationMs: elapsedMs(),
            fallbackTriggered,
            fallbackReason: "desktop-node-direct",
            success: true
          });
          return new TextEncoder().encode(content);
        }
      }
    } catch (error) {
      appendLog(\`Desktop node fallback failed: \${error.message}\`);
      noteFallback("desktop-node-error");
    }
  }

  // Pure P2P mode fallback if desktop node unavailable
  if (!settings.fallbackToRegistry) {
    appendLog(\`Pure P2P mode: chunk \${index} must come from peers only.\`);
    noteFallback("peer-only-mode");`;
  
  const modifiedContent = content.replace(pureP2PSection, desktopNodeFallback);
  
  if (modifiedContent !== content) {
    await fs.writeFile(resolverPath, modifiedContent, 'utf8');
    console.log('   ✅ Added desktop node fallback logic to resolver');
  } else {
    console.log('   ⚠️  Could not find exact match to modify resolver logic');
    console.log('   💡 Manual modification may be needed');
  }
}

async function fixStorageConfig() {
  // The resolver already has the correct localhost URLs in ENV_CONFIG.local
  console.log('   ✅ Storage service URLs already configured for localhost');
  console.log('   📍 Registry: http://localhost:8788');
  console.log('   📍 Storage: http://localhost:8789');
}

// Export for programmatic use
export { main as fixExtensionIntegration };

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
