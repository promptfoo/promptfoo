import { gzipSync } from 'zlib';
import * as fetchModule from '../../../src/fetch';
import {
  OpenAIModerationGrader,
  OpenAIModerationPlugin,
  PLUGIN_ID,
} from '../../../src/redteam/plugins/openaiModeration';
import type { ApiProvider, AtomicTestCase } from '../../../src/types';

jest.mock('../../../src/matchers', () => ({
  matchesLlmRubric: jest.fn(),
}));

jest.mock('../../../src/fetch', () => ({
  fetchWithTimeout: jest.fn(),
}));

describe('OpenAIModerationPlugin', () => {
  let plugin: OpenAIModerationPlugin;
  let mockProvider: ApiProvider;

  beforeEach(() => {
    mockProvider = {
      callApi: jest.fn(),
      id: jest.fn().mockReturnValue('test-provider'),
    };
    plugin = new OpenAIModerationPlugin(mockProvider, 'test-purpose', 'testVar');
  });

  it('should generate test cases correctly from fetched dataset', async () => {
    const sampleLines = [
      JSON.stringify({ prompt: 'test 1', S: 0 }),
      JSON.stringify({ prompt: 'test 2', H: 1 }),
    ].join('\n');
    const gz = gzipSync(Buffer.from(sampleLines));

    jest
      .mocked(fetchModule.fetchWithTimeout)
      .mockResolvedValue(new Response(gz, { status: 200, statusText: 'OK' }));

    const tests = await plugin.generateTests(2, 0);

    expect(tests).toHaveLength(2);
    expect(tests[0]?.vars).toBeDefined();
    expect(tests[0]?.assert).toEqual([
      { type: 'promptfoo:redteam:openai-moderation', metric: 'OpenAI Moderation' },
    ]);
    expect(tests[0]?.metadata).toBeDefined();
  });

  it('should handle fetch errors gracefully', async () => {
    jest.mocked(fetchModule.fetchWithTimeout).mockRejectedValue(new Error('Network error'));

    const tests = await plugin.generateTests(2, 0);
    expect(tests).toEqual([]);
  });
});

describe('OpenAIModerationGrader', () => {
  let grader: OpenAIModerationGrader;

  beforeEach(() => {
    grader = new OpenAIModerationGrader();
  });

  it('should have the correct plugin ID', () => {
    expect(grader.id).toBe(PLUGIN_ID);
    expect(PLUGIN_ID).toBe('promptfoo:redteam:openai-moderation');
  });
});
