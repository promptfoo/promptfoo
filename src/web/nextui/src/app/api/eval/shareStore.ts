import { caching, type Cache } from 'cache-manager';

const storeType = process.env.PROMPTFOO_SHARE_STORE_TYPE || 'memory';

// cache-manager-fs-hash as of version 2.0 uses milliseconds
const ttl = parseInt(process.env.PROMPTFOO_SHARE_TTL || String(60 * 60 * 24 * 14), 10) * 1_000;

async function getStore(): Promise<Cache> {
  // TODO(ian): Just use the sqlite db for this
  switch (storeType) {
    case 'redis':
      console.log('Using Redis store');
      return caching(require('cache-manager-ioredis'), {
        host: process.env.PROMPTFOO_SHARE_REDIS_HOST,
        port: process.env.PROMPTFOO_SHARE_REDIS_PORT,
        password: process.env.PROMPTFOO_SHARE_REDIS_PASSWORD,
        db: parseInt(process.env.PROMPTFOO_SHARE_REDIS_DB || '0', 10),
        ttl,
      });
    case 'filesystem':
      console.log('Using Filesystem store');
      return caching(require('cache-manager-fs-hash'), {
        path: process.env.PROMPTFOO_SHARE_STORE_PATH || 'share-store',
        ttl,
      });
    case 'memory':
    default:
      console.log('Using Memory store');
      return caching('memory', { ttl });
  }
}

const store = getStore();

export default store;
