/** @type {import('next').NextConfig} */
const nextConfig = {
    // Disable ESLint during build
    eslint: {
        ignoreDuringBuilds: true,
    },

    webpack: (config) => {
        // Add polyfills for crypto-related modules
        config.resolve.fallback = {
            ...config.resolve.fallback,
            stream: require.resolve('stream-browserify'),
            buffer: require.resolve('buffer'),
            crypto: require.resolve('crypto-browserify'),
        };

        // Use webpack from next
        const webpack = require('next/dist/compiled/webpack/webpack-lib');

        config.plugins.push(
            new webpack.ProvidePlugin({
                Buffer: ['buffer', 'Buffer'],
            })
        );

        // Enable WebAssembly
        config.experiments = {
            ...config.experiments,
            asyncWebAssembly: true,
        };

        // Add rule for WebAssembly modules
        config.module.rules.push({
            test: /\.wasm$/,
            type: 'webassembly/async',
        });

        return config;
    },
};

module.exports = nextConfig;
