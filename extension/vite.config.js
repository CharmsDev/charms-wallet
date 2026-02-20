import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { babel } from '@rollup/plugin-babel';
import wasm from 'vite-plugin-wasm';
import topLevelAwait from 'vite-plugin-top-level-await';
import { resolve } from 'path';
import { copyFileSync, mkdirSync, existsSync } from 'fs';

// Override WASM-based modules with extension-specific prover API versions
function overrideWasmModules() {
  const overrides = {
    'charm-transaction-extractor': resolve(__dirname, './src/services/failover/charm-tx-extractor.js'),
  };
  return {
    name: 'override-wasm-modules',
    enforce: 'pre',
    resolveId(source, importer) {
      if (!importer) return null;
      for (const [key, replacement] of Object.entries(overrides)) {
        if (source.endsWith(key) || source.endsWith(key + '.js') || source.endsWith(key + '.ts')) {
          return replacement;
        }
      }
      return null;
    },
  };
}

// Copy static files to dist after build
function copyStaticFiles() {
  return {
    name: 'copy-static-files',
    closeBundle() {
      const distDir = resolve(__dirname, 'dist');
      const iconsDir = resolve(distDir, 'icons');
      
      // Create icons directory
      if (!existsSync(iconsDir)) {
        mkdirSync(iconsDir, { recursive: true });
      }
      
      // Copy manifest.json
      copyFileSync(
        resolve(__dirname, 'manifest.json'),
        resolve(distDir, 'manifest.json')
      );
      
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
    }
  };
}

export default defineConfig(({ mode }) => {
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
      overrideWasmModules(),
      wasm(),
      topLevelAwait(),
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
      copyStaticFiles()
    ],
    resolve: {
      alias: {
        '@': resolve(__dirname, '../wallet/src'),
        '@shared': resolve(__dirname, './src/shared'),
        'next/navigation': resolve(__dirname, './src/mocks/next-navigation.js'),
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
        },
        output: {
          entryFileNames: 'assets/[name].js',
          chunkFileNames: 'assets/[name]-[hash].js',
          assetFileNames: 'assets/[name]-[hash][extname]',
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
