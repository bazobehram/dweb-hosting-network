/**
 * Test script to verify protocol handler works
 */

import { createLibp2p } from 'libp2p';
import { tcp } from '@libp2p/tcp';
import { noise } from '@chainsafe/libp2p-noise';
import { mplex } from '@libp2p/mplex';
import { identify } from '@libp2p/identify';

const TEST_PROTOCOL = '/test/echo/1.0.0';

async function main() {
  console.log('[Test] Creating libp2p node...');
  
  const node = await createLibp2p({
    addresses: {
      listen: ['/ip4/127.0.0.1/tcp/0']
    },
    transports: [tcp()],
    connectionEncrypters: [noise()],
    streamMuxers: [mplex()],
    services: {
      identify: identify()
    }
  });
  
  await node.start();
  
  console.log('[Test] Node started');
  console.log('[Test] Peer ID:', node.peerId.toString());
  console.log('[Test] Addresses:', node.getMultiaddrs().map(a => a.toString()));
  
  // Register handler
  console.log(`[Test] Registering handler for ${TEST_PROTOCOL}`);
  
  node.handle(TEST_PROTOCOL, async ({ stream, connection }) => {
    console.log('[Test] === HANDLER CALLED ===');
    console.log('[Test] Connection from:', connection.remotePeer.toString());
    console.log('[Test] Stream:', stream.constructor.name);
  });
  
  console.log('[Test] Handler registered');
  console.log('[Test] Available protocols:', node.getProtocols());
  
  // Keep running
  await new Promise(resolve => setTimeout(resolve, 60000));
  
  await node.stop();
}

main().catch(console.error);
