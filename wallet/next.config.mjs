/** @type {import('next').NextConfig} */
const nextConfig = {
    webpack: (config) => {
        // Add polyfills for crypto-related modules
        config.resolve.fallback = {
            ...config.resolve.fallback,
            stream: require.resolve('stream-browserify'),
            buffer: require.resolve('buffer'),
            crypto: require.resolve('crypto-browserify'),
        };

        config.plugins.push(
            new config.webpack.ProvidePlugin({
                Buffer: ['buffer', 'Buffer'],
            })
        );

        return config;
    },
};

export default nextConfig;
