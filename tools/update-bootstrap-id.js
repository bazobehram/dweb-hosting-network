#!/usr/bin/env node

import { promises as fs } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createLibp2p } from 'libp2p';
import { webSockets } from '@libp2p/websockets';
import { noise } from '@chainsafe/libp2p-noise';
import { mplex } from '@libp2p/mplex';

const __dirname = dirname(fileURLToPath(import.meta.url));

async function getBootstrapPeerId() {
  // Read from log file - simpler and more reliable
  const logPath = join(__dirname, '..', 'backend', 'bootstrap-node', 'bootstrap-server.log');
  try {
    const logContent = await fs.readFile(logPath, 'utf-8');
    const match = logContent.match(/Peer ID: (12D3Koo[A-Za-z0-9]+)/);
    if (match) {
      return match[1];
    }
    throw new Error('Peer ID not found in log');
  } catch (error) {
    throw new Error(`Could not read bootstrap log: ${error.message}`);
  }
}

async function updateFile(filePath, oldId, newId) {
  const content = await fs.readFile(filePath, 'utf-8');
  const updated = content.replace(new RegExp(oldId, 'g'), newId);
  
  if (content !== updated) {
    await fs.writeFile(filePath, updated, 'utf-8');
    return true;
  }
  return false;
}

async function main() {
  console.log('🔍 Getting current bootstrap peer ID...\n');
  
  try {
    const newPeerId = await getBootstrapPeerId();
    console.log(`✅ Bootstrap Peer ID: ${newPeerId}\n`);
    
    console.log('📝 Updating test scripts...\n');
    
    const files = [
      'reload-and-test.js',
      'test-two-browsers.js',
      'force-dial.js',
      'fresh-test.js',
      'test-with-real-bootstrap.js',
      'playwright-test.js',
      'bootstrap-config.js',
      'comprehensive-test.js'
    ];
    
    // Get old peer IDs by reading one file
    const sampleFile = join(__dirname, files[0]);
    const sampleContent = await fs.readFile(sampleFile, 'utf-8');
    const match = sampleContent.match(/12D3Koo[A-Za-z0-9]+/);
    
    if (!match) {
      console.log('⚠️  No old peer ID found in files');
      return;
    }
    
    const oldPeerId = match[0];
    
    if (oldPeerId === newPeerId) {
      console.log('✓ Peer ID already up to date!');
      return;
    }
    
    console.log(`Replacing: ${oldPeerId}`);
    console.log(`With:      ${newPeerId}\n`);
    
    let updated = 0;
    for (const file of files) {
      const filePath = join(__dirname, file);
      try {
        if (await updateFile(filePath, oldPeerId, newPeerId)) {
          console.log(`✓ Updated ${file}`);
          updated++;
        }
      } catch (error) {
        console.log(`⚠️  Skipped ${file}: ${error.message}`);
      }
    }
    
    console.log(`\n✅ Updated ${updated} file(s)`);
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error('\nMake sure bootstrap server is running:');
    console.error('  cd backend/bootstrap-node');
    console.error('  node bootstrap-server.js');
    process.exit(1);
  }
}

main();
