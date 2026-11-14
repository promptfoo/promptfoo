import { matchesLlmRubric } from '../matchers/llmGrading';
import invariant from '../util/invariant';
import { finalizeGradedAssertion } from './ragDefaults';

import type {
  AssertionEvidence,
  AssertionParams,
  EvidenceEntry,
  GradingResult,
} from '../types/index';

/**
 * Maximum depth for evidence value cloning. Prevents pathological objects
 * (e.g., deeply nested trees or list-of-lists-of-lists…) from consuming
 * unbounded memory even when the byte-truncation step would eventually cut
 * them short. The limit is generous enough for realistic metadata (tool
 * traces, file-change summaries) but tight enough to bound local work.
 */
const MAX_EVIDENCE_DEPTH = 20;

/**
 * Walk an evidence path (already validated by `validateEvidencePath`) and return
 * the value under metadata at that path. Returns `undefined` when the path does
 * not resolve.
 *
 * The path is a dotted identifier like `metadata.fileChanges.0.path`. The leading
 * `metadata` segment is stripped before walking the remaining segments.
 */
export function getMetadataPathValue(metadata: unknown, path: string): unknown {
  if (typeof path !== 'string' || !path.startsWith('metadata')) {
    return undefined;
  }
  const parts = path.split('.').slice(1);
  let value: unknown = metadata;
  for (const part of parts) {
    if (value === null || value === undefined || typeof value !== 'object') {
      return undefined;
    }
    const rec = value as Record<string, unknown>;
    // Support both `array.0` and `array."0"` — either works for a numeric index.
    value = rec[part];
  }
  return value;
}

/**
 * Return a deep-cloned copy of `value` with all back-references to any object
 * in the path ancestor chain replaced by a sentinel string.
 *
 * We use this to isolate a selected metadata subtree from its parent `metadata`
 * root before serialising it for the grader — otherwise a selected child that
 * holds a reference back to an intermediate ancestor (e.g. `metadata.run.files.parent = metadata.run`
 * while projecting `metadata.run.files`) would leak sibling fields from that
 * ancestor into the evidence block.
 *
 * The ancestors are collected by walking the validated `path` from `root` to
 * the endpoint, so cyclic endpoint cases (e.g. `metadata.self = metadata` with
 * `from: metadata.self`) still block the ancestor object correctly.
 *
 * We also use an ancestor stack for in-cycle detection inside the cloned
 * subtree, instead of a global WeakSet — this preserves non-circular shared
 * references (common in trace entries or summaries) while still eliding real
 * cycles.
 */
function isolateEvidenceValue(value: unknown, root: object | null, path: string, maxBytes: number) {
  if (root === null || value === null || typeof value !== 'object') {
    return { value, limited: false };
  }

  // The path is known here, so discover ancestors without scanning sibling fields.
  const ancestors: object[] = [root];
  let current: unknown = root;
  for (const part of path.split('.').slice(1)) {
    if (current === null || typeof current !== 'object') {
      break;
    }
    current = (current as Record<string, unknown>)[part];
    if (current !== null && typeof current === 'object') {
      ancestors.push(current);
    }
  }

  // Build the ancestor set for back-reference elision. We exclude:
  //   - The endpoint itself (which we're cloning and must preserve)
  //   - Any ancestor that IS the same object as the endpoint (cyclic-endpoint
  //     case where the selected path points to an ancestor)
  const ancestorSet = new WeakSet<object>(ancestors.filter((ancestor) => ancestor !== value));
  // A byte limit cannot usefully include more entries than bytes. Cap the
  // walk as well, so a small projection need not clone an entire wide subtree.
  let remainingEntries = Math.max(0, Math.min(maxBytes, 65_536));
  let limited = false;

  function takeEntry(): boolean {
    if (!(remainingEntries > 0)) {
      limited = true;
      return false;
    }
    remainingEntries--;
    return true;
  }

  function clone(v: unknown, pathAncestors: object[] = [], depth: number = 0): unknown {
    if (v === null || v === undefined) {
      return v;
    }
    if (typeof v !== 'object') {
      return v;
    }
    // Bounded depth — replace anything past the limit with a sentinel so we
    // can still serialise the outer structure without blowing up on nested
    // monstrosities.
    if (depth >= MAX_EVIDENCE_DEPTH) {
      return '[Max depth exceeded]';
    }
    const obj = v as object;
    // Back-reference to a metadata-path ancestor — must be elided to prevent
    // leaking unselected siblings through cyclic pointers.
    if (ancestorSet.has(obj)) {
      return '[Back-reference to metadata ancestor omitted]';
    }
    // Real cycle in the cloned subtree — elide. Using an ancestor stack (not
    // a global WeakSet) so shared-but-non-circular objects are preserved.
    if (pathAncestors.includes(obj)) {
      return '[Cycle omitted]';
    }
    const nextAncestors = [...pathAncestors, obj];
    if (Array.isArray(v)) {
      const out: unknown[] = [];
      for (let index = 0; index < v.length && takeEntry(); index++) {
        out.push(clone(v[index], nextAncestors, depth + 1));
      }
      return out;
    }
    const record = v as Record<string, unknown>;
    const out: Record<string, unknown> = Object.create(null);
    for (const key in record) {
      if (!Object.prototype.hasOwnProperty.call(record, key)) {
        continue;
      }
      if (!takeEntry()) {
        break;
      }
      out[key] = clone(record[key], nextAncestors, depth + 1);
    }
    return out;
  }

  const isolated = clone(value);
  return { value: isolated, limited };
}

/**
 * Truncate a UTF-8 string so that its encoded form fits within `maxBytes`.
 *
 * We slice at a UTF-8 code-unit boundary that is also a valid UTF-8
 * byte-sequence boundary, so re-decoding never produces replacement
 * characters from a truncated trailing multibyte sequence.
 */
function truncateToMaxBytes(value: string, maxBytes: number) {
  if (!Number.isFinite(maxBytes) || maxBytes <= 0) {
    return { value: '', truncated: true };
  }
  const bytes = Buffer.from(value, 'utf8');
  if (bytes.byteLength <= maxBytes) {
    return { value, truncated: false };
  }

  // Walk backwards from maxBytes to find a safe cut point that does not split
  // a UTF-8 continuation byte (0x80..0xBF) from its lead byte.
  let safeEnd = maxBytes;
  while (safeEnd > 0) {
    const b = bytes[safeEnd];
    if (b === undefined || (b & 0xc0) !== 0x80) {
      break;
    }
    safeEnd--;
  }
  // After walking back over continuation bytes, `safeEnd` is already the
  // correct exclusive cut point. When we land at a multi-byte lead byte,
  // that entire character lies at indices [safeEnd, safeEnd+N), which is
  // outside our slice — we already cut before it. No further decrement is
  // needed; doing so would land inside the *preceding* multibyte character's
  // continuation bytes and corrupt otherwise-complete evidence.
  const sliced = bytes.subarray(0, safeEnd).toString('utf8');
  return { value: sliced, truncated: true };
}

/**
 * Escape characters inside evidence content that could break prompt XML/YAML
 * boundaries. We escape `<`, `>`, and `&` so retrieved documents or tool
 * traces cannot close <Output>, <Evidence>, or Markdown fence markers.
 */
function escapeEvidenceContent(raw: string): string {
  return raw.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/**
 * Serialize a single evidence value to a compact JSON string suitable for
 * the grader prompt. Replaces bigints with their string representation.
 */
function serializeEvidenceValue(value: unknown): string {
  try {
    return JSON.stringify(value, (_key, nestedValue) => {
      if (typeof nestedValue === 'bigint') {
        return nestedValue.toString();
      }
      return nestedValue;
    });
  } catch {
    return String(value);
  }
}

/**
 * Project assertion evidence entries from provider metadata.
 *
 * Each configured `from` path walks the metadata, breaks any back-references
 * to metadata ancestors (preventing unselected siblings from leaking through
 * cyclic pointers), clones with a depth limit, serialises to compact JSON,
 * escapes XML boundary characters, and truncates to the configured byte limit.
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

  const rootIsObject = metadata !== null && typeof metadata === 'object';
  const rootObj = rootIsObject ? (metadata as object) : null;

  const projected: EvidenceEntry[] = [];
  for (const item of evidence) {
    const rawValue = getMetadataPathValue(metadata, item.from);
    if (rawValue === undefined) {
      continue;
    }

    // Break any back-reference from this subtree to the metadata root before
    // we serialise — prevents sibling keys (including credentials) from leaking
    // through a selected child's parent pointer. Pass the validated path so
    // ancestors are collected correctly even when the selected endpoint IS a
    // cyclic ancestor (e.g. `metadata.self = metadata` with `from: metadata.self`).
    const isolated = isolateEvidenceValue(rawValue, rootObj, item.from, item.maxBytes);

    // Serialise → escape → truncate. Escape BEFORE truncation so the byte limit
    // bounds the FINAL grader-facing content — an HTML-rich payload would
    // otherwise expand 4-5× after truncation and exceed the requested limit.
    const serialized = serializeEvidenceValue(isolated.value);
    const escaped = escapeEvidenceContent(serialized);
    const truncated = truncateToMaxBytes(escaped, item.maxBytes);

    projected.push({
      from: item.from,
      label: item.label || item.from,
      value: truncated.value,
      truncated: isolated.limited || truncated.truncated,
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
  const evidence = projectEvidenceValues(assertion.evidence, providerResponse?.metadata);

  // Only forward provider media to the matcher when (a) we have evidence
  // to inject or (b) there is no assertion transform. When `assertion.transform`
  // is set, the `outputString` passed above is the transformed text, so the
  // original provider images/audio no longer correspond — the matcher would
  // end up grading transformed text against stale media.
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
