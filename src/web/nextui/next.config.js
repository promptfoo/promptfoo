console.log('**************************************************');
console.log(`Building next.js`);
console.log('**************************************************');

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'export',
  trailingSlash: true,
  customServer: true,
  webpack: (config, { isServer }) => {
    config.externals.push({
      'utf-8-validate': 'commonjs utf-8-validate',
      bufferutil: 'commonjs bufferutil',
      fsevents: 'require("fsevents")',
      'better-sqlite3': 'commonjs better-sqlite3',
    });

    if (!isServer) {
      config.resolve.fallback = {
        child_process: false,
        fs: false,
        module: false,
        net: false,
        os: false,
        path: false,
        tls: false,
      };
    }

    return config;
  },
  env: {
    PROMPTFOO_VERSION: require('../../../package.json').version,
    NEXT_PUBLIC_SUPABASE_URL:
      process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.promptfoo.dev',
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'abc123',
    NEXT_PUBLIC_PROMPTFOO_REMOTE_API_BASE_URL:
      process.env.NEXT_PUBLIC_PROMPTFOO_REMOTE_API_BASE_URL ||
      process.env.NODE_ENV === 'development'
        ? `http://localhost:${process.env.PORT || 15500}`
        : '',
  },
};

module.exports = nextConfig;
