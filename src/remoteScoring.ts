import { fetchWithCache } from './cache';
import { getEnvString } from './envars';
import logger from './logger';
import { REQUEST_TIMEOUT_MS } from './providers/shared';

import type { GradingResult } from './types';

type PiQuestion = {
  question: string;
};
type PiScoringSpec = PiQuestion[];
type RemotePiScoringPayload = {
  llm_input: string;
  llm_output: string;
  scoring_spec: PiScoringSpec;
};

function getWithPiApiKey(): string | undefined {
  // Check env var first
  const withPiApiKey = getEnvString('WITHPI_API_KEY');
  if (withPiApiKey) {
    return withPiApiKey;
  }
}

type WithPiGradingResult = {
  question_scores: Record<string, number>;
  total_score: number;
};

function convertPiResultToGradingResult(
  result: WithPiGradingResult,
  threshold: number,
): GradingResult {
  return {
    pass: result.total_score > threshold,
    score: result.total_score,
    namedScores: result.question_scores,
    reason: 'Pi Scorer',
  };
}
const WITHPI_API_URL = `https://api.withpi.ai/v1/scoring_system/score`;
export async function doRemoteScoringWithPi(
  payload: RemotePiScoringPayload,
  passThreshold: number = 0.5,
): Promise<Omit<GradingResult, 'assertion'>> {
  try {
    const apiKey = getWithPiApiKey();
    if (apiKey) {
      const body = JSON.stringify(payload);
      logger.debug(`Performing remote scoring with pi: ${body}`);
      const { data } = await fetchWithCache(
        WITHPI_API_URL,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': apiKey,
          },
          body,
        },
        REQUEST_TIMEOUT_MS,
      );
      return convertPiResultToGradingResult(data, passThreshold);
    } else {
      throw new Error(
        `Env var WITHPI_API_KEY must be set. Visit https://docs.withpi.ai for more information.`,
      );
    }
  } catch (error) {
    throw new Error(`Could not perform remote grading: ${error}`);
  }
}
