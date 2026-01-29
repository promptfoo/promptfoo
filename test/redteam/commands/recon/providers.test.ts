import { afterEach, beforeEach, describe, expect, it, type Mock, vi } from 'vitest';
import {
  DEFAULT_ANTHROPIC_MODEL,
  DEFAULT_OPENAI_MODEL,
  parseReconOutput,
  selectProvider,
} from '../../../../src/redteam/commands/recon/providers';

// Mock the envars module
vi.mock('../../../../src/envars', () => ({
  getEnvString: vi.fn(),
}));

// Mock the logger to verify warning behavior
vi.mock('../../../../src/logger', () => ({
  default: {
    info: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
    error: vi.fn(),
  },
}));

import { getEnvString } from '../../../../src/envars';
import logger from '../../../../src/logger';

const mockedGetEnvString = getEnvString as Mock;

describe('selectProvider', () => {
  beforeEach(() => {
    mockedGetEnvString.mockReset();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  it('should select OpenAI when OPENAI_API_KEY is set', () => {
    mockedGetEnvString.mockImplementation((key: string) => {
      if (key === 'OPENAI_API_KEY') {
        return 'test-openai-key';
      }
      return undefined;
    });

    const result = selectProvider();

    expect(result.type).toBe('openai');
    expect(result.model).toBe(DEFAULT_OPENAI_MODEL);
  });

  it('should select OpenAI when CODEX_API_KEY is set', () => {
    mockedGetEnvString.mockImplementation((key: string) => {
      if (key === 'CODEX_API_KEY') {
        return 'test-codex-key';
      }
      return undefined;
    });

    const result = selectProvider();

    expect(result.type).toBe('openai');
    expect(result.model).toBe(DEFAULT_OPENAI_MODEL);
  });

  it('should select Anthropic when only ANTHROPIC_API_KEY is set', () => {
    mockedGetEnvString.mockImplementation((key: string) => {
      if (key === 'ANTHROPIC_API_KEY') {
        return 'test-anthropic-key';
      }
      return undefined;
    });

    const result = selectProvider();

    expect(result.type).toBe('anthropic');
    expect(result.model).toBe(DEFAULT_ANTHROPIC_MODEL);
  });

  it('should prefer OpenAI when both keys are set', () => {
    mockedGetEnvString.mockImplementation((key: string) => {
      if (key === 'OPENAI_API_KEY') {
        return 'test-openai-key';
      }
      if (key === 'ANTHROPIC_API_KEY') {
        return 'test-anthropic-key';
      }
      return undefined;
    });

    const result = selectProvider();

    expect(result.type).toBe('openai');
  });

  it('should throw when no keys are set', () => {
    mockedGetEnvString.mockReturnValue(undefined);

    expect(() => selectProvider()).toThrow('No API key found');
  });

  it('should respect forced provider override to anthropic', () => {
    mockedGetEnvString.mockImplementation((key: string) => {
      if (key === 'OPENAI_API_KEY') {
        return 'test-openai-key';
      }
      if (key === 'ANTHROPIC_API_KEY') {
        return 'test-anthropic-key';
      }
      return undefined;
    });

    const result = selectProvider('anthropic');

    expect(result.type).toBe('anthropic');
    expect(result.model).toBe(DEFAULT_ANTHROPIC_MODEL);
  });

  it('should respect forced provider override to openai', () => {
    mockedGetEnvString.mockImplementation((key: string) => {
      if (key === 'OPENAI_API_KEY') {
        return 'test-openai-key';
      }
      if (key === 'ANTHROPIC_API_KEY') {
        return 'test-anthropic-key';
      }
      return undefined;
    });

    const result = selectProvider('openai');

    expect(result.type).toBe('openai');
    expect(result.model).toBe(DEFAULT_OPENAI_MODEL);
  });

  it('should throw when forced to anthropic but no ANTHROPIC_API_KEY', () => {
    mockedGetEnvString.mockImplementation((key: string) => {
      if (key === 'OPENAI_API_KEY') {
        return 'test-openai-key';
      }
      return undefined;
    });

    expect(() => selectProvider('anthropic')).toThrow('ANTHROPIC_API_KEY required');
  });

  it('should throw when forced to openai but no key', () => {
    mockedGetEnvString.mockImplementation((key: string) => {
      if (key === 'ANTHROPIC_API_KEY') {
        return 'test-anthropic-key';
      }
      return undefined;
    });

    expect(() => selectProvider('openai')).toThrow('OPENAI_API_KEY or CODEX_API_KEY required');
  });
});

describe('parseReconOutput', () => {
  const mockedLogger = vi.mocked(logger);

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('valid inputs', () => {
    it('should parse a complete valid ReconResult object', () => {
      const input = {
        purpose: 'Customer support chatbot',
        features: 'Answer questions, process refunds',
        industry: 'E-commerce',
        systemPrompt: 'You are a helpful assistant',
        hasAccessTo: 'Order database, customer records',
        discoveredTools: [{ name: 'getOrderStatus', description: 'Check order status' }],
        suggestedPlugins: ['pii:direct', 'rbac'],
        entities: ['Acme Corp', 'John Doe'],
        stateful: true,
        keyFiles: ['src/app.ts', 'src/tools.ts'],
        securityNotes: ['Uses JWT authentication'],
      };

      const result = parseReconOutput(input);

      expect(result.purpose).toBe('Customer support chatbot');
      expect(result.features).toBe('Answer questions, process refunds');
      expect(result.industry).toBe('E-commerce');
      expect(result.systemPrompt).toBe('You are a helpful assistant');
      expect(result.discoveredTools).toHaveLength(1);
      expect(result.discoveredTools![0].name).toBe('getOrderStatus');
      expect(result.suggestedPlugins).toContain('pii:direct');
      expect(result.stateful).toBe(true);
    });

    it('should parse a minimal valid ReconResult with only purpose', () => {
      const input = { purpose: 'Simple chatbot' };

      const result = parseReconOutput(input);

      expect(result.purpose).toBe('Simple chatbot');
      expect(result.features).toBeUndefined();
    });

    it('should parse an empty object as valid (all fields optional)', () => {
      const input = {};

      const result = parseReconOutput(input);

      expect(result).toEqual({});
    });
  });

  describe('string inputs', () => {
    it('should parse valid JSON string into ReconResult', () => {
      const input = JSON.stringify({
        purpose: 'From JSON string',
        industry: 'Finance',
      });

      const result = parseReconOutput(input);

      expect(result.purpose).toBe('From JSON string');
      expect(result.industry).toBe('Finance');
    });

    it('should treat non-JSON string as purpose field', () => {
      const input = 'This is a simple description of the app';

      const result = parseReconOutput(input);

      expect(result.purpose).toBe('This is a simple description of the app');
    });

    it('should handle empty string as purpose', () => {
      const input = '';

      const result = parseReconOutput(input);

      expect(result.purpose).toBe('');
    });

    it('should handle malformed JSON string as purpose', () => {
      const input = '{ invalid json }';

      const result = parseReconOutput(input);

      expect(result.purpose).toBe('{ invalid json }');
    });

    it('should handle JSON string with trailing comma (invalid JSON)', () => {
      const input = '{"purpose": "test",}';

      const result = parseReconOutput(input);

      expect(result.purpose).toBe('{"purpose": "test",}');
    });
  });

  describe('partial/invalid schema inputs', () => {
    it('should log warning and return object with invalid field types', () => {
      const input = {
        purpose: 'Valid purpose',
        stateful: 'not-a-boolean', // Should be boolean
      };

      const result = parseReconOutput(input);

      expect(result.purpose).toBe('Valid purpose');
      expect(mockedLogger.warn).toHaveBeenCalledWith(
        'Recon output validation failed, using raw output',
        expect.objectContaining({ errors: expect.any(Object) }),
      );
    });

    it('should log warning for invalid discoveredTools structure', () => {
      const input = {
        purpose: 'Test app',
        discoveredTools: ['string-instead-of-object'],
      };

      const result = parseReconOutput(input);

      expect(result.purpose).toBe('Test app');
      expect(mockedLogger.warn).toHaveBeenCalled();
    });

    it('should handle extra fields not in schema (passthrough)', () => {
      const input = {
        purpose: 'Test app',
        customField: 'should be preserved',
      };

      const result = parseReconOutput(input);

      expect(result.purpose).toBe('Test app');
      // Extra fields should be preserved after falling back to raw object
    });
  });

  describe('edge cases', () => {
    it('should throw error for null input', () => {
      expect(() => parseReconOutput(null)).toThrow('Invalid recon output: expected JSON object');
    });

    it('should throw error for undefined input', () => {
      expect(() => parseReconOutput(undefined)).toThrow(
        'Invalid recon output: expected JSON object',
      );
    });

    it('should throw error for number input', () => {
      expect(() => parseReconOutput(42)).toThrow('Invalid recon output: expected JSON object');
    });

    it('should throw error for boolean input', () => {
      expect(() => parseReconOutput(true)).toThrow('Invalid recon output: expected JSON object');
    });

    it('should throw error for array input', () => {
      expect(() => parseReconOutput(['not', 'an', 'object'])).toThrow(
        'Invalid recon output: expected JSON object',
      );
    });

    it('should handle deeply nested discoveredTools', () => {
      const input = {
        purpose: 'Complex app',
        discoveredTools: [
          {
            name: 'tool1',
            description: 'First tool',
            file: 'src/tools/tool1.ts',
            parameters: '{ "query": "string" }',
          },
          {
            name: 'tool2',
            description: 'Second tool',
          },
        ],
      };

      const result = parseReconOutput(input);

      expect(result.discoveredTools).toHaveLength(2);
      expect(result.discoveredTools![0].file).toBe('src/tools/tool1.ts');
      expect(result.discoveredTools![1].file).toBeUndefined();
    });

    it('should handle very long purpose strings', () => {
      const longPurpose = 'A'.repeat(10000);
      const input = { purpose: longPurpose };

      const result = parseReconOutput(input);

      expect(result.purpose).toBe(longPurpose);
    });

    it('should handle unicode in fields', () => {
      const input = {
        purpose: '日本語のアプリケーション 🚀',
        entities: ['企業名', '製品 ®'],
      };

      const result = parseReconOutput(input);

      expect(result.purpose).toBe('日本語のアプリケーション 🚀');
      expect(result.entities).toContain('企業名');
    });

    it('should handle special characters in system prompt', () => {
      const input = {
        systemPrompt: 'You are {{role}}. Use <xml> tags. $VAR works.',
      };

      const result = parseReconOutput(input);

      expect(result.systemPrompt).toBe('You are {{role}}. Use <xml> tags. $VAR works.');
    });
  });

  describe('JSON string edge cases', () => {
    it('should handle JSON string with nested objects', () => {
      const input = JSON.stringify({
        purpose: 'Nested test',
        discoveredTools: [{ name: 'api', description: 'API call' }],
      });

      const result = parseReconOutput(input);

      expect(result.discoveredTools).toHaveLength(1);
    });

    it('should handle whitespace-only string as purpose', () => {
      const input = '   \n\t  ';

      const result = parseReconOutput(input);

      expect(result.purpose).toBe('   \n\t  ');
    });

    it('should handle JSON null string by returning purpose', () => {
      const input = 'null';

      // JSON.parse('null') returns null, then falls through to throw
      expect(() => parseReconOutput(input)).toThrow('Invalid recon output: expected JSON object');
    });

    it('should handle JSON array string by throwing', () => {
      const input = '["a", "b"]';

      expect(() => parseReconOutput(input)).toThrow('Invalid recon output: expected JSON object');
    });
  });
});
