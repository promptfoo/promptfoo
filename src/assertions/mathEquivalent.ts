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
 * Ported from a sympy/latex2sympy reference implementation; see
 * site/docs/configuration/expected-outputs/deterministic.md#math-equivalent.
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
 * Normalize LaTeX quirks before parsing. Mirrors `_normalize_latex` from the
 * reference Python implementation.
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

  // European decimal comma: "2,00625" → "2.00625" (only when 2+ digits follow,
  // to avoid mangling tuples like "23, 53" or coordinate pairs).
  s = s.replace(/(\d),(\d{2,})\b/g, '$1.$2');

  // \dfrac / \tfrac / \cfrac variants → plain \frac for engines that don't
  // recognize the display/text variants.
  s = s.replace(/\\(?:dfrac|tfrac|cfrac)\b/g, '\\frac');

  // \fracAB (two bare single chars, no braces): \frac32 → \frac{3}{2}.
  s = s.replace(/\\frac([^{\\])([^{\\])/g, '\\frac{$1}{$2}');

  // \frac{numerator}X (single non-brace denominator): \frac{32}3 → \frac{32}{3}.
  s = s.replace(/(\\frac\{[^{}]*\})([^{])/g, (_m, p1, p2) => `${p1}{${p2}}`);

  for (const fn of TRIG_FNS) {
    // fn( → \fn(
    s = s.replace(new RegExp(`(?<!\\\\)(?<![a-zA-Z])${fn}\\(`, 'g'), `\\${fn}(`);
    // fn<digits> → \fn(<digits>)  e.g. cos4 → \cos(4)
    s = s.replace(new RegExp(`(?<!\\\\)(?<![a-zA-Z])${fn}(\\d+)`, 'g'), `\\${fn}($1)`);
    // fn<space><digits> → \fn(<digits>)
    s = s.replace(new RegExp(`(?<!\\\\)(?<![a-zA-Z])${fn}\\s+(\\d+)`, 'g'), `\\${fn}($1)`);
  }

  return s;
}

/**
 * Strip formatting wrappers that don't affect mathematical meaning. Mirrors
 * `_clean` from the reference Python implementation.
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

  // Trailing common units.
  s = s.trim().replace(/\s+(?:m|km|cm|mm|s|ms|kg|g|rad|deg)\s*$/, '');
  s = s.trim().replace(/\s*°\s*$/, '');

  // Display math fences.
  s = s.replace(/\$\$([\s\S]*?)\$\$/g, '$1');
  s = s.replace(/\\\[([\s\S]*?)\\\]/g, '$1');

  // Inline math fences.
  s = s.replace(/\\\(([\s\S]*?)\\\)/g, '$1');
  s = s.replace(/\$([^$]+)\$/g, '$1');

  // Markdown bold/italic.
  s = s.replace(/\*\*([^*]+)\*\*/g, '$1');
  s = s.replace(/\*([^*]+)\*/g, '$1');

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
 * Parse a candidate string into a CortexJS expression. Returns undefined when
 * the candidate fails to parse, parses to an equality (a = b) rather than a
 * value, or is empty after normalization.
 */
export function parseMathExpression(text: string): BoxedExpression | undefined {
  const normalized = normalizeLatex(text.trim());
  if (!normalized) {
    return undefined;
  }
  try {
    const ce = getEngine();
    const expr = ce.parse(normalized);
    if (!expr.isValid || (expr.errors && expr.errors.length > 0)) {
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

function findAllBoxed(text: string): string[] {
  const out: string[] = [];
  BOXED_PATTERN.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = BOXED_PATTERN.exec(text)) !== null) {
    out.push(m[1]);
  }
  return out;
}

/**
 * Extract the mathematical answer from arbitrary model prose.
 * Mirrors `_extract_answer` from the reference Python implementation.
 */
export function extractMathAnswer(text: string): string {
  if (!text) {
    return '';
  }

  // Step 1: scan raw $$...$$ display blocks for \boxed{} or any parseable
  // expression, scanning the LATEST block first.
  const displayBlocks: string[] = [];
  const reDisplay = /\$\$([\s\S]*?)\$\$/g;
  let dm: RegExpExecArray | null;
  while ((dm = reDisplay.exec(text)) !== null) {
    displayBlocks.push(dm[1]);
  }
  for (let i = displayBlocks.length - 1; i >= 0; i--) {
    const block = displayBlocks[i];
    const boxed = findAllBoxed(block);
    if (boxed.length > 0) {
      return cleanMathText(boxed[boxed.length - 1].trim());
    }
    const candidate = cleanMathText(block.trim());
    if (candidate && parseMathExpression(candidate)) {
      return candidate;
    }
  }

  // Step 2: clean the full text.
  const cleaned = cleanMathText(text);

  // Step 3: \boxed{} in cleaned text.
  const boxedClean = findAllBoxed(cleaned);
  if (boxedClean.length > 0) {
    return cleanMathText(boxedClean[boxedClean.length - 1].trim());
  }

  // Step 4: last non-trivial line.
  const lines = cleaned
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && !TRIVIAL_LINE.test(l));
  if (lines.length === 0) {
    return cleaned;
  }
  let last = lines[lines.length - 1];

  // Strip "Word(s): " prefix.
  last = last.replace(/^[A-Za-z][A-Za-z\s]*:\s*/, '');

  // Strip ", trailing prose..." after the answer.
  last = last.replace(/,\s+(?=[A-Za-z]|\\\().*$/, '');

  return cleanMathText(last.trim());
}

export type MathEquivalentResult = {
  pass: boolean;
  score: number;
  reason: string;
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
  const expectedStr = typeof expected === 'number' ? String(expected) : expected;
  const actualAnswer = extractMathAnswer(llmOutput);
  const expectedAnswer = extractMathAnswer(expectedStr);

  const expr1 = parseMathExpression(actualAnswer) ?? tryParseEachSegment(actualAnswer);
  const expr2 = parseMathExpression(expectedAnswer) ?? tryParseEachSegment(expectedAnswer);

  if (!expr1 || !expr2) {
    return {
      pass: false,
      score: 0,
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
    return {
      pass: false,
      score: 0,
      reason: `Math equivalence comparison failed: ${err instanceof Error ? err.message : String(err)}`,
      metadata: { actualAnswer, expectedAnswer },
    };
  }
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

  const result = isMathEquivalent(outputString, renderedValue as string | number);
  const pass = result.pass !== inverse;
  return {
    pass,
    score: pass ? 1 : 0,
    reason: pass
      ? inverse
        ? `Math expressions are not equivalent, as expected${result.metadata?.diff ? ` (diff: ${result.metadata.diff})` : ''}`
        : 'Math equivalence assertion passed'
      : inverse
        ? `Expected math expressions to differ but they are equivalent (actual: ${result.metadata?.actualParse ?? result.metadata?.actualAnswer}, expected: ${result.metadata?.expectedParse ?? result.metadata?.expectedAnswer})`
        : result.reason,
    assertion,
  };
}
