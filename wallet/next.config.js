/** @type {import('next').NextConfig} */
const nextConfig = {
    eslint: {
        ignoreDuringBuilds: true,
    },

    // The Next.js app router skips folders prefixed with `.`, so we host
    // the WebAuthn Related Origins document under a regular name and
    // expose it at the spec-mandated `/.well-known/webauthn` path.
    async rewrites() {
        return [
            { source: '/.well-known/webauthn', destination: '/webauthn-well-known' },
        ];
    },

    images: {
        remotePatterns: [
            { protocol: 'https', hostname: 'bro.charms.dev' },
        ],
    },

    // Disabled to prevent double mounting in development
    reactStrictMode: false,
    
    typescript: {
        // Allow production builds to complete with type errors
        ignoreBuildErrors: true,
    },

    webpack: (config) => {
        config.resolve.fallback = {
            ...config.resolve.fallback,
            stream: require.resolve('stream-browserify'),
            buffer: require.resolve('buffer'),
            crypto: require.resolve('crypto-browserify'),
            fs: false,
            path: false,
            os: false,
            net: false,
            tls: false,
            child_process: false,
            snarkjs: false,
            cbor: false,
        };

        const webpack = require('next/dist/compiled/webpack/webpack-lib');

        config.plugins.push(
            new webpack.ProvidePlugin({
                Buffer: ['buffer', 'Buffer'],
                process: 'process/browser',
            }),
            // Suppress @emurgo/cardano-serialization-lib-browser internal dynamic require()
            new webpack.ContextReplacementPlugin(
                /@emurgo\/cardano-serialization-lib-browser/
            )
        );

        config.experiments = {
            ...config.experiments,
            asyncWebAssembly: true,
        };


        config.module.rules.push({
            test: /\.wasm$/,
            type: 'webassembly/async',
        });

        return config;
    },
};

module.exports = nextConfig;
