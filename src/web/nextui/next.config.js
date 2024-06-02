const outputType = process.env.NEXT_PUBLIC_PROMPTFOO_BUILD_STANDALONE_SERVER ? 'standalone' : 'export';
console.log('**************************************************');
console.log(`Building next.js in ${outputType} mode`);
console.log('**************************************************');

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: outputType,
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
};

module.exports = nextConfig;
