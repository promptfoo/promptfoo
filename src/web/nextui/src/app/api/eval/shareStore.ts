import cacheManager from 'cache-manager';

const storeType = process.env.PROMPTFOO_SHARE_STORE_TYPE || 'memory';

const ttl = parseInt(process.env.PROMPTFOO_SHARE_TTL || String(60 * 60 * 24 * 14), 10);

function getStore() {
  switch (storeType) {
    case 'redis':
      return cacheManager.caching({
        store: require('cache-manager-ioredis'),
        host: process.env.PROMPTFOO_SHARE_REDIS_HOST,
        port: process.env.PROMPTFOO_SHARE_REDIS_PORT,
        password: process.env.PROMPTFOO_SHARE_REDIS_PASSWORD,
        db: parseInt(process.env.PROMPTFOO_SHARE_REDIS_DB || '0', 10),
        ttl,
      });
    case 'filesystem':
      return cacheManager.caching({
        store: require('cache-manager-fs-hash'),
        options: {
          path: process.env.PROMPTFOO_SHARE_STORE_PATH || 'share-store',
          ttl,
        },
      });
    case 'memory':
    default:
      return cacheManager.caching({
        store: 'memory',
        ttl,
      });
  }
}

const store = getStore();

export default store;
