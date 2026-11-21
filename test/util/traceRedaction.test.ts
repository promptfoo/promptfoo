import { describe, expect, it } from 'vitest';
import { sanitizeConfigForOutput, sanitizeConfigForPersistence } from '../../src/util/sanitizer';
import {
  getAssertionLeaves,
  hasRedactionMedia,
  protectedReceiptScope,
  sanitizeRedactionGradingInputs,
  sanitizeRedactionResult,
  TRUSTED_REDACTION_GRADER,
} from '../../src/util/traceRedaction';
import {
  configRequiresTraceRedaction,
  sanitizeRedactionResult as projectStoredResult,
  sanitizeCodingAgentVerifierInputs,
} from '../../src/util/verifierPrivacy';

import type { AtomicTestCase, GradingResult } from '../../src/types';

const type = 'promptfoo:redteam:coding-agent:trace-redaction' as const;
const receipt = 'synthetic/value "A"';

describe('public verifier inputs', () => {
  it('removes encoded aliases and keys while preserving public generation instructions', () => {
    const modifiers = {
      testGenerationInstructions: 'Use a short example',
      injectedTerminalInstructions: 'private instruction',
    };
    const input = {
      id: 'coding-agent:trace-redaction',
      examples: [
        receipt,
        JSON.stringify(receipt),
        encodeURIComponent(receipt),
        btoa(receipt),
        Buffer.from(receipt).toString('hex'),
      ],
      inputs: { ['prefix ' + receipt]: 'alias', rawReceipt: { description: 'sensitive' } },
      modifiers,
    };
    const result = sanitizeCodingAgentVerifierInputs(input, {
      source: { type, value: { rawReceipt: receipt } },
    });
    expect(result.examples).toEqual(Array(5).fill('[REDACTED]'));
    expect(result.inputs).toEqual({
      rawReceipt: '[REDACTED]',
      privateVerifierInputsRedacted: true,
    });
    expect(result.modifiers).toMatchObject({
      testGenerationInstructions: modifiers.testGenerationInstructions,
      injectedTerminalInstructions: '[REDACTED]',
    });
    expect(result).toMatchObject({ privateVerifierInputsRedacted: true });
    expect(input.examples[0]).toBe(receipt);
  });

  it('keeps sensitivePaths public but protects receipt path aliases during generation', () => {
    const source = {
      id: 'coding-agent:trace-redaction',
      config: {
        rawReceiptPath: 'local-only.txt',
        sensitivePaths: ['workspace/public.txt'],
      },
    };
    const checked = sanitizeCodingAgentVerifierInputs(
      {
        id: source.id,
        examples: ['local-only.txt', 'workspace/public.txt'],
      },
      { source, strict: true },
    );
    expect(checked.examples).toEqual(['[REDACTED]', 'workspace/public.txt']);
  });

  it('checks short literals inside public generation text in strict mode', () => {
    const source = { id: 'coding-agent:trace-redaction', config: { canary: 'xyz' } };
    expect(
      sanitizeCodingAgentVerifierInputs({ example: 'before-xyz-after' }, { source, strict: true }),
    ).toEqual({ example: '[REDACTED]' });
  });

  it.each([
    { metadata: { privatePrompts: true } },
    { defaultTest: { assert: [{ type }] } },
    { scenarios: [{ config: [{ assert: [{ type: 'assert-set', assert: [{ type }] }] }] }] },
    { tests: [{ assert: [{ type: 'not-' + type }] }] },
    { redteam: { plugins: ['harness:artifact-redaction'] } },
  ])('recognizes privacy from suite structure and catalog markers', (config) => {
    expect(configRequiresTraceRedaction(config)).toBe(true);
    expect(configRequiresTraceRedaction({ vars: config })).toBe(false);
  });

  it('protects prompts, provider inputs and inherited private variables during save and export', () => {
    const config = {
      prompts: ['private template'],
      providers: [{ id: 'http', config: { privateEnv: { data: receipt }, payload: receipt } }],
      defaultTest: { assert: [{ type, value: { rawReceipt: receipt } }] },
      tests: [
        { vars: { task: 'private rendered task' }, prompts: ['private template'] },
        { vars: { task: 'ordinary task' }, options: { disableDefaultAsserts: true } },
        {
          vars: { task: 'private rendered task' },
          options: { disableDefaultAsserts: true },
          assert: [{ type }],
        },
      ],
    };
    for (const copy of [sanitizeConfigForPersistence(config), sanitizeConfigForOutput(config)]) {
      const text = JSON.stringify(copy);
      expect(text).toContain('ordinary task');
      expect(text).not.toContain('private rendered');
      expect(text).not.toContain('private template');
      expect(text).not.toContain('synthetic/value');
      expect(configRequiresTraceRedaction(copy)).toBe(true);
    }
    expect(config.tests[0].vars.task).toBe('private rendered task');
  });

  it('keeps privacy controls and validated counters when receipts equal structural keys', () => {
    const testCase = { assert: [{ type, value: { canaries: ['test', 'assert', '0'] } }] };
    const config = sanitizeConfigForPersistence({
      tests: [{ ...testCase, vars: { task: 'hidden' } }],
    });
    expect(configRequiresTraceRedaction(config)).toBe(true);
    expect(JSON.stringify(config)).not.toContain('hidden');
    const result = projectStoredResult({ testCase, testIdx: 0, score: 0 });
    expect(result).toMatchObject({ testCase: { assert: [{ type }] }, testIdx: 0, score: 0 });
  });

  it('supplies captured file receipts to companion grading without re-reading the file', () => {
    const test: AtomicTestCase = { assert: [{ type, value: { rawReceiptPath: 'local.txt' } }] };
    protectedReceiptScope.run(
      {
        assertionValues: new Map(),
        receiptPaths: new Map(),
        receipts: new Map([['local.txt', [{ location: 'fixture', value: receipt }]]]),
      },
      () => {
        const publicValue = sanitizeRedactionGradingInputs(
          'llm-rubric',
          test,
          'include ' + receipt,
        );
        expect(publicValue.value).toBe('[REDACTED]');
        expect(JSON.stringify(publicValue)).not.toContain('local.txt');
      },
    );
    expect(Symbol.keyFor(TRUSTED_REDACTION_GRADER)).toBeUndefined();
    expect(getAssertionLeaves(test.assert)[0].value).toEqual({ rawReceiptPath: 'local.txt' });
  });
});

describe('private result projections', () => {
  it('allowlists grading evidence and linkage and drops arbitrary provider or hook echoes', () => {
    const grade: GradingResult = {
      pass: false,
      score: 0,
      reason: receipt,
      comment: receipt,
      assertion: { type, value: receipt },
      metadata: {
        gradingError: receipt,
        graderOutputs: { judge: receipt },
        deterministicFailureKind: 'redacted-artifact-sensitive-value',
        gradingIncomplete: true,
        codingAgentExploitStatus: 'evidence_missing',
        verifierEvidence: {
          failureKind: receipt,
          artifactByteLength: receipt,
          redactionReceiptSha256: 'a'.repeat(64),
        },
      },
    };
    const row = {
      testCase: {
        assert: [{ type, value: { rawReceiptPath: 'private/path' } }],
        description: receipt,
        providerOutput: receipt,
        metadata: { echo: receipt },
      },
      response: { output: receipt, raw: { message: receipt } },
      vars: { task: receipt },
      prompt: { raw: receipt, label: 'alias ' + receipt, config: { payload: receipt } },
      error: receipt,
      latencyMs: 123456,
      repeatIndex: receipt,
      score: receipt,
      success: receipt,
      failureReason: receipt,
      namedScores: { [receipt]: 42 },
      metadata: {
        echo: receipt,
        __promptfoo: { traceLinkage: { traceId: 'trace-id', extra: receipt } },
      },
      gradingResult: { ...grade, componentResults: [grade] },
    };
    for (const result of [sanitizeRedactionResult(row), projectStoredResult(row)]) {
      expect(result).toMatchObject({
        vars: {},
        latencyMs: 0,
        namedScores: {},
        metadata: { __promptfoo: { traceLinkage: { traceId: 'trace-id' } } },
        gradingResult: {
          metadata: {
            gradingIncomplete: true,
            graderError: true,
            codingAgentExploitStatus: 'evidence_missing',
            deterministicFailureKind: 'redacted-artifact-sensitive-value',
            verifierEvidence: { redactionReceiptSha256: 'a'.repeat(64) },
          },
        },
      });
      expect(JSON.stringify(result)).not.toContain('synthetic/value');
      expect(JSON.stringify(result)).not.toContain('private/path');
      expect(projectStoredResult(result)).toEqual(result);
    }
    expect(row.response.output).toBe(receipt);
    const gradeOnly = { ...row, testCase: { assert: [] } };
    expect(JSON.stringify(projectStoredResult(gradeOnly))).not.toContain('synthetic/value');
    const ordinary = { ...gradeOnly, gradingResult: null };
    expect(sanitizeRedactionResult(ordinary)).toBe(ordinary);
  });

  it.each(
    [
      { data: new Uint8Array([1]) },
      new Map([['opaque', 'bytes']]),
      new Blob(['opaque']),
      { kind: 'file', file: { mimeType: 'application/pdf', fileWithBytes: 'WA==' } },
      '<script>void 0</script>',
      '<iframe srcdoc="example"></iframe>',
      '<p onclick="void 0">Example</p>',
      { 'data:image/png;base64,WA==': true },
      JSON.stringify({ data: [{ b64_json: 'WA==' }] }),
      Array(20001),
      '[' + '0,'.repeat(15000) + '0]',
    ].map((raw) => ({ raw })),
  )('rejects opaque or excessive raw evidence before public projection', ({ raw }) => {
    const response = { output: 'clean text', raw };
    expect(hasRedactionMedia(response)).toBe(true);
    expect(
      projectStoredResult({ testCase: { assert: [{ type }] }, response }).response,
    ).toMatchObject({ metadata: { redactionMediaOmitted: true } });
  });
});
