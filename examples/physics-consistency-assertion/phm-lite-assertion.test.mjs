import { test } from 'node:test';
import assert from 'node:assert/strict';
import { phmLiteCheck, extractQuantities, C_LIGHT } from './phm-lite-assertion.mjs';

// ---- FAIL: violates universal physical law ----

test('speed above c (fraction notation) fails', () => {
  const r = phmLiteCheck('The probe travels at 1.5 c.');
  assert.equal(r.verdict, 'FAIL');
  assert.ok(r.violations.some((v) => v.rule === 'speed-of-light'));
});

test('speed above c (km/s) fails', () => {
  const r = phmLiteCheck('Signal propagated at 400,000 km/s through the cable.');
  assert.equal(r.verdict, 'FAIL');
});

test('negative superluminal magnitude fails (limit applies to |v|)', () => {
  const r = phmLiteCheck('The particle drifted at -400,000 km/s.');
  assert.equal(r.verdict, 'FAIL');
  assert.ok(r.violations.some((v) => v.rule === 'speed-of-light'));
});

test('temperature below absolute zero (ASCII minus) fails', () => {
  const r = phmLiteCheck('We cooled the sample to -300 degC.');
  assert.equal(r.verdict, 'FAIL');
  assert.ok(r.violations.some((v) => v.rule === 'absolute-zero'));
});

test('temperature below absolute zero (U+2212 minus) fails', () => {
  const r = phmLiteCheck('We cooled the sample to \u2212300 degC.');
  assert.equal(r.verdict, 'FAIL');
  assert.ok(r.violations.some((v) => v.rule === 'absolute-zero'));
});

test('negative mass in kg fails', () => {
  const r = phmLiteCheck('The reaction consumed -5 kg of catalyst.');
  assert.equal(r.verdict, 'FAIL');
});

test('negative mass in grams fails (g is a mass unit too)', () => {
  const r = phmLiteCheck('The balance read mass is -5 g.');
  assert.equal(r.verdict, 'FAIL');
  assert.ok(r.violations.some((v) => v.rule === 'negative-mass-energy'));
});

test('percentage above 100 fails', () => {
  const r = phmLiteCheck('We are 150% confident in this result.');
  assert.equal(r.verdict, 'FAIL');
});

test('negative percentage fails (range is [0, 100])', () => {
  const r = phmLiteCheck('The model achieved -5% accuracy.');
  assert.equal(r.verdict, 'FAIL');
  assert.ok(r.violations.some((v) => v.rule === 'percentage-range'));
});

// ---- WARN: suspicious but not strictly impossible ----

test('impossible free-fall timing warns', () => {
  const r = phmLiteCheck('The ball fell 100 m in 1 s.');
  assert.equal(r.verdict, 'WARN');
  assert.ok(r.violations.some((v) => v.rule === 'free-fall-time'));
});

test('every fall claim is checked (later impossible one is caught)', () => {
  const r = phmLiteCheck('The first ball fell 20 m in 2.1 s, and the second fell 100 m in 1 s.');
  assert.equal(r.verdict, 'WARN');
  assert.ok(r.violations.some((v) => v.rule === 'free-fall-time'));
});

test('percentage shares summing above 100 warn', () => {
  const r = phmLiteCheck('Method A handled 60% of cases, method B handled 70% of cases.');
  assert.equal(r.verdict, 'WARN');
  assert.ok(r.violations.some((v) => v.rule === 'percentage-sum'));
});

// ---- PASS: physically plausible ----

test('plausible output passes', () => {
  const r = phmLiteCheck('The car travels at 25 m/s. Water freezes at 0 degC. Sensor reads 98.6%.');
  assert.equal(r.verdict, 'PASS');
});

test('rounded light-speed notation passes (1% tolerance)', () => {
  const r = phmLiteCheck('Light travels at 3e8 m/s in vacuum.');
  assert.equal(r.verdict, 'PASS');
});

test('text without quantities passes', () => {
  const r = phmLiteCheck('Chapter 3 covers 5 topics. The answer is 42.');
  assert.equal(r.verdict, 'PASS');
});

test('plausible free-fall timing passes (85% tolerance band)', () => {
  const r = phmLiteCheck('The ball fell 20 m in 2.1 s.');
  assert.equal(r.verdict, 'PASS');
});

// ---- Parser internals ----

test('extractQuantities handles scientific notation and commas', () => {
  const qs = extractQuantities('values 3e8 m/s and 300,000 km/s');
  assert.deepEqual(
    qs.map((q) => [q.value, q.unit]),
    [
      [3e8, 'm/s'],
      [300000, 'km/s'],
    ]
  );
});

test('extractQuantities parses U+2212 as negative', () => {
  const qs = extractQuantities('cooled to \u2212300 degC');
  assert.equal(qs[0].value, -300);
});

test('C_LIGHT is the exact SI value', () => {
  assert.equal(C_LIGHT, 299792458);
});
