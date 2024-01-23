import cacheManager, { Cache } from 'cache-manager';
import fsStore from 'cache-manager-fs-hash';

const store = cacheManager.caching({
  store: fsStore,
  options: {
    path: process.env.PROMPTFOO_SHARE_STORE_PATH || 'share-store',
    ttl: process.env.PROMPTFOO_SHARE_TTL || 60 * 60 * 24 * 14,
  },
});

export default store;