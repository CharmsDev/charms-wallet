// Rewrites ipfs://CID(/path) to an HTTPS gateway URL so <img> tags can
// load it. Browsers don't speak ipfs:// natively; spells from alchemy /
// eBTC pin images on IPFS and the indexer returns them as ipfs:// in the
// charm metadata. Mirrors charms-explorer/webapp resolveImageUrl.
export function resolveImageUrl(url) {
    if (!url || typeof url !== 'string') return url;
    if (url.startsWith('ipfs://')) {
        const path = url.slice('ipfs://'.length).replace(/^ipfs\//, '');
        return `https://ipfs.io/ipfs/${path}`;
    }
    return url;
}
