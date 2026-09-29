import { describe, expect, it } from 'vitest';
import { sanitizeResultForJsonlArtifact } from '../../src/models/evalResult';
import { sanitizeConfigForOutput } from '../../src/util/sanitizer';

import type { OutputStripFlags } from '../../src/models/evalResult';
import type { AtomicTestCase, UnifiedConfig } from '../../src/types';

const flags = (overrides: Partial<OutputStripFlags> = {}): OutputStripFlags => ({
  shouldStripPromptText: false,
  shouldStripResponseOutput: false,
  shouldStripTestVars: false,
  shouldStripGradingResult: false,
  shouldStripMetadata: false,
  ...overrides,
});

function createTestCase(): AtomicTestCase {
  return {
    options: { rubricPrompt: ['Grade this greeting.', 'Return a score.'], temperature: 0 },
    assert: [
      {
        type: 'assert-set',
        assert: [
          { type: 'llm-rubric', value: 'A friendly greeting', rubricPrompt: 'Grade the answer.' },
        ],
      },
    ],
    metadata: { notes: { rubricPrompt: 'User-authored label', bestImageDescription: 'User note' } },
  };
}

describe('artifact field projections', () => {
  it.each([false, true])('projects rubric prompts in result schema slots (strip=%s)', (strip) => {
    const testCase = createTestCase();
    const assertion = testCase.assert![0];
    const component = { pass: true, score: 1, reason: 'Greeting matched', assertion };
    const source = {
      testCase,
      response: { output: 'Hello.', tokenUsage: { total: 10, prompt: 4, completion: 6 } },
      gradingResult: { ...component, componentResults: [component] },
      namedScores: { greeting: 1 },
    };
    const original = structuredClone(source);

    const artifact = sanitizeResultForJsonlArtifact(
      source,
      flags({ shouldStripPromptText: strip }),
    );

    const rubricPaths = [
      'testCase.options.rubricPrompt',
      'testCase.assert.0.assert.0.rubricPrompt',
      'gradingResult.assertion.assert.0.rubricPrompt',
      'gradingResult.componentResults.0.assertion.assert.0.rubricPrompt',
    ];
    for (const path of rubricPaths) {
      if (strip) {
        expect(artifact).not.toHaveProperty(path);
      } else {
        expect(artifact).toHaveProperty(path);
      }
    }
    expect(artifact.testCase.options?.temperature).toBe(0);
    expect(artifact.testCase.metadata).toEqual(testCase.metadata);
    expect(artifact).toHaveProperty('testCase.assert.0.assert.0.value', 'A friendly greeting');
    expect(artifact.response).toEqual(source.response);
    expect(artifact.gradingResult).toMatchObject({
      pass: true,
      score: 1,
      reason: 'Greeting matched',
    });
    expect(artifact.namedScores).toEqual(source.namedScores);
    expect(source).toEqual(original);
  });

  it.each([false, true])(
    'projects rubric prompts across config test locations (strip=%s)',
    (strip) => {
      const config: Partial<UnifiedConfig> = {
        tests: [createTestCase()],
        defaultTest: createTestCase(),
        scenarios: [{ config: [createTestCase()], tests: [createTestCase()] }],
      };
      const original = structuredClone(config);

      const artifact = sanitizeConfigForOutput(config, flags({ shouldStripPromptText: strip }));

      for (const location of [
        'tests.0',
        'defaultTest',
        'scenarios.0.config.0',
        'scenarios.0.tests.0',
      ]) {
        for (const field of ['options.rubricPrompt', 'assert.0.assert.0.rubricPrompt']) {
          if (strip) {
            expect(artifact).not.toHaveProperty(`${location}.${field}`);
          } else {
            expect(artifact).toHaveProperty(`${location}.${field}`);
          }
        }
        expect(artifact).toHaveProperty(`${location}.options.temperature`, 0);
        expect(artifact).toHaveProperty(`${location}.metadata`, createTestCase().metadata);
        expect(artifact).toHaveProperty(
          `${location}.assert.0.assert.0.value`,
          'A friendly greeting',
        );
      }
      expect(config).toEqual(original);
    },
  );

  it.each([false, true])('projects provider-owned selected image fields (strip=%s)', (strip) => {
    const providerMetadata = {
      bestImageUrl: 'https://example.test/greeting.png',
      bestImageDescription: 'A friendly greeting card.',
      finalIteration: 2,
      highestScore: 1,
    };
    const notes = { bestImageUrl: 'User reference', bestImageDescription: 'User-authored note' };
    const source = {
      response: {
        output: 'Hello.',
        tokenUsage: { total: 10, prompt: 4, completion: 6, numRequests: 1 },
        metadata: providerMetadata,
      },
      metadata: { ...providerMetadata, notes },
      testCase: { metadata: { notes } },
      score: 1,
      cost: 0.01,
    };
    const original = structuredClone(source);

    const artifact = sanitizeResultForJsonlArtifact(
      source,
      flags({ shouldStripResponseOutput: strip }),
    );

    for (const location of ['metadata', 'response.metadata']) {
      for (const field of ['bestImageUrl', 'bestImageDescription']) {
        if (strip) {
          expect(artifact).not.toHaveProperty(`${location}.${field}`);
        } else {
          expect(artifact).toHaveProperty(`${location}.${field}`);
        }
      }
      expect(artifact).toHaveProperty(`${location}.finalIteration`, 2);
      expect(artifact).toHaveProperty(`${location}.highestScore`, 1);
    }
    expect(artifact.response.output).toBe(strip ? '[output stripped]' : 'Hello.');
    expect(artifact.response.tokenUsage).toEqual(source.response.tokenUsage);
    expect(artifact.metadata.notes).toEqual(notes);
    expect(artifact.testCase.metadata).toEqual(source.testCase.metadata);
    expect(artifact.score).toBe(1);
    expect(artifact.cost).toBe(0.01);
    expect(source).toEqual(original);
  });
});
