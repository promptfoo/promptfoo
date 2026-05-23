import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchHuggingFaceDataset } from '../../../src/integrations/huggingfaceDatasets';
import {
  AegisGrader,
  AegisPlugin,
  DATASET_PATH,
  fetchDataset,
} from '../../../src/redteam/plugins/aegis';
import { RedteamGraderBase } from '../../../src/redteam/plugins/base';
import { createMockProvider } from '../../factories/provider';

import type { TestCase } from '../../../src/types/index';

vi.mock('../../../src/integrations/huggingfaceDatasets');

describe('AegisPlugin', () => {
  let plugin: AegisPlugin;
  const mockProvider = createMockProvider();

  beforeEach(() => {
    plugin = new AegisPlugin(mockProvider, 'test-var', 'test-var');
  });

  it('should set canGenerateRemote to false', () => {
    expect(AegisPlugin.canGenerateRemote).toBe(false);
  });

  it('should return inject var from getTemplate', async () => {
    const template = await plugin.getTemplate();
    expect(template).toBe('test-var');
  });

  it('should return correct assertions', () => {
    const assertions = (plugin as any).getAssertions('test prompt');
    expect(assertions).toEqual([
      {
        type: 'promptfoo:redteam:aegis',
        metric: 'Aegis',
      },
    ]);
  });

  it('uses standardized context tags for safe over-blocking assertions', () => {
    const assertions = (plugin as any).getAssertions('benign request', { isSafe: true });

    expect(assertions).toHaveLength(1);
    expect(assertions[0].type).toBe('llm-rubric');
    expect(assertions[0].value).toContain('<purpose>');
    expect(assertions[0].value).toContain('<UserQuery>');
    expect(assertions[0].value).toContain('{{prompt}}');
  });

  it('should generate tests correctly', async () => {
    const mockTestCases: TestCase[] = [
      {
        vars: {
          text: 'test text',
          text_type: 'user_message',
          labels_0: 'unsafe',
        },
      },
    ];
    vi.mocked(fetchHuggingFaceDataset).mockResolvedValue(mockTestCases);

    const tests = await plugin.generateTests(1);

    expect(tests).toEqual([
      {
        vars: {
          'test-var': 'test text',
        },
        metadata: {
          label: 'unsafe',
          isSafe: false,
          safetyLabel: 'unsafe',
        },
        assert: [
          {
            type: 'promptfoo:redteam:aegis',
            metric: 'Aegis',
          },
        ],
      },
    ]);
  });

  it('should handle empty dataset', async () => {
    vi.mocked(fetchHuggingFaceDataset).mockResolvedValue([]);
    const tests = await plugin.generateTests(1);
    expect(tests).toEqual([]);
  });
});

describe('fetchDataset', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('should fetch and filter dataset', async () => {
    const mockTestCases: TestCase[] = [
      {
        vars: {
          text: 'hello',
          text_type: 'user_message',
          labels_0: 'Guns and Illegal Weapons',
        },
      },
      { vars: { text: 'ignore me', text_type: 'llm_response' } },
    ];
    vi.mocked(fetchHuggingFaceDataset).mockResolvedValue(mockTestCases);

    const result = await fetchDataset(1);
    expect(fetchHuggingFaceDataset).toHaveBeenCalledWith(DATASET_PATH, 5);
    expect(result).toHaveLength(1);
    expect(result[0].vars?.text).toBe('hello');
    expect(result[0].vars?.labels_0).toBe('Guns and Illegal Weapons');
  });

  it('should handle errors', async () => {
    vi.mocked(fetchHuggingFaceDataset).mockRejectedValue(new Error('fail'));
    const result = await fetchDataset(2);
    expect(result).toEqual([]);
  });

  it('should fetch enough rows for a balanced safe and unsafe sample', async () => {
    vi.mocked(fetchHuggingFaceDataset).mockResolvedValue([
      { vars: { text: 'safe prompt', text_type: 'user_message', labels_0: 'safe' } },
      {
        vars: {
          text: 'unsafe prompt',
          text_type: 'user_message',
          labels_0: 'Criminal Planning/Confessions',
        },
      },
    ]);

    const result = await fetchDataset(2, true);

    expect(fetchHuggingFaceDataset).toHaveBeenCalledWith(DATASET_PATH, 5000);
    expect(result.map((record) => record.vars?.labels_0).sort()).toEqual([
      'Criminal Planning/Confessions',
      'safe',
    ]);
  });

  it('should handle invalid records', async () => {
    const mockTestCases: TestCase[] = [
      { vars: { text: 'valid', text_type: 'wrong_type' } },
      { vars: { text: 'valid', text_type: 'user_message', labels_0: 'unsafe' } },
    ];
    vi.mocked(fetchHuggingFaceDataset).mockResolvedValue(mockTestCases);

    const result = await fetchDataset(1);
    expect(result).toEqual([
      {
        vars: {
          text: 'valid',
          labels_0: 'unsafe',
        },
      },
    ]);
  });
});

describe('AegisGrader', () => {
  let grader: AegisGrader;

  beforeEach(() => {
    grader = new AegisGrader();
  });

  it('should have correct ID', () => {
    expect(grader.id).toBe('promptfoo:redteam:aegis');
  });

  it('should handle basic refusal', async () => {
    const output = "I'm sorry, I cannot help with that request";
    const result = await grader.getResult('test prompt', output, {}, undefined);
    expect(result).toEqual({
      grade: {
        pass: true,
        score: 1,
        reason: 'The output contains a standard refusal.',
      },
      rubric: grader.rubric,
    });
  });

  it('should use super class grading for non-refusal', async () => {
    const output = 'Here is a normal response';
    const mockSuperResult = {
      grade: { pass: true, score: 0.8, reason: 'test' },
      rubric: 'test rubric',
    };
    vi.spyOn(RedteamGraderBase.prototype, 'getResult').mockResolvedValue(mockSuperResult);

    const result = await grader.getResult('test prompt', output, {}, undefined);
    expect(result).toEqual(mockSuperResult);
  });

  it('should have correct rubric content', () => {
    expect(grader.rubric).toContain('You are a content safety evaluator');
    expect(grader.rubric).toContain('content safety guidelines');
    expect(grader.rubric).toContain('{ "pass": true }');
    expect(grader.rubric).toContain('{ "pass": false }');
  });
});
