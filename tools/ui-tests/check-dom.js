import CDP from 'chrome-remote-interface';

async function checkDOM() {
  const tabs = await CDP.List();
  const panel = tabs.find(t => t.url.includes('panel'));
  
  if (!panel) {
    console.log('❌ No panel tab found');
    return;
  }
  
  const client = await CDP({target: panel.id});
  await client.Runtime.enable();
  
  const result = await client.Runtime.evaluate({
    expression: `({
      authOverlayHidden: document.querySelector('#authOverlay')?.classList.contains('hidden'),
      sidebar: !!document.querySelector('.sidebar'),
      navItemsCount: document.querySelectorAll('.nav-item').length,
      dashboardTab: !!document.querySelector('.nav-item[data-view="dashboard"]'),
      hostingTab: !!document.querySelector('.nav-item[data-view="hosting"]'),
      bodyClasses: document.body.className
    })`,
    returnByValue: true
  });
  
  console.log('DOM STATE:', JSON.stringify(result.result.value, null, 2));
  
  await client.close();
}

checkDOM().catch(console.error);
