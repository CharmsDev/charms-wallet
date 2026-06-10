/**
 * WebAuthn Related Origin Requests endpoint.
 *
 * The browser fetches this URL on the RP id origin (wallet.charms.dev)
 * before honouring a passkey assertion whose request origin doesn't
 * match the RP id. Any URL listed under `origins` is allowed to use
 * passkeys scoped to the primary RP id.
 *
 * Spec: W3C WebAuthn §5.10.1 Related Origin Requests
 *
 * Content-Type MUST be `application/json` — the browser rejects any
 * other content-type, regardless of the body's correctness.
 */

const ORIGINS = [
  'https://wallet.charms.dev',     // canonical
  'https://alchemy.charms.dev',    // future alias
  'https://alchemy-pk.pages.dev',  // current Cloudflare Pages URL
];

export const dynamic = 'force-static';

export async function GET() {
  return new Response(JSON.stringify({ origins: ORIGINS }), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'public, max-age=3600',
    },
  });
}
