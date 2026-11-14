import { matchesLlmRubric } from '../matchers/llmGrading';
import invariant from '../util/invariant';
import { finalizeGradedAssertion } from './ragDefaults';

import type {
  AssertionEvidence,
  AssertionParams,
  EvidenceEntry,
  GradingResult,
} from '../types/index';

/** Bound recursion independently of the serialized byte budget. */
const MAX_EVIDENCE_DEPTH = 20;

/**
 * Walk an evidence path (already validated by `validateEvidencePath`) and return
 * the value under metadata at that path. Returns `undefined` when the path does
 * not resolve.
 *
 * The path is a dotted identifier like `metadata.fileChanges.0.path`. The leading
 * `metadata` segment is stripped before walking the remaining segments.
 */
export function getMetadataPathValue(
  metadata: unknown,
  path: string,
  ancestors?: WeakSet<object>,
): unknown {
  if (typeof path !== 'string' || !path.startsWith('metadata.')) {
    return undefined;
  }
  const parts = path.split('.').slice(1);
  let value: unknown = metadata;
  for (const part of parts) {
    if (value === null || value === undefined || typeof value !== 'object') {
      return undefined;
    }
    if (!Object.prototype.hasOwnProperty.call(value, part)) {
      return undefined;
    }
    ancestors?.add(value);
    const rec = value as Record<string, unknown>;
    value = rec[part];
  }
  return value;
}

/** Write the XML-escaped JSON prefix directly, stopping on a UTF-8 boundary. */
function serializeEvidencePrefix(value: unknown, ancestors: WeakSet<object>, maxBytes: number) {
  let remaining = Number.isFinite(maxBytes) ? Math.max(0, maxBytes) : 0;
  let remainingKeys = Math.min(remaining, 65_536);
  let output = '';
  let truncated = false;
  const active = new WeakSet<object>();

  function append(text: string) {
    if (truncated) {
      return;
    }
    for (const char of text) {
      const bytes = Buffer.byteLength(char);
      if (bytes > remaining) {
        truncated = true;
        return;
      }
      output += char;
      remaining -= bytes;
    }
  }

  function writeString(text: string) {
    append('"');
    for (const char of text) {
      if (truncated) {
        return;
      }
      // Escape one code point at a time so a large input string is never copied in full.
      const escaped = JSON.stringify(char).slice(1, -1);
      append(escaped.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'));
    }
    append('"');
  }

  function writeArray(entry: unknown[], depth: number) {
    append('[');
    for (let i = 0; i < entry.length && !truncated; i++) {
      if (i > 0) {
        append(',');
      }
      if (!truncated) {
        write(entry[i], depth + 1);
      }
    }
    append(']');
  }

  function writeObject(entry: Record<string, unknown>, depth: number) {
    append('{');
    let first = true;
    for (const key in entry) {
      if (truncated || remainingKeys-- <= 0) {
        truncated = true;
        break;
      }
      if (!Object.prototype.hasOwnProperty.call(entry, key)) {
        continue;
      }
      const child = entry[key];
      if (child === undefined || typeof child === 'symbol' || typeof child === 'function') {
        continue;
      }
      if (!first) {
        append(',');
      }
      first = false;
      writeString(key);
      append(':');
      if (!truncated) {
        write(child, depth + 1);
      }
    }
    append('}');
  }

  function write(entry: unknown, depth: number) {
    if (typeof entry === 'string' || typeof entry === 'bigint') {
      writeString(String(entry));
    } else if (entry === null || typeof entry !== 'object') {
      append(JSON.stringify(entry) ?? 'null');
    } else if (ancestors.has(entry)) {
      writeString('[Back-reference to metadata ancestor omitted]');
    } else if (active.has(entry)) {
      writeString('[Cycle omitted]');
    } else if (depth >= MAX_EVIDENCE_DEPTH) {
      writeString('[Max depth exceeded]');
    } else {
      active.add(entry);
      if (Array.isArray(entry)) {
        writeArray(entry, depth);
      } else {
        writeObject(entry as Record<string, unknown>, depth);
      }
      active.delete(entry);
    }
  }

  write(value, 0);
  return { value: output, truncated };
}

/**
 * Project assertion evidence entries from provider metadata.
 *
 * Each configured `from` path walks the metadata, breaks any back-references
 * to metadata ancestors (preventing unselected siblings from leaking through
 * cyclic pointers), and writes a bounded prefix of XML-escaped compact JSON.
 *
 * The resulting entries form a structured `evidence` variable for the grader
 * — they are NOT appended to the candidate output and are NOT auto-injected
 * into the prompt. Custom rubrics use Nunjucks `{{ evidence }}` (or the
 * individual fields) to decide how to present them.
 *
 * Returns `undefined` when no evidence is configured, the metadata is absent,
 * or every configured path resolves to `undefined`.
 */
export function projectEvidenceValues(
  evidence: AssertionEvidence[] | undefined,
  metadata: unknown,
): EvidenceEntry[] | undefined {
  if (!evidence?.length || metadata === undefined) {
    return undefined;
  }

  const projected: EvidenceEntry[] = [];
  for (const item of evidence) {
    const ancestors = new WeakSet<object>();
    const rawValue = getMetadataPathValue(metadata, item.from, ancestors);
    if (rawValue === undefined || typeof rawValue === 'symbol' || typeof rawValue === 'function') {
      continue;
    }

    const prefix = serializeEvidencePrefix(rawValue, ancestors, item.maxBytes);

    projected.push({
      from: item.from,
      label: item.label || item.from,
      ...prefix,
      maxBytes: item.maxBytes,
    });
  }

  if (projected.length === 0) {
    return undefined;
  }

  return projected;
}

export const handleLlmRubric = async ({
  assertion,
  inverse,
  renderedValue,
  outputString,
  providerResponse,
  test,
  providerCallContext,
}: AssertionParams): Promise<GradingResult> => {
  invariant(
    typeof renderedValue === 'string' ||
      typeof renderedValue === 'object' ||
      typeof renderedValue === 'undefined',
    '"llm-rubric" assertion type must have a string or object value',
  );
  if (test.options?.rubricPrompt && typeof test.options.rubricPrompt === 'object') {
    test.options.rubricPrompt = JSON.stringify(test.options.rubricPrompt);
  }

  // Update the assertion value. This allows the web view to display the prompt.
  assertion.value = assertion.value || test.options?.rubricPrompt;

  // IMPORTANT: we deliberately do NOT append evidence to `outputString` here.
  // Doing so would (a) break `tryParse` on structured JSON outputs so that
  // custom rubric templates with `{{output.field}}` stop working, and (b)
  // corrupt the image-output comparison inside getGradingOutputForImages.
  // Instead, we project evidence as a structured entry and pass it separately
  // to the matcher so the grader receives it as its own `evidence` variable.
  const evidence = assertion.evidence?.length
    ? (projectEvidenceValues(assertion.evidence, providerResponse?.metadata) ?? [])
    : undefined;

  // A transform replaces the candidate output, so the original media no longer corresponds.
  const hasMedia =
    !assertion.transform && (providerResponse?.images?.length || providerResponse?.audio);
  const matcherOptions =
    evidence || hasMedia
      ? {
          ...(evidence ? { evidence } : {}),
          ...(hasMedia ? { providerResponse } : {}),
        }
      : undefined;

  const resp = await matchesLlmRubric(
    renderedValue || '',
    outputString,
    test.options,
    test.vars,
    assertion,
    matcherOptions,
    providerCallContext,
  );

  return finalizeGradedAssertion(resp, assertion, inverse);
};
