import fs from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';
import { runAssertion } from '../../src/assertions';
import { handleNumeric } from '../../src/assertions/numeric';
import { transform } from '../../src/util/transform';
import { loadYaml } from '../../src/util/yamlLoad';

import type {
  Assertion,
  AssertionParams,
  AssertionValue,
  AtomicTestCase,
  ProviderOptions,
} from '../../src/types/index';

function check(output: unknown, value: unknown = { min: 0.8, max: 1 }, inverse = false) {
  const assertion = {
    type: inverse ? ('not-numeric' as const) : ('numeric' as const),
    value: value as AssertionValue,
  };
  return handleNumeric({
    output: output as AssertionParams['output'],
    assertion,
    renderedValue: assertion.value,
    inverse,
  });
}

describe('numeric', () => {
  it.each([0.8, 0.9, 1, '0.9', ' 9e-1 '])('accepts an inclusive range: %s', (output) => {
    expect(check(output)).toMatchObject({ pass: true, score: 1 });
    expect(check(output, { min: 0.8, max: 1 }, true).pass).toBe(false);
  });
  it.each([-1, 0, 0.799, 1.001])('rejects numbers outside the range: %s', (output) => {
    expect(check(output)).toMatchObject({ pass: false, score: 0 });
    expect(check(output, { min: 0.8, max: 1 }, true).pass).toBe(true);
  });
  it.each([
    undefined,
    null,
    true,
    false,
    '',
    ' ',
    'null',
    'true',
    '[]',
    [],
    [1],
    {},
    NaN,
    Infinity,
    -Infinity,
    '1e999',
    '0.9oops',
    '"0.9"',
    '0x1',
  ])('fails invalid output even when negated: %j', (output) => {
    expect(check(output).pass).toBe(false);
    expect(check(output, { min: 0.8 }, true).pass).toBe(false);
  });
  it('supports exact, one-sided, zero, negative, and fractional bounds', () => {
    expect(check(0, 0).pass).toBe(true);
    expect(check(-2, { max: -1.5 }).pass).toBe(true);
    expect(check(2.5, { min: 2.5 }).pass).toBe(true);
    expect(check(2, { min: 2, max: 2 }).pass).toBe(true);
    expect(check(1, '1').pass).toBe(true);
    expect(check(2, 1).pass).toBe(false);
  });
  it.each([
    undefined,
    null,
    {},
    [],
    true,
    NaN,
    Infinity,
    { min: NaN },
    { max: Infinity },
    { min: '0.8' },
    { min: null },
    { min: 2, max: 1 },
    { minimum: 0.8 },
    { min: 0, typo: 1 },
  ])('rejects invalid constraints: %j', (value) => {
    expect(() =>
      handleNumeric({
        output: '0.9',
        assertion: { type: 'numeric', value: value as AssertionValue },
        renderedValue: value as AssertionValue,
        inverse: false,
      }),
    ).toThrow('"numeric" assertion value');
  });
  it('routes transforms and templated exact values through the assertion pipeline', async () => {
    const result = await runAssertion({
      assertion: { type: 'numeric', transform: 'output.confidence', value: '{{expected}}' },
      test: { vars: { expected: 0.9 } },
      providerResponse: { output: { confidence: 0.9 } },
    });
    expect(result).toMatchObject({ pass: true, score: 1 });
  });
  it('fails a missing confidence instead of passing not-numeric', async () => {
    const result = await runAssertion({
      assertion: {
        type: 'not-numeric',
        transform: 'output.confidence ?? NaN',
        value: { min: 0.8 },
      },
      test: {},
      providerResponse: { output: { probability: 0.9 } },
    });
    expect(result).toMatchObject({ pass: false, score: 0 });
  });
});

describe('shared decision example', () => {
  const config = loadYaml(
    fs.readFileSync(path.resolve('examples/decision-assertions/promptfooconfig.yaml'), 'utf8'),
  ) as {
    providers: ProviderOptions[];
    defaultTest: { assert: Assertion[] };
    tests: AtomicTestCase[];
  };

  it.each([0, 1])('uses identical assertions with provider %s', async (index) => {
    for (const test of config.tests) {
      for (const scenario of [
        { choice: test.vars!.expected, confidence: 0.9, expected: [true, true] },
        { choice: test.vars!.expected, confidence: 0.79, expected: [true, false] },
        { choice: 'wrong', confidence: 0.99, expected: [false, true] },
        { choice: test.vars!.expected, confidence: undefined, expected: [true, false] },
      ]) {
        const answer = {
          type: 'choice',
          name: 'category',
          choice: scenario.choice,
          confidence: scenario.confidence,
        };
        const raw = index === 0 ? JSON.stringify({ answers: [answer] }) : { category: answer };
        const output = await transform(config.providers[index].transform!, raw, {
          vars: test.vars!,
        });
        const verdicts = await Promise.all(
          config.defaultTest.assert.map((assertion) =>
            runAssertion({ assertion, test, providerResponse: { output } }),
          ),
        );
        expect(verdicts.map((result) => result.pass)).toEqual(scenario.expected);
      }
    }
  });
  it('does not treat a refusal as a low-confidence success', async () => {
    const output = await transform(
      config.providers[0].transform!,
      JSON.stringify({ answers: [{ type: 'refusal', name: 'category' }] }),
      { vars: {} },
    );
    await expect(
      runAssertion({
        assertion: config.defaultTest.assert[0],
        test: config.tests[0],
        providerResponse: { output },
      }),
    ).rejects.toThrow('did not return a value');
    expect(
      (
        await runAssertion({
          assertion: config.defaultTest.assert[1],
          test: {},
          providerResponse: { output },
        })
      ).pass,
    ).toBe(false);
  });
});
