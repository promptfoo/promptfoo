import { AsyncLocalStorage } from 'node:async_hooks';

import { marked } from 'marked';
import { type DefaultTreeAdapterMap, parseFragment } from 'parse5';
import { BLOB_SCHEME } from '../blobs/constants';
import { sanitizeCodingAgentVerifierInputs } from './sanitizer';

import type {
  Assertion,
  AssertionOrSet,
  AtomicTestCase,
  GradingResult,
  ProviderResponse,
} from '../types';

export type VerifierReceipt = {
  location: string;
  sourcePath?: string;
  value: string;
};

export const protectedReceiptScope = new AsyncLocalStorage<{
  receipts: Map<string, VerifierReceipt[]>;
  receiptPaths: Map<string, string>;
  assertionValues: Map<Assertion, { value: Assertion['value'] } | { error: unknown }>;
}>();

export function getProtectedAssertionValue(assertion: Assertion): Assertion['value'] {
  const captured = protectedReceiptScope.getStore()?.assertionValues.get(assertion);
  if (!captured) {
    return assertion.value;
  }
  if ('error' in captured) {
    throw captured.error;
  }
  return captured.value;
}

export const TRACE_REDACTION_ASSERTIONS = new Set([
  'promptfoo:redteam:coding-agent:trace-redaction',
  'promptfoo:redteam:harness:artifact-redaction',
]);

/** Project model-grading inputs after local verifiers have used the original receipts. */
export function sanitizeRedactionGradingInputs<T extends AtomicTestCase>(
  type: string,
  test: T,
  value: Assertion['value'],
) {
  return sanitizeCodingAgentVerifierInputs(
    { type, assert: test.assert, test, value },
    { preservePaths: false },
  );
}

// Non-enumerable on wrapper-created assertions; JSON target responses cannot carry this marker.
export const TRUSTED_REDACTION_GRADER = Symbol.for('promptfoo.trustedRedactionGrader');

export function getAssertionLeaves(assertions: AssertionOrSet[] | undefined): Assertion[] {
  const leaves: Assertion[] = [];
  const ancestors = new Set<AssertionOrSet>();
  const pending = (assertions ?? [])
    .slice()
    .reverse()
    .map((assertion) => ({ assertion, exit: false }));
  while (pending.length) {
    const { assertion, exit } = pending.pop()!;
    if (exit) {
      ancestors.delete(assertion);
      continue;
    }
    if (assertion.type === 'assert-set') {
      if (ancestors.has(assertion)) {
        continue;
      }
      ancestors.add(assertion);
      pending.push({ assertion, exit: true });
      pending.push(
        ...assertion.assert
          .slice()
          .reverse()
          .map((child) => ({ assertion: child, exit: false })),
      );
    } else {
      leaves.push(assertion);
    }
  }
  return leaves;
}

export function requiresTraceRedaction(assertions: AssertionOrSet[] | undefined): boolean {
  return getAssertionLeaves(assertions).some((assertion) =>
    TRACE_REDACTION_ASSERTIONS.has(assertion.type.replace(/^not-/, '')),
  );
}

function hasMarkdownImage(text: string): boolean {
  if (!text.includes('![')) {
    return false;
  }
  if (text.length > 16 * 1024 * 1024) {
    return true;
  }
  try {
    let hasImage = false;
    marked.walkTokens(marked.lexer(text), (token) => {
      hasImage ||= token.type === 'image';
    });
    return hasImage;
  } catch {
    // If Markdown cannot be inspected, the privacy check cannot accept its media.
    return true;
  }
}

function hasHtmlMedia(text: string): boolean {
  if (!/<[a-z]/i.test(text)) {
    return false;
  }
  if (text.length > 16 * 1024 * 1024) {
    return true;
  }
  const pending: DefaultTreeAdapterMap['node'][] = [parseFragment(text)];
  while (pending.length) {
    const node = pending.pop()!;
    if ('tagName' in node) {
      if (
        (node.tagName === 'input' &&
          node.attrs.some(
            ({ name, value }) => name === 'type' && value.toLowerCase() === 'image',
          )) ||
        (node.tagName === 'link' &&
          node.attrs.some(
            ({ name, value }) =>
              name === 'rel' && value.toLowerCase().split(/\s+/).includes('stylesheet'),
          ))
      ) {
        return true;
      }
      const styles = node.attrs.filter(({ name }) => name === 'style').map(({ value }) => value);
      if (node.tagName === 'style') {
        styles.push(node.childNodes.map((child) => ('value' in child ? child.value : '')).join(''));
      }
      // Escaped CSS can hide loaded media. Quoted comment markers may be literal text,
      // so inspect that CSS conservatively instead of stripping apparent comments.
      if (
        styles.some((style) =>
          /\\|\b(?:url|image|(?:-webkit-)?image-set)\s*\(|@import\b/i.test(
            /["']/.test(style) ? style : style.replace(/\/\*[\s\S]*?(?:\*\/|$)/g, ''),
          ),
        )
      ) {
        return true;
      }
    }
    if ('childNodes' in node) {
      for (const child of node.childNodes) {
        pending.push(child);
      }
    }
  }
  return false;
}

export function hasRedactionMedia(response: ProviderResponse | null | undefined): boolean {
  const pending: unknown[] = [response];
  const seen = new Set<object>();
  const seenText = new Set<string>();
  let inspected = 0;
  let inspectedBytes = 0;
  while (pending.length) {
    if (++inspected > 10000) {
      return true;
    }
    const value = pending.pop();
    if (typeof value === 'string') {
      let text = value;
      if (seenText.has(text)) {
        continue;
      }
      seenText.add(text);
      for (let depth = 0; ; depth++) {
        inspectedBytes += Buffer.byteLength(text);
        if (inspectedBytes > 32 * 1024 * 1024) {
          return true;
        }
        if (!/%[\da-f]{2}/i.test(text)) {
          break;
        }
        if (depth === 8) {
          return true;
        }
        try {
          text = decodeURIComponent(text);
        } catch {
          return true;
        }
      }
      if (
        text.includes(BLOB_SCHEME) ||
        /data:(?:audio|image|video)\/|<(?:svg|img|audio|video|picture|source|object|embed)(?:\s|\/?>)/i.test(
          text,
        ) ||
        hasHtmlMedia(text) ||
        hasMarkdownImage(text)
      ) {
        return true;
      }
      if (/^\s*[[{"]/.test(text)) {
        try {
          pending.push(JSON.parse(text));
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
        ([record.mimeType, record.mime_type, record.mediaType, record.media_type].some(
          (mime) => typeof mime === 'string' && /^\s*(?:image|audio|video)\//i.test(mime),
        ) &&
          [
            record.data,
            record.raw,
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

function sanitizeRedactionGrade(result: GradingResult): GradingResult {
  const evidence = result.metadata?.verifierEvidence;
  return {
    ...result,
    ...(result.metadata && {
      metadata: {
        ...result.metadata,
        renderedGradingPrompt: undefined,
        ...(evidence && {
          verifierEvidence: Object.fromEntries(
            Object.entries(evidence).filter(([key]) =>
              [
                'failureKind',
                'artifactByteLength',
                'redactedArtifactByteLength',
                'redactedArtifactSha256',
                'redactionReceiptByteLength',
                'redactionReceiptSha256',
              ].includes(key),
            ),
          ),
        }),
      },
    }),
    ...(result.componentResults && {
      componentResults: result.componentResults.map(sanitizeRedactionGrade),
    }),
  };
}

/** Keep privacy-check response bodies and their echoes out of public result copies. */
export function sanitizeRedactionResult<T extends object>(input: T): T {
  const result = input as T & {
    testCase?: AtomicTestCase;
    vars?: Record<string, unknown>;
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
  const publicInputs = sanitizeCodingAgentVerifierInputs({
    assert: result.testCase?.assert,
    testCase: result.testCase,
    vars: result.vars,
    gradingResult: result.gradingResult,
    metadata: result.metadata,
  });
  const { testCase, vars } = publicInputs;
  const metadata = { ...publicInputs.metadata };
  for (const key of Object.keys(response?.metadata ?? {})) {
    if (testCase?.metadata && Object.prototype.hasOwnProperty.call(testCase.metadata, key)) {
      metadata[key] = testCase.metadata[key];
    } else {
      delete metadata[key];
    }
  }
  delete metadata.errorContext;
  delete metadata.sessionId;
  delete metadata.redteamHistory;
  const error = result.error ? 'Error details omitted for trace/artifact redaction.' : result.error;
  const gradingResult = publicInputs.gradingResult
    ? sanitizeRedactionGrade(publicInputs.gradingResult)
    : publicInputs.gradingResult;
  if (!response) {
    return { ...input, ...accounting, testCase, vars, error, metadata, gradingResult };
  }
  return {
    ...input,
    ...accounting,
    testCase,
    vars,
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
