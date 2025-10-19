// Service worker for the DWeb Hosting Network extension.

const peerChunkQueue = [];
const pendingChunkResponses = new Map();
const REQUEST_TIMEOUT = 2000;

chrome.runtime.onInstalled.addListener(() => {
  console.log('DWeb Hosting Network extension installed');
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || typeof message !== 'object') {
    return false;
  }

  if (message.type === 'ping') {
    sendResponse({ ok: true, time: Date.now() });
    return true;
  }

  if (message.type === 'peer-chunk-request') {
    const { manifestId, chunkIndex, replicas } = message;
    const requestId = `${manifestId}:${chunkIndex}:${Date.now()}`;

    console.log('[SW] Peer chunk request', { manifestId, chunkIndex, replicas, requestId });

    peerChunkQueue.push({ requestId, manifestId, chunkIndex, replicas, requestedAt: Date.now() });
    const timeout = setTimeout(() => {
      if (pendingChunkResponses.has(requestId)) {
        const responder = pendingChunkResponses.get(requestId);
        responder({ status: 'timeout' });
        pendingChunkResponses.delete(requestId);
      }
    }, REQUEST_TIMEOUT);

    pendingChunkResponses.set(requestId, (response) => {
      clearTimeout(timeout);
      sendResponse(response);
    });

    chrome.runtime.sendMessage(
      {
        type: 'peer-chunk-request-dispatch',
        requestId,
        manifestId,
        chunkIndex,
        replicas
      },
      () => {
        if (chrome.runtime.lastError) {
          const responder = pendingChunkResponses.get(requestId);
          if (responder) {
            responder({ status: 'unavailable' });
            pendingChunkResponses.delete(requestId);
          }
        }
      }
    );

    return true;
  }

  if (message.type === 'peer-chunk-response') {
    const { requestId, status, data, reason } = message;
    const responder = pendingChunkResponses.get(requestId);
    if (responder) {
      responder({ status: status ?? 'success', data, reason });
      pendingChunkResponses.delete(requestId);
    }
    return true;
  }

  return false;
});
