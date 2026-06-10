/**
 * WebAuthn Related Origin Requests endpoint.
 *
 * Reached via the `/.well-known/webauthn` URL through a `next.config.js`
 * rewrite (the Next.js app router ignores folders prefixed with `.`,
 * so we serve from this canonical-named directory and let the rewrite
 * expose it at the spec-mandated path).
 *
 * Spec: W3C WebAuthn §5.10.1 Related Origin Requests
 * Content-Type MUST be `application/json` — the browser rejects otherwise.
 */

const ORIGINS = [
  'https://wallet.charms.dev',     // canonical RP id origin
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
