import { vi, type Mock } from 'vitest';
import { selectProvider } from '../../../../src/redteam/commands/recon/providers';

// Mock the envars module
vi.mock('../../../../src/envars', () => ({
  getEnvString: vi.fn(),
}));

import { getEnvString } from '../../../../src/envars';
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
    expect(result.model).toBe('gpt-5.1-codex');
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
    expect(result.model).toBe('gpt-5.1-codex');
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
    expect(result.model).toBe('opus');
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
    expect(result.model).toBe('opus');
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
    expect(result.model).toBe('gpt-5.1-codex');
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
