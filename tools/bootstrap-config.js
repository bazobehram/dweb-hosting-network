/**
 * Bootstrap server configuration
 * This Peer ID is FIXED and will never change (derived from FIXED_PRIVATE_KEY)
 */

// Fixed Peer ID (from bootstrap server's FIXED_PRIVATE_KEY)
export const BOOTSTRAP_PEER_ID = '12D3KooWQYzUbggz4RfYvHmKUdYDzHqG3r7MR4YzL8jPMTzJGQRa';

// Bootstrap multiaddr with fixed peer ID
export const BOOTSTRAP_MULTIADDR = `/dns4/localhost/tcp/9104/ws/p2p/${BOOTSTRAP_PEER_ID}`;

console.log('[Config] Bootstrap Peer ID:', BOOTSTRAP_PEER_ID);
console.log('[Config] Bootstrap multiaddr:', BOOTSTRAP_MULTIADDR);
