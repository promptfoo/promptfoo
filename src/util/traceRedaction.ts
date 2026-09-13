import { BLOB_SCHEME } from '../blobs/constants';

import type { AssertionOrSet, AtomicTestCase, GradingResult, ProviderResponse } from '../types';

export const TRACE_REDACTION_ASSERTIONS = new Set([
  'promptfoo:redteam:coding-agent:trace-redaction',
  'promptfoo:redteam:harness:artifact-redaction',
]);

export function requiresTraceRedaction(assertions: AssertionOrSet[] | undefined): boolean {
  return (
    assertions?.some((assertion) =>
      assertion.type === 'assert-set'
        ? requiresTraceRedaction(assertion.assert)
        : TRACE_REDACTION_ASSERTIONS.has(assertion.type.replace(/^not-/, '')),
    ) ?? false
  );
}

export function hasRedactionMedia(response: ProviderResponse | null | undefined): boolean {
  const pending: unknown[] = [response];
  const seen = new Set<object>();
  let inspected = 0;
  while (pending.length) {
    if (++inspected > 10000) {
      return true;
    }
    const value = pending.pop();
    if (typeof value === 'string') {
      if (
        value.includes(BLOB_SCHEME) ||
        /data:(?:audio|image|video)\/|<(?:svg|img|audio|video|picture|source)(?:\s|\/?>)|!\[[^\]\n]*\]/i.test(
          value,
        )
      ) {
        return true;
      }
      if (/^\s*[{[]/.test(value)) {
        try {
          pending.push(JSON.parse(value));
        } catch {
          // Plain text is checked by the text verifier.
        }
      }
    } else if (value && typeof value === 'object' && !seen.has(value)) {
      seen.add(value);
      const record = value as Record<string, unknown>;
      const image = record.image as Record<string, unknown> | undefined;
      const audio = record.audio as ProviderResponse['audio'];
      const video = record.video as ProviderResponse['video'];
      if (
        record.redactionMediaOmitted === true ||
        record.isBase64 === true ||
        (typeof record.b64_json === 'string' && record.b64_json.length > 0) ||
        (Array.isArray(record.images) && record.images.length > 0) ||
        ([record.mimeType, record.mime_type, record.media_type].some(
          (mime) => typeof mime === 'string' && /^\s*(?:image|audio|video)\//i.test(mime),
        ) &&
          [
            record.data,
            record.bytesBase64Encoded,
            record.base64Data,
            record.url,
            record.uri,
            record.fileWithBytes,
            record.fileWithUri,
            record.fileUri,
            record.file_uri,
          ].some((payload) =>
            typeof payload === 'string'
              ? payload.length > 0
              : payload && typeof payload === 'object' && Object.keys(payload).length > 0,
          )) ||
        (typeof record.type === 'string' &&
          /^(?:(?:input|output)_)?(?:image|audio|video)(?:_url)?$/.test(record.type)) ||
        image?.data ||
        image?.url ||
        image?.blobRef ||
        record.image_url ||
        record.audio_url ||
        record.video_url ||
        audio?.id ||
        audio?.data ||
        audio?.blobRef ||
        (video && Object.values(video).some(Boolean))
      ) {
        return true;
      }
      for (const [key, child] of Object.entries(record)) {
        if (value !== response || key !== 'raw') {
          pending.push(child);
        }
      }
    }
  }
  return false;
}

function omitGradingPrompts(result: GradingResult): GradingResult {
  return {
    ...result,
    ...(result.metadata && { metadata: { ...result.metadata, renderedGradingPrompt: undefined } }),
    ...(result.componentResults && {
      componentResults: result.componentResults.map(omitGradingPrompts),
    }),
  };
}

/** Keep privacy-check response bodies and their echoes out of public result copies. */
export function sanitizeRedactionResult<T extends object>(input: T): T {
  const result = input as T & {
    testCase?: AtomicTestCase;
    response?: ProviderResponse | null;
    gradingResult?: GradingResult | null;
    metadata?: Record<string, unknown>;
    error?: string | null;
    tokenUsage?: unknown;
    cost?: unknown;
    incurredCost?: unknown;
    latencyMs?: unknown;
  };
  const response = result.response;
  if (!requiresTraceRedaction(result.testCase?.assert)) {
    return input;
  }
  // Provider-reported numbers can carry private receipts just like text fields.
  const accounting = {
    tokenUsage: undefined,
    cost: undefined,
    incurredCost: undefined,
    latencyMs: undefined,
  };
  const mediaOmitted = hasRedactionMedia(response);
  const metadata = { ...result.metadata };
  for (const key of Object.keys(response?.metadata ?? {})) {
    if (
      result.testCase?.metadata &&
      Object.prototype.hasOwnProperty.call(result.testCase.metadata, key)
    ) {
      metadata[key] = result.testCase.metadata[key];
    } else {
      delete metadata[key];
    }
  }
  delete metadata.errorContext;
  delete metadata.sessionId;
  const error = result.error ? 'Error details omitted for trace/artifact redaction.' : result.error;
  const gradingResult = result.gradingResult
    ? omitGradingPrompts(result.gradingResult)
    : result.gradingResult;
  if (!response) {
    return { ...input, ...accounting, error, metadata, gradingResult };
  }
  return {
    ...input,
    ...accounting,
    error,
    metadata,
    gradingResult,
    response: {
      output: mediaOmitted
        ? '[Media response omitted: image, audio, or video redaction could not be verified.]'
        : '[Response omitted for trace/artifact redaction.]',
      ...(response.error && { error: 'Error details omitted for trace/artifact redaction.' }),
      ...(response.conversationEnded === true && { conversationEnded: true }),
      cached: typeof response.cached === 'boolean' ? response.cached : undefined,
      metadata: mediaOmitted ? { redactionMediaOmitted: true } : { redactionContentOmitted: true },
    },
  };
}
