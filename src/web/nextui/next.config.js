/** @type {import('next').NextConfig} */
const nextConfig = {
  //output: 'standalone',
  output: 'export',
  trailingSlash: true,
  webpack: (config, { buildId, dev, isServer, defaultLoaders, webpack }) => {
    config.externals.push({
      'utf-8-validate': 'commonjs utf-8-validate',
      'bufferutil': 'commonjs bufferutil',
    })
    return config
  },
};

module.exports = nextConfig;
