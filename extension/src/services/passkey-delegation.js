/**
 * Passkey signing delegation.
 *
 * A passkey for rpId wallet.charms.dev cannot be exercised from a
 * chrome-extension:// document, but it can from a page on that origin,
 * where Touch ID / Face ID prompts normally. We park the request, open
 * the tab, and wait for the signed artifact. The mnemonic is derived and
 * dropped over there, so the extension only ever receives a signature.
 *
 * Extension-only on purpose: it drives chrome.tabs and chrome.storage.
 * The counterpart is wallet/src/app/extension-sign/page.js, which decides
 * what each `kind` means.
 */

const EXT_SIGN_PENDING = 'ext:sign_delegate_pending';
const EXT_SIGN_RESULT  = 'ext:sign_delegate_result';
const WALLET_ORIGIN    = 'https://wallet.charms.dev';

// Under the five minutes background.js allows a passkey wallet, so the
// user sees this timeout rather than a bare rejection from the dApp.
const TIMEOUT_MS = 4 * 60 * 1000;

/**
 * @param {object} payload  { kind, network, ...kind-specific fields }
 * @param {{onStatus?: (msg: string) => void}} [opts]
 * @returns {Promise<any>} whatever the page produced for this request kind
 */
export async function signViaPasskeyDelegation(payload, { onStatus } = {}) {
  const requestId = `sig-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  await chrome.storage.local.set({ [EXT_SIGN_PENDING]: { requestId, payload, at: Date.now() } });
  await chrome.storage.local.remove(EXT_SIGN_RESULT);

  const tab = await chrome.tabs.create({
    url: `${WALLET_ORIGIN}/extension-sign?req=${encodeURIComponent(requestId)}`,
    active: true,
  });
  onStatus?.('Approve in the wallet tab that just opened…');

  // Poll rather than message-listen: this popup can be closed and reopened
  // while the user is in the other tab, and storage survives that.
  const started = Date.now();
  try {
    while (Date.now() - started < TIMEOUT_MS) {
      const data = await chrome.storage.local.get([EXT_SIGN_RESULT]);
      const res = data[EXT_SIGN_RESULT];
      if (res && res.requestId === requestId) {
        await chrome.storage.local.remove(EXT_SIGN_RESULT);
        if (res.error) throw new Error(res.error);
        return res.result;
      }
      await new Promise(r => setTimeout(r, 400));
    }
    throw new Error('Timed out waiting for approval in the wallet tab.');
  } finally {
    await chrome.storage.local.remove(EXT_SIGN_PENDING);
    try { await chrome.tabs.remove(tab.id); } catch (_) { /* user may have closed it */ }
  }
}
