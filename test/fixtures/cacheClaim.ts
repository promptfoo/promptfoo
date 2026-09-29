import { claimCacheKeyOnce } from '../../src/cache';

process.send?.('ready');
process.once('message', async () => {
  try {
    process.send?.({ claimed: await claimCacheKeyOnce('shared-background-response') });
  } catch (error) {
    process.send?.({ error: String(error) });
    process.exitCode = 1;
  } finally {
    process.disconnect();
  }
});
