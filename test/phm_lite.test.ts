import { describe, expect, it } from 'vitest';
// @ts-ignore -- ESM module without type declarations
import phmAssert, { phmLiteCheck, C_LIGHT } from '../examples/physics-consistency-assertion/phm-lite-assertion.mjs';

describe('PHM-Lite physics-consistency assertion', () => {
  // ---- FAIL: violates universal physical law ----
  it.each([
    ['speed above c (fraction)', 'The probe travels at 1.5 c.'],
    ['speed above c (km/s)', 'Signal propagated at 400,000 km/s through the cable.'],
    ['negative superluminal magnitude', 'The particle drifted at -400,000 km/s.'],
    ['temperature below absolute zero (ASCII)', 'We cooled the sample to -300 degC.'],
    ['temperature below absolute zero (U+2212)', 'We cooled the sample to −300 °C.'],
    ['negative mass (kg)', 'The reaction consumed -5 kg of catalyst.'],
    ['probability above 100%', 'We are 150% confident in this result.'],
    ['probability below 0%', 'a probability of -5% is recorded'],
  ])('flags FAIL: %s', (_name, text) => {
    const r = phmLiteCheck(text);
    expect(r.verdict).toBe('FAIL');
  });

  // ---- WARN: suspicious but not impossible ----
  it.each([
    ['impossible free-fall timing', 'The ball fell 100 m in 1 s.'],
    ['zero-second fall', 'fell 100 m in 0 s'],
    ['fall claim spanning a line break', 'The weight fell 100 m\nin 1 s.'],
    ['exponent-form fall quantities', 'fell 1e2 m in 1e0 s'],
    ['percentage shares summing over 100%', 'Traffic shares: A took 6e1% and B took 7e1%.'],
    ['scientific-notation percentage sum', 'A took 6e1% and B took 7e1% of traffic.'],
  ])('flags WARN: %s', (_name, text) => {
    const r = phmLiteCheck(text);
    expect(r.verdict).toBe('WARN');
  });

  // ---- PASS: physically plausible ----
  it.each([
    ['ordinary speeds', 'The car travels at 25 m/s. Water freezes at 0 degC.'],
    ['rounded light speed (1% tolerance)', 'Light travels at 3e8 m/s in vacuum.'],
    ['range separator (temperature)', 'The sensor operates over a range 0-300 °C.'],
    ['range separator (mass)', 'Capacity 0-5 kg per batch.'],
    ['leading-dot decimals', 'The signal moved at .5 c relative to the lab frame.'],
    ['acceleration (caret form)', 'The piston saw 5e8 m/s^2 of acceleration.'],
    ['acceleration (superscript)', 'Acceleration reached 6.0e8 m/s².'],
    ['acceleration (plain ASCII exponent)', 'accel in plain ascii: 6e8 m/s2'],
    ['exact Fahrenheit absolute-zero boundary', 'The gas reached -459.67 °F, absolute zero.'],
    ['no quantities at all', 'Chapter 3 covers 5 topics. The answer is 42.'],
    ['plausible free-fall timing', 'The ball fell 20 m in 2.1 s.'],
  ])('passes: %s', (_name, text) => {
    const r = phmLiteCheck(text);
    expect(r.verdict).toBe('PASS');
  });

  it('still flags true negatives that look like ranges', () => {
    // sanity: the range-separator fix must not disable real violations
    expect(phmLiteCheck('We cooled it to -300 °C.').verdict).toBe('FAIL');
  });

  it('connects an untimed first fall without swallowing a later timed claim', () => {
    const r = phmLiteCheck('The first ball fell 5 m while the second fell 100 m in 1 s');
    expect(r.violations.some((v: { rule: string }) => v.rule === 'free-fall-time')).toBe(true);
  });

  it('scans structured object outputs with split value/unit fields', async () => {
    const res = await phmAssert({ temperature: { value: -300, unit: 'degC' } });
    expect(res.pass).toBe(false);
    expect(res.reason).toContain('absolute-zero');
  });

  it('scores deterministic repeats identically', () => {
    const a = JSON.stringify(phmLiteCheck('The probe travels at 2.3 c and hit -50 degC.'));
    const b = JSON.stringify(phmLiteCheck('The probe travels at 2.3 c and hit -50 degC.'));
    expect(a).toBe(b);
  });

  it('exposes the exact SI speed of light', () => {
    expect(C_LIGHT).toBe(299792458);
  });
});
