import { evaluate } from '../src/evaluator';

import type { ApiProvider, Prompt, TestSuite } from '../src/types';
import { TestCase } from '../dist/src';
import { CallApiContextParams } from '../src/types';

jest.mock('node-fetch', () => jest.fn());
jest.mock('proxy-agent', () => ({
  ProxyAgent: jest.fn().mockImplementation(() => ({})),
}));
jest.mock('glob', () => ({
  globSync: jest.fn(),
}));

jest.mock('fs', () => ({
  readFileSync: jest.fn(),
  writeFileSync: jest.fn(),
  statSync: jest.fn(),
  readdirSync: jest.fn(),
  existsSync: jest.fn(),
  mkdirSync: jest.fn(),
  promises: {
    readFile: jest.fn(),
  },
}));

jest.mock('../src/esm');
jest.mock('../src/database');

beforeEach(() => {
  jest.clearAllMocks();
});

const mockApiProviderThreadCommaConcatenator: ApiProvider = {
  id: jest.fn().mockReturnValue('test-provider'),
  callApi: jest.fn().mockImplementation((prompt: string, context?: CallApiContextParams) => ({
    output: (context?.thread.thread || '') + ',' + prompt,
    tokenUsage: { total: 10, prompt: 5, completion: 5, cached: 0 },
    thread: (context?.thread.thread || '') + ',' + prompt
  })),
};

const mockApiProviderThreadColonConcatenator: ApiProvider = {
  id: jest.fn().mockReturnValue('test-provider'),
  callApi: jest.fn().mockImplementation((prompt: string, context?: CallApiContextParams) => ({
    output: (context?.thread.thread || '') + ':' + prompt,
    tokenUsage: { total: 10, prompt: 5, completion: 5, cached: 0 },
    thread: (context?.thread.thread || '') + ':' + prompt
  })),
};

function toPrompt(text: string): Prompt {
  return { raw: text, display: text };
}

describe('runAssertions', () => {

  afterEach(() => {
    jest.clearAllMocks();
  });

  test('Tests in a thread keeps thread context', async () => {
    const testSuite: TestSuite = {
      providers: [mockApiProviderThreadCommaConcatenator],
      prompts: [toPrompt('Test prompt')],
      tests: [
        {
          thread: [{
            assert: [{
              type: 'equals',
              value: ',Test prompt'
            }]
          },{
            assert: [{
              type: 'equals',
              value: ',Test prompt,Test prompt'
            }]
          }]
        },
      ],
    };

    const summary = await evaluate(testSuite, {});

    expect(mockApiProviderThreadCommaConcatenator.callApi).toHaveBeenCalledTimes(2);
    expect(summary.stats.successes).toBe(2);
    expect(summary.stats.failures).toBe(0);
    expect(summary.results[0].prompt.raw).toBe('Test prompt');
    expect(summary.results[0].response?.output).toBe(',Test prompt');
    expect(summary.results[1].prompt.raw).toBe('Test prompt');
    expect(summary.results[1].response?.output).toBe(',Test prompt,Test prompt');
  });

  test('Columns are correctly filled in when using multiple providers', async () => {
    const testSuite: TestSuite = {
      providers: [mockApiProviderThreadCommaConcatenator, mockApiProviderThreadColonConcatenator],
      prompts: [toPrompt('Test prompt')],
      tests: [
        {
          thread: [{
            assert: [{
              type: 'contains',
              value: 'Test prompt'
            }]
          },{
            assert: [{
              type: 'regex',
              value: '.Test prompt.Test prompt'
            }]
          }]
        },
      ],
    };

    const summary = await evaluate(testSuite, {});

    expect(mockApiProviderThreadCommaConcatenator.callApi).toHaveBeenCalledTimes(2);
    expect(mockApiProviderThreadColonConcatenator.callApi).toHaveBeenCalledTimes(2);
    expect(summary.stats.successes).toBe(4);
    expect(summary.stats.failures).toBe(0);
    expect(summary.table.body[0].outputs[0].text).toBe(',Test prompt')
    expect(summary.table.body[1].outputs[0].text).toBe(',Test prompt,Test prompt')
    expect(summary.table.body[0].outputs[1].text).toBe(':Test prompt')
    expect(summary.table.body[1].outputs[1].text).toBe(':Test prompt:Test prompt')
  });

  test('variables on thread level causes many threads instead of many sub-threads', async () => {
    const testSuite: TestSuite = {
      providers: [mockApiProviderThreadCommaConcatenator],
      prompts: [toPrompt('{{query}}')],
      tests: [
        {
          vars: { 'query': [ 'banana', 'apple' ] },
          thread: [{
            vars: { 'query': 'I will name fruit, please repeat it back to me' }
          },{
            assert: [{
              type: 'equals',
              value: ',I will name fruit, please repeat it back to me,{{query}}'
            }]
          }]
        },
      ],
    };

    const summary = await evaluate(testSuite, {});

    expect(mockApiProviderThreadCommaConcatenator.callApi).toHaveBeenCalledTimes(4);
    expect(summary.stats.successes).toBe(4);
    expect(summary.stats.failures).toBe(0);
    expect(summary.table.body[0].outputs[0].text).toBe(',I will name fruit, please repeat it back to me')
    expect(summary.table.body[1].outputs[0].text).toBe(',I will name fruit, please repeat it back to me,banana')
    expect(summary.table.body[2].outputs[0].text).toBe(',I will name fruit, please repeat it back to me')
    expect(summary.table.body[3].outputs[0].text).toBe(',I will name fruit, please repeat it back to me,apple')
  });

  test('threads are not run concurrently', async () => {
    let running = 0
    const mockApiProvider: ApiProvider = {
      id: jest.fn().mockReturnValue('test-provider'),
      callApi: () => {
        running += 1;
        return new Promise(resolve => setTimeout(() => {
          expect(running).toBeLessThan(2)
          running -= 1;
          resolve({ output: "test" })
        }, 100));
      },
    };
    const testSuite: TestSuite = {
      providers: [mockApiProvider],
      prompts: [toPrompt('Test prompt')],
      tests: [
        {
          thread: [{
            assert: [{
              type: 'equals',
              value: 'Test output'
            }]
          },
          {
            assert: [{
              type: 'equals',
              value: 'Test output'
            }]
          }]
        },
      ],
    };

    const summary = await evaluate(testSuite, {});
  });
});
