import type { GradingResult, TokenUsage } from '../types/index';

/**
 * Normalize token usage for matcher results. Unlike the evaluator-level
 * normalizeTokenUsage, this excludes the `assertions` field and preserves
 * the existing completionDetails shape and any incurred usage reported by
 * the provider.
 */
export function normalizeMatcherTokenUsage(
  tokenUsage: Partial<TokenUsage> | undefined,
): TokenUsage {
  const prompt = tokenUsage?.prompt ?? 0;
  const completion = tokenUsage?.completion ?? 0;
  const cached = tokenUsage?.cached ?? 0;
  const componentTotal = prompt + completion;
  const cachedResponse = tokenUsage?.numRequests === 0 && cached > 0 && componentTotal <= cached;

  return {
    total: tokenUsage?.total ?? (cachedResponse ? 0 : componentTotal),
    prompt,
    completion,
    cached,
    numRequests: tokenUsage?.numRequests ?? 0,
    completionDetails: tokenUsage?.completionDetails || {
      reasoning: 0,
      acceptedPrediction: 0,
      rejectedPrediction: 0,
    },
    ...(tokenUsage?.incurredTokenUsage && {
      incurredTokenUsage: tokenUsage.incurredTokenUsage,
    }),
  };
}

export function fail(
  reason: string,
  tokensUsed?: Partial<TokenUsage>,
): Omit<GradingResult, 'assertion'> {
  return {
    pass: false,
    reason,
    score: 0,
    tokensUsed: normalizeMatcherTokenUsage(tokensUsed),
  };
}

/**
 * Same shape as `fail`, but tagged with `metadata.graderError` so inverse-aware
 * callers (e.g. `not-llm-rubric`, `not-g-eval`, `not-trajectory:goal-success`)
 * propagate the failure verbatim rather than flipping a transport/parse error
 * into a spurious pass.
 */
export function graderFail(
  reason: string,
  tokensUsed?: Partial<TokenUsage>,
): Omit<GradingResult, 'assertion'> {
  return {
    ...fail(reason, tokensUsed),
    metadata: { graderError: true },
  };
}

export function cosineSimilarity(vecA: number[], vecB: number[]): number {
  if (vecA.length !== vecB.length) {
    throw new Error('Vectors must be of equal length');
  }
  const dotProduct = vecA.reduce((acc, val, idx) => acc + val * vecB[idx], 0);
  const vecAMagnitude = Math.sqrt(vecA.reduce((acc, val) => acc + val * val, 0));
  const vecBMagnitude = Math.sqrt(vecB.reduce((acc, val) => acc + val * val, 0));
  if (vecAMagnitude === 0 || vecBMagnitude === 0) {
    return 0;
  }
  return dotProduct / (vecAMagnitude * vecBMagnitude);
}

export function dotProduct(vecA: number[], vecB: number[]): number {
  if (vecA.length !== vecB.length) {
    throw new Error('Vectors must be of equal length');
  }
  return vecA.reduce((acc, val, idx) => acc + val * vecB[idx], 0);
}

export function euclideanDistance(vecA: number[], vecB: number[]): number {
  if (vecA.length !== vecB.length) {
    throw new Error('Vectors must be of equal length');
  }
  const sumSquaredDiff = vecA.reduce((acc, val, idx) => {
    const diff = val - vecB[idx];
    return acc + diff * diff;
  }, 0);
  return Math.sqrt(sumSquaredDiff);
}

export function tryParse(content: string) {
  try {
    return JSON.parse(content);
  } catch {}
  return content;
}

export function splitIntoSentences(text: string) {
  const cleaned = stripLeadingHeaders(text);
  if (!cleaned) {
    return [];
  }
  return cleaned.split('\n').filter((sentence) => sentence.trim() !== '');
}

const PREAMBLE_LABEL_PATTERN =
  /^(?:#{1,6}\s+)?(?:\*{1,2}|_{1,2}|`+)?\s*(?:(?:candidate|extracted|relevant|selected)\s+(?:(?:sentences?|context|passages?|information|units?)\b(?:\([sS]\))?)|context\s+relevance\b)(?:\s*[:])?(?:\*{1,2}|_{1,2}|`+)?\s*:?\s*/i;

const MARKDOWN_HEADER_LINE_PATTERN = /^#{1,6}\s+(.*)$/;

/**
 * Strips leading markdown headers and preamble labels (e.g., "# Extracted sentences",
 * "## Relevant Context:", "**Candidate sentences:**", "Extracted sentences:") from text
 * before sentence extraction, preventing grader or context preambles from inflating sentence counts.
 */
export function stripLeadingHeaders(text: string): string {
  if (!text || typeof text !== 'string') {
    return '';
  }

  const lines = text.split('\n');
  let startIdx = 0;

  // Skip leading empty lines
  while (startIdx < lines.length && lines[startIdx].trim() === '') {
    startIdx++;
  }

  while (startIdx < lines.length) {
    const line = lines[startIdx].trim();
    if (line === '') {
      startIdx++;
      continue;
    }

    // Check if line starts with a preamble label (e.g. "Extracted sentences:", "# Relevant Context:", "**Candidate sentences:**")
    const preambleMatch = line.match(PREAMBLE_LABEL_PATTERN);
    if (preambleMatch) {
      const rest = line.slice(preambleMatch[0].length).trim();
      if (rest.length > 0) {
        // Preamble was inline; replace current line with the content after the preamble label
        lines[startIdx] = rest;
        break;
      } else {
        // Entire line was just a preamble label; skip it and check next line
        startIdx++;
        continue;
      }
    }

    // Check if line is a markdown header line (e.g., "# Extracted sentences", "## Analysis")
    const headerMatch = line.match(MARKDOWN_HEADER_LINE_PATTERN);
    if (headerMatch) {
      const hasSubsequentContent = lines.slice(startIdx + 1).some((l) => l.trim().length > 0);
      if (hasSubsequentContent) {
        startIdx++;
        continue;
      } else {
        // Single line remaining with markdown header marker
        const headerContent = headerMatch[1].trim();
        if (
          /^(?:candidate|extracted|relevant|context|sentences?|results?|analysis|output)$/i.test(
            headerContent.replace(/[:*`_#]/g, '').trim(),
          )
        ) {
          startIdx++;
          continue;
        } else {
          lines[startIdx] = headerContent;
          break;
        }
      }
    }

    // Not a header or preamble label
    break;
  }

  return lines.slice(startIdx).join('\n').trim();
}

/**
 * Segments text into units for sentence-level metrics (e.g. the RAGAS context
 * relevance denominator).
 *
 * Text that spans **two or more** non-empty lines is treated as already segmented
 * (one unit per line) — a context passed one chunk/sentence per line. This also
 * avoids mis-splitting abbreviations (e.g. "i.e.", "U.S.") in pre-formatted text.
 *
 * Otherwise the text is a single prose block (the common shape of a retrieved RAG
 * passage) and is segmented on sentence boundaries (`.`, `!`, `?` followed by
 * whitespace). This is the important case: {@link splitIntoSentences} splits on
 * newlines only, so a prose passage with no newlines collapses to a single unit,
 * forcing the denominator to 1 and the score to ~1.0 regardless of relevance.
 *
 * The "two or more lines" threshold (rather than the mere presence of a newline)
 * is deliberate: it keeps a prose paragraph carrying an incidental leading/trailing
 * newline — common when a context is loaded from a file, a template, or a YAML
 * block scalar — in the prose branch instead of collapsing it to one unit.
 *
 * Note: the sentence split is a lightweight heuristic and does not handle every
 * edge case (e.g. decimals like "3.14", abbreviations); full segmentation would
 * need an NLP tokenizer. It is a substantial improvement over newline-only
 * splitting for the common prose case.
 *
 * Bare enumeration markers are dropped: splitting an inline numbered list such as
 * "1. Paris is the capital. 2. France is in Europe." on the sentence boundary
 * strands the "1." / "2." markers as their own segments, which would inflate
 * sentence-level counts (e.g. the RAGAS context-relevance numerator). A segment
 * that is only a list marker carries no content, so it is not a unit.
 */
const ENUMERATION_MARKER_ONLY = /^\d+[.)]$/;

export function splitTextIntoSentences(text: string): string[] {
  const cleaned = stripLeadingHeaders(text);
  if (!cleaned) {
    return [];
  }
  const lines = cleaned.split('\n').filter((line) => line.trim() !== '');
  const segments = lines.length > 1 ? lines : cleaned.split(/(?<=[.!?])\s+/);
  return segments
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length > 0 && !ENUMERATION_MARKER_ONLY.test(sentence));
}
