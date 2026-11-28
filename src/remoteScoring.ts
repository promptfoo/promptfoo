import { fetchWithCache } from './cache';
import { getEnvString } from './envars';
import logger from './logger';
import { getRequestTimeoutMs } from './providers/shared';

import type { GradingResult } from './types/index';

type PiQuestion = {
  question: string;
};
type PiScoringSpec = PiQuestion[];
type RemotePiScoringPayload = {
  llm_input: string;
  llm_output: string;
  scoring_spec: PiScoringSpec;
};

type WithPiGradingResult = {
  question_scores: Record<string, number>;
  total_score: number;
};

function convertPiResultToGradingResult(
  result: WithPiGradingResult,
  threshold: number,
): GradingResult {
  return {
    pass: result.total_score >= threshold,
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
    const apiKey = getEnvString('WITHPI_API_KEY');
    if (!apiKey) {
      throw new Error(
        `Env var WITHPI_API_KEY must be set. Visit https://docs.withpi.ai for more information.`,
      );
    }
    const body = JSON.stringify(payload);
    logger.debug('Requesting Pi score');
    const { data, status, statusText } = await fetchWithCache<WithPiGradingResult>(
      WITHPI_API_URL,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
        },
        body,
      },
      getRequestTimeoutMs(),
    );
    if (status < 200 || status >= 300) {
      throw new Error(`Pi scoring failed with status ${status}: ${statusText}`);
    }
    if (!Number.isFinite(data?.total_score)) {
      throw new Error('Pi scoring response has no numeric total_score');
    }
    return convertPiResultToGradingResult(data, passThreshold);
  } catch (error) {
    throw new Error(`Could not perform remote grading: ${error}`);
  }
}
