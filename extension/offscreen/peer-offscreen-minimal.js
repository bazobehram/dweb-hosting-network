// Minimal offscreen document for testing
console.log('[Offscreen-Minimal] Loaded successfully');

// Establish keepalive connection with background
const keepalivePort = chrome.runtime.connect({ name: 'offscreen-keepalive' });
keepalivePort.onDisconnect.addListener(() => {
  console.log('[Offscreen-Minimal] Keepalive port disconnected');
});

// Send ready signal immediately
console.log('[Offscreen-Minimal] Sending ready signal...');
chrome.runtime.sendMessage({ type: 'offscreen-ready' }, (response) => {
  if (chrome.runtime.lastError) {
    console.log('[Offscreen-Minimal] Could not send ready signal:', chrome.runtime.lastError.message);
  } else {
    console.log('[Offscreen-Minimal] ✅ Ready signal sent successfully');
  }
});

// Listen for messages
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('[Offscreen-Minimal] Received message:', message.type);
  
  if (message.type === 'start-background-peer') {
    console.log('[Offscreen-Minimal] Start command received (dummy response)');
    sendResponse({ success: true });
    return true;
  }
  
  if (message.type === 'get-peer-status') {
    sendResponse({
      connected: false,
      peerId: null,
      peerCount: 0,
      discoveredCount: 0
    });
    return true;
  }
  
  return false;
});

console.log('[Offscreen-Minimal] All handlers registered');
