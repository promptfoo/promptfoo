/** @type {import('next').NextConfig} */
const nextConfig = {
  output: process.env.PROMPTFOO_BUILD_STANDALONE_SERVER ? 'standalone' : 'export',
  trailingSlash: true,
  webpack: (config, { buildId, dev, isServer, defaultLoaders, webpack }) => {
    config.externals.push({
      'utf-8-validate': 'commonjs utf-8-validate',
      bufferutil: 'commonjs bufferutil',
    });

    return config;
  },
};

module.exports = nextConfig;
