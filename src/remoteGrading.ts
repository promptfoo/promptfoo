import { fetchWithCache } from './cache';
import { getUserEmail } from './globalConfig/accounts';
import logger from './logger';
import { getRequestTimeoutMs } from './providers/shared';
import { getRemoteGenerationHeaders, getRemoteGenerationUrl } from './redteam/remoteGeneration';

import type { GradingResult } from './types/index';

type RemoteGradingPayload = {
  task: string;
  [key: string]: unknown;
};

export class RemoteGradingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RemoteGradingError';
  }
}

export function serializeRemoteGradingPayload(payload: unknown, failureMessage: string): string {
  try {
    const body = JSON.stringify(payload);
    if (body === undefined) {
      throw new Error('Payload did not serialize to JSON');
    }
    return body;
  } catch {
    throw new RemoteGradingError(failureMessage);
  }
}

function getRateLimitErrorMetadata(
  error: unknown,
): { kind: 'quota' | 'rate_limit'; status: number } | undefined {
  if (!(error instanceof Error)) {
    return undefined;
  }
  try {
    const candidate = error as Error & { kind?: unknown; status?: unknown };
    if (
      candidate.name !== 'HttpRateLimitError' ||
      (candidate.kind !== 'quota' && candidate.kind !== 'rate_limit') ||
      typeof candidate.status !== 'number' ||
      !Number.isInteger(candidate.status)
    ) {
      return undefined;
    }
    return { kind: candidate.kind, status: candidate.status };
  } catch {
    return undefined;
  }
}

export function formatRemoteGradingError(error: unknown, subject: string): string {
  if (error instanceof RemoteGradingError) {
    return error.message;
  }
  const rateLimit = getRateLimitErrorMetadata(error);
  if (rateLimit) {
    return rateLimit.kind === 'quota'
      ? `${subject} quota exceeded (HTTP ${rateLimit.status})`
      : `${subject} rate limited (HTTP ${rateLimit.status})`;
  }
  const message = error instanceof Error ? error.message : '';
  if (
    /^Request timed out after \d+ ms$/.test(message) ||
    /^Request failed after \d+ retries: Error: Request timed out after \d+ ms$/.test(message)
  ) {
    return `${subject} request timed out`;
  }
  return `${subject} request failed`;
}

function getRemoteGradingResult(data: unknown): unknown {
  return typeof data === 'object' && data !== null && !Array.isArray(data)
    ? (data as { result?: unknown }).result
    : undefined;
}

function getRemoteGradingResponseMetadata(result: unknown) {
  return {
    hasResult: Boolean(result),
    resultType: typeof result,
  };
}

function isRemoteGradingResult(result: unknown): result is Omit<GradingResult, 'assertion'> {
  if (!result || typeof result !== 'object' || Array.isArray(result)) {
    return false;
  }
  const candidate = result as Record<string, unknown>;
  return (
    typeof candidate.pass === 'boolean' &&
    typeof candidate.score === 'number' &&
    typeof candidate.reason === 'string' &&
    (candidate.namedScores === undefined || typeof candidate.namedScores === 'object') &&
    (candidate.namedScoreWeights === undefined ||
      typeof candidate.namedScoreWeights === 'object') &&
    (candidate.tokensUsed === undefined || typeof candidate.tokensUsed === 'object') &&
    (candidate.componentResults === undefined || Array.isArray(candidate.componentResults)) &&
    (candidate.assertion === undefined ||
      candidate.assertion === null ||
      typeof candidate.assertion === 'object') &&
    (candidate.comment === undefined || typeof candidate.comment === 'string')
  );
}

export async function doRemoteGrading(
  payload: RemoteGradingPayload,
): Promise<Omit<GradingResult, 'assertion'>> {
  try {
    payload.email = getUserEmail();
    let taskForLog = 'unknown';
    try {
      const task = payload.task;
      if (task === 'llm-rubric' || task === 'similar') {
        taskForLog = task;
      }
    } catch {
      throw new RemoteGradingError('Remote grading request payload is not serializable');
    }
    const body = serializeRemoteGradingPayload(
      payload,
      'Remote grading request payload is not serializable',
    );
    logger.debug('Performing remote grading', { task: taskForLog });
    const { data: responseText, status } = await fetchWithCache<string>(
      getRemoteGenerationUrl(),
      {
        method: 'POST',
        headers: getRemoteGenerationHeaders({
          'x-promptfoo-silent': 'true',
        }),
        body,
      },
      getRequestTimeoutMs(),
      'text',
    );

    if (status !== 200) {
      logger.debug('Remote grading result', {
        status,
        hasResult: false,
        resultType: 'not-inspected',
      });
      throw new RemoteGradingError(`Remote grading failed with status ${status}`);
    }

    let data: unknown;
    try {
      data = JSON.parse(responseText);
    } catch {
      logger.debug('Remote grading result', {
        status,
        hasResult: false,
        resultType: 'invalid-json',
      });
      throw new RemoteGradingError('Remote grading failed. Response was not valid JSON');
    }

    const result = getRemoteGradingResult(data);
    logger.debug('Remote grading result', {
      status,
      ...getRemoteGradingResponseMetadata(result),
    });

    if (!isRemoteGradingResult(result)) {
      throw new RemoteGradingError('Remote grading failed. Response data is invalid');
    }

    return {
      pass: result.pass,
      score: result.score,
      reason: result.reason,
      tokensUsed: result.tokensUsed,
      metadata: result.metadata,
    };
  } catch (error) {
    throw new Error(formatRemoteGradingError(error, 'Remote grading'));
  }
}
