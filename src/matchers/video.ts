import logger from '../logger';
import { DEFAULT_VIDEO_GRADING_PROMPT } from '../prompts/index';
import { getDefaultProviders } from '../providers/defaults';
import { DefaultVideoGradingProvider } from '../providers/google/ai.studio';
import { extractJsonObjects } from '../util/json';
import { getNunjucksEngine } from '../util/templates';
import {
  isWithinInlineLimit,
  resolveVideoBytes,
  VIDEO_INLINE_LIMIT_BYTES,
  videoToBase64,
} from '../util/video';
import { callProviderWithContext, getAndCheckProvider } from './providers';
import { loadRubricPrompt } from './rubric';
import { fail, normalizeMatcherTokenUsage } from './shared';

import type {
  ApiProvider,
  Assertion,
  CallApiContextParams,
  GradingConfig,
  GradingResult,
  ProviderResponse,
  VarValue,
} from '../types/index';

type VideoResponse = NonNullable<ProviderResponse['video']>;
interface RawVideoRubricResult {
  pass?: unknown;
  reason?: unknown;
  score?: unknown;
}

const nunjucks = getNunjucksEngine(undefined, false, true);

async function getDefaultVideoGradingProvider(): Promise<ApiProvider> {
  const defaultProviders = await getDefaultProviders();
  return defaultProviders.videoGradingProvider ?? DefaultVideoGradingProvider;
}

function failure(
  reason: string,
  assertion?: Assertion,
  tokenUsage?: ProviderResponse['tokenUsage'],
): GradingResult {
  return {
    ...fail(reason, tokenUsage),
    assertion,
  };
}

function parseVideoRubricResponse(resp: ProviderResponse): RawVideoRubricResult | undefined {
  if (typeof resp.output === 'string') {
    const jsonObjects = extractJsonObjects(resp.output);
    return jsonObjects[0] as RawVideoRubricResult | undefined;
  }

  if (resp.output && typeof resp.output === 'object' && !Array.isArray(resp.output)) {
    return resp.output as RawVideoRubricResult;
  }

  return undefined;
}

function normalizeVideoRubricResponse(
  parsed: RawVideoRubricResult,
): (Pick<GradingResult, 'pass' | 'score'> & { reason?: string }) | undefined {
  let pass: boolean | undefined;
  if (typeof parsed.pass === 'boolean') {
    pass = parsed.pass;
  } else if (typeof parsed.pass === 'string') {
    const normalized = parsed.pass.trim().toLowerCase();
    if (['true', 'yes', 'pass', 'y'].includes(normalized)) {
      pass = true;
    } else if (['false', 'no', 'fail', 'n'].includes(normalized)) {
      pass = false;
    }
  }

  const numericScore =
    typeof parsed.score === 'number'
      ? parsed.score
      : typeof parsed.score === 'string' && parsed.score.trim() !== ''
        ? Number(parsed.score)
        : Number.NaN;

  if (
    pass === undefined ||
    !Number.isFinite(numericScore) ||
    numericScore < 0 ||
    numericScore > 1
  ) {
    return undefined;
  }

  return {
    pass,
    score: numericScore,
    ...(typeof parsed.reason === 'string' && { reason: parsed.reason }),
  };
}

/**
 * Evaluates a video against a rubric using a multimodal grading provider.
 */
export async function matchesVideoRubric(
  rubric: string | object,
  video: VideoResponse,
  grading?: GradingConfig,
  vars?: Record<string, VarValue>,
  assertion?: Assertion,
  providerCallContext?: CallApiContextParams,
): Promise<GradingResult> {
  if (!grading) {
    throw new Error(
      'Cannot grade video without grading config. Specify --grader option or grading config.',
    );
  }

  let resolvedVideo;
  try {
    resolvedVideo = await resolveVideoBytes(video);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return failure(`Failed to resolve video: ${message}`, assertion);
  }

  if (!isWithinInlineLimit(resolvedVideo.buffer)) {
    const limitMB = VIDEO_INLINE_LIMIT_BYTES / 1024 / 1024;
    return failure(
      `Video cannot fit within Gemini's ${limitMB}MB inline request limit after base64 encoding. Use a smaller video; File API support is not yet available.`,
      assertion,
    );
  }

  const rubricString = typeof rubric === 'object' ? JSON.stringify(rubric) : rubric;
  const rubricPrompt = await loadRubricPrompt(grading.rubricPrompt, DEFAULT_VIDEO_GRADING_PROMPT);
  const renderedGradingPrompt = nunjucks.renderString(rubricPrompt, {
    rubric: rubricString,
    ...(vars || {}),
  });
  const videoBase64 = videoToBase64(resolvedVideo.buffer);
  const defaultProvider = grading.provider
    ? DefaultVideoGradingProvider
    : await getDefaultVideoGradingProvider();

  const finalProvider = await getAndCheckProvider(
    'text',
    grading.provider,
    defaultProvider,
    'video-rubric check',
  );

  const multimodalPrompt = JSON.stringify([
    {
      role: 'user',
      parts: [
        {
          inline_data: {
            mime_type: resolvedVideo.mimeType,
            data: videoBase64,
          },
        },
        {
          text: renderedGradingPrompt,
        },
      ],
    },
  ]);

  if (Buffer.byteLength(multimodalPrompt, 'utf8') >= VIDEO_INLINE_LIMIT_BYTES) {
    const limitMB = VIDEO_INLINE_LIMIT_BYTES / 1024 / 1024;
    return failure(
      `Video and rubric exceed Gemini's ${limitMB}MB inline request limit. Use a smaller video or shorter rubric; File API support is not yet available.`,
      assertion,
    );
  }

  logger.debug('[VideoRubric] Calling video grading provider', {
    provider: finalProvider.id(),
    videoSizeKB: Math.round(resolvedVideo.buffer.length / 1024),
    mimeType: resolvedVideo.mimeType,
  });

  const resp = await callProviderWithContext(
    finalProvider,
    multimodalPrompt,
    'video-rubric',
    {
      rubric: rubricString,
      ...(vars || {}),
    },
    providerCallContext,
  );

  if (resp.error || !resp.output) {
    return failure(
      resp.error || 'No output from video grading provider',
      assertion,
      resp.tokenUsage,
    );
  }

  const parsed = parseVideoRubricResponse(resp);
  if (!parsed) {
    return failure(
      typeof resp.output === 'string'
        ? `Could not extract JSON from video-rubric response: ${resp.output}`
        : `video-rubric produced malformed response. Output: ${JSON.stringify(resp.output)}`,
      assertion,
      resp.tokenUsage,
    );
  }

  const normalized = normalizeVideoRubricResponse(parsed);
  if (!normalized) {
    return failure(
      `video-rubric response must include a boolean pass and a finite score between 0 and 1. Output: ${JSON.stringify(resp.output)}`,
      assertion,
      resp.tokenUsage,
    );
  }

  let { pass } = normalized;
  const { score } = normalized;
  const threshold =
    typeof assertion?.threshold === 'string' ? Number(assertion.threshold) : assertion?.threshold;
  const thresholdFailed =
    typeof threshold === 'number' && Number.isFinite(threshold) && score < threshold;
  pass = pass && !thresholdFailed;

  const reason =
    normalized.reason ||
    (pass
      ? 'Video grading passed'
      : thresholdFailed
        ? `Score ${score} below threshold ${threshold}`
        : 'Video grading failed');

  return {
    assertion,
    pass,
    score,
    reason,
    tokensUsed: normalizeMatcherTokenUsage(resp.tokenUsage),
    metadata: {
      renderedGradingPrompt,
      videoSizeBytes: resolvedVideo.buffer.length,
      videoMimeType: resolvedVideo.mimeType,
    },
  };
}
