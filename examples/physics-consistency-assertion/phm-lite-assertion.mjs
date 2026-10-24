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
  const re =
    /(-?\d[\d,]*(?:\.\d+)?(?:\s*[eE][+-]?\d+)?)\s*(°C|degC|°F|K\b|km\/s|m\/s|c\b|%|kg\b|g\b|km\b|m\b|J\b|kJ\b|MJ\b|Wh\b|kWh\b|MeV\b|GeV\b|eV\b|N\b|Pa\b|kPa\b|MPa\b|atm\b|mol\/L\b|mg\/mL\b)?/g;
  let m;
  while ((m = re.exec(text)) !== null) {
    const raw = m[1].replace(/,/g, '');
    const value = Number(raw);
    if (!Number.isFinite(value)) continue;
    out.push({ value, unit: (m[2] || '').trim(), raw: m[0].trim() });
  }
  return out;
}

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
function phmLiteCheck(output) {
  const violations = [];
  const qs = extractQuantities(output);

  for (const { value, unit, raw } of qs) {
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
    if (speedMs !== null && speedMs > C_LIGHT * 1.01) {
      violations.push({
        rule: 'speed-of-light',
        severity: 'FAIL',
        detail: `stated speed ${raw} exceeds c (${C_LIGHT} m/s)`,
      });
    }

    // Rule 2: absolute temperature floor.
    const celsius = toCelsius(value, unit);
    if (celsius !== null && celsius < ABSOLUTE_ZERO_C) {
      violations.push({
        rule: 'absolute-zero',
        severity: 'FAIL',
        detail: `stated temperature ${raw} is below absolute zero`,
      });
    }

    // Rule 3: non-negativity of mass and energy.
    if ((unit === 'kg' || unit === 'J' || unit === 'kJ' || unit === 'MJ') && value < 0) {
      violations.push({
        rule: 'negative-mass-energy',
        severity: 'FAIL',
        detail: `negative ${unit} quantity: ${raw}`,
      });
    }

    // Rule 4: percentage range.
    if (unit === '%' && Math.abs(value) > 100) {
      violations.push({
        rule: 'percentage-range',
        severity: 'FAIL',
        detail: `percentage outside [0, 100]: ${raw}`,
      });
    }
  }

  // Rule 5: free-fall time consistency, "fell X m in Y s" (15% tolerance).
  const fall =
    /(?:fell|drops?|dropped|falls?)\s+([\d,.]+)\s*(?:m\b|meters?|metres?).*?(?:in|within|after)\s+([\d,.]+)\s*s(?:ec|econds?)?\b/i.exec(
      output
    );
  if (fall) {
    const h = Number(fall[1].replace(/,/g, ''));
    const t = Number(fall[2].replace(/,/g, ''));
    if (h > 0 && t > 0) {
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

  // Rule 6: percentage shares summing above 100% (warn; may be overlapping).
  const pct = [...output.matchAll(/(\d[\d,.]*)\s*%/g)].map((x) => Number(x[1].replace(/,/g, '')));
  if (pct.length >= 2) {
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

export default async function phmLiteAssertion(output) {
  const { verdict, violations } = phmLiteCheck(String(output ?? ''));
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
export { phmLiteCheck, extractQuantities, C_LIGHT, G_EARTH };
