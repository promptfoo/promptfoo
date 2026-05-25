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
 *  5. Returning pass when ce.box(['Subtract', a, b]).simplify().is(0).
 *
 * See site/docs/configuration/expected-outputs/deterministic.md#math-equivalent.
 */

import invariant from '../util/invariant';
// Type-only import — the CortexJS Compute Engine package is "type": "module"
// (ESM-only) and `require('@cortex-js/compute-engine')` on the published CJS
// entrypoint returns an empty namespace, so the actual runtime value must be
// pulled in via a dynamic `import()` inside `getEngine()` below. Keeping
// types static lets the rest of the module stay strongly typed.
import type { BoxedExpression, ComputeEngine } from '@cortex-js/compute-engine';

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

let _enginePromise: Promise<ComputeEngine> | undefined;

/**
 * Lazily load `@cortex-js/compute-engine` via dynamic `import()`. Static
 * `import` on the value would be emitted as `require()` in the CJS bundle
 * and break before any caller ever reaches `math-equivalent`, because the
 * package is ESM-only.
 */
async function getEngine(): Promise<ComputeEngine> {
  if (!_enginePromise) {
    _enginePromise = import('@cortex-js/compute-engine').then(
      (m) => new m.ComputeEngine({ tolerance: 0 }),
    );
  }
  return _enginePromise;
}

/**
 * Normalize LaTeX quirks before parsing.
 */
export function normalizeLatex(text: string): string {
  let s = text;

  // Unicode → ASCII / LaTeX equivalents.
  s = s.replace(/\u2212/g, '-'); // − → -
  s = s.replace(/[\u00d7\u00b7]/g, '*'); // ×, · → *
  s = s.replace(/\u00f7/g, '/'); // ÷ → /
  s = s.replace(/√(\d+)/g, '\\sqrt{$1}');
  s = s.replace(/√\{/g, '\\sqrt{');
  s = s.replace(/√(\\[A-Za-z]+|[A-Za-z])/g, '\\sqrt{$1}');
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
    // fn<space><symbol-or-command>(end-of-token) → \fn(<symbol-or-command>)
    s = s.replace(
      new RegExp(`(?<!\\\\)(?<![a-zA-Z])${fn}\\s+([A-Za-z]|\\\\[A-Za-z]+)(?!\\w)`, 'g'),
      `\\${fn}($1)`,
    );
  }

  return s;
}

const TRAILING_UNIT_PATTERN = /^(.*?)(?:\s*)(rad|deg|km|cm|mm|kg|ms|m|s|g)\s*$/;
const NUMERIC_VALUE_PATTERN = /^-?\d+(?:\.\d+)?(?:\s*\/\s*\d+(?:\.\d+)?)?$/;

function isSelfContainedLatexValue(text: string): boolean {
  let value = text.startsWith('-') ? text.slice(1).trimStart() : text;
  if (!value.startsWith('\\')) {
    return false;
  }

  const command = value.match(/^\\[A-Za-z]+/);
  if (!command) {
    return false;
  }
  value = value.slice(command[0].length);
  let sawArgument = false;

  while (value) {
    if (!value.startsWith('{')) {
      return false;
    }
    sawArgument = true;
    let depth = 0;
    let end = -1;
    for (let i = 0; i < value.length; i++) {
      if (value[i] === '{') {
        depth++;
      } else if (value[i] === '}') {
        depth--;
        if (depth === 0) {
          end = i + 1;
          break;
        }
      }
    }
    if (end < 0) {
      return false;
    }
    value = value.slice(end);
  }
  return sawArgument;
}

function stripTrailingUnit(text: string): string {
  const trimmed = text.trim();
  const match = trimmed.match(TRAILING_UNIT_PATTERN);
  if (!match) {
    return trimmed;
  }
  const value = match[1].trimEnd();
  if (NUMERIC_VALUE_PATTERN.test(value) || isSelfContainedLatexValue(value)) {
    return value;
  }
  return trimmed;
}

/**
 * Strip formatting wrappers that don't affect mathematical meaning.
 */
export function cleanMathText(text: string): string {
  let s = stripThinkingBlocks(text);

  // \text{...} units/labels and any preceding space/backslash.
  s = s.replace(/\s*\\?\s*\\text\{[^}]*\}/g, '');

  // Trailing backslash-space sequences left over from \text removal.
  s = s.trim().replace(/\\+\s*$/, '');

  // Remove units only after self-contained numeric or brace-balanced LaTeX
  // values, so `x + m` remains symbolic while `\frac{1}{\sqrt{2}} m` works.
  s = stripTrailingUnit(s);
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
 *
 * Async because the underlying CortexJS Compute Engine is loaded lazily via
 * dynamic `import()` (see `getEngine`).
 */
export async function parseMathExpression(text: string): Promise<BoxedExpression | undefined> {
  const normalized = normalizeLatex(text.trim());
  if (!normalized) {
    return undefined;
  }
  if (looksLikeProse(normalized)) {
    return undefined;
  }
  try {
    const ce = await getEngine();
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
 * For "A = B = C" chains (including approximation chains "A ≈ B" and
 * "A \approx B" — the docs treat ≈/\approx as equality), try parsing each
 * segment right-to-left and return the first that succeeds.
 */
export async function tryParseEachSegment(text: string): Promise<BoxedExpression | undefined> {
  const segments = text.split(/=|\u2248|\\approx\b/).map((s) => s.trim());
  for (let i = segments.length - 1; i >= 0; i--) {
    const seg = segments[i];
    if (!seg) {
      continue;
    }
    const result = await parseMathExpression(seg);
    if (result) {
      return result;
    }
  }
  return undefined;
}

const TRIVIAL_LINE = /^[\\\]\[\)\(}\s]*$/;
const BOXED_PREFIX = '\\boxed{';
const DISPLAY_BLOCK_PATTERN = /\$\$([\s\S]*?)\$\$|\\\[([\s\S]*?)\\\]/g;

type BoxedMatch = {
  content: string;
  end: number;
};

function scanBoxed(text: string): BoxedMatch[] {
  const matches: BoxedMatch[] = [];
  for (let i = 0; i < text.length; i++) {
    if (!text.startsWith(BOXED_PREFIX, i)) {
      continue;
    }

    let depth = 1;
    const contentStart = i + BOXED_PREFIX.length;
    let j = contentStart;
    while (j < text.length && depth > 0) {
      if (text[j] === '{') {
        depth++;
      } else if (text[j] === '}') {
        depth--;
      }
      j++;
    }

    if (depth === 0) {
      matches.push({ content: text.slice(contentStart, j - 1), end: j });
      i = j - 1;
    }
  }
  return matches;
}

function findAllBoxed(text: string): string[] {
  return scanBoxed(text).map((match) => match.content);
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
function countProseWords(text: string): number {
  let count = 0;
  for (const tok of text.split(/\s+/)) {
    if (tok.length >= 2 && /^[A-Za-z]+$/.test(tok)) {
      count++;
    }
  }
  return count;
}

/**
 * A token is "math-shaped" if it contains a digit, starts with a `\` LaTeX
 * command, is a single ASCII letter (variable), is pure operator/bracket
 * (including the common Unicode math operators ×, ÷, −, · that
 * `normalizeLatex` would otherwise have collapsed to ASCII before parsing),
 * OR is a compact symbolic expression — alphanumerics interleaved with
 * math operators ("x+y", "2x+3y", "a-b*c"). Used to gather the contiguous
 * trailing math expression in a prose line.
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
  if (TRIG_FNS.includes(tok)) {
    return true;
  }
  if (/^[A-Za-z]$/.test(tok)) {
    return true;
  }
  if (/^[+\-*/^=<>(){}[\]_~|\u00b1\u00b7\u00d7\u00f7\u2212]+$/.test(tok)) {
    return true;
  }
  // Compact symbolic token: only math characters AND at least one operator.
  // Catches "x+y", "2x+3y", "a^2", "f(x)+1" while rejecting pure-letter
  // prose tokens like "abc".
  return (
    /^[A-Za-z0-9.+\-*/^=<>()_\u00b1\u00b7\u00d7\u00f7\u2212]+$/.test(tok) &&
    /[+\-*/^=<>\u00b1\u00b7\u00d7\u00f7\u2212]/.test(tok)
  );
}

/**
 * Walk a prose line from the right and return the contiguous trailing math
 * expression (sequence of math-shaped tokens, joined by spaces). Multi-letter
 * prose words (`is`, `the`, `Therefore`) terminate the run; multi-letter
 * non-math tokens at the very end are skipped while we look for the math
 * suffix. Strips trailing sentence punctuation (`.,;:?`) per token so
 * "The answer is 0.5." hands "0.5" — not "0.5." — to the parser.
 * `!` is preserved because it is also the factorial operator.
 *
 * "The answer is 1 / 2"   → "1 / 2"
 * "The answer is x + 1"   → "x + 1"
 * "Therefore … 42"        → "42"
 */
function extractRightmostMathExpression(text: string): string | undefined {
  const tokens = text.split(/\s+/).filter(Boolean);
  const collected: string[] = [];
  for (let i = tokens.length - 1; i >= 0; i--) {
    // `!` is factorial in math, so do not silently trim it as punctuation.
    const stripped = tokens[i].replace(/[.,;:?]+$/, '');
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
  return collected.length > 0 ? cleanMathText(collected.join(' ')) : undefined;
}

function extractFromLastLine(cleanedLines: string[]): string | undefined {
  if (cleanedLines.length === 0) {
    return undefined;
  }
  let candidate = cleanedLines[cleanedLines.length - 1];
  candidate = candidate.replace(/^[A-Za-z][A-Za-z\s]*:\s*/, '');
  // Mid-line label after a stripped display fence ("$$2$$ Answer: 3" cleans
  // to "2 Answer: 3" — the labelled answer is the real one). Take the
  // rightmost "<Word(s)>: <rest>" suffix when one exists. The leading `\s`
  // anchor keeps this from re-firing on a label that's already at the
  // start (handled above) and avoids matching `f(x):...` style colons.
  const labelMatch = candidate.match(/\s([A-Za-z][A-Za-z\s]*):\s*(\S.*)$/);
  if (labelMatch) {
    candidate = labelMatch[2].trim();
  }
  const finalPrefixMatch = candidate.match(
    /^(?:final\s+answer|answer|result|total|therefore|thus|hence)\s+(.+)$/i,
  );
  if (finalPrefixMatch) {
    candidate = finalPrefixMatch[1].trim();
  }
  candidate = candidate.replace(/,\s+(?=[A-Za-z]|\\\().*$/, '');
  candidate = candidate.trim();
  if (!candidate) {
    return undefined;
  }
  // Pull a trailing math suffix out of prose. Two-or-more prose words ("the
  // answer is 42") are unambiguously prose and any non-empty math suffix wins.
  // A single prose word is ambiguous: "Step 1" is a step counter we must
  // leave alone, while "Therefore 6 ÷ 2" is a real prose-wrapped expression.
  // Disambiguate by requiring the extracted suffix to span 2+ tokens
  // (whitespace inside it) so we keep the "Step 1" semantics intact.
  const proseCount = countProseWords(candidate);
  if (proseCount >= 1) {
    const rightmost = extractRightmostMathExpression(candidate);
    if (rightmost && (proseCount >= 2 || /\s/.test(rightmost))) {
      return rightmost;
    }
  }
  // Strip terminal sentence punctuation from non-prose candidates too. Without
  // this, a labelled answer like "Answer: 0.5." (after the prefix strip) would
  // become "0.5." and fail to parse — only the prose-extraction branch did
  // this previously, so labelled non-prose lines slipped through.
  candidate = candidate.replace(/[.,;:?]+$/, '');
  // If the last line is pure prose with no math content (e.g. a closing
  // sentence like "This is the final result."), bail so the caller can
  // fall back to display-block extraction or earlier candidates instead
  // of committing the prose string as the answer.
  if (looksLikeProse(candidate)) {
    return undefined;
  }
  return cleanMathText(candidate);
}

async function extractFromDisplayBlocks(text: string): Promise<string | undefined> {
  // DISPLAY_BLOCK_PATTERN is `$$...$$` OR `\[...\]`; pick whichever capture
  // group fired so both forms feed the fallback equivalently.
  const blocks = [...text.matchAll(DISPLAY_BLOCK_PATTERN)].map((m) => m[1] ?? m[2] ?? '');
  for (let i = blocks.length - 1; i >= 0; i--) {
    const block = blocks[i];
    const boxed = findAllBoxed(block);
    if (boxed.length > 0) {
      return cleanMathText(boxed[boxed.length - 1].trim());
    }
    const candidate = cleanMathText(block.trim());
    if (!candidate) {
      continue;
    }
    // Accept the block if it parses on its own OR if any segment of an
    // equality / approximation chain inside it parses (e.g. "230/530 =
    // 23/53"). Without the segment fallback, equality chains in display
    // blocks were silently discarded and tryParseEachSegment later saw
    // the chain polluted by trailing prose ("23/53\nDone."), letting it
    // pick the wrong (left) segment.
    const expr = (await parseMathExpression(candidate)) ?? (await tryParseEachSegment(candidate));
    if (expr) {
      return candidate;
    }
  }
  return undefined;
}

/**
 * Brace-balanced scan: return everything on `line` AFTER the close of the
 * last `\boxed{...}`, with a leading "," / whitespace sequence stripped.
 * Returns undefined when the line has no boxed or no remainder.
 *
 * Used to demote a boxed intermediate when the same line ALSO has a later
 * final answer ("work \boxed{2}, final answer: 3" or "...final answer is
 * 3"). A flat regex can't reliably find the close because boxed contents
 * may carry arbitrarily nested braces (`\boxed{\frac{1}{\sqrt{2}}}`).
 */
function remainderAfterLastBoxed(line: string): string | undefined {
  const boxed = scanBoxed(line);
  const lastBoxed = boxed.length > 0 ? boxed[boxed.length - 1] : undefined;
  if (!lastBoxed) {
    return undefined;
  }
  const tail = line.slice(lastBoxed.end).replace(/^[,\s]+/, '');
  return tail || undefined;
}

/**
 * Strip hidden-reasoning blocks before scanning for display math or computing
 * line positions. `<think>$$2$$</think>\nAnswer: 3` must not bubble the hidden
 * `$$2$$` up as the answer; the docs promise that thinking blocks are ignored.
 */
function stripThinkingBlocks(text: string): string {
  return (
    text
      // Provider-native XML thinking wrappers (Bedrock, etc.).
      .replace(/<thinking>[\s\S]*?<\/thinking>/gi, '')
      .replace(/<think>[\s\S]*?<\/think>/gi, '')
      // Anthropic extended thinking: multi-line body, then a Signature line, then a blank line.
      .replace(/(^|\r?\n)[ \t]*Thinking:[\s\S]*?\r?\n[ \t]*Signature:[^\n]*(?:\r?\n)+/gi, '$1')
      // Anthropic redacted thinking is a single rendered line.
      .replace(/(^|\r?\n)[ \t]*Redacted[ \t]+Thinking:[^\n]*(?:\r?\n)+/gi, '$1')
      // OpenAI/OpenRouter-style signatureless thinking (`Thinking: ${reasoning}\n\n${output}`).
      // Stop at the first blank-line separator so later blank lines inside ${output}
      // (e.g. "Final answer: 3\n\nNotes") are not consumed.
      .replace(/(^|\r?\n)[ \t]*Thinking:[\s\S]*?\r?\n\r?\n/gi, '$1')
  );
}

function hasTrailingDisplaySuffix(line: string): boolean {
  let lastBlockEnd = -1;
  for (const match of line.matchAll(DISPLAY_BLOCK_PATTERN)) {
    lastBlockEnd = (match.index ?? 0) + match[0].length;
  }
  if (lastBlockEnd < 0) {
    return false;
  }
  return (
    line
      .slice(lastBlockEnd)
      .replace(/^[,.;:!?\s]+/, '')
      .trim().length > 0
  );
}

/**
 * Extract the mathematical answer from arbitrary model prose.
 *
 * Priority (highest first):
 *  1. `\boxed{}` on the last visible line — that's the actual final answer.
 *  2. Last non-trivial cleaned line, if its raw counterpart has no `$$` /
 *     `\[ \]` / `\boxed` fence — pulls the rightmost numeric/LaTeX token
 *     from prose like "The answer is 0.5" or "$$intermediate$$\nAnswer:
 *     final". Intermediate `\boxed` work is demoted by this step so the
 *     real final-line answer wins.
 *  3. Latest display block (`$$...$$` or `\[...\]`, boxed inside first,
 *     then parseable content), scanned over the visible text only
 *     (thinking blocks excluded).
 *  4. Last `\boxed{}` anywhere in the cleaned text — fallback for shown
 *     work when (2) and (3) didn't yield anything.
 *  5. Last cleaned line as-is.
 */
export async function extractMathAnswer(text: string): Promise<string> {
  if (!text) {
    return '';
  }

  const cleaned = cleanMathText(text);

  // Use the thinking-stripped text as the source of truth for display-block
  // scanning and "is the last raw line a fence?" detection so hidden
  // reasoning never leaks into the extracted answer.
  const visible = stripThinkingBlocks(text);

  const cleanedLines = filterNonTrivialLines(cleaned);
  const visibleLines = filterNonTrivialLines(visible);
  const lastVisible = visibleLines[visibleLines.length - 1] ?? '';

  // Boxed *on the last visible line* is normally the real final answer.
  // But if there's content after the last `\boxed{...}` on the same line
  // ("work \boxed{2}, final answer: 3" or "...final answer is 3"), the
  // boxed is intermediate work and we should try to extract a labelled /
  // prose final from that suffix. Brace-balanced because boxed contents
  // may carry arbitrary nesting ("\boxed{\frac{1}{\sqrt{2}}}").
  if (/\\boxed\{/.test(lastVisible)) {
    const remainder = remainderAfterLastBoxed(lastVisible);
    // Strip any closing display fence ("$$" / "\]") and trailing punctuation
    // so we don't treat an empty or fence-only suffix as a final answer.
    const trimmed = remainder
      ?.replace(/\$+\s*$/, '')
      .replace(/\\\]\s*$/, '')
      .replace(/[.,;:!?\s]+$/, '')
      .trim();
    if (trimmed) {
      const fromTail = extractFromLastLine([cleanMathText(trimmed)]);
      if (fromTail) {
        return fromTail;
      }
    }
    // No usable suffix → the boxed itself IS the answer.
    const cleanedBoxed = findAllBoxed(cleaned);
    if (cleanedBoxed.length > 0) {
      return cleanMathText(cleanedBoxed[cleanedBoxed.length - 1].trim());
    }
  }

  // Always try the cleaned final line first, even when the last visible
  // line itself has a display fence. The cleaned line has the fence
  // stripped, so labelled finals on the same line as a fence (e.g.
  // "$$2$$ Answer: 3" → cleans to "2 Answer: 3") still get extracted via
  // the mid-line label rule in extractFromLastLine. extractFromLastLine
  // already returns undefined for pure prose, so the display-block scan
  // below still wins for prose-only trailers.
  //
  // Exception: when the last visible line has 2+ display fences and no
  // suffix after the final fence ("$$2$$ $$3$$" or "work $$2$$ $$3$$"),
  // the cleaned line collapses to a fence-stripped concat ("2 3") and
  // extractFromLastLine would commit it as the answer. Skip ahead to
  // display-block extraction so the documented "latest display block
  // wins" semantics apply. A trailing suffix ("... final answer is 4")
  // still gets first crack at extraction.
  const fenceCount =
    (lastVisible.match(/\$\$/g)?.length ?? 0) / 2 + (lastVisible.match(/\\\[/g)?.length ?? 0);
  const skipLastLine = fenceCount >= 2 && !hasTrailingDisplaySuffix(lastVisible);
  if (!skipLastLine) {
    const lineAnswer = extractFromLastLine(cleanedLines);
    if (lineAnswer) {
      return lineAnswer;
    }
  }

  const blockAnswer = await extractFromDisplayBlocks(visible);
  if (blockAnswer) {
    return blockAnswer;
  }

  // Final fallback: any boxed anywhere in the cleaned text (e.g. when the
  // last visible line was prose with no math and the display-block scan
  // also failed). This preserves the legacy "last \\boxed wins" behavior
  // for shown work.
  const cleanedBoxed = findAllBoxed(cleaned);
  if (cleanedBoxed.length > 0) {
    return cleanMathText(cleanedBoxed[cleanedBoxed.length - 1].trim());
  }

  // If the final line was only a prose trailer ("Done.", "This is the
  // final result."), fall back to the nearest earlier parseable line instead
  // of returning the whole cleaned transcript.
  for (let i = cleanedLines.length - 2; i >= 0; i--) {
    const earlierAnswer = extractFromLastLine([cleanedLines[i]]);
    if (!earlierAnswer) {
      continue;
    }
    const expr =
      (await parseMathExpression(earlierAnswer)) ?? (await tryParseEachSegment(earlierAnswer));
    if (expr) {
      return earlierAnswer;
    }
  }

  return cleaned;
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
 *
 * Async because the underlying CortexJS Compute Engine is loaded lazily via
 * dynamic `import()` — see `getEngine`.
 */
export async function isMathEquivalent(
  llmOutput: string,
  expected: string | number,
): Promise<MathEquivalentResult> {
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

  const actualAnswer = await extractMathAnswer(llmOutput);
  const expectedAnswer = await extractMathAnswer(String(expected));

  const expr1 =
    (await parseMathExpression(actualAnswer)) ?? (await tryParseEachSegment(actualAnswer));
  const expr2 =
    (await parseMathExpression(expectedAnswer)) ?? (await tryParseEachSegment(expectedAnswer));

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
    const ce = await getEngine();
    const diff = ce.box(['Subtract', expr1, expr2]).simplify();
    // The engine is created with tolerance: 0, so this numeric fallback remains exact.
    const pass = Boolean(diff.is(0));
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

export async function handleMathEquivalent({
  assertion,
  renderedValue,
  outputString,
  inverse,
}: Pick<
  AssertionParams,
  'assertion' | 'renderedValue' | 'outputString' | 'inverse'
>): Promise<GradingResult> {
  invariant(
    typeof renderedValue === 'string' || typeof renderedValue === 'number',
    '"math-equivalent" assertion type must have a string or number value',
  );

  const result = await isMathEquivalent(outputString, renderedValue);
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
