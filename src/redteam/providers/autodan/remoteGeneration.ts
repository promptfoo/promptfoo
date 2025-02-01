import { fetchWithCache } from '../../../cache';
import { VERSION } from '../../../constants';
import { getUserEmail } from '../../../globalConfig/accounts';
import logger from '../../../logger';
import { REQUEST_TIMEOUT_MS } from '../../../providers/shared';
import { getRemoteGenerationUrl } from '../../remoteGeneration';
import { strategies } from './strategies';

interface AutoDanRemoteResponse {
  selectedStrategy: string;
  prompt: string;
  rationale: string;
}

interface AutoDanRemoteRequest {
  task: 'autodan';
  goal: string;
  lastAttempt?: string;
  lastResponse?: string;
  currentStrategy?: string;
  strategies: typeof strategies;
  version: string;
  email: string | null;
}

export async function getNextAutoDanAttack({
  goal,
  lastAttempt,
  lastResponse,
  currentStrategy,
}: {
  goal: string;
  lastAttempt?: string;
  lastResponse?: string;
  currentStrategy?: string;
}): Promise<AutoDanRemoteResponse> {
  try {
    const payload: AutoDanRemoteRequest = {
      task: 'autodan',
      goal,
      lastAttempt,
      lastResponse,
      currentStrategy,
      strategies,
      version: VERSION,
      email: getUserEmail(),
    };

    logger.debug(`Sending AutoDan remote request: ${JSON.stringify(payload)}`);

    const { data } = await fetchWithCache(
      getRemoteGenerationUrl(),
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      },
      REQUEST_TIMEOUT_MS,
      'json'
    );

    if (!data || !data.result) {
      throw new Error('Invalid response from remote generation service');
    }

    const result = data.result as AutoDanRemoteResponse;
    logger.debug(`Got AutoDan remote response: ${JSON.stringify(result)}`);

    return result;
  } catch (error) {
    throw new Error(`Failed to get next AutoDan attack: ${error}`);
  }
}
