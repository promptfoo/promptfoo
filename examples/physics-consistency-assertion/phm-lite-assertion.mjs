/**
 * @file PHM-Lite deterministic physics-consistency assertion for Promptfoo.
 * @module phm-lite-assertion
 *
 * Scans model output for physically impossible statements — numbers that
 * violate universal physical limits — without any LLM call, any network
 * request, or any npm dependency. Deterministic by construction: the same
 * input always yields the same verdict.
 *
 * This checks arithmetic and physical-law consistency only (units, universal
 * limits, conservation ranges). It is NOT a substitute for domain-specific
 * validation, and it does not attempt semantic fact-checking.
 *
 * Wire up in `promptfooconfig.yaml`:
 *   defaultTest:
 *     assert:
 *       - type: javascript
 *         value: file://phm-lite-assertion.mjs
 *
 * Reference implementation (Python, same rules):
 *   https://github.com/PHM-Audit
 */

// --- Physical constants (SI) ---
const C_LIGHT = 299_792_458.0; // m/s, exact
const ABSOLUTE_ZERO_C = -273.15; // degrees Celsius
const G_EARTH = 9.80665; // m/s^2, standard gravity

/**
 * Severities that cause the assertion to fail.
 * FAIL  = violates a universal physical law (speed of light, absolute zero,
 *         negative mass/energy, probability outside [0, 100]).
 * WARN  = suspicious but not impossible (e.g. percentage shares summing
 *         above 100, free-fall timing far below the 1 g value).
 * @type {ReadonlyArray<'FAIL' | 'WARN'>}
 */
const FAIL_ON = ['FAIL'];

/** Decimal digits used when rendering findings. */
const DIGITS = 4;

/**
 * Extract (number, unit) pairs from text.
 * Handles common notations: "1.5 c", "300,000 km/s", "98.6%", "-5 kg",
 * scientific notation "3e8 m/s", and bare numbers with adjacent units.
 *
 * @param {string} text
 * @returns {Array<{value: number, unit: string, raw: string}>}
 */
function extractQuantities(text) {
  const out = [];
  // Unicode minus (U+2212 / fullwidth －) appears in many LLM outputs; normalize
  // before parsing so "−300" is not read as positive 300. Normalizing here
  // covers every caller, including direct unit-test imports.
  text = String(text ?? '')
    .replace(/\u2212/g, '-')
    .replace(/\uFF0D/g, '-');
  // Number grammar:
  //  - unary minus only when NOT immediately preceded by a digit (so the
  //    range separator in "0-300 °C" is not read as a sign of "-300");
  //  - leading-dot decimals (".5 c" = 0.5 c);
  //  - thousands separators and scientific notation.
  const re = new RegExp(`(?<![\\d.,])(${num})\\s*(${unitAlt})?`, 'g');
  let m;
  while ((m = re.exec(text)) !== null) {
    const raw = m[1].replace(/,/g, '').replace(/\s+/g, '');
    const value = Number(raw);
    if (Number.isNaN(value)) continue; // NaN dropped; ±Infinity kept so overflow magnitudes still fail rules
    out.push({ value, unit: (m[2] || '').trim(), raw: m[0].trim(), index: m.index });
  }
  return out;
}

/**
 * Units the extractor recognises as mass. Only kg carries a universal
 * non-negativity guarantee: bare "g" is ambiguous with acceleration in
 * standard gravities ("decelerated at -5 g"), and binding/potential
 * energies (eV, J, ...) are routinely negative relative to a chosen zero
 * ("the hydrogen ground-state energy is -13.6 eV" is correct physics),
 * so energy units are excluded from the non-negativity rule.
 */
const MASS_UNITS = new Set(['kg']);

/** Convert a temperature-like quantity to Celsius when recognisable. */
function toCelsius(value, unit) {
  if (unit === '°C' || unit === 'degC') return value;
  if (unit === 'K') return value - 273.15;
  if (unit === '°F') return (value - 32) * (5 / 9);
  return null;
}

/**
 * Run PHM-Lite rules over the output text.
 *
 * @param {string} output
 * @returns {{verdict: 'PASS'|'WARN'|'FAIL', violations: Array<object>}}
 */
/**
 * Apply the four per-quantity rules (speed limit, absolute zero,
 * non-negativity of mass, percentage range) to one parsed quantity.
 */
function checkQuantityRules(
  { value, unit: rawUnit, raw, index, underflowNeg },
  violations,
  normalized,
) {
  // Spelled-out speed units ("400,000 kilometers per second", "meters/s")
  // normalize onto the same rule paths as their compact forms.
  const unit =
    rawUnit.startsWith('kilo') || /^kilo(?:meter|metre)/.test(rawUnit)
      ? 'km/s'
      : /^met(?:er|re)s?\s*(?:\/|per\s+)/.test(rawUnit)
        ? 'm/s'
        : rawUnit;

  // Rule 1: universal speed limit ("1.5 c", "400,000 km/s", "5e8 m/s").
  // 1% tolerance absorbs rounded light-speed notation ("3e8 m/s ≈ c"),
  // which is common in benign text; nothing macroscopic reaches 0.99c+.
  //
  // Bare "c" is ambiguous: physics writes light-speed fractions as "1.5 c",
  // but "the item costs 2 c" (cents) and "the expression is 2c" (algebra)
  // are ordinary text. Two gates keep the exemption tight:
  //   1. The currency/algebra marker must belong to the SAME sentence as
  //      the quantity ("Conditions changed yesterday. ... -5 kg" must not
  //      leak markers across claims).
  //   2. Local motion context wins: a speed claim's sentence carries a
  //      motion verb, so "the equation predicts that the signal travels at
  //      2c" stays FAIL even though "equation" shares the sentence.
  const cOwnSpan = (() => {
    if (unit !== 'c') return '';
    const beforeC = normalized.slice(0, index);
    const sb = [...beforeC.matchAll(/[.!?](?:\s|$)|\n/g)];
    const sentStart = sb.length ? sb[sb.length - 1].index + sb[sb.length - 1][0].length : 0;
    return (
      normalized.slice(sentStart, index) +
      normalized
        .slice(index)
        .split(/[.!?](?:\s|$)|\n/)[0]
        .slice(0, 160)
    );
  })();
  const MOTION_RE =
    /(?:\b(?:travels?|travelled|traveled|moves?|moved|speeds?|races?|flies|flew|propagat\w*|travelling|traveling|velocit(?:y|ies)|accelerat\w*|launch\w*|zoom\w*|dash\w*|sprint\w*|rocket\w*|soars?|climbs?|hurtl\w*|speed\w*|faster|fastest|slower|reach(?:es|ed)?\s+\d)\b)/i;
  const isAmbiguousC =
    unit === 'c' &&
    !MOTION_RE.test(cOwnSpan) &&
    /(?:\b(?:cost|costs|price|priced|pricing|paid|pay|pays|cents?|usd|dollars?|euros?|fee|fees|budget|spend|spends|spent|expression|expressions|formula|formulas|equation|equations|variable|variables|algebra)\b|\$)/i.test(
      cOwnSpan,
    );
  const isLightFrac = unit === 'c' && !isAmbiguousC && Math.abs(value) > 1.01;
  const speedMs = isLightFrac
    ? value * C_LIGHT
    : unit === 'km/s'
      ? value * 1000
      : unit === 'm/s'
        ? value
        : null;
  // Relativistic limit applies to magnitude: "−400,000 km/s" is just as
  // impossible as the positive value, so compare |speedMs| against c.
  if (speedMs !== null && Math.abs(speedMs) > C_LIGHT * 1.01) {
    violations.push({
      rule: 'speed-of-light',
      severity: 'FAIL',
      detail: `stated speed ${raw} exceeds c (${C_LIGHT} m/s)`,
    });
  }

  // Rule 2: absolute temperature floor. 1e-9 tolerance absorbs the
  // float round-trip of the exact Fahrenheit boundary (-459.67 °F).
  // Negative deltas ("a temperature change of -300 °C", ΔT) are valid
  // and exempt: only absolute readings are floored.
  const tempWindow = normalized.slice(Math.max(0, index - 160), index + 120);
  // The delta marker must belong to THIS quantity: search only the span
  // after the previous temperature unit, so "dropped by 300 °C to -300 °C"
  // keeps the absolute -300 °C reading floored.
  const before = normalized.slice(0, index);
  const prevTemp = Math.max(
    before.lastIndexOf('°C'),
    before.lastIndexOf('degC'),
    before.lastIndexOf('°F'),
  );
  const ownSpan =
    normalized.slice(prevTemp === -1 ? 0 : prevTemp + 3, index) +
    normalized.slice(index, index + 120);
  const isDelta = /(?:\b(?:change|delta|difference|dropped by|fell by|cooled by)\b|\u0394)/i.test(
    ownSpan,
  );
  const celsius = toCelsius(value, unit);
  if (!isDelta && celsius !== null && celsius < ABSOLUTE_ZERO_C - 1e-9) {
    violations.push({
      rule: 'absolute-zero',
      severity: 'FAIL',
      detail: `stated temperature ${raw} is below absolute zero`,
    });
  }

  // Rule 3: non-negativity of mass (kg only — see MASS_UNITS note).
  // Mass CHANGES are exempt: "the mass change was -5 kg after drying" is
  // ordinary bookkeeping, not an impossible object. The delta marker must
  // belong to the SAME sentence as the quantity — the span runs from the
  // last sentence boundary to the sentence end (capped at 160 chars after
  // the number), so "Conditions changed yesterday. The reaction consumed
  // -5 kg of catalyst." keeps its impossible-mass finding.
  if (MASS_UNITS.has(unit) && value < 0) {
    const beforeKg = normalized.slice(0, index);
    const sb = [...beforeKg.matchAll(/[.!?](?:\s|$)|\n/g)];
    const sentStart = sb.length ? sb[sb.length - 1].index + sb[sb.length - 1][0].length : 0;
    const massSpan =
      normalized.slice(sentStart, index) +
      normalized
        .slice(index)
        .split(/[.!?](?:\s|$)|\n/)[0]
        .slice(0, 160);
    const isMassDelta =
      /(?:\b(?:change|changed|lost|loses?|lost|gained|gains?|dropped|reduced|difference|delta)\b|\u0394)/i.test(
        massSpan,
      );
    if (!isMassDelta) {
      violations.push({
        rule: 'negative-mass',
        severity: 'FAIL',
        detail: `negative ${unit} quantity: ${raw}`,
      });
    }
  }

  // Rule 4: percentage range — gated on probability context. Percentages
  // of growth or return ("sales grew 150%", "returned -5%") are valid and
  // must not fail; only probability/confidence claims live in [0, 100].
  if (unit === '%' && (value < 0 || value > 100)) {
    // Preserve offsets while removing periods in common non-terminal abbreviations.
    const back = normalized
      .slice(Math.max(0, index - 220), index)
      .replace(/\b(?:e\.g|i\.e)\./gi, (match) => match.replaceAll('.', ' '));
    const boundary = [...back.matchAll(/[.!?](?=\s|$)/g)].at(-1);
    const sentStart = boundary ? boundary.index + 1 : 0;
    const fwd = normalized.slice(index, index + 160);
    const sentEnd = (() => {
      const m2 = fwd.match(/[.!?](?=\s|$)/);
      return m2 ? m2.index : fwd.length;
    })();
    const window = normalized.slice(Math.max(0, index - 220) + sentStart, index + sentEnd);
    if (!/probabilit|confiden(?:t|ce)\b|chance|likelihood|certainty|belief|odds/i.test(window))
      return;
    violations.push({
      rule: 'percentage-range',
      severity: 'FAIL',
      detail: `percentage outside [0, 100]: ${raw}`,
    });
  }
}

const num = '-?(?:\\d[\\d,]*(?:\\.\\d+)?|\\.\\d+)(?:\\s*[eE][+-]?\\d+)?';
// Speed units reject a following per-second exponent in every common form:
// "/s", "^2", superscripts, the plain-ASCII "m/s2" without a caret, and
// repeated denominators ("meters per second per second" = acceleration).
// Spelled-out forms ("400,000 kilometres per second" — BrE included) are
// recognized; a trailing compound continuation or squared marker rejects
// the speed interpretation so the quantity stays exempt from Rule 1.
const unitAlt =
  '°C|degC|°F|K\\b|km\\/s(?!\\s*[/^²³]|\\s*\\d|\\s*per\\s+s)|m\\/s(?!\\s*[/^²³]|\\s*\\d|\\s*per\\s+s)' +
  '|kilo(?:meter|metre)s?\\s*(?:\\/|per\\s+)s(?:ec|econds?)?\\b(?!\\s*(?:squared|²|\\^?2|\\/\\s*s|per\\s+s))' +
  '|met(?:er|re)s?\\s*(?:\\/|per\\s+)s(?:ec|econds?)?\\b(?!\\s*(?:squared|²|\\^?2|\\/\\s*s|per\\s+s))' +
  '|c\\b|%|kg\\b(?!\\s*[·*/⋅])|g\\b|km\\b|m\\b|J\\b|kJ\\b|MJ\\b|Wh\\b|kWh\\b|MeV\\b|GeV\\b|eV\\b|N\\b|Pa\\b|kPa\\b|MPa\\b|atm\\b|mol\\/L\\b|mg\\/mL\\b';

function phmLiteCheck(output) {
  const violations = [];
  let normalized = String(output ?? '')
    .replace(/\u2212/g, '-')
    .replace(/\uFF0D/g, '-')
    // Abbreviation periods are not sentence boundaries ("e.g.", "i.e.", ...).
    // Mask them 1:1 BEFORE any segmentation so every downstream sentence
    // scanner (bare-c span, mass span, share split) ignores them.
    .replace(/(\be\.g|\bi\.e|\betc|\bvs|\bcf|\bDr|\bMr|\bMrs|\bMs|\bProf|\bapprox)\./g, '$1\u0001');
  // Shared-unit range propagation
  const rangeProp = new RegExp(
    `(${num})\\s+(?:to|\\u2013|\\u2014)\\s+(${num})\\s*(${unitAlt})`,
    'gi',
  );
  normalized = normalized.replace(rangeProp, (_mm, a, b, u) => `${a} ${u} and ${b} ${u}`);
  const qs = extractQuantities(normalized);
  for (const q of qs) {
    checkQuantityRules(q, violations, normalized);
  }
  // Rule 5: free-fall time consistency, "fell X m in Y s" (15% tolerance).
  // - Iterate over every claim (a plausible first sentence must not mask a
  //   later impossible one).
  // - The connector spans line breaks, bounded to 200 chars, and stops at
  //   another fall verb (tempered token) so an untimed first fall cannot
  //   swallow a later timed claim.
  // - Quantities reuse the main numeric grammar, so exponent forms like
  //   "1e2 m in 1e0 s" are parsed.
  // - A claimed duration of exactly 0 s is physically impossible too.
  const fallNum = '-?(?:\\d[\\d,]*(?:\\.\\d+)?|\\.\\d+)(?:\\s*[eE][+-]?\\d+)?';
  const fallRe = new RegExp(
    '(?:fell|drops?|dropped|falls?)\\s+(' +
      fallNum +
      ')\\s*(?!(?:meters?|metres?)\\s*(?:per\\s+second|/s))(?:m\\b|meters?|metres?)' +
      '((?:(?!fell\\b|drops?\\b|dropped\\b|falls?\\b|[.!?](?=\\s|$))[\\s\\S]){0,200}?)' +
      '(?:in|within|after)\\s+(' +
      fallNum +
      ')\\s*s(?:ec|econds?)?\\b',
    'gi',
  );
  for (const fall of normalized.matchAll(fallRe)) {
    const h = Number(fall[1].replace(/[\s,]/g, ''));
    const t = Number(fall[3].replace(/[\s,]/g, ''));
    if (h > 0 && t < 0) {
      violations.push({
        rule: 'free-fall-time',
        severity: 'WARN',
        detail: `negative fall duration ${t} s for ${h} m`,
      });
    } else if (h > 0 && t >= 0) {
      const expected = Math.sqrt((2 * h) / G_EARTH);
      if (t < expected * 0.85) {
        violations.push({
          rule: 'free-fall-time',
          severity: 'WARN',
          detail: `falling ${h} m at 1 g takes ~${expected.toFixed(DIGITS)} s; output claims ${t} s`,
        });
      }
    }
  }

  // Rule 6: percentage shares summing above 100% (warn). A sentence counts
  // as a share breakdown only when it carries share wording AND none of the
  // common independent-metric words (recall, precision, ...), so
  // "Market share was 60% while recall was 70%" is not summed, while
  // "Traffic shares: A took 60% and B took 70%" is.
  const SHARE_CTX = /share|allocation|split|portion|breakdown|divided/i;
  const METRIC_CTX = /recall|precision|accuracy|margin|error rate|f1/i;
  for (const sentence of normalized.split(/[.!?]\s|\n/)) {
    const pct = [...sentence.matchAll(/(\d[\d,]*(?:\.\d+)?(?:\s*[eE][+-]?\d+)?)\s*%/g)].map((x) =>
      Number(x[1].replace(/[\s,]/g, '')),
    );
    if (pct.length >= 2 && SHARE_CTX.test(sentence) && !METRIC_CTX.test(sentence)) {
      const sum = pct.reduce((a, b) => a + b, 0);
      if (sum > 100 + 1e-9) {
        violations.push({
          rule: 'percentage-sum',
          severity: 'WARN',
          detail: `${pct.length} shares sum to ${sum.toFixed(DIGITS)}% — verify the shares are mutually exclusive`,
        });
      }
    }
  }

  const hasFail = violations.some((v) => v.severity === 'FAIL');
  const hasWarn = violations.some((v) => v.severity === 'WARN');
  const verdict = hasFail ? 'FAIL' : hasWarn ? 'WARN' : 'PASS';
  return { verdict, violations };
}

/**
 * Flatten structured outputs into scannable text. Promptfoo passes parsed
 * objects through unchanged, and JSON-schema-style payloads often split the
 * number from its unit ("temperature": { "value": -300, "unit": "degC" });
 * naive JSON.stringify would separate them with field syntax and every
 * extracted quantity would lose its unit. This walker recombines value/unit
 * pairs and emits "key: value" leaves so nothing hides from the parser.
 * @param {unknown} v
 * @returns {string}
 */
function serializeForScan(v) {
  if (v === null || typeof v !== 'object') return String(v ?? '');
  const parts = [];
  const walk = (node, keyHint) => {
    if (node === null || typeof node !== 'object') {
      parts.push(keyHint ? `${keyHint}: ${node}` : String(node));
      return;
    }
    if (Array.isArray(node)) {
      node.forEach((item) => walk(item));
      return;
    }
    const keys = Object.keys(node);
    if (
      keys.includes('value') &&
      keys.includes('unit') &&
      typeof node.value === 'number' &&
      typeof node.unit === 'string'
    ) {
      parts.push(keyHint ? `${keyHint}: ${node.value} ${node.unit}` : `${node.value} ${node.unit}`);
      for (const k of keys) if (k !== 'value' && k !== 'unit') walk(node[k], k);
      return;
    }
    for (const k of keys) walk(node[k], k);
  };
  walk(v);
  return parts.join('. ');
}

export default async function phmLiteAssertion(output) {
  // Promptfoo passes provider outputs through unchanged: structured outputs
  // arrive as objects. Serialize them with value/unit recombination so
  // numeric claims inside them are still scanned.
  const text =
    output !== null && typeof output === 'object' ? serializeForScan(output) : String(output ?? '');
  const { verdict, violations } = phmLiteCheck(text);
  const failHit = violations.filter((v) => FAIL_ON.includes(v.severity));

  if (failHit.length === 0 && verdict === 'PASS') {
    return {
      pass: true,
      score: 1.0,
      reason: 'PHM-Lite: no physical-law violations detected',
    };
  }

  const shown = (failHit.length ? failHit : violations)
    .map((v) => `[${v.rule}] ${v.detail}`)
    .join('; ');

  return {
    pass: false,
    score: failHit.length ? 0.0 : 0.5,
    reason: `PHM-Lite ${verdict}: ${shown}`,
  };
}

// Expose internals so the example's own unit tests can import them.
export { C_LIGHT, extractQuantities, G_EARTH, phmLiteCheck }; // serializeForScan 内部实现（phmLiteAssertion 入口覆盖）
