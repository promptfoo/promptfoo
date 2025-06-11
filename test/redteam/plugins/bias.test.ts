import { BIAS_PLUGINS } from '../../../src/redteam/constants';
import { Plugins } from '../../../src/redteam/plugins';
import { BiasGrader, getBiasTestsForCategory } from '../../../src/redteam/plugins/bias';
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
  });

  describe('getBiasTestsForCategory (local generation function)', () => {
    it('should generate test cases for age bias', async () => {
      const mockResponse = {
        output:
          'Prompt: Test age bias prompt 1\nPrompt: Test age bias prompt 2\nPrompt: Test age bias prompt 3',
      };
      jest.mocked(mockProvider.callApi).mockResolvedValue(mockResponse);

      const result = await getBiasTestsForCategory(mockPluginParams, 'bias:age');

      expect(result).toHaveLength(3);
      expect(result[0]?.vars?.testVar).toBe('Test age bias prompt 1');
      expect(result[0]?.assert?.[0]?.type).toBe('promptfoo:redteam:bias');
      expect(result[0]?.assert?.[0]?.metric).toBe('Bias');
    });

    it('should generate test cases for disability bias', async () => {
      const mockResponse = {
        output: 'Prompt: Test disability bias prompt\nPrompt: Another disability prompt',
      };
      jest.mocked(mockProvider.callApi).mockResolvedValue(mockResponse);

      const result = await getBiasTestsForCategory(mockPluginParams, 'bias:disability');

      expect(result).toHaveLength(2);
      expect(result[0]?.vars?.testVar).toBe('Test disability bias prompt');
      expect(result[1]?.vars?.testVar).toBe('Another disability prompt');
    });

    it('should generate test cases for gender bias', async () => {
      const mockResponse = {
        output: 'Prompt: Test gender bias prompt',
      };
      jest.mocked(mockProvider.callApi).mockResolvedValue(mockResponse);

      const result = await getBiasTestsForCategory(mockPluginParams, 'bias:gender');

      expect(result).toHaveLength(1);
      expect(result[0]?.vars?.testVar).toBe('Test gender bias prompt');
    });

    it('should handle custom examples in config', async () => {
      const customExamples = ['Custom example 1', 'Custom example 2'];
      const paramsWithCustomExamples = {
        ...mockPluginParams,
        config: { examples: customExamples },
      };

      const mockResponse = {
        output: 'Prompt: Custom generated prompt',
      };
      jest.mocked(mockProvider.callApi).mockResolvedValue(mockResponse);

      await getBiasTestsForCategory(paramsWithCustomExamples, 'bias:age');

      expect(mockProvider.callApi).toHaveBeenCalledWith(
        expect.stringContaining('Custom example 1'),
      );
    });

    it('should throw error for unknown category', async () => {
      await expect(getBiasTestsForCategory(mockPluginParams, 'bias:unknown')).rejects.toThrow(
        'Bias category bias:unknown not found',
      );
    });

    it('should handle non-string API response', async () => {
      const mockResponse = {
        output: { invalid: 'response' },
      };
      jest.mocked(mockProvider.callApi).mockResolvedValue(mockResponse);

      const result = await getBiasTestsForCategory(mockPluginParams, 'bias:age');

      expect(result).toHaveLength(0);
    });

    it('should filter and parse prompts correctly', async () => {
      const mockResponse = {
        output:
          'Some text\nPrompt: Valid prompt 1\nNot a prompt\nPrompt: Valid prompt 2\nMore text',
      };
      jest.mocked(mockProvider.callApi).mockResolvedValue(mockResponse);

      const result = await getBiasTestsForCategory(mockPluginParams, 'bias:age');

      expect(result).toHaveLength(2);
      expect(result[0]?.vars?.testVar).toBe('Valid prompt 1');
      expect(result[1]?.vars?.testVar).toBe('Valid prompt 2');
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
      expect(BIAS_PLUGINS).toHaveLength(3);
    });
  });
});
