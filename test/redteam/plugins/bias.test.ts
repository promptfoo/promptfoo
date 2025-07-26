import { BIAS_PLUGINS } from '../../../src/redteam/constants';
import { Plugins } from '../../../src/redteam/plugins';
import { BiasGrader } from '../../../src/redteam/plugins/bias';
import { neverGenerateRemote } from '../../../src/redteam/remoteGeneration';

import type { ApiProvider, PluginActionParams } from '../../../src/types';

jest.mock('../../../src/redteam/remoteGeneration');

describe('Bias Plugin', () => {
  let mockProvider: ApiProvider;
  let mockPluginParams: PluginActionParams;

  beforeEach(() => {
    mockProvider = {
      callApi: jest.fn(),
      id: jest.fn().mockReturnValue('test-provider'),
    };

    mockPluginParams = {
      provider: mockProvider,
      purpose: 'test purpose',
      injectVar: 'testVar',
      n: 3,
      config: {},
      delayMs: 0,
    };

    jest.mocked(neverGenerateRemote).mockReturnValue(false);
  });

  describe('remote-only behavior', () => {
    it('should throw error when remote generation is disabled for age bias', async () => {
      jest.mocked(neverGenerateRemote).mockReturnValue(true);

      const agebiasPlugin = Plugins.find((p) => p.key === 'bias:age');
      expect(agebiasPlugin).toBeDefined();

      await expect(agebiasPlugin!.action(mockPluginParams)).rejects.toThrow(
        'bias:age plugin requires remote generation to be enabled',
      );
    });

    it('should throw error when remote generation is disabled for disability bias', async () => {
      jest.mocked(neverGenerateRemote).mockReturnValue(true);

      const disabilityBiasPlugin = Plugins.find((p) => p.key === 'bias:disability');
      expect(disabilityBiasPlugin).toBeDefined();

      await expect(disabilityBiasPlugin!.action(mockPluginParams)).rejects.toThrow(
        'bias:disability plugin requires remote generation to be enabled',
      );
    });

    it('should throw error when remote generation is disabled for gender bias', async () => {
      jest.mocked(neverGenerateRemote).mockReturnValue(true);

      const genderBiasPlugin = Plugins.find((p) => p.key === 'bias:gender');
      expect(genderBiasPlugin).toBeDefined();

      await expect(genderBiasPlugin!.action(mockPluginParams)).rejects.toThrow(
        'bias:gender plugin requires remote generation to be enabled',
      );
    });

    it('should throw error when remote generation is disabled for race bias', async () => {
      jest.mocked(neverGenerateRemote).mockReturnValue(true);

      const raceBiasPlugin = Plugins.find((p) => p.key === 'bias:race');
      expect(raceBiasPlugin).toBeDefined();

      await expect(raceBiasPlugin!.action(mockPluginParams)).rejects.toThrow(
        'bias:race plugin requires remote generation to be enabled',
      );
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
