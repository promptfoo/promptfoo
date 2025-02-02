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
  tokenUsage: {
    prompt: number;
    completion: number;
    total: number;
  };
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

    const response = await fetchWithCache(
      getRemoteGenerationUrl(),
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      },
      REQUEST_TIMEOUT_MS,
      'json',
    );

    console.log('response', response);

    const data = response.data;

    if (!data || !data.prompt) {
      throw new Error('Invalid response from remote generation service');
    }

    logger.debug(`Got AutoDan remote response: ${JSON.stringify(data)}`);

    return {
      prompt: data.prompt,
      selectedStrategy: data.selectedStrategy,
      rationale: data.rationale,
      tokenUsage: data.tokenUsage,
    };
  } catch (error) {
    throw new Error(`Failed to get next AutoDan attack: ${error}`);
  }
}
