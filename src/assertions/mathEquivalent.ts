/**
 * math-equivalent assertion: symbolic mathematical equivalence.
 *
 * Compares LLM output against an expected value (string or number) by:
 *  1. Cleaning prose / formatting wrappers from each side.
 *  2. Extracting the most likely answer candidate (last \boxed{}, last
 *     display block, or last non-trivial line).
 *  3. Normalizing common LaTeX quirks (Unicode minus, \dfrac, missing
 *     trig backslashes, european decimal commas, ...).
 *  4. Parsing each side with CortexJS Compute Engine (handles LaTeX).
 *  5. Returning pass when ce.box(['Subtract', a, b]).simplify().isEqual(0).
 *
 * See site/docs/configuration/expected-outputs/deterministic.md#math-equivalent.
 */

import { type BoxedExpression, ComputeEngine } from '@cortex-js/compute-engine';
import invariant from '../util/invariant';

import type { AssertionParams, GradingResult } from '../types/index';

const TRIG_FNS = [
  // Longer names first so partial matches don't fire (arctan must not become arc\tan).
  'arccos',
  'arcsin',
  'arctan',
  'cosh',
  'sinh',
  'tanh',
  'cos',
  'sin',
  'tan',
  'cot',
  'sec',
  'csc',
  'ln',
  'log',
  'exp',
  'sqrt',
];

let _engine: ComputeEngine | undefined;

function getEngine(): ComputeEngine {
  if (!_engine) {
    _engine = new ComputeEngine();
  }
  return _engine;
}

/**
 * Normalize LaTeX quirks before parsing.
 */
export function normalizeLatex(text: string): string {
  let s = text;

  // Unicode → ASCII / LaTeX equivalents.
  s = s.replace(/\u2212/g, '-'); // − → -
  s = s.replace(/\u00d7/g, '*'); // × → *
  s = s.replace(/√(\d+)/g, '\\sqrt{$1}');
  s = s.replace(/√\{/g, '\\sqrt{');
  s = s.replace(/√/g, '\\sqrt');

  // Approximation symbols collapse to equality so segment parsing can split on '='.
  s = s.replace(/≈/g, '=').replace(/\\approx/g, '=');

  // Strip "(i.e., ...)" and "(= ...)" trailing parentheticals.
  s = s.trim().replace(/\s*\(i\.e\..*?\)\s*$/, '');
  s = s.trim().replace(/\s*\(=\s*[^)]+\)\s*$/, '');

  // Strip leading "= " or whitespace that survived the ≈→= conversion.
  s = s.trim().replace(/^[=\s]+/, '');

  // Strip "Var = ", "x_0 = ", "P(Safe|F) = " prefixes.
  s = s.trim().replace(/^[A-Za-z_]\w*(?:\([^)]*\))?\s*=\s*/, '');

  // US thousands separators: collapse "1,000" / "1,234,567" before the
  // European-decimal rewrite — otherwise "1,000" becomes "1.000" = 1 and
  // silently passes against the wrong expected value.
  s = s.replace(/\b\d{1,3}(?:,\d{3})+\b/g, (m) => m.replace(/,/g, ''));

  // European decimal comma: "2,00625" → "2.00625" (only when 2+ digits follow,
  // to avoid mangling tuples like "23, 53" or coordinate pairs).
  s = s.replace(/(\d),(\d{2,})\b/g, '$1.$2');

  // \dfrac / \tfrac / \cfrac variants → plain \frac for engines that don't
  // recognize the display/text variants.
  s = s.replace(/\\(?:dfrac|tfrac|cfrac)\b/g, '\\frac');

  // \fracAB (two bare single chars, no braces): \frac32 → \frac{3}{2}.
  s = s.replace(/\\frac([A-Za-z0-9])([A-Za-z0-9])/g, '\\frac{$1}{$2}');

  // \frac{numerator}X (single non-brace denominator): \frac{32}3 → \frac{32}{3}
  // and \frac{1}\pi → \frac{1}{\pi}. Capture the WHOLE LaTeX command token
  // when the denominator starts with `\`, otherwise a single letter or digit.
  // Restrict to those forms so whitespace and operators don't get auto-braced
  // (which previously corrupted e.g. "\frac{32} + 2" → "\frac{32}{ }+ 2",
  // and "\frac{1}\pi" → "\frac{1}{\}pi").
  s = s.replace(/(\\frac\{[^{}]*\})(\\[A-Za-z]+|[A-Za-z0-9])/g, (_m, p1, p2) => `${p1}{${p2}}`);

  for (const fn of TRIG_FNS) {
    // fn( → \fn(
    s = s.replace(new RegExp(`(?<!\\\\)(?<![a-zA-Z])${fn}\\(`, 'g'), `\\${fn}(`);
    // fn<digits>(end-of-token) → \fn(<digits>)  e.g. cos4 → \cos(4).
    // The trailing (?!\w) guard prevents identifiers like `sqrt2var` or
    // `sqrt2_x` from being silently rewritten to `\sqrt(2)var`.
    s = s.replace(new RegExp(`(?<!\\\\)(?<![a-zA-Z])${fn}(\\d+)(?!\\w)`, 'g'), `\\${fn}($1)`);
    // fn<space><digits>(end-of-token) → \fn(<digits>)
    s = s.replace(new RegExp(`(?<!\\\\)(?<![a-zA-Z])${fn}\\s+(\\d+)(?!\\w)`, 'g'), `\\${fn}($1)`);
  }

  return s;
}

/**
 * Strip formatting wrappers that don't affect mathematical meaning.
 */
export function cleanMathText(text: string): string {
  let s = text;

  // <think>…</think> blocks (multi-line).
  s = s.replace(/<think>[\s\S]*?<\/think>/g, '');

  // promptfoo-rendered redacted thinking blocks.
  s = s.replace(/Thinking:\s*\nSignature:[\s\S]*?(?=\n\n|$)/g, '');

  // \text{...} units/labels and any preceding space/backslash.
  s = s.replace(/\s*\\?\s*\\text\{[^}]*\}/g, '');

  // Trailing backslash-space sequences left over from \text removal.
  s = s.trim().replace(/\\+\s*$/, '');

  // Trailing common units. Anchor the strip so a SELF-CONTAINED math value
  // must be the immediate left context of the unit — a number, a numeric
  // fraction (`1/2`, `1.5/2.5`), or a LaTeX command with its braces
  // (`\frac{1}{2}`, `\dfrac{8\pi}{3}`, `\sqrt{2}`). This preserves both
  // attached forms ("10kg") and whitespace-separated ("10 m", "1/2 m",
  // "\frac{1}{2} kg"), while leaving algebraic expressions intact
  // ("x + m" stays "x + m", an expected "2*m" stays "2*m"). Longer unit
  // alternatives come first so "100ms" matches "ms", not "m".
  s = s
    .trim()
    .replace(
      /(^|\s)((?:-?\d+(?:\.\d+)?(?:\/\d+(?:\.\d+)?)?)|\\[A-Za-z]+(?:\{[^{}]*\}){1,2})\s*(?:rad|deg|km|cm|mm|kg|ms|m|s|g)\s*$/,
      '$1$2',
    );
  s = s.trim().replace(/\s*°\s*$/, '');

  // Display math fences.
  s = s.replace(/\$\$([\s\S]*?)\$\$/g, '$1');
  s = s.replace(/\\\[([\s\S]*?)\\\]/g, '$1');

  // Inline math fences.
  s = s.replace(/\\\(([\s\S]*?)\\\)/g, '$1');
  s = s.replace(/\$([^$]+)\$/g, '$1');

  // Markdown bold/italic. Guard against asterisks used as math operators
  // (e.g. "2*3*4" or "x**y**z") by requiring a non-word boundary on both
  // sides of the marker pair — real markdown emphasis is whitespace- or
  // punctuation-flanked, never digit/letter-flanked. The italic guard also
  // excludes adjacent `*` so the inner pair of `**3**` isn't stripped to
  // `*3*` then to `3`.
  s = s.replace(/(?<![*A-Za-z0-9_])\*\*([^*]+)\*\*(?![*A-Za-z0-9_])/g, '$1');
  s = s.replace(/(?<![*A-Za-z0-9_])\*([^*]+)\*(?![*A-Za-z0-9_])/g, '$1');

  return s.trim();
}

function isEqualityExpr(expr: BoxedExpression): boolean {
  if ((expr as { operator?: string }).operator === 'Equal') {
    return true;
  }
  const json = expr.json as unknown;
  if (Array.isArray(json) && json[0] === 'Equal') {
    return true;
  }
  return false;
}

/**
 * Heuristic: does the (already-normalized) text look like English prose rather
 * than math? CortexJS will happily parse `apple` as `a*p*p*l*e` (an implicit
 * product of single-letter symbols), which would let pathological configs like
 * `value: 'apple'` silently match any output with the same letter multiset.
 * Math expressions almost always contain at least one digit, operator, brace,
 * or LaTeX command, so the absence of all of those is strong evidence we're
 * looking at prose.
 */
function looksLikeProse(normalized: string): boolean {
  if (/[0-9\\+\-*/^()={}√_]/.test(normalized)) {
    return false;
  }
  const letters = normalized.match(/[A-Za-z]/g) ?? [];
  return letters.length >= 3;
}

/**
 * Parse a candidate string into a CortexJS expression. Returns undefined when
 * the candidate fails to parse, parses to an equality (a = b) rather than a
 * value, or is empty after normalization.
 */
export function parseMathExpression(text: string): BoxedExpression | undefined {
  const normalized = normalizeLatex(text.trim());
  if (!normalized) {
    return undefined;
  }
  if (looksLikeProse(normalized)) {
    return undefined;
  }
  try {
    const ce = getEngine();
    const expr = ce.parse(normalized);
    if (!expr.isValid || (expr.errors?.length ?? 0) > 0) {
      return undefined;
    }
    if (isEqualityExpr(expr)) {
      return undefined;
    }
    return expr;
  } catch {
    return undefined;
  }
}

/**
 * For "A = B = C" chains, try parsing each segment right-to-left and return
 * the first that succeeds.
 */
export function tryParseEachSegment(text: string): BoxedExpression | undefined {
  const segments = text.split('=').map((s) => s.trim());
  for (let i = segments.length - 1; i >= 0; i--) {
    const seg = segments[i];
    if (!seg) {
      continue;
    }
    const result = parseMathExpression(seg);
    if (result) {
      return result;
    }
  }
  return undefined;
}

const TRIVIAL_LINE = /^[\\\]\[\)\(}\s]*$/;
const BOXED_PATTERN = /\\boxed\{((?:[^{}]|\{(?:[^{}]|\{[^{}]*\})*\})*)\}/g;
const DISPLAY_BLOCK_PATTERN = /\$\$([\s\S]*?)\$\$/g;

/**
 * Number of multi-letter alphabetic tokens that triggers prose-mode rightmost
 * extraction. 2 catches "The answer is 0.5" without breaking single-label
 * lines like "Step 1" or "V = 32" (which have at most one alpha word).
 */
const PROSE_WORD_THRESHOLD = 2;

function findAllBoxed(text: string): string[] {
  return [...text.matchAll(BOXED_PATTERN)].map((m) => m[1]);
}

function filterNonTrivialLines(s: string): string[] {
  return s
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && !TRIVIAL_LINE.test(l));
}

/**
 * Heuristic: text reads like a sentence (≥2 multi-letter alphabetic tokens).
 * "V = 32" / "Step 1" stay below the threshold and are left alone.
 */
function hasMultipleProseWords(text: string): boolean {
  let count = 0;
  for (const tok of text.split(/\s+/)) {
    if (tok.length >= 2 && /^[A-Za-z]+$/.test(tok)) {
      count++;
      if (count >= PROSE_WORD_THRESHOLD) {
        return true;
      }
    }
  }
  return false;
}

/**
 * A token is "math-shaped" if it contains a digit, starts with a `\` LaTeX
 * command, is a single ASCII letter (variable), or is pure operator/bracket.
 * Used to gather the contiguous trailing math expression in a prose line.
 */
function isMathShapedToken(tok: string): boolean {
  if (!tok) {
    return false;
  }
  if (/\d/.test(tok)) {
    return true;
  }
  if (tok.startsWith('\\')) {
    return true;
  }
  if (/^[A-Za-z]$/.test(tok)) {
    return true;
  }
  return /^[+\-*/^=<>(){}[\]_~|]+$/.test(tok);
}

/**
 * Walk a prose line from the right and return the contiguous trailing math
 * expression (sequence of math-shaped tokens, joined by spaces). Multi-letter
 * prose words (`is`, `the`, `Therefore`) terminate the run; multi-letter
 * non-math tokens at the very end are skipped while we look for the math
 * suffix. Strips trailing sentence punctuation (`.,;:!?`) per token so
 * "The answer is 0.5." hands "0.5" — not "0.5." — to the parser.
 *
 * "The answer is 1 / 2"   → "1 / 2"
 * "The answer is x + 1"   → "x + 1"
 * "Therefore … 42"        → "42"
 */
function extractRightmostMathExpression(text: string): string | undefined {
  const tokens = text.split(/\s+/).filter(Boolean);
  const collected: string[] = [];
  for (let i = tokens.length - 1; i >= 0; i--) {
    const stripped = tokens[i].replace(/[.,;:!?]+$/, '');
    if (!stripped) {
      continue;
    }
    if (isMathShapedToken(stripped)) {
      collected.unshift(stripped);
      continue;
    }
    if (collected.length > 0) {
      break;
    }
  }
  return collected.length > 0 ? collected.join(' ') : undefined;
}

function extractFromLastLine(cleanedLines: string[]): string | undefined {
  if (cleanedLines.length === 0) {
    return undefined;
  }
  let candidate = cleanedLines[cleanedLines.length - 1];
  candidate = candidate.replace(/^[A-Za-z][A-Za-z\s]*:\s*/, '');
  candidate = candidate.replace(/,\s+(?=[A-Za-z]|\\\().*$/, '');
  candidate = candidate.trim();
  if (!candidate) {
    return undefined;
  }
  if (hasMultipleProseWords(candidate)) {
    const rightmost = extractRightmostMathExpression(candidate);
    if (rightmost) {
      return rightmost;
    }
  }
  // Strip terminal sentence punctuation from non-prose candidates too. Without
  // this, a labelled answer like "Answer: 0.5." (after the prefix strip) would
  // become "0.5." and fail to parse — only the prose-extraction branch did
  // this previously, so labelled non-prose lines slipped through.
  candidate = candidate.replace(/[.,;:!?]+$/, '');
  return cleanMathText(candidate);
}

function extractFromDisplayBlocks(text: string): string | undefined {
  const blocks = [...text.matchAll(DISPLAY_BLOCK_PATTERN)].map((m) => m[1]);
  for (let i = blocks.length - 1; i >= 0; i--) {
    const block = blocks[i];
    const boxed = findAllBoxed(block);
    if (boxed.length > 0) {
      return cleanMathText(boxed[boxed.length - 1].trim());
    }
    const candidate = cleanMathText(block.trim());
    if (candidate && parseMathExpression(candidate)) {
      return candidate;
    }
  }
  return undefined;
}

/**
 * Strip hidden-reasoning blocks before scanning for display math or computing
 * line positions. `<think>$$2$$</think>\nAnswer: 3` must not bubble the hidden
 * `$$2$$` up as the answer; the docs promise that thinking blocks are ignored.
 */
function stripThinkingBlocks(text: string): string {
  return text
    .replace(/<think>[\s\S]*?<\/think>/g, '')
    .replace(/Thinking:\s*\nSignature:[\s\S]*?(?=\n\n|$)/g, '');
}

/**
 * Extract the mathematical answer from arbitrary model prose.
 *
 * Priority (highest first):
 *  1. Last `\boxed{}` in the cleaned text.
 *  2. Last non-trivial cleaned line, if its raw counterpart has no `$$` fence
 *     — pulls the rightmost numeric/LaTeX token from prose like
 *     "The answer is 0.5" or "$$intermediate$$\nAnswer: final".
 *  3. Latest `$$...$$` display block (boxed inside, then parseable content),
 *     scanned over the visible text only (thinking blocks excluded).
 *  4. Last cleaned line as-is.
 */
export function extractMathAnswer(text: string): string {
  if (!text) {
    return '';
  }

  const cleaned = cleanMathText(text);

  const cleanedBoxed = findAllBoxed(cleaned);
  if (cleanedBoxed.length > 0) {
    return cleanMathText(cleanedBoxed[cleanedBoxed.length - 1].trim());
  }

  // Use the thinking-stripped text as the source of truth for both display
  // block scanning and "is the last raw line a fence?" detection so hidden
  // reasoning never leaks into the extracted answer.
  const visible = stripThinkingBlocks(text);

  const cleanedLines = filterNonTrivialLines(cleaned);
  const visibleLines = filterNonTrivialLines(visible);
  const lastVisibleHasDisplay = (visibleLines[visibleLines.length - 1] ?? '').includes('$$');

  if (!lastVisibleHasDisplay) {
    const lineAnswer = extractFromLastLine(cleanedLines);
    if (lineAnswer) {
      return lineAnswer;
    }
  }

  const blockAnswer = extractFromDisplayBlocks(visible);
  if (blockAnswer) {
    return blockAnswer;
  }

  return extractFromLastLine(cleanedLines) ?? cleaned;
}

export type MathEquivalentResult = {
  pass: boolean;
  score: number;
  reason: string;
  /**
   * True when the symbolic comparison never produced a verdict — either one
   * side failed to parse, or the engine threw mid-comparison. Handlers must
   * treat this as a hard failure (do NOT invert under `not-math-equivalent`)
   * — otherwise garbage output or engine glitches silently satisfy a
   * non-equivalence assertion.
   */
  parseFailed?: boolean;
  metadata?: {
    actualAnswer: string;
    expectedAnswer: string;
    actualParse?: string;
    expectedParse?: string;
    diff?: string;
  };
};

/**
 * Determine whether `llmOutput` is mathematically equivalent to `expected`.
 */
export function isMathEquivalent(
  llmOutput: string,
  expected: string | number,
): MathEquivalentResult {
  if (typeof expected === 'number' && !Number.isFinite(expected)) {
    return {
      pass: false,
      score: 0,
      parseFailed: true,
      reason: Number.isNaN(expected)
        ? 'Expected value is NaN; math-equivalent requires a finite numeric or string expression'
        : 'Expected value is not finite; math-equivalent requires a finite numeric or string expression',
      metadata: { actualAnswer: '', expectedAnswer: String(expected) },
    };
  }

  const actualAnswer = extractMathAnswer(llmOutput);
  const expectedAnswer = extractMathAnswer(String(expected));

  const expr1 = parseMathExpression(actualAnswer) ?? tryParseEachSegment(actualAnswer);
  const expr2 = parseMathExpression(expectedAnswer) ?? tryParseEachSegment(expectedAnswer);

  if (!expr1 || !expr2) {
    return {
      pass: false,
      score: 0,
      parseFailed: true,
      reason: expr1
        ? `Could not parse expected answer "${expectedAnswer}" as a math expression`
        : `Could not parse actual answer "${actualAnswer}" as a math expression`,
      metadata: { actualAnswer, expectedAnswer },
    };
  }

  try {
    const ce = getEngine();
    const diff = ce.box(['Subtract', expr1, expr2]).simplify();
    const pass = Boolean(diff.isEqual(0));
    return {
      pass,
      score: pass ? 1 : 0,
      reason: pass
        ? 'Math equivalence assertion passed'
        : `Math expressions are not equivalent (actual: ${expr1.toString()}, expected: ${expr2.toString()}, diff: ${diff.toString()})`,
      metadata: {
        actualAnswer,
        expectedAnswer,
        actualParse: expr1.toString(),
        expectedParse: expr2.toString(),
        diff: diff.toString(),
      },
    };
  } catch (err) {
    // Comparison errors mean we never established (non-)equivalence. Mark
    // parseFailed so handleMathEquivalent does NOT invert this false to a
    // pass under not-math-equivalent — engine glitches must surface, not
    // silently satisfy a negative assertion.
    return {
      pass: false,
      score: 0,
      parseFailed: true,
      reason: `Math equivalence comparison failed: ${err instanceof Error ? err.message : String(err)}`,
      metadata: { actualAnswer, expectedAnswer },
    };
  }
}

function buildHandlerReason(pass: boolean, inverse: boolean, result: MathEquivalentResult): string {
  if (pass && !inverse) {
    return 'Math equivalence assertion passed';
  }
  if (pass && inverse) {
    const diff = result.metadata?.diff;
    return diff
      ? `Math expressions are not equivalent, as expected (diff: ${diff})`
      : 'Math expressions are not equivalent, as expected';
  }
  if (!pass && inverse) {
    const actual = result.metadata?.actualParse ?? result.metadata?.actualAnswer;
    const expected = result.metadata?.expectedParse ?? result.metadata?.expectedAnswer;
    return `Expected math expressions to differ but they are equivalent (actual: ${actual}, expected: ${expected})`;
  }
  return result.reason;
}

export function handleMathEquivalent({
  assertion,
  renderedValue,
  outputString,
  inverse,
}: Pick<
  AssertionParams,
  'assertion' | 'renderedValue' | 'outputString' | 'inverse'
>): GradingResult {
  invariant(
    typeof renderedValue === 'string' || typeof renderedValue === 'number',
    '"math-equivalent" assertion type must have a string or number value',
  );

  const result = isMathEquivalent(outputString, renderedValue);
  // Parse failure is not negatable: if we cannot parse, we cannot prove
  // equivalence OR non-equivalence. Surface the parse error verbatim so
  // not-math-equivalent does not silently accept garbage output.
  if (result.parseFailed) {
    return { pass: false, score: 0, reason: result.reason, assertion };
  }
  const pass = result.pass !== inverse;
  return {
    pass,
    score: pass ? 1 : 0,
    reason: buildHandlerReason(pass, inverse, result),
    assertion,
  };
}
