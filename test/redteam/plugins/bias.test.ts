import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BIAS_PLUGINS } from '../../../src/redteam/constants';
import { BiasGrader } from '../../../src/redteam/plugins/bias';
import { Plugins } from '../../../src/redteam/plugins/index';
import { neverGenerateRemote } from '../../../src/redteam/remoteGeneration';

import type { ApiProvider, CallApiFunction, PluginActionParams } from '../../../src/types/index';

vi.mock('../../../src/redteam/remoteGeneration');

describe('Bias Plugin', () => {
  let mockProvider: ApiProvider;
  let mockPluginParams: PluginActionParams;

  beforeEach(() => {
    mockProvider = {
      callApi: vi.fn() as CallApiFunction,
      id: vi.fn().mockReturnValue('test-provider'),
    };

    mockPluginParams = {
      provider: mockProvider,
      purpose: 'test purpose',
      injectVar: 'testVar',
      n: 3,
      config: {},
      delayMs: 0,
    };

    vi.mocked(neverGenerateRemote).mockImplementation(function () {
      return false;
    });
  });

  describe('remote-only behavior', () => {
    it('should return empty array when remote generation is disabled for age bias', async () => {
      vi.mocked(neverGenerateRemote).mockImplementation(function () {
        return true;
      });

      const agebiasPlugin = Plugins.find((p) => p.key === 'bias:age');
      expect(agebiasPlugin).toBeDefined();

      const result = await agebiasPlugin!.action(mockPluginParams);
      expect(result).toEqual([]);
    });

    it('should return empty array when remote generation is disabled for disability bias', async () => {
      vi.mocked(neverGenerateRemote).mockImplementation(function () {
        return true;
      });

      const disabilityBiasPlugin = Plugins.find((p) => p.key === 'bias:disability');
      expect(disabilityBiasPlugin).toBeDefined();

      const result = await disabilityBiasPlugin!.action(mockPluginParams);
      expect(result).toEqual([]);
    });

    it('should return empty array when remote generation is disabled for gender bias', async () => {
      vi.mocked(neverGenerateRemote).mockImplementation(function () {
        return true;
      });

      const genderBiasPlugin = Plugins.find((p) => p.key === 'bias:gender');
      expect(genderBiasPlugin).toBeDefined();

      const result = await genderBiasPlugin!.action(mockPluginParams);
      expect(result).toEqual([]);
    });

    it('should return empty array when remote generation is disabled for race bias', async () => {
      vi.mocked(neverGenerateRemote).mockImplementation(function () {
        return true;
      });

      const raceBiasPlugin = Plugins.find((p) => p.key === 'bias:race');
      expect(raceBiasPlugin).toBeDefined();

      const result = await raceBiasPlugin!.action(mockPluginParams);
      expect(result).toEqual([]);
    });
  });

  describe('BiasGrader', () => {
    let grader: BiasGrader;

    beforeEach(() => {
      grader = new BiasGrader();
    });

    it('should have correct plugin ID', () => {
      expect(grader.id).toBe('promptfoo:redteam:bias');
    });

    it('should have bias-specific rubric content', () => {
      expect(grader.rubric).toContain('bias');
      expect(grader.rubric).toContain('stereotyping');
      expect(grader.rubric).toContain('discrimination');
      expect(grader.rubric).toContain('protected characteristics');
    });

    it('should include evaluation criteria in rubric', () => {
      expect(grader.rubric).toContain('FAIL');
      expect(grader.rubric).toContain('PASS');
      expect(grader.rubric).toContain('Stereotyping');
      expect(grader.rubric).toContain('Discriminatory Language');
      expect(grader.rubric).toContain('Unfair Treatment');
    });

    it('should include guidance for avoiding false positives', () => {
      expect(grader.rubric).toContain('false positives');
      expect(grader.rubric).toContain('accessibility');
      expect(grader.rubric).toContain('accommodations');
    });
  });

  describe('Plugin Constants', () => {
    it('should include all expected bias plugin types', () => {
      expect(BIAS_PLUGINS).toContain('bias:age');
      expect(BIAS_PLUGINS).toContain('bias:disability');
      expect(BIAS_PLUGINS).toContain('bias:gender');
      expect(BIAS_PLUGINS).toContain('bias:race');
      expect(BIAS_PLUGINS).toHaveLength(4);
    });
  });
});
