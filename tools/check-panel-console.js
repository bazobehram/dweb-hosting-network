#!/usr/bin/env node

import CDP from 'chrome-remote-interface';

async function checkConsole() {
  try {
    const tabs = await CDP.List({ host: 'localhost', port: 9222 });
    const targetTab = tabs.find(t => t.url.includes('panel/index.html'));
    
    if (!targetTab) {
      console.error('Panel not found');
      process.exit(1);
    }
    
    const client = await CDP({ host: 'localhost', port: 9222, target: targetTab });
    const { Runtime, Console } = client;
    
    await Console.enable();
    await Runtime.enable();
    
    console.log('[Console] Listening to panel console...\n');
    
    // Listen to console messages
    Console.messageAdded(({ message }) => {
      const { level, text } = message;
      console.log(`[${level.toUpperCase()}] ${text}`);
    });
    
    // Check what's available
    const checkResult = await Runtime.evaluate({
      expression: `
        (() => {
          return {
            hasP2PManager: typeof window.p2pManager !== 'undefined',
            p2pManagerType: typeof window.p2pManager,
            hasTestLibp2pStart: typeof window.testLibp2pStart !== 'undefined',
            globalKeys: Object.keys(window).filter(k => k.includes('p2p') || k.includes('P2P') || k.includes('test')),
            scripts: Array.from(document.scripts).map(s => s.src).filter(s => s)
          };
        })()
      `,
      returnByValue: true
    });
    
    console.log('\nPanel state:', JSON.stringify(checkResult.result?.value, null, 2));
    
    // Try to manually start p2pManager if test function exists
    const startResult = await Runtime.evaluate({
      expression: `
        (async () => {
          if (typeof window.testLibp2pStart === 'function') {
            const bootstrapAddr = '/dns4/localhost/tcp/9104/ws/p2p/12D3KooWBxBb3jWHkPnvJjRvSfJZG1aZHVqXJYKe4RmXNAVYvUvG';
            try {
              await window.testLibp2pStart(bootstrapAddr);
              return { started: true };
            } catch (error) {
              return { error: error.message };
            }
          }
          return { testFunctionNotFound: true };
        })()
      `,
      returnByValue: true,
      awaitPromise: true
    });
    
    console.log('\nStart attempt:', JSON.stringify(startResult.result?.value, null, 2));
    
    // Wait a bit
    await new Promise(r => setTimeout(r, 3000));
    
    // Check again
    const checkResult2 = await Runtime.evaluate({
      expression: `
        window.p2pManager ? {
          exists: true,
          isStarted: window.p2pManager.isStarted,
          peerId: window.p2pManager.peerId,
          peerCount: window.p2pManager.peers?.size || 0
        } : { exists: false }
      `,
      returnByValue: true
    });
    
    console.log('\nAfter start:', JSON.stringify(checkResult2.result?.value, null, 2));
    
    await client.close();
    
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

checkConsole();
