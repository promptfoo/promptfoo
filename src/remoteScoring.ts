import { fetchWithCache } from './cache';
import { getEnvString } from './envars';
import logger from './logger';
import { getRequestTimeoutMs } from './providers/shared';
import {
  formatRemoteGradingError,
  RemoteGradingError,
  serializeRemoteGradingPayload,
} from './remoteGrading';

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

function isWithPiGradingResult(result: unknown): result is WithPiGradingResult {
  if (!result || typeof result !== 'object') {
    return false;
  }

  const { question_scores: questionScores, total_score: totalScore } =
    result as Partial<WithPiGradingResult>;
  return (
    Number.isFinite(totalScore) &&
    questionScores !== undefined &&
    typeof questionScores === 'object' &&
    !Array.isArray(questionScores) &&
    Object.values(questionScores).every((score) => Number.isFinite(score))
  );
}

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
      let questionCount: number;
      try {
        questionCount = Array.isArray(payload.scoring_spec) ? payload.scoring_spec.length : 0;
      } catch {
        throw new RemoteGradingError('Remote Pi scoring payload is not serializable');
      }
      const body = serializeRemoteGradingPayload(
        payload,
        'Remote Pi scoring payload is not serializable',
      );
      logger.debug('Performing remote scoring with Pi', { questionCount });
      const { data: responseText, status } = await fetchWithCache<string>(
        WITHPI_API_URL,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': apiKey,
            'x-promptfoo-silent': 'true',
          },
          body,
        },
        getRequestTimeoutMs(),
        'text',
      );

      if (status < 200 || status >= 300) {
        throw new RemoteGradingError(`Remote Pi scoring failed with status ${status}`);
      }

      let data: unknown;
      try {
        data = JSON.parse(responseText);
      } catch {
        throw new RemoteGradingError('Remote Pi scoring response was not valid JSON');
      }
      if (!isWithPiGradingResult(data)) {
        throw new RemoteGradingError('Remote Pi scoring response data is invalid');
      }
      return convertPiResultToGradingResult(data, passThreshold);
    } else {
      throw new RemoteGradingError(
        'Env var WITHPI_API_KEY must be set. Visit https://docs.withpi.ai for more information.',
      );
    }
  } catch (error) {
    throw new Error(
      `Could not perform remote grading: ${formatRemoteGradingError(error, 'Remote Pi scoring')}`,
    );
  }
}
