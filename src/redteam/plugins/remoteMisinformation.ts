import { neverGenerateRemote } from '../remoteGeneration';

import type { PluginConfig } from '../types';

export const REMOTE_MISINFORMATION_BATCH_SIZE = 20;

export function shouldChunkRemoteMisinformationRequests(
  key: string,
  n: number,
  config?: PluginConfig,
) {
  // Named inputs can require position-dependent materialization on the server.
  return (
    key === 'harmful:misinformation-disinformation' &&
    n > REMOTE_MISINFORMATION_BATCH_SIZE &&
    Object.keys(config?.inputs ?? {}).length === 0 &&
    !neverGenerateRemote()
  );
}
