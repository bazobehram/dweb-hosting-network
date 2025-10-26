#!/usr/bin/env node

import CDP from 'chrome-remote-interface';

async function captureLogs() {
  try {
    const tabs = await CDP.List({ host: 'localhost', port: 9222 });
    const panelTab = tabs.find(t => t.url.includes('panel/index.html'));
    
    if (!panelTab) {
      console.error('No panel tab found');
      process.exit(1);
    }
    
    const client = await CDP({ host: 'localhost', port: 9222, target: panelTab });
    const { Runtime, Console } = client;
    
    await Console.enable();
    await Runtime.enable();
    
    console.log('📝 Capturing console logs for 10 seconds...\n');
    console.log('─'.repeat(60));
    
    const logs = [];
    
    // Listen to console
    Console.messageAdded(({ message }) => {
      const { level, text } = message;
      const log = `[${level.toUpperCase()}] ${text}`;
      console.log(log);
      logs.push(log);
    });
    
    // Trigger peer exchange
    console.log('\n🔄 Triggering peer exchange...\n');
    
    await Runtime.evaluate({
      expression: `
        (async () => {
          console.log('[CAPTURE-TEST] Starting peer exchange...');
          try {
            await window.p2pManager.requestPeerExchange(undefined, { 
              reason: 'capture-test', 
              force: true 
            });
            console.log('[CAPTURE-TEST] Peer exchange completed');
          } catch (error) {
            console.error('[CAPTURE-TEST] Peer exchange failed:', error.message);
            console.error('[CAPTURE-TEST] Stack:', error.stack);
          }
        })()
      `,
      awaitPromise: true
    });
    
    // Wait for logs
    await new Promise(r => setTimeout(r, 3000));
    
    console.log('\n' + '─'.repeat(60));
    console.log(`\n📊 Captured ${logs.length} log entries`);
    
    // Filter for peer exchange related logs
    const peerExchangeLogs = logs.filter(l => 
      l.includes('Peer exchange') || 
      l.includes('dialProtocol') ||
      l.includes('CAPTURE-TEST') ||
      l.includes('ERROR') ||
      l.includes('Error')
    );
    
    if (peerExchangeLogs.length > 0) {
      console.log('\n🔍 Peer exchange related logs:');
      peerExchangeLogs.forEach(l => console.log('  ', l));
    }
    
    await client.close();
    
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

captureLogs();
