#!/usr/bin/env node

/**
 * Monitor bootstrap server logs in real-time
 * Captures stdout/stderr and displays relevant logs
 */

import { spawn } from 'child_process';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const BOOTSTRAP_DIR = join(__dirname, '..', 'backend', 'bootstrap-node');

console.log('🔍 Bootstrap Server Monitor\n');
console.log('Starting bootstrap server with live monitoring...\n');
console.log('─'.repeat(60));

// Start bootstrap server
const server = spawn('npm', ['start'], {
  cwd: BOOTSTRAP_DIR,
  shell: true,
  stdio: ['pipe', 'pipe', 'pipe']
});

let lastLogTime = Date.now();
const peerExchangeLogs = [];

// Process stdout
server.stdout.on('data', (data) => {
  const lines = data.toString().split('\n').filter(l => l.trim());
  
  lines.forEach(line => {
    const timestamp = new Date().toISOString().split('T')[1].split('.')[0];
    
    // Highlight important logs
    if (line.includes('[Bootstrap] Peer exchange')) {
      console.log(`\n🔄 ${timestamp} ${line}`);
      peerExchangeLogs.push({ time: timestamp, log: line });
    } else if (line.includes('Stream type:') || line.includes('Stream properties:')) {
      console.log(`   📊 ${line}`);
      peerExchangeLogs.push({ time: timestamp, log: line });
    } else if (line.includes('Request data:') || line.includes('Sending response')) {
      console.log(`   💬 ${line}`);
      peerExchangeLogs.push({ time: timestamp, log: line });
    } else if (line.includes('Peer connected:')) {
      console.log(`\n✅ ${timestamp} ${line}`);
    } else if (line.includes('Peer disconnected:')) {
      console.log(`\n❌ ${timestamp} ${line}`);
    } else if (line.includes('Node started') || line.includes('Peer ID:') || line.includes('Listening on:')) {
      console.log(`   ${line}`);
    } else if (line.includes('[Bootstrap]') && !line.includes('Status:')) {
      console.log(`   ${timestamp} ${line}`);
    }
    
    lastLogTime = Date.now();
  });
});

// Process stderr
server.stderr.on('data', (data) => {
  const lines = data.toString().split('\n').filter(l => l.trim());
  lines.forEach(line => {
    console.error(`❗ ERROR: ${line}`);
  });
});

// Handle exit
server.on('close', (code) => {
  console.log(`\n${'─'.repeat(60)}`);
  console.log(`\n🛑 Bootstrap server exited with code ${code}\n`);
  
  if (peerExchangeLogs.length > 0) {
    console.log('📋 Peer Exchange Summary:');
    console.log('─'.repeat(60));
    peerExchangeLogs.forEach(({ time, log }) => {
      console.log(`${time} ${log}`);
    });
  }
  
  process.exit(code);
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n\n⏸️  Stopping bootstrap server...');
  server.kill('SIGINT');
});

// Keep process alive and show status
setInterval(() => {
  const idleTime = Math.floor((Date.now() - lastLogTime) / 1000);
  if (idleTime > 60) {
    process.stdout.write(`\r⏳ Idle for ${idleTime}s... (waiting for activity)`);
  }
}, 5000);

console.log('\n💡 Monitoring bootstrap server...');
console.log('   Press Ctrl+C to stop\n');
