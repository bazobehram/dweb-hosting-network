#!/usr/bin/env node

/**
 * Watch bootstrap server logs in real-time
 * Reads from bootstrap-server.log and displays with highlights
 */

import { watch, readFile } from 'fs/promises';
import { existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const LOG_FILE = join(__dirname, '..', 'backend', 'bootstrap-node', 'bootstrap-server.log');

let lastSize = 0;

async function highlightLog(line) {
  const timestamp = new Date().toISOString().split('T')[1].split('.')[0];
  
  // Highlight important logs
  if (line.includes('Peer exchange')) {
    console.log(`\n🔄 ${timestamp} ${line}`);
  } else if (line.includes('Stream type:') || line.includes('Stream properties:')) {
    console.log(`   📊 ${line}`);
  } else if (line.includes('Request data:') || line.includes('Sending response')) {
    console.log(`   💬 ${line}`);
  } else if (line.includes('Peer connected:')) {
    console.log(`\n✅ ${timestamp} ${line}`);
  } else if (line.includes('Peer disconnected:')) {
    console.log(`\n❌ ${timestamp} ${line}`);
  } else if (line.includes('Using fixed Peer ID') || line.includes('Peer ID:')) {
    console.log(`   🆔 ${line}`);
  } else if (line.includes('Listening on:') || line.includes('Node started')) {
    console.log(`   ${line}`);
  } else if (line.includes('ERROR') || line.includes('Error')) {
    console.log(`\n❗ ${timestamp} ${line}`);
  } else if (line.includes('[Bootstrap]') && !line.includes('Status:')) {
    console.log(`   ${timestamp} ${line}`);
  }
}

async function watchLogs() {
  console.log('🔍 Bootstrap Log Watcher\n');
  console.log('Watching:', LOG_FILE);
  console.log('─'.repeat(60));
  
  if (!existsSync(LOG_FILE)) {
    console.log('\n⚠️  Log file not found. Make sure bootstrap is logging to:');
    console.log('   ', LOG_FILE);
    console.log('\nStart bootstrap with:');
    console.log('   npm start > bootstrap-server.log 2>&1');
    process.exit(1);
  }
  
  // Read initial content
  try {
    const content = await readFile(LOG_FILE, 'utf-8');
    const lines = content.split('\n').filter(l => l.trim());
    
    console.log('\n📜 Recent logs:\n');
    lines.slice(-20).forEach(highlightLog);
    
    lastSize = content.length;
  } catch (error) {
    console.error('Error reading log file:', error.message);
  }
  
  console.log('\n\n💡 Watching for new logs...\n');
  console.log('─'.repeat(60));
  
  // Watch for changes
  const watcher = watch(LOG_FILE);
  
  for await (const event of watcher) {
    if (event.eventType === 'change') {
      try {
        const content = await readFile(LOG_FILE, 'utf-8');
        const newContent = content.slice(lastSize);
        
        if (newContent.length > 0) {
          const lines = newContent.split('\n').filter(l => l.trim());
          lines.forEach(highlightLog);
          lastSize = content.length;
        }
      } catch (error) {
        // Ignore read errors during writing
      }
    }
  }
}

// Handle Ctrl+C
process.on('SIGINT', () => {
  console.log('\n\n⏸️  Stopped watching logs\n');
  process.exit(0);
});

watchLogs().catch(console.error);
