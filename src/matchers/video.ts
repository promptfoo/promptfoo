import logger from '../logger';
import { DEFAULT_VIDEO_GRADING_PROMPT } from '../prompts/index';
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
  Assertion,
  CallApiContextParams,
  GradingConfig,
  GradingResult,
  ProviderResponse,
  VarValue,
} from '../types/index';

type VideoResponse = NonNullable<ProviderResponse['video']>;

const nunjucks = getNunjucksEngine(undefined, false, true);

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

function parseVideoRubricResponse(resp: ProviderResponse): Partial<GradingResult> | undefined {
  if (typeof resp.output === 'string') {
    const jsonObjects = extractJsonObjects(resp.output);
    return jsonObjects[0] as Partial<GradingResult> | undefined;
  }

  if (resp.output && typeof resp.output === 'object' && !Array.isArray(resp.output)) {
    return resp.output as Partial<GradingResult>;
  }

  return undefined;
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
      `Video size (${(resolvedVideo.buffer.length / 1024 / 1024).toFixed(1)}MB) exceeds ${limitMB}MB inline limit. File API support coming soon.`,
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

  const finalProvider = await getAndCheckProvider(
    'text',
    grading.provider,
    DefaultVideoGradingProvider,
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

  let pass = parsed.pass ?? true;
  if (typeof pass !== 'boolean') {
    pass = /^(true|yes|pass|y)$/i.test(String(pass));
  }

  let score = parsed.score;
  if (typeof score !== 'number') {
    score = Number.isFinite(Number(score)) ? Number(score) : Number(pass);
  }

  const threshold =
    typeof assertion?.threshold === 'string' ? Number(assertion.threshold) : assertion?.threshold;
  if (typeof threshold === 'number' && Number.isFinite(threshold)) {
    pass = pass && score >= threshold;
  }

  const reason =
    parsed.reason ||
    (pass
      ? 'Video grading passed'
      : typeof threshold === 'number'
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
