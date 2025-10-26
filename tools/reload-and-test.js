#!/usr/bin/env node

import CDP from 'chrome-remote-interface';

async function reloadAndTest() {
  try {
    const tabs = await CDP.List({ host: 'localhost', port: 9222 });
    const panelTabs = tabs.filter(t => t.url.includes('panel/index.html'));
    
    console.log('🔄 Reloading all panel tabs...\n');
    
    // Close all existing panel tabs
    for (const tab of panelTabs) {
      const client = await CDP({ host: 'localhost', port: 9222, target: tab });
      const { Runtime } = client;
      await Runtime.enable();
      
      // Reload the page
      await Runtime.evaluate({
        expression: 'location.reload()',
        awaitPromise: false
      });
      
      await client.close();
    }
    
    console.log('⏳ Waiting 5 seconds for reload...\n');
    await new Promise(r => setTimeout(r, 5000));
    
    // Now test
    console.log('🧪 Testing peer exchange...\n');
    
    const newTabs = await CDP.List({ host: 'localhost', port: 9222 });
    const newPanelTabs = newTabs.filter(t => t.url.includes('panel/index.html')).slice(0, 2);
    
    if (newPanelTabs.length < 2) {
      console.log('❌ Need 2 panel tabs');
      process.exit(1);
    }
    
    const BOOTSTRAP_PEER_ID = '12D3KooWDAWy43rvsZXEpaJ7DLBDmuHpcYBLRe4SNCbvW4DKVx99';
    const bootstrapAddr = `/dns4/localhost/tcp/9104/ws/p2p/${BOOTSTRAP_PEER_ID}`;
    
    // Start libp2p on both
    for (let i = 0; i < newPanelTabs.length; i++) {
      const client = await CDP({ host: 'localhost', port: 9222, target: newPanelTabs[i] });
      const { Runtime } = client;
      await Runtime.enable();
      
      console.log(`Starting libp2p on Browser ${i + 1}...`);
      
      await Runtime.evaluate({
        expression: `
          (async () => {
            await window.testLibp2pStart('${bootstrapAddr}');
          })()
        `,
        awaitPromise: true
      });
      
      await client.close();
    }
    
    console.log('\n⏳ Waiting 5 seconds for connections...\n');
    await new Promise(r => setTimeout(r, 5000));
    
    // Test peer exchange
    console.log('🔄 Testing peer exchange...\n');
    
    for (let i = 0; i < newPanelTabs.length; i++) {
      const client = await CDP({ host: 'localhost', port: 9222, target: newPanelTabs[i] });
      const { Runtime } = client;
      await Runtime.enable();
      
      console.log(`Browser ${i + 1}: Requesting peer exchange...`);
      
      const result = await Runtime.evaluate({
        expression: `
          (async () => {
            try {
              await window.p2pManager.requestPeerExchange(undefined, { 
                reason: 'reload-test', 
                force: true 
              });
              return { success: true };
            } catch (error) {
              return { error: error.message };
            }
          })()
        `,
        returnByValue: true,
        awaitPromise: true
      });
      
      console.log(`  Result:`, result.result?.value);
      
      await client.close();
    }
    
    console.log('\n📊 Check bootstrap logs now!');
    console.log('   File: D:\\Projects\\dweb-hosting-network\\backend\\bootstrap-node\\bootstrap-server.log\n');
    
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

reloadAndTest();
