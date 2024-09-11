const API_PORT = process.env.API_PORT || '15500';

if (process.env.NODE_ENV === 'development') {
  process.env.NEXT_PUBLIC_PROMPTFOO_REMOTE_API_BASE_URL =
    process.env.PROMPTFOO_REMOTE_API_BASE_URL || `http://localhost:${API_PORT}`;
  process.env.NEXT_PUBLIC_PROMPTFOO_SHARE_API_URL = `http://localhost:${API_PORT}`;
} else {
  if (process.env.NEXT_PUBLIC_HOSTED) {
    process.env.NEXT_PUBLIC_PROMPTFOO_SHARE_API_URL =
      process.env.PROMPTFOO_REMOTE_API_BASE_URL || '';
  } else {
    process.env.NEXT_PUBLIC_PROMPTFOO_APP_SHARE_URL = 'https://app.promptfoo.dev';
    process.env.NEXT_PUBLIC_PROMPTFOO_SHARE_API_URL = 'https://api.promptfoo.dev';
  }

  process.env.NEXT_PUBLIC_PROMPTFOO_REMOTE_API_BASE_URL =
    process.env.PROMPTFOO_REMOTE_API_BASE_URL || '';
}

console.log('**************************************************');
console.log(`Building next.js`);
console.log('**************************************************');

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'export',
  trailingSlash: true,
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
  },
};

module.exports = nextConfig;
