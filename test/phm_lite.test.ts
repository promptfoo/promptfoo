import { describe, expect, it } from 'vitest';
// @ts-expect-error -- The JavaScript example has no TypeScript declarations.
import * as physics from '../examples/physics-consistency-assertion/phm-lite-assertion.mjs';

const { default: phmAssert, phmLiteCheck, C_LIGHT } = physics;

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
    ['spelled-out speed unit', 'The beam moved at 400,000 kilometers per second.'],
    ['British kilometre spelling', 'The beam moved at 400,000 kilometres per second.'],
    ['mixed algebra marker with motion context', 'The equation predicts that the signal travels at 2c.'],
    ['price in the following sentence', 'The signal travels at 2c. The price is $5.'],
    ['cross-sentence delta marker', 'Conditions changed yesterday. The reaction consumed -5 kg of catalyst.'],
    ['abbreviation in algebra context', 'The equation, e.g. its leading term is 2c.'],
    ['accelerated to bare c', 'The projectile accelerated to 2c.'],
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
    [
      'scientific-notation percentage sum',
      'Traffic shares: A took 6e1% and B took 7e1% of traffic.',
    ],
  ])('flags WARN: %s', (_name, text) => {
    const r = phmLiteCheck(text);
    expect(r.verdict).toBe('WARN');
  });

  // ---- PASS: physically plausible ----
  it.each([
    ['temperature difference', 'The temperature change was -300 °C.'],
    ['symbolic temperature difference', 'ΔT = -300 °C.'],
    ['probability context in another sentence', 'We checked the probability. Revenue grew 150%.'],
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
    ['cents notation, not light-speed', 'The item costs 2 c each.'],
    ['algebra coefficient, not light-speed', 'The expression is 2c.'],
    ['mass change, not absolute mass', 'The mass change was -5 kg after drying.'],
    ['repeated-denominator acceleration', 'Acceleration reached 5e8 meters per second per second.'],
    ['compact repeated denominator', 'Acceleration hit 5e8 m/s per second.'],
    ['abbreviation in share context', 'Traffic shares, e.g. A took 60% and B took 70% of traffic.'],
    ['confidential word, not confidence', 'The confidential report says revenue grew 150%.'],
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

  it('does not let substrings of delta words exempt absolute readings', () => {
    const r = phmLiteCheck('The chamber temperature remained unchanged at -300 °C.');
    expect(r.violations.some((v: { rule: string }) => v.rule === 'absolute-zero')).toBe(true);
  });

  it('keeps probability context across abbreviations (e.g.)', () => {
    const r = phmLiteCheck('The probability, e.g. 150%, is invalid');
    expect(r.violations.some((v: { rule: string }) => v.rule === 'percentage-range')).toBe(true);
  });

  it('scopes mass-change exemption to the preceding kg mention', () => {
    const r = phmLiteCheck(
      'The tank lost 2 kg of water. The reaction consumed -5 kg of catalyst.',
    );
    expect(r.violations.some((v: { rule: string }) => v.rule === 'negative-mass')).toBe(true);
  });

  it('keeps the light-speed rule for genuine 2c claims', () => {
    const r = phmLiteCheck('The signal travels at 2c through the medium.');
    expect(r.violations.some((v: { rule: string }) => v.rule === 'speed-of-light')).toBe(true);
  });

  it('scans structured outputs with parent-key context', async () => {
    const bad = await phmLiteAssertion({ probability: { value: 150, unit: '%' } });
    expect(bad.pass).toBe(false);
    const growth = await phmLiteAssertion({ growth: { value: 150, unit: '%' } });
    expect(growth.pass).toBe(true);
    const benign = await phmLiteAssertion({ probability: { value: 85, unit: '%' } });
    expect(benign.pass).toBe(true);
  });

  it('still rejects spelled-out accelerations', () => {
    const r = phmLiteCheck('The piston saw 5e8 meters per second squared of acceleration.');
    expect(r.verdict).toBe('PASS');
  });

  it('stops free-fall pairing at sentence boundaries', () => {
    const r = phmLiteCheck('The rock fell 100 m. The sensor responded in 1 s.');
    expect(r.violations.some((v: { rule: string }) => v.rule === 'free-fall-time')).toBe(false);
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
