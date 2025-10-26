#!/usr/bin/env node

import CDP from 'chrome-remote-interface';

async function openSecondPanel() {
  try {
    const tabs = await CDP.List({ host: 'localhost', port: 9222 });
    const panelTab = tabs.find(t => t.url.includes('panel/index.html'));
    
    if (!panelTab) {
      console.error('No panel tab found');
      process.exit(1);
    }
    
    // Extract extension ID
    const match = panelTab.url.match(/chrome-extension:\/\/([a-z]+)\//);
    if (!match) {
      console.error('Could not extract extension ID');
      process.exit(1);
    }
    
    const extensionId = match[1];
    const panelUrl = `chrome-extension://${extensionId}/panel/index.html`;
    
    console.log('[Tool] Opening second panel tab...');
    console.log('[Tool] Extension ID:', extensionId);
    
    // Find a regular tab to execute from
    const regularTab = tabs.find(t => !t.url.startsWith('chrome://') && !t.url.startsWith('chrome-extension://')) || tabs[0];
    
    const client = await CDP({ host: 'localhost', port: 9222, target: regularTab });
    const { Runtime } = client;
    await Runtime.enable();
    
    // Open new tab with panel
    await Runtime.evaluate({
      expression: `window.open('${panelUrl}', '_blank')`,
      returnByValue: true
    });
    
    console.log('[Tool] ✓ Second panel opened!');
    console.log('[Tool] Now you can run: node test-two-browsers.js');
    
    await client.close();
    
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

openSecondPanel();
