import { matchesLlmRubric } from '../matchers/llmGrading';
import invariant from '../util/invariant';
import { finalizeGradedAssertion } from './ragDefaults';

import type { AssertionEvidence, AssertionParams, GradingResult } from '../types/index';

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
function breakCyclesAgainstRoot<T>(value: T, root: object | null, path?: string): T {
  if (root === null || value === null || (typeof value !== 'object' && !Array.isArray(value))) {
    return value;
  }

  // Collect every ancestor from root down through value. Walking the validated
  // path (when available) is more reliable than DFS discovery because it never
  // follows cycles arbitrarily and naturally handles the cyclic-endpoint case
  // where the endpoint IS one of its own ancestors.
  const ancestors: object[] = [];
  if (path && path.startsWith('metadata')) {
    const parts = path.split('.').slice(1);
    ancestors.push(root as object);
    let current: unknown = root;
    for (const part of parts) {
      if (current === null || current === undefined || typeof current !== 'object') {
        break;
      }
      const rec = current as Record<string, unknown>;
      const next = rec[part];
      if (next !== null && next !== undefined && typeof next === 'object') {
        ancestors.push(next as object);
      }
      current = next;
    }
  } else {
    // Fallback: discover ancestors by DFS (only used when no path is available).
    function collectAncestors(v: unknown, target: unknown): boolean {
      if (v === null || v === undefined || typeof v !== 'object') {
        return false;
      }
      ancestors.push(v as object);
      if (v === target) {
        return true;
      }
      if (Array.isArray(v)) {
        for (const item of v) {
          if (collectAncestors(item, target)) {
            return true;
          }
        }
      } else {
        for (const child of Object.values(v as Record<string, unknown>)) {
          if (collectAncestors(child, target)) {
            return true;
          }
        }
      }
      ancestors.pop();
      return false;
    }
    collectAncestors(root, value);
  }

  // Build the ancestor set for back-reference elision. We exclude:
  //   - The endpoint itself (which we're cloning and must preserve)
  //   - Any ancestor that IS the same object as the endpoint (cyclic-endpoint
  //     case where the selected path points to an ancestor)
  const endpointObj = value as unknown;
  const ancestorSet = new WeakSet<object>(ancestors.filter((a) => a !== endpointObj));

  function clone(v: unknown, pathAncestors: object[] = []): unknown {
    if (v === null || v === undefined) {
      return v;
    }
    if (typeof v !== 'object') {
      return v;
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
      return v.map((item) => clone(item, nextAncestors));
    }
    const out: Record<string, unknown> = {};
    for (const [k, child] of Object.entries(v as Record<string, unknown>)) {
      out[k] = clone(child, nextAncestors);
    }
    return out;
  }

  return clone(value) as T;
}

/**
 * Deep-clone a value while replacing actual cyclic references (where an
 * object points back to one of its own ancestors) with `[Circular]`.
 *
 * Repeated references to the same object in non-circular positions are
 * preserved — direct JavaScript providers can legitimately share objects
 * between trace entries or summaries, and we should not silently drop
 * those associations.
 */
function safeClone(value: unknown, ancestors: object[] = []): unknown {
  if (value === null || value === undefined) {
    return value;
  }
  if (typeof value !== 'object') {
    return value;
  }

  const obj = value as object;
  // Is this object one of its own ancestors? If so, that's a real cycle.
  if (ancestors.includes(obj)) {
    return '[Circular]';
  }

  const nextAncestors = [...ancestors, obj];

  if (Array.isArray(value)) {
    return value.map((item) => safeClone(item, nextAncestors));
  }
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    out[k] = safeClone(v, nextAncestors);
  }
  return out;
}

function stringifyEvidenceValue(value: unknown) {
  try {
    const cloned = safeClone(value);
    return JSON.stringify(
      cloned,
      (_key, nestedValue) => {
        if (typeof nestedValue === 'bigint') {
          return nestedValue.toString();
        }
        return nestedValue;
      },
      2,
    );
  } catch {
    return String(value);
  }
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
 * Escape characters inside an evidence block so they cannot be mistaken for
 * the surrounding block's XML markers or Markdown fence.
 *
 * We wrap evidence content in an XML-style `<evidence>` block and escape
 * embedded `<` / `>` / `&` characters, plus any literal fence delimiters that
 * might otherwise terminate a Markdown code fence unexpectedly.
 */
function escapeEvidenceContent(raw: string): string {
  return raw.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export function renderEvidenceBlock(
  evidence: AssertionEvidence[] | undefined,
  metadata: unknown,
): string | undefined {
  if (!evidence?.length || metadata === undefined) {
    return undefined;
  }

  const projected = evidence.flatMap((item) => {
    const value = getMetadataPathValue(metadata, item.from);
    if (value === undefined) {
      return [];
    }

    // Break any back-reference from this subtree to the metadata root before we
    // serialise — prevents sibling keys (including credentials) from leaking
    // through a selected child's parent pointer. Pass the validated path so
    // ancestors are collected correctly even when the selected endpoint IS a
    // cyclic ancestor (e.g. `metadata.self = metadata` with `from: metadata.self`).
    const isolated = breakCyclesAgainstRoot(
      value,
      metadata !== null && typeof metadata === 'object' ? (metadata as object) : null,
      item.from,
    );

    const serialized = stringifyEvidenceValue(isolated) ?? String(isolated);
    // Escape before truncation so the displayed `maxBytes` limit bounds the
    // final grader-facing content. Escaping `<`/`>`/`&` into 4-5 byte entities
    // after truncation would otherwise let an HTML-rich payload exceed the
    // requested limit (e.g. 65536 bytes of raw `<div>` would become ~256 KiB).
    const escaped = escapeEvidenceContent(serialized);
    const truncated = truncateToMaxBytes(escaped, item.maxBytes);
    const label = item.label || item.from;

    return [
      [
        `### ${label}`,
        `Source: ${item.from}`,
        `Limit: ${item.maxBytes} bytes${truncated.truncated ? ` (truncated to ${item.maxBytes} bytes)` : ''}`,
        '<evidence>',
        truncated.value,
        '</evidence>',
      ].join('\n'),
    ];
  });

  if (!projected.length) {
    return undefined;
  }

  return ['---', 'Additional evidence for grading', ...projected].join('\n\n');
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
  // Instead, we pass the evidence block separately to the matcher so the
  // grader can inject it after output normalisation.
  const evidenceBlock = renderEvidenceBlock(assertion.evidence, providerResponse?.metadata);

  // Only forward provider media to the matcher when (a) we have evidence
  // to inject or (b) there is no assertion transform. When `assertion.transform`
  // is set, the `outputString` passed above is the transformed text, so the
  // original provider images/audio no longer correspond — the matcher would
  // end up grading transformed text against stale media.
  const hasMedia =
    !assertion.transform && (providerResponse?.images?.length || providerResponse?.audio);
  const matcherOptions =
    evidenceBlock || hasMedia
      ? {
          ...(evidenceBlock ? { evidenceBlock } : {}),
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
