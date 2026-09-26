import { ensureCloudTeamContext } from '../util/cloud';
import { PROMPTFOO_TEAM_ID_HEADER } from '../util/fetch/monkeyPatchFetch';
import { getRemoteGenerationUrl, getRemoteGenerationUrlForUnaligned } from './remoteGeneration';

/** Resolve remembered CLI routing only when the task has no explicit Cloud context. */
export async function resolveRemoteGenerationUrl(
  payload: Record<string, unknown> = {},
  options?: { headers?: HeadersInit; unaligned?: boolean },
): Promise<string> {
  const config = payload.config;
  const metadata =
    config && typeof config === 'object' && 'metadata' in config ? config.metadata : undefined;
  const metadataTeamId =
    metadata && typeof metadata === 'object' && 'teamId' in metadata ? metadata.teamId : undefined;
  const explicitContext = [
    payload.jobId,
    payload.evaluationId,
    payload.targetId,
    payload.teamId,
    metadataTeamId,
    new Headers(options?.headers).get(PROMPTFOO_TEAM_ID_HEADER),
  ].some((value) => typeof value === 'string' && value.length > 0);
  const getUrl = options?.unaligned ? getRemoteGenerationUrlForUnaligned : getRemoteGenerationUrl;
  if (!explicitContext) {
    await ensureCloudTeamContext(getUrl());
  }
  return getUrl();
}
