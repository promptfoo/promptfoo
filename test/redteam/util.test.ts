import { fetchWithCache } from '../../src/cache';
import { Severity } from '../../src/redteam/constants/metadata';
import {
  calcPromptfooRisk,
  extractGoalFromPrompt,
  getShortPluginId,
  isBasicRefusal,
  isEmptyResponse,
  normalizeApostrophes,
  removePrefix,
} from '../../src/redteam/util';

jest.mock('../../src/cache');

describe('calcPromptfooRisk', () => {
  describe('basic calculations', () => {
    it('should return 0 when successes is 0', () => {
      expect(calcPromptfooRisk(Severity.Low, 0, 10)).toBe(0);
      expect(calcPromptfooRisk(Severity.Medium, 0, 5)).toBe(0);
      expect(calcPromptfooRisk(Severity.High, 0, 100)).toBe(0);
      expect(calcPromptfooRisk(Severity.Critical, 0, 1)).toBe(0);
    });

    it('should calculate risk for Low severity', () => {
      expect(calcPromptfooRisk(Severity.Low, 1, 10)).toBe(2.0);
      expect(calcPromptfooRisk(Severity.Low, 5, 10)).toBe(2.5);
      expect(calcPromptfooRisk(Severity.Low, 10, 10)).toBe(4.0);
    });

    it('should calculate risk for Medium severity', () => {
      expect(calcPromptfooRisk(Severity.Medium, 1, 10)).toBe(4.1);
      expect(calcPromptfooRisk(Severity.Medium, 5, 10)).toBe(5.1);
      expect(calcPromptfooRisk(Severity.Medium, 10, 10)).toBe(7.0);
    });

    it('should calculate risk for High severity', () => {
      expect(calcPromptfooRisk(Severity.High, 1, 10)).toBe(7.3);
      expect(calcPromptfooRisk(Severity.High, 5, 10)).toBe(8.5);
      expect(calcPromptfooRisk(Severity.High, 10, 10)).toBe(10.0);
    });

    it('should calculate risk for Critical severity', () => {
      expect(calcPromptfooRisk(Severity.Critical, 1, 10)).toBe(9.1);
      expect(calcPromptfooRisk(Severity.Critical, 5, 10)).toBe(9.5);
      expect(calcPromptfooRisk(Severity.Critical, 10, 10)).toBe(10.0);
    });
  });

  describe('edge cases', () => {
    it('should handle 100% success rate', () => {
      expect(calcPromptfooRisk(Severity.Low, 10, 10)).toBe(4.0);
      expect(calcPromptfooRisk(Severity.Medium, 10, 10)).toBe(7.0);
      expect(calcPromptfooRisk(Severity.High, 10, 10)).toBe(10.0);
      expect(calcPromptfooRisk(Severity.Critical, 10, 10)).toBe(10.0);
    });

    it('should handle small sample sizes with Laplace smoothing', () => {
      // When attempts < 10, (successes + 1) / (attempts + 2) is used
      expect(calcPromptfooRisk(Severity.Low, 1, 1)).toBe(2.9);
      expect(calcPromptfooRisk(Severity.Low, 1, 2)).toBe(2.5);
      expect(calcPromptfooRisk(Severity.Low, 2, 3)).toBe(2.7);
    });

    it('should not use Laplace smoothing for larger sample sizes', () => {
      // When attempts >= 10, raw ASR is used
      expect(calcPromptfooRisk(Severity.Low, 5, 10)).toBe(2.5);
      expect(calcPromptfooRisk(Severity.Medium, 10, 20)).toBe(5.1);
    });
  });

  describe('complexity level', () => {
    it('should apply complexity factor correctly', () => {
      // Default complexity level is 5 (factor = 1.0)
      expect(calcPromptfooRisk(Severity.Low, 5, 10, 5)).toBe(2.5);
      
      // Complexity level 10 (factor = 1.1)
      expect(calcPromptfooRisk(Severity.Low, 5, 10, 10)).toBe(2.8);
      
      // Complexity level 0 (factor = 0.9)
      expect(calcPromptfooRisk(Severity.Low, 5, 10, 0)).toBe(2.3);
    });

    it('should not exceed max risk score even with high complexity', () => {
      expect(calcPromptfooRisk(Severity.Low, 10, 10, 10)).toBe(4.0);
      expect(calcPromptfooRisk(Severity.Medium, 10, 10, 10)).toBe(7.0);
      expect(calcPromptfooRisk(Severity.High, 10, 10, 10)).toBe(10.0);
      expect(calcPromptfooRisk(Severity.Critical, 10, 10, 10)).toBe(10.0);
    });
  });

  describe('gamma severity scaling', () => {
    it('should apply different gamma values based on severity', () => {
      // Low severity has gamma 2.0 (quadratic)
      const lowRisk = calcPromptfooRisk(Severity.Low, 5, 10);
      expect(lowRisk).toBe(2.5);
      
      // Medium severity has gamma 1.5
      const mediumRisk = calcPromptfooRisk(Severity.Medium, 5, 10);
      expect(mediumRisk).toBe(5.1);
      
      // High severity has gamma 1.0 (linear)
      const highRisk = calcPromptfooRisk(Severity.High, 5, 10);
      expect(highRisk).toBe(8.5);
      
      // Critical severity has gamma 1.0 (linear)
      const criticalRisk = calcPromptfooRisk(Severity.Critical, 5, 10);
      expect(criticalRisk).toBe(9.5);
    });
  });

  describe('error handling', () => {
    it('should throw error for negative successes', () => {
      expect(() => calcPromptfooRisk(Severity.Low, -1, 10)).toThrow(
        'Invalid input: successes and attempts must be non-negative, and successes cannot exceed attempts'
      );
    });

    it('should throw error for negative attempts', () => {
      expect(() => calcPromptfooRisk(Severity.Low, 5, -10)).toThrow(
        'Invalid input: successes and attempts must be non-negative, and successes cannot exceed attempts'
      );
    });

    it('should throw error when successes exceed attempts', () => {
      expect(() => calcPromptfooRisk(Severity.Low, 11, 10)).toThrow(
        'Invalid input: successes and attempts must be non-negative, and successes cannot exceed attempts'
      );
    });
  });

  describe('decimal precision', () => {
    it('should return values with one decimal place', () => {
      const result = calcPromptfooRisk(Severity.Low, 3, 7);
      expect(result.toString()).toMatch(/^\d+\.\d$/);
    });

    it('should round correctly', () => {
      // Test cases that might produce values needing rounding
      const result1 = calcPromptfooRisk(Severity.Low, 7, 13);
      expect(typeof result1).toBe('number');
      expect(result1.toString().split('.')[1]?.length ?? 0).toBeLessThanOrEqual(1);
      
      const result2 = calcPromptfooRisk(Severity.High, 3, 17);
      expect(typeof result2).toBe('number');
      expect(result2.toString().split('.')[1]?.length ?? 0).toBeLessThanOrEqual(1);
    });
  });

  describe('boundary conditions', () => {
    it('should handle zero attempts with zero successes', () => {
      expect(calcPromptfooRisk(Severity.Low, 0, 0)).toBe(0);
    });

    it('should handle very large numbers', () => {
      expect(calcPromptfooRisk(Severity.Medium, 1000, 1000)).toBe(7.0);
      expect(calcPromptfooRisk(Severity.High, 500, 1000)).toBe(8.5);
    });

    it('should handle fractional ASR values correctly', () => {
      expect(calcPromptfooRisk(Severity.Low, 1, 3)).toBe(2.3);
      expect(calcPromptfooRisk(Severity.Medium, 2, 7)).toBe(4.6);
      expect(calcPromptfooRisk(Severity.High, 3, 11)).toBe(7.8);
    });
  });
});

describe('removePrefix', () => {
  it('should remove a simple prefix', () => {
    expect(removePrefix('Prompt: Hello world', 'Prompt')).toBe('Hello world');
  });

  it('should be case insensitive', () => {
    expect(removePrefix('PROMPT: Hello world', 'prompt')).toBe('Hello world');
  });

  it('should remove asterisks from the prefix', () => {
    expect(removePrefix('**Prompt:** Hello world', 'Prompt')).toBe('Hello world');
  });

  it('should handle multiple asterisks', () => {
    expect(removePrefix('***Prompt:*** Hello world', 'Prompt')).toBe('Hello world');
  });

  it('should return the same string if prefix is not found', () => {
    expect(removePrefix('Hello world', 'Prefix')).toBe('Hello world');
  });

  it('should handle empty strings', () => {
    expect(removePrefix('', 'Prefix')).toBe('');
  });

  it('should handle prefix that is the entire string', () => {
    expect(removePrefix('Prompt:', 'Prompt')).toBe('');
  });
});

describe('normalizeApostrophes', () => {
  it('should normalize different types of apostrophes', () => {
    expect(normalizeApostrophes("I'm")).toBe("I'm");
    expect(normalizeApostrophes('I′m')).toBe("I'm");
    expect(normalizeApostrophes("I'm")).toBe("I'm");
    expect(normalizeApostrophes("I'm")).toBe("I'm");
  });

  it('should handle strings without apostrophes', () => {
    expect(normalizeApostrophes('Hello world')).toBe('Hello world');
  });
});

describe('isEmptyResponse', () => {
  it('should return true for empty responses', () => {
    expect(isEmptyResponse('')).toBe(true);
    expect(isEmptyResponse('   ')).toBe(true);
    expect(isEmptyResponse('{}')).toBe(true);
    expect(isEmptyResponse('  {}  ')).toBe(true);
    expect(isEmptyResponse('undefined')).toBe(true);
    expect(isEmptyResponse('  undefined  ')).toBe(true);
    expect(isEmptyResponse('UNDEFINED')).toBe(true);
    expect(isEmptyResponse('null')).toBe(true);
    expect(isEmptyResponse('  NULL  ')).toBe(true);
  });

  it('should return false for non-empty responses', () => {
    expect(isEmptyResponse('Hello')).toBe(false);
    expect(isEmptyResponse('{"key": "value"}')).toBe(false);
    expect(isEmptyResponse('undefined behavior')).toBe(false);
    expect(isEmptyResponse('null pointer')).toBe(false);
  });
});

describe('isBasicRefusal', () => {
  it('should detect refusal prefixes', () => {
    expect(isBasicRefusal('I am sorry, I cannot help with that')).toBe(true);
    expect(isBasicRefusal("I'm not able to assist with this request")).toBe(true);
    expect(isBasicRefusal('I apologize, but I cannot do that')).toBe(true);
  });

  it('should detect refusal substrings', () => {
    expect(isBasicRefusal('As an AI language model, I cannot help with that')).toBe(true);
    expect(isBasicRefusal('I cannot assist with that request')).toBe(true);
    expect(isBasicRefusal('That would not be appropriate')).toBe(true);
  });

  it('should normalize apostrophes in responses', () => {
    expect(isBasicRefusal("I′m sorry, I can't help")).toBe(true);
    expect(isBasicRefusal("I'm unable to assist")).toBe(true);
  });

  it('should handle case insensitivity', () => {
    expect(isBasicRefusal('I AM SORRY, I CANNOT HELP')).toBe(true);
    expect(isBasicRefusal('as an ai language model')).toBe(true);
  });

  it('should return false for non-refusal responses', () => {
    expect(isBasicRefusal('I will help you with that')).toBe(false);
    expect(isBasicRefusal('Here is the information you requested')).toBe(false);
    expect(isBasicRefusal('The answer is 42')).toBe(false);
  });
});

describe('getShortPluginId', () => {
  it('should remove promptfoo:redteam: prefix', () => {
    expect(getShortPluginId('promptfoo:redteam:test')).toBe('test');
  });

  it('should return original if no prefix', () => {
    expect(getShortPluginId('test')).toBe('test');
  });
});

describe('extractGoalFromPrompt', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  it('should successfully extract goal', async () => {
    jest.mocked(fetchWithCache).mockResolvedValue({
      cached: false,
      status: 200,
      statusText: 'OK',
      headers: {},
      data: { intent: 'test goal' },
      deleteFromCache: async () => {},
    });

    const result = await extractGoalFromPrompt('test prompt', 'test purpose');
    expect(result).toBe('test goal');
  });

  it('should return null on HTTP error', async () => {
    jest.mocked(fetchWithCache).mockResolvedValue({
      cached: false,
      status: 500,
      statusText: 'Internal Server Error',
      headers: {},
      data: {},
      deleteFromCache: async () => {},
    });

    const result = await extractGoalFromPrompt('test prompt', 'test purpose');
    expect(result).toBeNull();
  });

  it('should return null when no intent returned', async () => {
    jest.mocked(fetchWithCache).mockResolvedValue({
      cached: false,
      status: 200,
      statusText: 'OK',
      headers: {},
      data: {},
      deleteFromCache: async () => {},
    });

    const result = await extractGoalFromPrompt('test prompt', 'test purpose');
    expect(result).toBeNull();
  });

  it('should return null when API throws error', async () => {
    jest.mocked(fetchWithCache).mockRejectedValue(new Error('API error'));

    const result = await extractGoalFromPrompt('test prompt', 'test purpose');
    expect(result).toBeNull();
  });

  it('should handle empty prompt and purpose', async () => {
    jest.mocked(fetchWithCache).mockResolvedValue({
      cached: false,
      status: 200,
      statusText: 'OK',
      headers: {},
      data: { intent: 'empty goal' },
      deleteFromCache: async () => {},
    });

    const result = await extractGoalFromPrompt('', '');
    expect(result).toBe('empty goal');
  });

  it('should include plugin context when pluginId is provided', async () => {
    jest.mocked(fetchWithCache).mockResolvedValue({
      cached: false,
      status: 200,
      statusText: 'OK',
      headers: {},
      data: { intent: 'plugin-specific goal' },
      deleteFromCache: async () => {},
    });

    const result = await extractGoalFromPrompt(
      'innocent prompt',
      'test purpose',
      'indirect-prompt-injection',
    );
    expect(result).toBe('plugin-specific goal');

    // Verify that the API was called with plugin context
    expect(fetchWithCache).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        body: expect.stringContaining('pluginContext'),
      }),
      expect.any(Number),
    );
  });

  it('should skip remote call when remote generation is disabled', async () => {
    // Preserve original environment setting
    const originalValue = process.env.PROMPTFOO_DISABLE_REDTEAM_REMOTE_GENERATION;
    process.env.PROMPTFOO_DISABLE_REDTEAM_REMOTE_GENERATION = 'true';

    const result = await extractGoalFromPrompt('test prompt', 'test purpose');

    expect(result).toBeNull();
    expect(fetchWithCache).not.toHaveBeenCalled();

    // Cleanup: restore or delete the env var to avoid leaking into other tests
    if (originalValue === undefined) {
      delete process.env.PROMPTFOO_DISABLE_REDTEAM_REMOTE_GENERATION;
    } else {
      process.env.PROMPTFOO_DISABLE_REDTEAM_REMOTE_GENERATION = originalValue;
    }
  });

  it('should skip goal extraction for dataset plugins with short plugin ID', async () => {
    const result = await extractGoalFromPrompt('test prompt', 'test purpose', 'beavertails');

    expect(result).toBeNull();
    expect(fetchWithCache).not.toHaveBeenCalled();
  });

  it('should skip goal extraction for dataset plugins with full plugin ID', async () => {
    const result = await extractGoalFromPrompt(
      'test prompt',
      'test purpose',
      'promptfoo:redteam:cyberseceval',
    );

    expect(result).toBeNull();
    expect(fetchWithCache).not.toHaveBeenCalled();
  });

  it('should skip goal extraction for all dataset plugins', async () => {
    const datasetPlugins = [
      'beavertails',
      'cyberseceval',
      'donotanswer',
      'harmbench',
      'toxic-chat',
      'aegis',
      'pliny',
      'unsafebench',
      'xstest',
    ];

    for (const pluginId of datasetPlugins) {
      const result = await extractGoalFromPrompt('test prompt', 'test purpose', pluginId);
      expect(result).toBeNull();

      // Also test with full plugin ID format
      const fullPluginId = `promptfoo:redteam:${pluginId}`;
      const resultFull = await extractGoalFromPrompt('test prompt', 'test purpose', fullPluginId);
      expect(resultFull).toBeNull();
    }

    expect(fetchWithCache).not.toHaveBeenCalled();
  });

  it('should proceed with API call for non-dataset plugins', async () => {
    jest.mocked(fetchWithCache).mockResolvedValue({
      cached: false,
      status: 200,
      statusText: 'OK',
      headers: {},
      data: { intent: 'extracted goal' },
      deleteFromCache: async () => {},
    });

    // Test with a non-dataset plugin
    const result = await extractGoalFromPrompt('test prompt', 'test purpose', 'prompt-extraction');

    expect(result).toBe('extracted goal');
    expect(fetchWithCache).toHaveBeenCalledTimes(1);
  });

  it('should proceed with API call for non-dataset plugins with full plugin ID', async () => {
    jest.mocked(fetchWithCache).mockResolvedValue({
      cached: false,
      status: 200,
      statusText: 'OK',
      headers: {},
      data: { intent: 'extracted goal' },
      deleteFromCache: async () => {},
    });

    // Test with a full non-dataset plugin ID
    const result = await extractGoalFromPrompt(
      'test prompt',
      'test purpose',
      'promptfoo:redteam:sql-injection',
    );

    expect(result).toBe('extracted goal');
    expect(fetchWithCache).toHaveBeenCalledTimes(1);
  });
});
