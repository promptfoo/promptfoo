import { claimBackgroundUsageOnce } from '../../src/cache';

process.send?.('ready');
process.once('message', async () => {
  try {
    process.send?.({ claimed: await claimBackgroundUsageOnce('shared-background-response') });
  } catch (error) {
    process.send?.({ error: String(error) });
    process.exitCode = 1;
  } finally {
    process.disconnect();
  }
});
