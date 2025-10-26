#!/usr/bin/env node

import CDP from 'chrome-remote-interface';

async function collectLogs() {
  try {
    const tabs = await CDP.List({ host: 'localhost', port: 9222 });
    const panelTabs = tabs.filter(t => t.url.includes('panel/index.html')).slice(0, 2);
    
    if (panelTabs.length === 0) {
      console.log('No panel tabs found');
      process.exit(1);
    }
    
    for (let i = 0; i < panelTabs.length; i++) {
      const client = await CDP({ host: 'localhost', port: 9222, target: panelTabs[i] });
      const { Runtime, Console } = client;
      await Runtime.enable();
      await Console.enable();
      
      console.log(`\n=== Browser ${i + 1} Recent Console Logs ===\n`);
      
      // Listen for console events for a few seconds
      const logs = [];
      Console.messageAdded(({ message }) => {
        const text = message.text || '';
        const args = message.args || [];
        
        if (text.includes('[P2P]') || text.includes('peer') || text.includes('exchange')) {
          // Try to extract object values from console.log arguments
          let fullText = text;
          if (args.length > 0) {
            const values = args.map(arg => {
              if (arg.value !== undefined) return arg.value;
              if (arg.description) return arg.description;
              return '[object]';
            });
            if (values.some(v => v !== '[object]')) {
              fullText += ' ' + values.join(' ');
            }
          }
          logs.push(`[${message.level}] ${fullText}`);
        }
      });
      
      // Wait a bit to collect any immediate logs
      await new Promise(r => setTimeout(r, 1000));
      
      if (logs.length > 0) {
        logs.forEach(log => console.log(log));
      } else {
        console.log('No P2P-related logs captured. Triggering peer exchange...');
        
        // Trigger peer exchange and capture logs
        const result = await Runtime.evaluate({
          expression: `
            (async () => {
              try {
                await window.p2pManager.requestPeerExchange(undefined, { force: true, reason: 'logger-test' });
                return 'success';
              } catch (err) {
                return 'error: ' + err.message;
              }
            })()
          `,
          awaitPromise: true,
          returnByValue: true
        });
        
        console.log('Request result:', result.result?.value);
        
        // Wait to collect logs from the request
        await new Promise(r => setTimeout(r, 2000));
        
        console.log('\nCaptured logs after exchange:');
        logs.forEach(log => console.log(log));
      }
      
      await client.close();
    }
    
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

collectLogs();
