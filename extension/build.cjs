/**
 * Build script for DWeb Extension
 * Bundles libp2p modules for browser compatibility
 */

const esbuild = require('esbuild');
const fs = require('fs');
const path = require('path');

const isWatch = process.argv.includes('--watch');

// Ensure dist directory exists
const distDir = path.join(__dirname, 'dist');
if (!fs.existsSync(distDir)) {
  fs.mkdirSync(distDir, { recursive: true });
}

// Esbuild plugin to ensure it-ws uses the browser WebSocket shim
const aliasItWsWebSocket = {
  name: 'alias-it-ws-web-socket',
  setup(build) {
    // Internal relative import from it-ws/client -> './web-socket.js'
    build.onResolve({ filter: /^\.\/web-socket\.js$/ }, args => {
      if (args.importer && args.importer.includes(`${path.sep}it-ws${path.sep}`)) {
        return { path: path.join(path.dirname(args.importer), 'web-socket.browser.js') };
      }
      return null;
    });
    // Also catch direct imports like 'it-ws/web-socket.js'
    build.onResolve({ filter: /it-ws[\\\/].*web-socket\.js$/ }, args => {
      return { path: args.path.replace('web-socket.js', 'web-socket.browser.js') };
    });
  }
};

const buildOptions = {
  entryPoints: {
    'libp2p-test': path.join(__dirname, 'panel/libp2p-test.js'),
    'p2p-manager': path.join(__dirname, 'scripts/p2p/p2p-manager.js')
  },
  bundle: true,
  format: 'esm',
  outdir: path.join(__dirname, 'dist'),
  platform: 'browser',
  target: 'es2020',
  sourcemap: true,
  logLevel: 'info',
  plugins: [aliasItWsWebSocket],
  alias: {
    'ws': path.join(__dirname, 'browser-shims/ws.js')
  },
  external: [
    // Keep Chrome extension APIs as external
    'chrome',
    // Keep relative imports external (our own modules)
    '../scripts/webrtc/*',
    '../scripts/api/*',
    '../scripts/crypto/*',
    '../scripts/telemetry/*'
  ]
};

async function build() {
  try {
    if (isWatch) {
      console.log('👀 Watching for changes...');
      const ctx = await esbuild.context(buildOptions);
      await ctx.watch();
    } else {
      console.log('🔨 Building extension bundles...');
      await esbuild.build(buildOptions);
      console.log('✅ Build complete!');
    }
  } catch (error) {
    console.error('❌ Build failed:', error);
    process.exit(1);
  }
}

build();
