import * as fs from 'fs';
import * as path from 'path';
import { runAssertion } from '../../src/assertions';
import { OpenAiChatCompletionProvider } from '../../src/providers/openai/chat';
import type { Assertion, AtomicTestCase, GradingResult } from '../../src/types';

// Mock setup similar to index.test.ts
jest.mock('../../src/redteam/remoteGeneration', () => ({
  shouldGenerateRemote: jest.fn().mockReturnValue(false),
}));

jest.mock('proxy-agent', () => ({
  ProxyAgent: jest.fn().mockImplementation(() => ({})),
}));

jest.mock('node:module', () => {
  const mockRequire: NodeJS.Require = {
    resolve: jest.fn() as unknown as NodeJS.RequireResolve,
  } as unknown as NodeJS.Require;
  return {
    createRequire: jest.fn().mockReturnValue(mockRequire),
  };
});

jest.mock('../../src/fetch', () => {
  const actual = jest.requireActual('../../src/fetch');
  return {
    ...actual,
    fetchWithRetries: jest.fn(actual.fetchWithRetries),
  };
});

jest.mock('glob', () => ({
  globSync: jest.fn(),
}));

jest.mock('fs', () => ({
  readFileSync: jest.fn(),
  promises: {
    readFile: jest.fn(),
  },
}));

jest.mock('../../src/esm');
jest.mock('../../src/database', () => ({
  getDb: jest.fn(),
}));

jest.mock('path', () => ({
  ...jest.requireActual('path'),
  resolve: jest.fn(jest.requireActual('path').resolve),
  extname: jest.fn(jest.requireActual('path').extname),
}));

jest.mock('../../src/cliState', () => ({
  basePath: '/base/path',
}));

jest.mock('../../src/matchers', () => {
  const actual = jest.requireActual('../../src/matchers');
  return {
    ...actual,
    matchesContextRelevance: jest
      .fn()
      .mockResolvedValue({ pass: true, score: 1, reason: 'Mocked reason' }),
    matchesContextFaithfulness: jest
      .fn()
      .mockResolvedValue({ pass: true, score: 1, reason: 'Mocked reason' }),
  };
});

describe('Contains-JSON assertion', () => {
  // Setup test assertions
  const containsJsonAssertion: Assertion = {
    type: 'contains-json',
  };

  const containsJsonAssertionWithSchema: Assertion = {
    type: 'contains-json',
    value: {
      required: ['latitude', 'longitude'],
      type: 'object',
      properties: {
        latitude: {
          type: 'number',
          minimum: -90,
          maximum: 90,
        },
        longitude: {
          type: 'number',
          minimum: -180,
          maximum: 180,
        },
      },
    },
  };

  beforeEach(() => {
    jest.resetModules();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should pass when the contains-json assertion passes', async () => {
    const output =
      'this is some other stuff \n\n {"key": "value", "key2": {"key3": "value2", "key4": ["value3", "value4"]}} \n\n blah blah';

    const result: GradingResult = await runAssertion({
      prompt: 'Some prompt',
      provider: new OpenAiChatCompletionProvider('gpt-4o-mini'),
      assertion: containsJsonAssertion,
      test: {} as AtomicTestCase,
      providerResponse: { output },
    });
    expect(result).toMatchObject({
      pass: true,
      reason: 'Assertion passed',
    });
  });

  it('should pass when the contains-json assertion passes with multiple json values', async () => {
    const output =
      'this is some other stuff \n\n {"key": "value", "key2": {"key3": "value2", "key4": ["value3", "value4"]}} another {"key": "value", "key2": {"key3": "value2", "key4": ["value3", "value4"]}}\n\n blah blah';

    const result: GradingResult = await runAssertion({
      prompt: 'Some prompt',
      provider: new OpenAiChatCompletionProvider('gpt-4o-mini'),
      assertion: containsJsonAssertion,
      test: {} as AtomicTestCase,
      providerResponse: { output },
    });
    expect(result).toMatchObject({
      pass: true,
      reason: 'Assertion passed',
    });
  });

  it('should fail when the contains-json assertion fails', async () => {
    const output = 'Not valid JSON';

    const result: GradingResult = await runAssertion({
      prompt: 'Some prompt',
      provider: new OpenAiChatCompletionProvider('gpt-4o-mini'),
      assertion: containsJsonAssertion,
      test: {} as AtomicTestCase,
      providerResponse: { output },
    });
    expect(result).toMatchObject({
      pass: false,
      reason: 'Expected output to contain valid JSON',
    });
  });

  it('should pass when the contains-json assertion passes with schema', async () => {
    const output = 'here is the answer\n\n```{"latitude": 80.123, "longitude": -1}```';

    const result: GradingResult = await runAssertion({
      prompt: 'Some prompt',
      provider: new OpenAiChatCompletionProvider('gpt-4o-mini'),
      assertion: containsJsonAssertionWithSchema,
      test: {} as AtomicTestCase,
      providerResponse: { output },
    });
    expect(result).toMatchObject({
      pass: true,
      reason: 'Assertion passed',
    });
  });

  it('should pass when the contains-json assertion passes with schema with YAML string', async () => {
    const output = 'here is the answer\n\n```{"latitude": 80.123, "longitude": -1}```';

    const result: GradingResult = await runAssertion({
      prompt: 'Some prompt',
      provider: new OpenAiChatCompletionProvider('gpt-4o-mini'),
      assertion: containsJsonAssertionWithSchema,
      test: {} as AtomicTestCase,
      providerResponse: { output },
    });
    expect(result).toMatchObject({
      pass: true,
      reason: 'Assertion passed',
    });
  });

  it('should pass when the contains-json assertion passes with external schema', async () => {
    const assertion: Assertion = {
      type: 'contains-json',
      value: 'file:///schema.json',
    };

    jest.mocked(fs.readFileSync).mockReturnValue(
      JSON.stringify({
        required: ['latitude', 'longitude'],
        type: 'object',
        properties: {
          latitude: {
            type: 'number',
            minimum: -90,
            maximum: 90,
          },
          longitude: {
            type: 'number',
            minimum: -180,
            maximum: 180,
          },
        },
      }),
    );

    const output = 'here is the answer\n\n```{"latitude": 80.123, "longitude": -1}```';

    const result: GradingResult = await runAssertion({
      prompt: 'Some prompt',
      provider: new OpenAiChatCompletionProvider('gpt-4o-mini'),
      assertion,
      test: {} as AtomicTestCase,
      providerResponse: { output },
    });
    expect(fs.readFileSync).toHaveBeenCalledWith(path.resolve('/schema.json'), 'utf8');
    expect(result).toMatchObject({
      pass: true,
      reason: 'Assertion passed',
    });
  });

  it('should fail contains-json assertion with invalid data against external schema', async () => {
    const assertion: Assertion = {
      type: 'contains-json',
      value: 'file:///schema.json',
    };

    jest.mocked(fs.readFileSync).mockReturnValue(
      JSON.stringify({
        required: ['latitude', 'longitude'],
        type: 'object',
        properties: {
          latitude: {
            type: 'number',
            minimum: -90,
            maximum: 90,
          },
          longitude: {
            type: 'number',
            minimum: -180,
            maximum: 180,
          },
        },
      }),
    );

    const output = 'here is the answer\n\n```{"latitude": "medium", "longitude": -1}```';

    const result: GradingResult = await runAssertion({
      prompt: 'Some prompt',
      provider: new OpenAiChatCompletionProvider('gpt-4o-mini'),
      assertion,
      test: {} as AtomicTestCase,
      providerResponse: { output },
    });
    expect(fs.readFileSync).toHaveBeenCalledWith(path.resolve('/schema.json'), 'utf8');
    expect(result).toMatchObject({
      pass: false,
      reason: 'JSON does not conform to the provided schema. Errors: data/latitude must be number',
    });
  });

  it('should fail contains-json assertion with predefined schema and invalid data', async () => {
    const output = 'here is the answer\n\n```{"latitude": "medium", "longitude": -1}```';

    const result: GradingResult = await runAssertion({
      prompt: 'Some prompt',
      provider: new OpenAiChatCompletionProvider('gpt-4o-mini'),
      assertion: containsJsonAssertionWithSchema,
      test: {} as AtomicTestCase,
      providerResponse: { output },
    });
    expect(result).toEqual(
      expect.objectContaining({
        pass: false,
        reason:
          'JSON does not conform to the provided schema. Errors: data/latitude must be number',
      }),
    );
  });
});
