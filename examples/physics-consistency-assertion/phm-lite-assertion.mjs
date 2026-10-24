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
  text = String(text ?? '').replace(/\u2212/g, '-').replace(/\uFF0D/g, '-');
  // Number grammar:
  //  - unary minus only when NOT immediately preceded by a digit (so the
  //    range separator in "0-300 °C" is not read as a sign of "-300");
  //  - leading-dot decimals (".5 c" = 0.5 c);
  //  - thousands separators and scientific notation.
  const num = '-?(?:\\d[\\d,]*(?:\\.\\d+)?|\\.\\d+)(?:\\s*[eE][+-]?\\d+)?';
  // Speed units reject a following per-second exponent in every common form:
  // "/s", "^2", superscripts, and the plain-ASCII "m/s2" without a caret.
  const unitAlt =
    '°C|degC|°F|K\\b|km\\/s(?!\\s*[/^²³]|\\s*\\d)|m\\/s(?!\\s*[/^²³]|\\s*\\d)|c\\b|%|kg\\b|g\\b|km\\b|m\\b|J\\b|kJ\\b|MJ\\b|Wh\\b|kWh\\b|MeV\\b|GeV\\b|eV\\b|N\\b|Pa\\b|kPa\\b|MPa\\b|atm\\b|mol\\/L\\b|mg\\/mL\\b';
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
// biome-ignore lint/complexity/useExcessiveComplexity: deterministic rule engine, single flat function keeps all rule thresholds in one place
function phmLiteCheck(output) {
  const violations = [];
  // Normalize typographic minus signs (U+2212, fullwidth －) to ASCII hyphen
  // so negative quantities are parsed as negative everywhere below.
  const normalized = String(output ?? '')
    .replace(/\u2212/g, '-')
    .replace(/\uFF0D/g, '-');
  const qs = extractQuantities(normalized);

  for (const { value, unit, raw, index } of qs) {
    // Rule 1: universal speed limit ("1.5 c", "400,000 km/s", "5e8 m/s").
    // 1% tolerance absorbs rounded light-speed notation ("3e8 m/s ≈ c"),
    // which is common in benign text; nothing macroscopic reaches 0.99c+.
    const isLightFrac = unit === 'c' && Math.abs(value) > 1.01;
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
    const celsius = toCelsius(value, unit);
    if (celsius !== null && celsius < ABSOLUTE_ZERO_C - 1e-9) {
      violations.push({
        rule: 'absolute-zero',
        severity: 'FAIL',
        detail: `stated temperature ${raw} is below absolute zero`,
      });
    }

    // Rule 3: non-negativity of mass (kg only — see MASS_UNITS note).
    if (MASS_UNITS.has(unit) && value < 0) {
      violations.push({
        rule: 'negative-mass',
        severity: 'FAIL',
        detail: `negative ${unit} quantity: ${raw}`,
      });
    }

    // Rule 4: percentage range — gated on probability context. Percentages
    // of growth or return ("sales grew 150%", "returned -5%") are valid and
    // must not fail; only probability/confidence claims live in [0, 100].
    if (unit === '%' && (value < 0 || value > 100)) {
      const window = normalized.slice(Math.max(0, m.index - 220), m.index + 120);
      if (!/probabilit|confiden|chance|likelihood|certainty|belief|odds/i.test(window)) continue;
      violations.push({
        rule: 'percentage-range',
        severity: 'FAIL',
        detail: `percentage outside [0, 100]: ${raw}`,
      });
    }
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
    '(?:fell|drops?|dropped|falls?)\\s+(' + fallNum + ')\\s*(?:m\\b|meters?|metres?)' +
      '((?:(?!fell\\b|drops?\\b|dropped\\b|falls?\\b)[\\s\\S]){0,200}?)' +
      '(?:in|within|after)\\s+(' + fallNum + ')\\s*s(?:ec|econds?)?\\b',
    'gi'
  );
  for (const fall of normalized.matchAll(fallRe)) {
    const h = Number(fall[1].replace(/,/g, ''));
    const t = Number(fall[3].replace(/,/g, ''));
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

  // Rule 6: percentage shares summing above 100% (warn). Independent
  // metrics ("precision was 60% and recall was 70%") are not shares of one
  // whole, so the sum applies only inside a sentence that carries share
  // wording; scientific-notation percentages are handled because they are
  // re-parsed by the same grammar here.
  const SHARE_CTX = /share|allocation|split|portion|breakdown|divided/i;
  for (const sentence of normalized.split(/[.!?]\s|\n/)) {
    const pct = [...sentence.matchAll(/(\d[\d,]*(?:\.\d+)?(?:\s*[eE][+-]?\d+)?)\s*%/g)].map((x) =>
      Number(x[1].replace(/,/g, '').replace(/\s+/g, ''))
    );
    if (pct.length >= 2 && SHARE_CTX.test(sentence)) {
    const sum = pct.reduce((a, b) => a + b, 0);
    if (sum > 100 + 1e-9) {
      violations.push({
        rule: 'percentage-sum',
        severity: 'WARN',
        detail: `${pct.length} percentages sum to ${sum.toFixed(DIGITS)}% — verify the shares are mutually exclusive`,
      });
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
      parts.push(`${node.value} ${node.unit}`);
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
  const text = output !== null && typeof output === 'object' ? serializeForScan(output) : String(output ?? '');
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
export { C_LIGHT, G_EARTH, extractQuantities, phmLiteCheck };
