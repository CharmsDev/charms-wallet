# Charms Wallet Browser Extension

Chrome extension wrapping the Charms Wallet web app. Provides:

- Self-custody Bitcoin + Cardano popup UI
- Beam operations (BTC↔ADA) including eBTC mint+beam and redeem
- DApp provider API (`window.charmsWallet`) for BTC + Cardano signing

## Status — active migration in progress

The extension is being brought to feature parity with the wallet web app
(post-Cardano + beam additions). Roadmap and conventions:

- **Roadmap**: `.meshkore/docs/modules/extension/roadmap-feature-parity-wallet.md`
- **Constitution**: `.meshkore/docs/modules/extension/development-conventions.md`
- **Active tasks**: `.meshkore/modules/extension/tasks/E0XX-*.md`

Read both before contributing.

## Architecture overview

The extension imports the wallet's source directly via the Vite `@/` alias:

```js
// vite.config.js
resolve: {
  alias: { '@': resolve(__dirname, '../wallet/src') },
}
```

So `import { useBlockchain } from '@/stores/blockchainStore'` resolves to
the wallet repo's store. **The extension does not duplicate wallet code.**
Verify with `bash scripts/sync-from-wallet.sh`.

What lives in `extension/src/` is only the extension-specific surface:
popup screens, the service worker, the approve flows, popup-sized beam
dialogs.

## Development

```bash
# Once
npm install
cd ../wallet && npm install   # extension imports from wallet via @/

# Dev
npm run dev                    # vite dev server
npm run build:dev              # build for local install (manifest.dev.json)

# Production
npm run build:prod             # build with manifest.json (production hosts only)
```

Load the extension from `extension/dist/` in Chrome → `chrome://extensions`
→ Developer mode → "Load unpacked".

## Release packaging

See `.meshkore/modules/extension/tasks/E022-release-packaging.md`.
Once that task ships:

```bash
bash scripts/release.sh patch    # or minor / major
```

Produces `extension/zip/charms-wallet-extension-X.Y.Z.zip` ready for the
Chrome Web Store.

## CI guards

Every PR touching `extension/` runs:

- `guard-no-wallet-changes` — no commit modifies `wallet/`
- `verify-wallet-paths` — every `@/` import the extension relies on still
  exists in wallet/src/
- `tier2-headers` — tier-2 adapted files carry the derivation header
- `build` — production build succeeds

See `.github/workflows/extension-ci.yml`.
