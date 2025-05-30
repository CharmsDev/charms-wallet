/** @type {import('next').NextConfig} */
const nextConfig = {
    eslint: {
        ignoreDuringBuilds: true,
    },

    reactStrictMode: true,

    webpack: (config) => {
        config.resolve.fallback = {
            ...config.resolve.fallback,
            stream: require.resolve('stream-browserify'),
            buffer: require.resolve('buffer'),
            crypto: require.resolve('crypto-browserify'),
            fs: false,
            path: false,
        };

        const webpack = require('next/dist/compiled/webpack/webpack-lib');

        config.plugins.push(
            new webpack.ProvidePlugin({
                Buffer: ['buffer', 'Buffer'],
                process: 'process/browser',
            })
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
