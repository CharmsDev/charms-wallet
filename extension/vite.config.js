import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { babel } from '@rollup/plugin-babel';
import inject from '@rollup/plugin-inject';
import wasm from 'vite-plugin-wasm';
import topLevelAwait from 'vite-plugin-top-level-await';
import { resolve } from 'path';
import { copyFileSync, mkdirSync, existsSync } from 'fs';

// Copy static files to dist after build
function copyStaticFiles(isDev = false) {
  return {
    name: 'copy-static-files',
    closeBundle() {
      const distDir = resolve(__dirname, 'dist');
      const iconsDir = resolve(distDir, 'icons');
      
      // Create icons directory
      if (!existsSync(iconsDir)) {
        mkdirSync(iconsDir, { recursive: true });
      }
      
      // Copy the appropriate manifest: dev build uses manifest.dev.json (includes localhost),
      // production build uses manifest.json (production domains only).
      const manifestSrc = isDev
        ? resolve(__dirname, 'manifest.dev.json')
        : resolve(__dirname, 'manifest.json');
      copyFileSync(manifestSrc, resolve(distDir, 'manifest.json'));
      
      // Copy background.js
      copyFileSync(
        resolve(__dirname, 'background.js'),
        resolve(distDir, 'background.js')
      );
      
      // Copy content-script.js
      copyFileSync(
        resolve(__dirname, 'content-script.js'),
        resolve(distDir, 'content-script.js')
      );
      
      // Copy inpage.js (wallet provider injected into web pages)
      copyFileSync(
        resolve(__dirname, 'inpage.js'),
        resolve(distDir, 'inpage.js')
      );
      
      // Copy approve.html and approve.js (connection approval popup)
      copyFileSync(
        resolve(__dirname, 'approve.html'),
        resolve(distDir, 'approve.html')
      );
      copyFileSync(
        resolve(__dirname, 'approve.js'),
        resolve(distDir, 'approve.js')
      );
      
      // approve-sign.html is built by Vite as a second entry point
      // (no manual copy needed — Vite outputs it to dist automatically)
      
      // Copy icons
      ['icon16.png', 'icon48.png', 'icon128.png'].forEach(icon => {
        const src = resolve(__dirname, 'icons', icon);
        if (existsSync(src)) {
          copyFileSync(src, resolve(iconsDir, icon));
        }
      });

      // Copy Charms logo
      const logoSrc = resolve(__dirname, 'logo.png');
      if (existsSync(logoSrc)) {
        copyFileSync(logoSrc, resolve(distDir, 'logo.png'));
      }

      // Copy toad-token.wasm for BRO token transfers (legacy path, kept
      // until E015 retires it).
      const tokenWasmSrc = resolve(__dirname, 'toad-token.wasm');
      if (existsSync(tokenWasmSrc)) {
        copyFileSync(tokenWasmSrc, resolve(distDir, 'toad-token.wasm'));
      }

      // Mirror wallet's public/wasm/ into dist/wasm/ so that
      // @/services/beam/chains/wasm-loader.js (which fetches
      // '/wasm/<name>.wasm') resolves identically in the extension build.
      // Source of truth: wallet/public/wasm/. The CI guard
      // (extension-ci.yml) catches drift on SHA when E020 ships the
      // wasm-sha check.
      const walletWasmDir = resolve(__dirname, '../wallet/public/wasm');
      const distWasmDir = resolve(distDir, 'wasm');
      if (existsSync(walletWasmDir)) {
        if (!existsSync(distWasmDir)) mkdirSync(distWasmDir, { recursive: true });
        for (const name of ['ebtc.wasm', 'bro-token.wasm', 'toad-token.wasm']) {
          const src = resolve(walletWasmDir, name);
          if (existsSync(src)) {
            copyFileSync(src, resolve(distWasmDir, name));
          }
        }
      }
    }
  };
}

export default defineConfig(({ mode }) => {
  const isDev = mode === 'development';
  // Load env file from extension directory
  const env = loadEnv(mode, __dirname, 'VITE_');
  
  // Map VITE_* variables to NEXT_PUBLIC_* for wallet code compatibility
  const envDefines = {
    'process.env.NEXT_PUBLIC_BITCOIN_NETWORK': JSON.stringify(env.VITE_BITCOIN_NETWORK || 'mainnet'),
    // QuickNode disabled for extension: Chrome extension origin not whitelisted → 401.
    // All Bitcoin API calls go directly to mempool.space via fallback.
    'process.env.NEXT_PUBLIC_QUICKNODE_BITCOIN_TESTNET_URL': JSON.stringify(''),
    'process.env.NEXT_PUBLIC_QUICKNODE_API_KEY': JSON.stringify(''),
    'process.env.NEXT_PUBLIC_QUICKNODE_BITCOIN_MAINNET_URL': JSON.stringify(''),
    'process.env.NEXT_PUBLIC_QUICKNODE_BITCOIN_MAINNET_API_KEY': JSON.stringify(''),
    'process.env.NEXT_PUBLIC_EXPLORER_WALLET_API_URL': JSON.stringify(env.VITE_EXPLORER_WALLET_API_URL || 'https://charms-explorer-api.fly.dev'),
    'process.env.NEXT_PUBLIC_CHARMS_API_URL': JSON.stringify(env.VITE_CHARMS_API_URL || 'https://api-t4.charms.dev'),
    'process.env.NEXT_PUBLIC_PROVER_TESTNET4_URL': JSON.stringify(env.VITE_PROVER_TESTNET4_URL || 'https://prove-t4.charms.dev'),
    'process.env.NEXT_PUBLIC_PROVER_MAINNET_URL': JSON.stringify(env.VITE_PROVER_MAINNET_URL || ''),
    'process.env.NEXT_PUBLIC_MEMPOOL_API_URL': JSON.stringify(env.VITE_MEMPOOL_API_URL || 'https://mempool.space/api'),
    // Cardano (optional)
    'process.env.NEXT_PUBLIC_CARDANO_NETWORK': JSON.stringify(env.VITE_CARDANO_NETWORK || ''),
    'process.env.NEXT_PUBLIC_CARDANO_API_URL': JSON.stringify(env.VITE_CARDANO_API_URL || ''),
    'process.env.NEXT_PUBLIC_BLOCKFROST_PROJECT_ID': JSON.stringify(env.VITE_BLOCKFROST_PROJECT_ID || ''),
    'process.env.NEXT_PUBLIC_WALLET_API_URL': JSON.stringify(''),
    // Fallback for any other process.env access
    'process.env': '{}',
    'global': 'globalThis',
  };

  return {
    plugins: [
      wasm(),
      // topLevelAwait() removed — its rust binding crashes with
      // "Failed to convert rust String into napi string" when one of
      // the bundled modules exceeds an internal length limit (likely
      // @emurgo/cardano-serialization-lib-asmjs after E012 added it).
      // ESNext target supports top-level await natively in modern Chrome
      // (extension uses MV3 + esnext), so the plugin is no longer strictly
      // required. If a runtime regression surfaces, revisit.
      react({
        include: /\.(jsx|tsx|js|ts)$/,
        babel: {
          plugins: [],
          presets: [['@babel/preset-react', { runtime: 'automatic' }]],
        },
      }),
      babel({
        babelHelpers: 'bundled',
        extensions: ['.js', '.jsx', '.ts', '.tsx'],
        include: ['../wallet/src/**'],
        presets: [['@babel/preset-react', { runtime: 'automatic' }]],
      }),
      copyStaticFiles(isDev)
    ],
    resolve: {
      alias: {
        '@': resolve(__dirname, '../wallet/src'),
      },
    },
    base: './',
    build: {
      outDir: 'dist',
      emptyOutDir: true,
      rollupOptions: {
        input: {
          popup: resolve(__dirname, 'popup.html'),
          'approve-sign': resolve(__dirname, 'approve-sign.html'),
          offscreen: resolve(__dirname, 'offscreen.html'),
        },
        plugins: [inject({ Buffer: ['buffer', 'Buffer'] })],
        output: {
          entryFileNames: 'assets/[name].js',
          chunkFileNames: 'assets/[name]-[hash].js',
          assetFileNames: 'assets/[name]-[hash][extname]',
          // Manual chunk split: separate CSL into one chunk per variant
          // and isolate cbor-x. cardano-serialization-lib is loaded via
          // dynamic import() in @/lib/cardano/cardanoWasm, so the chunk
          // ships separately from popup.js.
          //
          // Note: we don't bundle CSL into popup directly; vite-plugin-
          // top-level-await chokes on the multi-MB asmjs string (rust
          // napi limit). The dynamic-import boundary in cardanoWasm.js
          // keeps it manageable.
          manualChunks(id) {
            if (id.includes('cardano-serialization-lib-asmjs')) return 'csl-asmjs';
            if (id.includes('cardano-serialization-lib-browser')) return 'csl-browser';
            if (id.includes('cbor-x')) return 'cbor';
          },
        },
      },
      target: 'esnext',
      minify: 'esbuild',
    },
    define: envDefines,
    optimizeDeps: {
      esbuildOptions: {
        loader: {
          '.js': 'jsx',
          '.ts': 'tsx',
        },
        define: {
          global: 'globalThis',
        },
      },
    },
  };
});
