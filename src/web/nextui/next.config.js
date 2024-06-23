/** @type {import('next').NextConfig} */
const nextConfig = {
  output: process.env.NEXT_PUBLIC_PROMPTFOO_BUILD_STANDALONE_SERVER ? 'standalone' : 'export',
  trailingSlash: true,
  webpack: (config, { buildId, dev, isServer, defaultLoaders, webpack }) => {
    config.externals.push({
      'utf-8-validate': 'commonjs utf-8-validate',
      bufferutil: 'commonjs bufferutil',
      fsevents: 'require("fsevents")',
      'better-sqlite3': 'commonjs better-sqlite3',
    });

    return config;
  },
  env: {
    NEXT_PUBLIC_PROMPTFOO_REMOTE_API_BASE_URL:
      process.env.NEXT_PUBLIC_PROMPTFOO_REMOTE_API_BASE_URL || 'http://localhost:15500',
  },
};

module.exports = nextConfig;
