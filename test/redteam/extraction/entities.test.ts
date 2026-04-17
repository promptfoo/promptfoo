import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchWithCache } from '../../../src/cache';
import { VERSION } from '../../../src/constants';
import logger from '../../../src/logger';
import { extractEntities } from '../../../src/redteam/extraction/entities';
import { getRemoteGenerationUrl } from '../../../src/redteam/remoteGeneration';

import type { ApiProvider } from '../../../src/types/index';

vi.mock('../../../src/cache', async (importOriginal) => {
  return {
    ...(await importOriginal()),
    fetchWithCache: vi.fn(),
  };
});

vi.mock('../../../src/logger', () => ({
  default: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
  getLogLevel: vi.fn().mockReturnValue('info'),
}));

vi.mock('../../../src/envars', async () => {
  const originalModule =
    await vi.importActual<typeof import('../../../src/envars')>('../../../src/envars');
  return {
    ...originalModule,
    getEnvBool: vi.fn(originalModule.getEnvBool),
  };
});

vi.mock('../../../src/redteam/remoteGeneration', async () => ({
  ...(await vi.importActual('../../../src/redteam/remoteGeneration')),
  getRemoteGenerationUrl: vi.fn().mockReturnValue('https://api.promptfoo.app/api/v1/task'),
}));

describe('Entities Extractor', () => {
  let provider: ApiProvider;
  let originalEnv: NodeJS.ProcessEnv;

  beforeAll(() => {
    originalEnv = process.env;
  });

  beforeEach(() => {
    process.env = { ...originalEnv };
    delete process.env.PROMPTFOO_REMOTE_GENERATION_URL;
    provider = {
      callApi: vi.fn().mockResolvedValue({ output: 'Entity: Apple\nEntity: Google' }),
      id: vi.fn().mockReturnValue('test-provider'),
    };
    vi.clearAllMocks();
    vi.mocked(getRemoteGenerationUrl).mockImplementation(function () {
      return 'https://api.promptfoo.app/api/v1/task';
    });
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('should use remote generation when enabled', async () => {
    process.env.OPENAI_API_KEY = undefined;
    process.env.PROMPTFOO_DISABLE_REDTEAM_REMOTE_GENERATION = 'false';
    vi.mocked(fetchWithCache).mockResolvedValue({
      data: { task: 'entities', result: ['Apple', 'Google'] },
      status: 200,
      statusText: 'OK',
      cached: false,
    });

    const result = await extractEntities(provider, ['prompt1', 'prompt2']);

    expect(result).toEqual(['Apple', 'Google']);
    expect(fetchWithCache).toHaveBeenCalledWith(
      'https://api.promptfoo.app/api/v1/task',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          task: 'entities',
          prompts: ['prompt1', 'prompt2'],
          version: VERSION,
          email: null,
        }),
      }),
      expect.any(Number),
      'json',
    );
  });

  it('should not fall back to local extraction when remote generation fails', async () => {
    process.env.OPENAI_API_KEY = undefined;
    process.env.PROMPTFOO_DISABLE_REDTEAM_REMOTE_GENERATION = 'false';
    vi.mocked(fetchWithCache).mockRejectedValue(new Error('Remote generation failed'));

    const result = await extractEntities(provider, ['prompt1', 'prompt2']);

    expect(result).toEqual([]);
    expect(provider.callApi).not.toHaveBeenCalled();
    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('Error using remote generation'),
    );
  });

  it('should use local extraction when remote generation is disabled', async () => {
    process.env.PROMPTFOO_DISABLE_REDTEAM_REMOTE_GENERATION = 'true';

    const result = await extractEntities(provider, ['prompt']);

    expect(result).toEqual(['Apple', 'Google']);
    expect(provider.callApi).toHaveBeenCalledWith(expect.stringContaining('prompt'));
    expect(fetchWithCache).not.toHaveBeenCalled();
  });

  it('should log debug message when no entities are found', async () => {
    process.env.PROMPTFOO_DISABLE_REDTEAM_REMOTE_GENERATION = 'true';
    vi.mocked(provider.callApi).mockResolvedValue({ output: 'No entities found' });

    const result = await extractEntities(provider, ['prompt']);

    expect(result).toEqual([]);
  });

  it('should ignore Nunjucks template variables in double curly braces', async () => {
    process.env.PROMPTFOO_DISABLE_REDTEAM_REMOTE_GENERATION = 'true';
    vi.mocked(provider.callApi).mockResolvedValue({
      output: 'Entity: John Smith\nEntity: {{image}}\nEntity: Google\nEntity: {{prompt}}',
    });

    const result = await extractEntities(provider, [
      'Analyze this image {{image}} for John Smith from Google using {{prompt}}',
    ]);

    // After our implementation fix, template variables should be filtered out
    expect(result).toEqual(['John Smith', 'Google']);
  });

  it('should properly extract real entities while ignoring template variables', async () => {
    process.env.PROMPTFOO_DISABLE_REDTEAM_REMOTE_GENERATION = 'true';

    // Currently our extraction simply returns whatever the AI returns as entities
    // We need to fix this to properly filter template variables

    vi.mocked(provider.callApi).mockResolvedValue({
      output: 'Entity: Microsoft\nEntity: Bill Gates\nEntity: Seattle',
    });

    const result = await extractEntities(provider, [
      'Provide information about Microsoft, founded by Bill Gates in Seattle',
      'Use {{image}} to analyze the logo of {{company}}',
    ]);

    expect(result).toEqual(['Microsoft', 'Bill Gates', 'Seattle']);
    expect(provider.callApi).toHaveBeenCalledWith(expect.stringContaining('Microsoft'));
  });

  it('should handle complex Nunjucks variables with spaces and special characters', async () => {
    process.env.PROMPTFOO_DISABLE_REDTEAM_REMOTE_GENERATION = 'true';
    vi.mocked(provider.callApi).mockResolvedValue({
      output:
        'Entity: Microsoft\nEntity: {{ complex_variable with spaces }}\nEntity: {{nested.variable}}',
    });

    const result = await extractEntities(provider, [
      'Company {{company_name}} founded in {{year}} by {{founder}}',
      'Microsoft was established in {{ complex_variable with spaces }} using {{nested.variable}}',
    ]);

    expect(result).toEqual(['Microsoft']);
  });

  it('should handle empty prompts array', async () => {
    process.env.PROMPTFOO_DISABLE_REDTEAM_REMOTE_GENERATION = 'true';

    const result = await extractEntities(provider, []);

    expect(result).toEqual(['Apple', 'Google']); // Default mock response
    expect(provider.callApi).toHaveBeenCalledWith(expect.stringContaining('PROMPTS TO ANALYZE'));
  });

  it('should handle errors in local extraction', async () => {
    process.env.PROMPTFOO_DISABLE_REDTEAM_REMOTE_GENERATION = 'true';
    vi.mocked(provider.callApi).mockRejectedValue(new Error('API call failed'));

    const result = await extractEntities(provider, ['prompt']);

    expect(result).toEqual([]);
    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('Error using local extraction'),
    );
  });
});
