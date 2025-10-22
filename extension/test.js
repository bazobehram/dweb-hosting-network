document.getElementById('extId').textContent = chrome.runtime.id;
document.getElementById('status').textContent = '✅ Working';

function openFullPanel() {
    chrome.tabs.create({ url: chrome.runtime.getURL('panel/index.html') });
}

async function testBackground() {
    try {
        const response = await chrome.runtime.sendMessage({ type: 'ping' });
        alert('✅ Background service responds: ' + JSON.stringify(response));
    } catch (error) {
        alert('❌ Background service error: ' + error.message);
    }
}

// Make functions global
window.openFullPanel = openFullPanel;
window.testBackground = testBackground;

console.log('Test panel loaded successfully');
