const CDP = require('chrome-remote-interface');

async function debugPanel() {
  try {
    const targets = await CDP.List();
    
    console.log('\n🔍 All Available Targets:\n');
    targets.forEach((t, i) => {
      console.log(`${i + 1}. Type: ${t.type}`);
      console.log(`   URL: ${t.url}`);
      console.log(`   ID: ${t.id}`);
      console.log(`   Title: ${t.title || '(no title)'}\n`);
    });
    
    const extensionPanels = targets.filter(t => 
      t.url && t.url.includes('chrome-extension://') && t.url.includes('panel')
    );
    
    if (extensionPanels.length === 0) {
      console.log('❌ No extension panels found\n');
      return;
    }
    
    console.log(`\n📊 Testing ${extensionPanels.length} panel target(s):\n`);
    
    for (const panel of extensionPanels) {
      console.log(`\n${'='.repeat(60)}`);
      console.log(`Target: ${panel.url}`);
      console.log('='.repeat(60));
      
      const client = await CDP({ target: panel.id });
      const { Runtime } = client;
      
      try {
        await Runtime.enable();
        
        // Check basic document state
        const docState = await Runtime.evaluate({
          expression: `JSON.stringify({
            readyState: document.readyState,
            bodyExists: !!document.body,
            bodyHTML: document.body ? document.body.innerHTML.substring(0, 200) : null,
            scriptsLoaded: document.scripts.length,
            hasWindow: typeof window !== 'undefined',
            hasP2P: typeof window.p2pManager !== 'undefined',
            hasTestFn: typeof window.testLibp2pStart !== 'undefined'
          })`
        });
        
        if (docState.result?.value) {
          const state = JSON.parse(docState.result.value);
          console.log('\nDocument State:');
          console.log(`  Ready State: ${state.readyState}`);
          console.log(`  Body Exists: ${state.bodyExists}`);
          console.log(`  Scripts Loaded: ${state.scriptsLoaded}`);
          console.log(`  Window Available: ${state.hasWindow}`);
          console.log(`  P2P Manager: ${state.hasP2P ? '✅' : '❌'}`);
          console.log(`  Test Function: ${state.hasTestFn ? '✅' : '❌'}`);
          
          if (state.bodyHTML) {
            console.log(`\nBody Preview:\n  ${state.bodyHTML.substring(0, 150)}...`);
          }
        }
        
      } catch (error) {
        console.error(`  Error inspecting panel: ${error.message}`);
      } finally {
        await client.close();
      }
    }
    
    console.log('\n' + '='.repeat(60) + '\n');
    
  } catch (error) {
    console.error('Debug failed:', error.message);
  }
}

debugPanel();
