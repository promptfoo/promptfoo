import { describe, expect, it } from 'vitest';
import { createTestCaseSelection, restoreTestCaseSelection } from '../../../src/evaluator';
import { generateIdFromPrompt } from '../../../src/models/prompt';
import {
  applyPromptSelection,
  createPromptSelection,
  getPromptsForReplay,
} from '../../../src/util/eval/replay';
import { createCompletedPrompt } from '../../factories/eval';

describe('evaluation replay helpers', () => {
  it('restores logical config order when provider expansion starts with a later prompt', () => {
    const resolvedPrompts = [
      { raw: 'first', label: 'First prompt', config: { temperature: 0 } },
      { raw: 'second', label: 'Second prompt' },
    ];
    const first = createCompletedPrompt('first', {
      id: generateIdFromPrompt(resolvedPrompts[0]),
      label: 'First prompt',
      provider: 'provider-b',
      config: { temperature: 0 },
    });
    const second = createCompletedPrompt('second', {
      id: generateIdFromPrompt(resolvedPrompts[1]),
      label: 'Second prompt',
      provider: 'provider-a',
    });
    const secondExpandedForAnotherProvider = { ...second, provider: 'provider-b' };

    expect(
      getPromptsForReplay([second, first, secondExpandedForAnotherProvider], resolvedPrompts),
    ).toEqual([
      {
        raw: 'first',
        label: 'First prompt',
        config: { temperature: 0 },
      },
      {
        raw: 'second',
        label: 'Second prompt',
        config: undefined,
      },
    ]);
  });

  it('does not collapse legacy persisted prompts that have no ID', () => {
    const first = createCompletedPrompt('first', { id: undefined, provider: 'provider-a' });
    const second = createCompletedPrompt('second', { id: undefined, provider: 'provider-b' });

    expect(getPromptsForReplay([first, second])).toHaveLength(2);
  });

  it('distinguishes persisted prompts that share a label but have different content', () => {
    const resolvedPrompts = [
      { raw: 'first content', label: 'Shared label' },
      { raw: 'second content', label: 'Shared label' },
    ];
    const sharedId = generateIdFromPrompt(resolvedPrompts[0]);
    const first = createCompletedPrompt('first content', {
      id: sharedId,
      label: 'Shared label',
      provider: 'provider-a',
    });
    const firstExpandedForAnotherProvider = { ...first, provider: 'provider-b' };
    const second = createCompletedPrompt('second content', {
      id: sharedId,
      label: 'Shared label',
      provider: 'provider-a',
    });

    expect(
      getPromptsForReplay([first, firstExpandedForAnotherProvider, second], resolvedPrompts).map(
        (prompt) => prompt.raw,
      ),
    ).toEqual(['first content', 'second content']);
  });

  it('restores reordered and repeated prompt selections exactly', () => {
    const prompts = [
      { raw: 'first', label: 'First' },
      { raw: 'second', label: 'Second' },
      { raw: 'third', label: 'Third' },
    ];
    const selection = createPromptSelection([prompts[2], prompts[0], prompts[2]]);
    const selectedPrompts = applyPromptSelection(prompts, selection);
    const persisted = [
      createCompletedPrompt('third', {
        id: generateIdFromPrompt(prompts[2]),
        label: 'Third',
      }),
      createCompletedPrompt('first', {
        id: generateIdFromPrompt(prompts[0]),
        label: 'First',
      }),
    ];

    expect(selectedPrompts.map((prompt) => prompt.label)).toEqual(['Third', 'First', 'Third']);
    expect(getPromptsForReplay(persisted, selectedPrompts).map((prompt) => prompt.label)).toEqual([
      'Third',
      'First',
      'Third',
    ]);
  });

  it('fails closed when a selected prompt changes', () => {
    const selection = createPromptSelection([{ raw: 'original', label: 'Prompt' }]);

    expect(() => applyPromptSelection([{ raw: 'changed', label: 'Prompt' }], selection)).toThrow(
      'no longer exists in the resolved configuration',
    );
  });

  it('restores selected tests by identity after the config is reordered', () => {
    const originalTests = [
      { vars: { input: 'first' }, assert: [{ type: 'equals', value: 'one' }] },
      { vars: { input: 'second' }, assert: [{ type: 'equals', value: 'two' }] },
      { vars: { input: 'third' }, assert: [{ type: 'equals', value: 'three' }] },
    ];
    const selection = createTestCaseSelection(originalTests, [2, 0]);

    expect(
      restoreTestCaseSelection([originalTests[0], originalTests[2], originalTests[1]], selection),
    ).toEqual([1, 0]);
  });

  it('fails closed when a selected test definition changes', () => {
    const originalTests = [{ vars: { input: 'first' } }, { vars: { input: 'second' } }];
    const selection = createTestCaseSelection(originalTests, [1]);

    expect(() =>
      restoreTestCaseSelection(
        [{ vars: { input: 'first' } }, { vars: { input: 'changed' } }],
        selection,
      ),
    ).toThrow('no longer exists in the resolved configuration');
  });

  it('fails closed when variable key order changes execution row ordering', () => {
    const selection = createTestCaseSelection(
      [{ vars: { first: ['a', 'b'], second: ['c', 'd'] } }],
      [0],
    );

    expect(() =>
      restoreTestCaseSelection([{ vars: { second: ['c', 'd'], first: ['a', 'b'] } }], selection),
    ).toThrow('no longer exists in the resolved configuration');
  });

  it('allows per-test provider credentials to rotate without changing the selected test', () => {
    const originalTest = {
      vars: { token: 'semantic-test-value' },
      provider: {
        id: 'http',
        config: {
          apiKey: 'old-secret',
          url: 'https://example.test/chat?api_key=old-url-secret',
        },
      },
      options: {
        provider: {
          id: 'openai:chat:gpt-4.1-mini',
          config: { apiKey: 'old-grader-secret' },
        },
      },
    };
    const selection = createTestCaseSelection([originalTest], [0]);
    const rotatedCredentials = {
      ...originalTest,
      provider: {
        ...originalTest.provider,
        config: {
          ...originalTest.provider.config,
          apiKey: 'new-secret',
          url: 'https://example.test/chat?api_key=new-url-secret',
        },
      },
      options: {
        provider: {
          ...originalTest.options.provider,
          config: { apiKey: 'new-grader-secret' },
        },
      },
    };

    expect(restoreTestCaseSelection([rotatedCredentials], selection)).toEqual([0]);
    expect(() =>
      restoreTestCaseSelection(
        [{ ...rotatedCredentials, vars: { token: 'changed-semantic-value' } }],
        selection,
      ),
    ).toThrow('no longer exists in the resolved configuration');
  });

  it('fails closed when a per-test provider endpoint or implementation changes', () => {
    const originalTest = {
      provider: {
        id: 'http',
        callApi: () => ({ output: 'original' }),
        config: { apiKey: 'secret', url: 'https://example.test/chat' },
      },
    };
    const selection = createTestCaseSelection([originalTest], [0]);

    expect(() =>
      restoreTestCaseSelection(
        [
          {
            provider: {
              ...originalTest.provider,
              config: { ...originalTest.provider.config, url: 'https://other.test/chat' },
            },
          },
        ],
        selection,
      ),
    ).toThrow('no longer exists in the resolved configuration');
    expect(() =>
      restoreTestCaseSelection(
        [
          {
            provider: {
              ...originalTest.provider,
              callApi: () => ({ output: 'changed' }),
            },
          },
        ],
        selection,
      ),
    ).toThrow('no longer exists in the resolved configuration');
  });

  it('preserves repeated selection of the same logical test', () => {
    const tests = [{ vars: { input: 'first' } }, { vars: { input: 'second' } }];
    const selection = createTestCaseSelection(tests, [1, 0, 1]);

    expect(restoreTestCaseSelection(tests, selection)).toEqual([1, 0, 1]);
  });

  it('does not persist secret-bearing test definitions in a selection', () => {
    const selection = createTestCaseSelection(
      [{ vars: { input: 'first' }, options: { provider: { apiKey: 'secret-value' } } }],
      [0],
    );

    expect(JSON.stringify(selection)).not.toContain('secret-value');
    expect(selection.tests[0].fingerprint).toMatch(/^[a-f0-9]{64}$/);
  });

  // Fix 8 (thread 3481053724): two identical selected tests at [0, 1] used to
  // collapse to [1, 1] after an unrelated test was inserted before them; both
  // selection entries mapped to the first matching fingerprint.
  it('restores duplicate identical selected tests to distinct indices after insertion', () => {
    const identical = { vars: { input: 'same' } };
    const original = [identical, { ...identical }];
    const selection = createTestCaseSelection(original, [0, 1]);

    const reordered = [
      { vars: { input: 'inserted' } },
      { vars: { input: 'same' } },
      { vars: { input: 'same' } },
    ];
    const restored = restoreTestCaseSelection(reordered, selection);
    expect(restored).toHaveLength(2);
    expect(new Set(restored).size).toBe(2);
    expect([...restored].sort((a, b) => a - b)).toEqual([1, 2]);
  });

  it('keeps distinct duplicate rows one-to-one even when an unselected duplicate exists', () => {
    const tests = [
      { vars: { input: 'dup' } },
      { vars: { input: 'dup' } },
      { vars: { input: 'dup' } },
    ];
    // Select only indices 1 and 2; the unselected duplicate at 0 must not be consumed.
    const selection = createTestCaseSelection(tests, [1, 2]);
    expect(restoreTestCaseSelection(tests, selection)).toEqual([1, 2]);
  });

  // Fix 6 (thread 3481053714): the raw JSON.stringify prompt fingerprint threw on
  // bigint/circular prompt config and rejected credential rotation.
  it('fingerprints prompt config with bigint and circular references without throwing', () => {
    const circular: Record<string, unknown> = { limit: 1n };
    circular.self = circular;
    const prompts = [{ raw: 'p', label: 'P', config: circular }];

    let selection: ReturnType<typeof createPromptSelection> | undefined;
    expect(() => {
      selection = createPromptSelection(prompts);
    }).not.toThrow();
    expect(selection?.prompts[0].fingerprint).toMatch(/^[a-f0-9]{64}$/);
  });

  it('allows prompt-config credential rotation without rejecting replay', () => {
    const selection = createPromptSelection([
      { raw: 'p', label: 'P', config: { apiKey: 'old-secret' } },
    ]);
    expect(JSON.stringify(selection)).not.toContain('old-secret');
    expect(() =>
      applyPromptSelection([{ raw: 'p', label: 'P', config: { apiKey: 'new-secret' } }], selection),
    ).not.toThrow();
  });
});
