// Local HTTPS intercept proxy for *.dweb
// Requirements:
// - mkcert installed and root CA installed (mkcert -install)
// - Provide environment variables CA_CERT and CA_KEY pointing to mkcert rootCA.pem and rootCA-key.pem
//   (you can get the path with `mkcert -CAROOT`).
// - Runs on 127.0.0.1:9090 and forwards *.dweb HTTP/HTTPS to http://127.0.0.1:8790, preserving Host header.

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function start() {
  const { default: Proxy } = await import('http-mitm-proxy');
  const proxy = Proxy();

  const listenHost = process.env.PROXY_HOST || '127.0.0.1';
  const listenPort = Number(process.env.PROXY_PORT || 9090);
  const gatewayUrl = process.env.GATEWAY_URL || 'http://127.0.0.1:8790';

  const caCertPath = process.env.CA_CERT || '';
  const caKeyPath = process.env.CA_KEY || '';

  if (!caCertPath || !caKeyPath) {
    console.error('[dweb-proxy] Missing CA_CERT/CA_KEY. Set to mkcert root files (rootCA.pem/rootCA-key.pem).');
    process.exit(1);
  }
  if (!fs.existsSync(caCertPath) || !fs.existsSync(caKeyPath)) {
    console.error('[dweb-proxy] CA files not found:', caCertPath, caKeyPath);
    process.exit(1);
  }

  proxy.onError((ctx, err) => {
    console.warn('[dweb-proxy:error]', err?.message || err);
  });

  proxy.onConnect((req, socket, head, callback) => {
    // Always MITM to allow presenting *.dweb certificate signed by the provided CA
    return callback();
  });

  proxy.onRequest((ctx, callback) => {
    const host = (ctx.clientToProxyRequest.headers['host'] || '').toLowerCase();
    const isDweb = host.endsWith('.dweb');

    if (isDweb) {
      // Forward to gateway while preserving Host header (domain extraction)
      try {
        const url = new URL(gatewayUrl);
        ctx.proxyToServerRequestOptions.hostname = url.hostname;
        ctx.proxyToServerRequestOptions.port = Number(url.port || (url.protocol === 'https:' ? 443 : 80));
        ctx.proxyToServerRequestOptions.protocol = url.protocol;
        // Preserve Host so gateway can resolve domain
        ctx.proxyToServerRequestOptions.headers = {
          ...ctx.proxyToServerRequestOptions.headers,
          host,
          'x-forwarded-host': host
        };
      } catch (e) {
        console.warn('[dweb-proxy] Bad GATEWAY_URL', gatewayUrl);
      }
    }
    return callback();
  });

  proxy.listen({
    host: listenHost,
    port: listenPort,
    caCert: fs.readFileSync(caCertPath),
    caKey: fs.readFileSync(caKeyPath)
  }, () => {
    console.log(`[dweb-proxy] Listening on ${listenHost}:${listenPort}`);
    console.log(`[dweb-proxy] Forwarding *.dweb to ${gatewayUrl}`);
  });
}

start().catch((e) => {
  console.error(e);
  process.exit(1);
});
