// Browser shim for 'ws' package - use native WebSocket
export default typeof WebSocket !== 'undefined' ? WebSocket : class {};
