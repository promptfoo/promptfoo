import dedent from 'dedent';
import * as fs from 'fs';
import * as path from 'path';
import { runAssertion, runAssertions } from '../../src/assertions';
import { validateXml, containsXml } from '../../src/assertions/xml';
import { fetchWithRetries } from '../../src/fetch';
import {
  DefaultGradingJsonProvider,
  DefaultEmbeddingProvider,
  OpenAiChatCompletionProvider,
} from '../../src/providers/openai';
import { ReplicateModerationProvider } from '../../src/providers/replicate';
import type {
  Assertion,
  ApiProvider,
  AtomicTestCase,
  ProviderResponse,
  GradingResult,
} from '../../src/types';
import { TestGrader } from '../util/utils';

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

const Grader = new TestGrader();

describe('runAssertions', () => {
  const test: AtomicTestCase = {
    assert: [
      {
        type: 'equals',
        value: 'Expected output',
      },
    ],
  };

  beforeEach(() => {
    jest.resetModules();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should pass when all assertions pass', async () => {
    const output = 'Expected output';

    const result: GradingResult = await runAssertions({
      prompt: 'Some prompt',
      provider: new OpenAiChatCompletionProvider('gpt-4o-mini'),
      test,
      providerResponse: { output },
    });
    expect(result).toMatchObject({
      pass: true,
      reason: 'All assertions passed',
    });
  });

  it('should fail when any assertion fails', async () => {
    const output = 'Actual output';

    const result: GradingResult = await runAssertions({
      prompt: 'Some prompt',
      provider: new OpenAiChatCompletionProvider('gpt-4o-mini'),
      test,
      providerResponse: { output },
    });
    expect(result).toMatchObject({
      pass: false,
      reason: 'Expected output "Actual output" to equal "Expected output"',
    });
  });

  it('should handle output as an object', async () => {
    const output = { key: 'value' };

    const result: GradingResult = await runAssertions({
      prompt: 'Some prompt',
      provider: new OpenAiChatCompletionProvider('gpt-4o-mini'),
      test,
      providerResponse: { output },
    });
    expect(result).toMatchObject({
      pass: false,
      reason: 'Expected output "{"key":"value"}" to equal "Expected output"',
    });
  });

  it('should fail when combined score is less than threshold', async () => {
    const result: GradingResult = await runAssertions({
      prompt: 'Some prompt',
      provider: new OpenAiChatCompletionProvider('gpt-4o-mini'),
      test: {
        threshold: 0.5,
        assert: [
          {
            type: 'equals',
            value: 'Hello world',
            weight: 2,
          },
          {
            type: 'contains',
            value: 'world',
            weight: 1,
          },
        ],
      },
      providerResponse: { output: 'Hi there world' },
    });
    expect(result).toMatchObject({
      pass: false,
      reason: 'Aggregate score 0.33 < 0.5 threshold',
    });
  });

  it('should pass when combined score is greater than threshold', async () => {
    const result: GradingResult = await runAssertions({
      prompt: 'Some prompt',
      provider: new OpenAiChatCompletionProvider('gpt-4o-mini'),
      test: {
        threshold: 0.25,
        assert: [
          {
            type: 'equals',
            value: 'Hello world',
            weight: 2,
          },
          {
            type: 'contains',
            value: 'world',
            weight: 1,
          },
        ],
      },
      providerResponse: { output: 'Hi there world' },
    });
    expect(result).toMatchObject({
      pass: true,
      reason: 'Aggregate score 0.33 ≥ 0.25 threshold',
    });
  });

  describe('assert-set', () => {
    const prompt = 'Some prompt';
    const provider = new OpenAiChatCompletionProvider('gpt-4o-mini');

    it('assert-set success', async () => {
      const output = 'Expected output';
      const test: AtomicTestCase = {
        assert: [
          {
            type: 'assert-set',
            assert: [
              {
                type: 'equals',
                value: output,
              },
            ],
          },
        ],
      };

      const result: GradingResult = await runAssertions({
        prompt,
        provider,
        test,
        providerResponse: { output },
      });
      expect(result).toMatchObject({
        pass: true,
        reason: 'All assertions passed',
      });
    });

    it('assert-set failure', async () => {
      const output = 'Actual output';
      const test: AtomicTestCase = {
        assert: [
          {
            type: 'assert-set',
            assert: [
              {
                type: 'equals',
                value: 'Expected output',
              },
            ],
          },
        ],
      };

      const result: GradingResult = await runAssertions({
        prompt,
        provider,
        test,
        providerResponse: { output },
      });
      expect(result).toMatchObject({
        pass: false,
        reason: 'Expected output "Actual output" to equal "Expected output"',
      });
    });

    it('assert-set threshold success', async () => {
      const output = 'Expected output';
      const test: AtomicTestCase = {
        assert: [
          {
            type: 'assert-set',
            threshold: 0.25,
            assert: [
              {
                type: 'equals',
                value: 'Hello world',
                weight: 2,
              },
              {
                type: 'contains',
                value: 'Expected',
                weight: 1,
              },
            ],
          },
        ],
      };

      const result: GradingResult = await runAssertions({
        prompt,
        provider,
        test,
        providerResponse: { output },
      });
      expect(result).toMatchObject({
        pass: true,
        reason: 'All assertions passed',
      });
    });

    it('assert-set threshold failure', async () => {
      const output = 'Expected output';
      const test: AtomicTestCase = {
        assert: [
          {
            type: 'assert-set',
            threshold: 0.5,
            assert: [
              {
                type: 'equals',
                value: 'Hello world',
                weight: 2,
              },
              {
                type: 'contains',
                value: 'Expected',
                weight: 1,
              },
            ],
          },
        ],
      };

      const result: GradingResult = await runAssertions({
        prompt,
        provider,
        test,
        providerResponse: { output },
      });
      expect(result).toMatchObject({
        pass: false,
        reason: 'Aggregate score 0.33 < 0.5 threshold',
      });
    });

    it('assert-set with metric', async () => {
      const metric = 'The best metric';
      const output = 'Expected output';
      const test: AtomicTestCase = {
        assert: [
          {
            type: 'assert-set',
            metric,
            threshold: 0.5,
            assert: [
              {
                type: 'equals',
                value: 'Hello world',
              },
              {
                type: 'contains',
                value: 'Expected',
              },
            ],
          },
        ],
      };

      const result: GradingResult = await runAssertions({
        prompt,
        provider,
        test,
        providerResponse: { output },
      });
      expect(result.namedScores).toStrictEqual({
        [metric]: 0.5,
      });
    });

    it('uses assert-set weight', async () => {
      const output = 'Expected';
      const test: AtomicTestCase = {
        assert: [
          {
            type: 'equals',
            value: 'Nope',
            weight: 10,
          },
          {
            type: 'assert-set',
            weight: 90,
            assert: [
              {
                type: 'equals',
                value: 'Expected',
              },
            ],
          },
        ],
      };

      const result: GradingResult = await runAssertions({
        prompt,
        provider,
        test,
        providerResponse: { output },
      });
      expect(result.score).toBe(0.9);
    });
  });

  it('preserves default provider', async () => {
    const provider = new OpenAiChatCompletionProvider('gpt-4o-mini');
    const output = 'Expected output';
    const test: AtomicTestCase = {
      assert: [
        {
          type: 'moderation',
          provider: 'replicate:moderation:foo/bar',
        },
        {
          type: 'llm-rubric',
          value: 'insert rubric here',
        },
      ],
    };

    const callApiSpy = jest.spyOn(DefaultGradingJsonProvider, 'callApi').mockResolvedValue({
      output: JSON.stringify({ pass: true, score: 1.0, reason: 'I love you' }),
    });
    const callModerationApiSpy = jest
      .spyOn(ReplicateModerationProvider.prototype, 'callModerationApi')
      .mockResolvedValue({ flags: [] });

    const result: GradingResult = await runAssertions({
      prompt: 'foobar',
      provider,
      test,
      providerResponse: { output },
    });

    expect(result.pass).toBeTruthy();
    expect(callApiSpy).toHaveBeenCalledTimes(1);
    expect(callModerationApiSpy).toHaveBeenCalledTimes(1);
  });
});

describe('runAssertion', () => {
  beforeEach(() => {
    jest.resetModules();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  const equalityAssertion: Assertion = {
    type: 'equals',
    value: 'Expected output',
  };

  const equalityAssertionWithObject: Assertion = {
    type: 'equals',
    value: { key: 'value' },
  };

  const isJsonAssertion: Assertion = {
    type: 'is-json',
  };

  const isJsonAssertionWithSchema: Assertion = {
    type: 'is-json',
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

  const isJsonAssertionWithSchemaYamlString: Assertion = {
    type: 'is-json',
    value: `
          required: ["latitude", "longitude"]
          type: object
          properties:
            latitude:
              type: number
              minimum: -90
              maximum: 90
            longitude:
              type: number
              minimum: -180
              maximum: 180
`,
  };

  const isSqlAssertion: Assertion = {
    type: 'is-sql',
  };

  const notIsSqlAssertion: Assertion = {
    type: 'not-is-sql',
  };

  const isSqlAssertionWithDatabase: Assertion = {
    type: 'is-sql',
    value: {
      databaseType: 'MySQL',
    },
  };

  const isSqlAssertionWithDatabaseAndWhiteTableList: Assertion = {
    type: 'is-sql',
    value: {
      databaseType: 'MySQL',
      allowedTables: ['(select|update|insert|delete)::null::departments'],
    },
  };

  const isSqlAssertionWithDatabaseAndWhiteColumnList: Assertion = {
    type: 'is-sql',
    value: {
      databaseType: 'MySQL',
      allowedColumns: ['select::null::name', 'update::null::id'],
    },
  };

  const isSqlAssertionWithDatabaseAndBothList: Assertion = {
    type: 'is-sql',
    value: {
      databaseType: 'MySQL',
      allowedTables: ['(select|update|insert|delete)::null::departments'],
      allowedColumns: ['select::null::name', 'update::null::id'],
    },
  };

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

  const javascriptStringAssertion: Assertion = {
    type: 'javascript',
    value: 'output === "Expected output"',
  };

  const javascriptStringAssertionWithNumber: Assertion = {
    type: 'javascript',
    value: 'output.length * 10',
  };

  const javascriptBooleanAssertionWithConfig: Assertion = {
    type: 'javascript',
    value: 'output.length <= context.config.maximumOutputSize',
    config: {
      maximumOutputSize: 20,
    },
  };

  const javascriptStringAssertionWithNumberAndThreshold: Assertion = {
    type: 'javascript',
    value: 'output.length * 10',
    threshold: 0.5,
  };

  it('should pass when the equality assertion passes', async () => {
    const output = 'Expected output';

    const result: GradingResult = await runAssertion({
      prompt: 'Some prompt',
      provider: new OpenAiChatCompletionProvider('gpt-4o-mini'),
      assertion: equalityAssertion,
      test: {} as AtomicTestCase,
      providerResponse: { output },
    });
    expect(result).toMatchObject({
      pass: true,
      reason: 'Assertion passed',
    });
  });

  it('should fail when the equality assertion fails', async () => {
    const output = 'Actual output';

    const result: GradingResult = await runAssertion({
      prompt: 'Some prompt',
      provider: new OpenAiChatCompletionProvider('gpt-4o-mini'),
      assertion: equalityAssertion,
      test: {} as AtomicTestCase,
      providerResponse: { output },
    });
    expect(result).toMatchObject({
      pass: false,
      reason: 'Expected output "Actual output" to equal "Expected output"',
    });
  });

  const notEqualsAssertion: Assertion = {
    type: 'not-equals',
    value: 'Unexpected output',
  };

  it('should pass when the not-equals assertion passes', async () => {
    const output = 'Expected output';

    const result: GradingResult = await runAssertion({
      prompt: 'Some prompt',
      assertion: notEqualsAssertion,
      test: {} as AtomicTestCase,
      providerResponse: { output },
      provider: new OpenAiChatCompletionProvider('gpt-4o-mini'),
    });
    expect(result).toMatchObject({
      pass: true,
      reason: 'Assertion passed',
    });
  });

  it('should fail when the not-equals assertion fails', async () => {
    const output = 'Unexpected output';

    const result: GradingResult = await runAssertion({
      prompt: 'Some prompt',
      assertion: notEqualsAssertion,
      test: {} as AtomicTestCase,
      providerResponse: { output },
      provider: new OpenAiChatCompletionProvider('gpt-4o-mini'),
    });
    expect(result).toMatchObject({
      pass: false,
      reason: 'Expected output "Unexpected output" to not equal "Unexpected output"',
    });
  });

  it('should handle output as an object', async () => {
    const output = { key: 'value' };
    const result: GradingResult = await runAssertion({
      prompt: 'Some prompt',
      provider: new OpenAiChatCompletionProvider('gpt-4o-mini'),
      assertion: equalityAssertion,
      test: {} as AtomicTestCase,
      providerResponse: { output },
    });
    expect(result).toMatchObject({
      pass: false,
      reason: 'Expected output "{"key":"value"}" to equal "Expected output"',
    });
  });

  it('should pass when the equality assertion with object passes', async () => {
    const output = { key: 'value' };

    const result: GradingResult = await runAssertion({
      prompt: 'Some prompt',
      provider: new OpenAiChatCompletionProvider('gpt-4o-mini'),
      assertion: equalityAssertionWithObject,
      test: {} as AtomicTestCase,
      providerResponse: { output },
    });
    expect(result).toMatchObject({
      pass: true,
      reason: 'Assertion passed',
    });
  });

  it('should fail when the equality assertion with object fails', async () => {
    const output = { key: 'not value' };

    const result: GradingResult = await runAssertion({
      prompt: 'Some prompt',
      provider: new OpenAiChatCompletionProvider('gpt-4o-mini'),
      assertion: equalityAssertionWithObject,
      test: {} as AtomicTestCase,
      providerResponse: { output },
    });
    expect(result).toMatchObject({
      pass: false,
      reason: 'Expected output "{"key":"not value"}" to equal "{"key":"value"}"',
    });
  });

  it('should pass when the equality assertion with object passes with external json', async () => {
    const assertion: Assertion = {
      type: 'equals',
      value: 'file:///output.json',
    };

    jest.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({ key: 'value' }));

    const output = '{"key":"value"}';

    const result: GradingResult = await runAssertion({
      prompt: 'Some prompt',
      provider: new OpenAiChatCompletionProvider('gpt-4o-mini'),
      assertion,
      test: {} as AtomicTestCase,
      providerResponse: { output },
    });
    expect(fs.readFileSync).toHaveBeenCalledWith(path.resolve('/output.json'), 'utf8');
    expect(result).toMatchObject({
      pass: true,
      reason: 'Assertion passed',
    });
  });

  it('should fail when the equality assertion with object fails with external object', async () => {
    const assertion: Assertion = {
      type: 'equals',
      value: 'file:///output.json',
    };

    jest.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({ key: 'value' }));

    const output = '{"key":"not value"}';

    const result: GradingResult = await runAssertion({
      prompt: 'Some prompt',
      provider: new OpenAiChatCompletionProvider('gpt-4o-mini'),
      assertion,
      test: {} as AtomicTestCase,
      providerResponse: { output },
    });
    expect(fs.readFileSync).toHaveBeenCalledWith(path.resolve('/output.json'), 'utf8');
    expect(result).toMatchObject({
      pass: false,
      reason: 'Expected output "{"key":"not value"}" to equal "{"key":"value"}"',
    });
  });

  it('should pass when the is-json assertion passes', async () => {
    const output = '{"key":"value"}';

    const result: GradingResult = await runAssertion({
      prompt: 'Some prompt',
      provider: new OpenAiChatCompletionProvider('gpt-4o-mini'),
      assertion: isJsonAssertion,
      test: {} as AtomicTestCase,
      providerResponse: { output },
    });
    expect(result).toMatchObject({
      pass: true,
      reason: 'Assertion passed',
    });
  });

  it('should fail when the is-json assertion fails', async () => {
    const output = 'Not valid JSON';

    const result: GradingResult = await runAssertion({
      prompt: 'Some prompt',
      provider: new OpenAiChatCompletionProvider('gpt-4o-mini'),
      assertion: isJsonAssertion,
      test: {} as AtomicTestCase,
      providerResponse: { output },
    });
    expect(result).toMatchObject({
      pass: false,
      reason: 'Expected output to be valid JSON',
    });
  });

  it('should pass when the is-json assertion passes with schema', async () => {
    const output = '{"latitude": 80.123, "longitude": -1}';

    const result: GradingResult = await runAssertion({
      prompt: 'Some prompt',
      provider: new OpenAiChatCompletionProvider('gpt-4o-mini'),
      assertion: isJsonAssertionWithSchema,
      test: {} as AtomicTestCase,
      providerResponse: { output },
    });
    expect(result).toMatchObject({
      pass: true,
      reason: 'Assertion passed',
    });
  });

  it('should fail when the is-json assertion fails with schema', async () => {
    const output = '{"latitude": "high", "longitude": [-1]}';

    const result: GradingResult = await runAssertion({
      prompt: 'Some prompt',
      provider: new OpenAiChatCompletionProvider('gpt-4o-mini'),
      assertion: isJsonAssertionWithSchema,
      test: {} as AtomicTestCase,
      providerResponse: { output },
    });
    expect(result).toMatchObject({
      pass: false,
      reason: 'JSON does not conform to the provided schema. Errors: data/latitude must be number',
    });
  });

  it('should pass when the is-json assertion passes with schema YAML string', async () => {
    const output = '{"latitude": 80.123, "longitude": -1}';

    const result: GradingResult = await runAssertion({
      prompt: 'Some prompt',
      provider: new OpenAiChatCompletionProvider('gpt-4o-mini'),
      assertion: isJsonAssertionWithSchemaYamlString,
      test: {} as AtomicTestCase,
      providerResponse: { output },
    });
    expect(result).toMatchObject({
      pass: true,
      reason: 'Assertion passed',
    });
  });

  it('should fail when the is-json assertion fails with schema YAML string', async () => {
    const output = '{"latitude": "high", "longitude": [-1]}';

    const result: GradingResult = await runAssertion({
      prompt: 'Some prompt',
      provider: new OpenAiChatCompletionProvider('gpt-4o-mini'),
      assertion: isJsonAssertionWithSchemaYamlString,
      test: {} as AtomicTestCase,
      providerResponse: { output },
    });
    expect(result).toMatchObject({
      pass: false,
      reason: 'JSON does not conform to the provided schema. Errors: data/latitude must be number',
    });
  });

  it('should validate JSON with formats using ajv-formats', async () => {
    const output = '{"date": "2021-08-29"}';
    const schemaWithFormat = {
      type: 'object',
      properties: {
        date: {
          type: 'string',
          format: 'date',
        },
      },
      required: ['date'],
    };

    const result: GradingResult = await runAssertion({
      prompt: 'Some prompt',
      provider: new OpenAiChatCompletionProvider('gpt-4o-mini'),
      assertion: { type: 'is-json', value: schemaWithFormat },
      test: {} as AtomicTestCase,
      providerResponse: { output },
    });

    expect(result).toMatchObject({
      pass: true,
      reason: 'Assertion passed',
    });
  });

  it('should validate JSON with formats using ajv-formats - failure', async () => {
    const output = '{"date": "not a date"}';
    const schemaWithFormat = {
      type: 'object',
      properties: {
        date: {
          type: 'string',
          format: 'date',
        },
      },
      required: ['date'],
    };

    const result: GradingResult = await runAssertion({
      prompt: 'Some prompt',
      provider: new OpenAiChatCompletionProvider('gpt-4o-mini'),
      assertion: { type: 'is-json', value: schemaWithFormat },
      test: {} as AtomicTestCase,
      providerResponse: { output },
    });

    expect(result).toMatchObject({
      pass: false,
      reason:
        'JSON does not conform to the provided schema. Errors: data/date must match format "date"',
    });
  });

  it('should pass when the is-json assertion passes with external schema', async () => {
    const assertion: Assertion = {
      type: 'is-json',
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

    const output = '{"latitude": 80.123, "longitude": -1}';

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

  it('should fail when the is-json assertion fails with external schema', async () => {
    const assertion: Assertion = {
      type: 'is-json',
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

    const output = '{"latitude": "high", "longitude": [-1]}';

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

  describe('SQL assertions', () => {
    it('should pass when the is-sql assertion passes', async () => {
      const output = 'SELECT id, name FROM users';

      const result: GradingResult = await runAssertion({
        prompt: 'Some prompt',
        provider: new OpenAiChatCompletionProvider('gpt-4o-mini'),
        assertion: isSqlAssertion,
        test: {} as AtomicTestCase,
        providerResponse: { output },
      });
      expect(result).toMatchObject({
        pass: true,
        reason: 'Assertion passed',
      });
    });

    it('should fail when the is-sql assertion fails', async () => {
      const output = 'SELECT * FROM orders ORDERY BY order_date';

      const result: GradingResult = await runAssertion({
        prompt: 'Some prompt',
        provider: new OpenAiChatCompletionProvider('gpt-4o-mini'),
        assertion: isSqlAssertion,
        test: {} as AtomicTestCase,
        providerResponse: { output },
      });
      expect(result).toMatchObject({
        pass: false,
        reason: 'SQL statement does not conform to the provided MySQL database syntax.',
      });
    });

    it('should pass when the not-is-sql assertion passes', async () => {
      const output = 'SELECT * FROM orders ORDERY BY order_date';

      const result: GradingResult = await runAssertion({
        prompt: 'Some prompt',
        provider: new OpenAiChatCompletionProvider('gpt-4o-mini'),
        assertion: notIsSqlAssertion,
        test: {} as AtomicTestCase,
        providerResponse: { output },
      });
      expect(result).toMatchObject({
        pass: true,
        reason: 'Assertion passed',
      });
    });

    it('should fail when the not-is-sql assertion fails', async () => {
      const output = 'SELECT id, name FROM users';

      const result: GradingResult = await runAssertion({
        prompt: 'Some prompt',
        provider: new OpenAiChatCompletionProvider('gpt-4o-mini'),
        assertion: notIsSqlAssertion,
        test: {} as AtomicTestCase,
        providerResponse: { output },
      });
      expect(result).toMatchObject({
        pass: false,
        reason: 'The output SQL statement is valid',
      });
    });

    it('should pass when the is-sql assertion passes given MySQL Database syntax', async () => {
      const output = 'SELECT id, name FROM users';

      const result: GradingResult = await runAssertion({
        prompt: 'Some prompt',
        provider: new OpenAiChatCompletionProvider('gpt-4o-mini'),
        assertion: isSqlAssertionWithDatabase,
        test: {} as AtomicTestCase,
        providerResponse: { output },
      });
      expect(result).toMatchObject({
        pass: true,
        reason: 'Assertion passed',
      });
    });

    it('should fail when the is-sql assertion fails given MySQL Database syntax', async () => {
      const output = `SELECT first_name, last_name FROM employees WHERE first_name ILIKE 'john%'`;

      const result: GradingResult = await runAssertion({
        prompt: 'Some prompt',
        provider: new OpenAiChatCompletionProvider('gpt-4o-mini'),
        assertion: isSqlAssertionWithDatabase,
        test: {} as AtomicTestCase,
        providerResponse: { output },
      });
      expect(result).toMatchObject({
        pass: false,
        reason: 'SQL statement does not conform to the provided MySQL database syntax.',
      });
    });

    it('should pass when the is-sql assertion passes given MySQL Database syntax and allowedTables', async () => {
      const output = 'SELECT * FROM departments WHERE department_id = 1';

      const result: GradingResult = await runAssertion({
        prompt: 'Some prompt',
        provider: new OpenAiChatCompletionProvider('gpt-4o-mini'),
        assertion: isSqlAssertionWithDatabaseAndWhiteTableList,
        test: {} as AtomicTestCase,
        providerResponse: { output },
      });
      expect(result).toMatchObject({
        pass: true,
        reason: 'Assertion passed',
      });
    });

    it('should fail when the is-sql assertion fails given MySQL Database syntax and allowedTables', async () => {
      const output = 'UPDATE employees SET department_id = 2 WHERE employee_id = 1';

      const result: GradingResult = await runAssertion({
        prompt: 'Some prompt',
        provider: new OpenAiChatCompletionProvider('gpt-4o-mini'),
        assertion: isSqlAssertionWithDatabaseAndWhiteTableList,
        test: {} as AtomicTestCase,
        providerResponse: { output },
      });
      expect(result).toMatchObject({
        pass: false,
        reason: `SQL validation failed: authority = 'update::null::employees' is required in table whiteList to execute SQL = 'UPDATE employees SET department_id = 2 WHERE employee_id = 1'.`,
      });
    });

    it('should pass when the is-sql assertion passes given MySQL Database syntax and allowedColumns', async () => {
      const output = 'SELECT name FROM t';

      const result: GradingResult = await runAssertion({
        prompt: 'Some prompt',
        provider: new OpenAiChatCompletionProvider('gpt-4o-mini'),
        assertion: isSqlAssertionWithDatabaseAndWhiteColumnList,
        test: {} as AtomicTestCase,
        providerResponse: { output },
      });
      expect(result).toMatchObject({
        pass: true,
        reason: 'Assertion passed',
      });
    });

    it('should fail when the is-sql assertion fails given MySQL Database syntax and allowedColumns', async () => {
      const output = 'SELECT age FROM a WHERE id = 1';

      const result: GradingResult = await runAssertion({
        prompt: 'Some prompt',
        provider: new OpenAiChatCompletionProvider('gpt-4o-mini'),
        assertion: isSqlAssertionWithDatabaseAndWhiteColumnList,
        test: {} as AtomicTestCase,
        providerResponse: { output },
      });
      expect(result).toMatchObject({
        pass: false,
        reason: `SQL validation failed: authority = 'select::null::age' is required in column whiteList to execute SQL = 'SELECT age FROM a WHERE id = 1'.`,
      });
    });

    it('should pass when the is-sql assertion passes given MySQL Database syntax, allowedTables, and allowedColumns', async () => {
      const output = 'SELECT name FROM departments';

      const result: GradingResult = await runAssertion({
        prompt: 'Some prompt',
        provider: new OpenAiChatCompletionProvider('gpt-4o-mini'),
        assertion: isSqlAssertionWithDatabaseAndBothList,
        test: {} as AtomicTestCase,
        providerResponse: { output },
      });
      expect(result).toMatchObject({
        pass: true,
        reason: 'Assertion passed',
      });
    });

    it('should fail when the is-sql assertion fails given MySQL Database syntax, allowedTables, and allowedColumns', async () => {
      const output = `INSERT INTO departments (name) VALUES ('HR')`;

      const result: GradingResult = await runAssertion({
        prompt: 'Some prompt',
        provider: new OpenAiChatCompletionProvider('gpt-4o-mini'),
        assertion: isSqlAssertionWithDatabaseAndBothList,
        test: {} as AtomicTestCase,
        providerResponse: { output },
      });
      expect(result).toMatchObject({
        pass: false,
        reason: `SQL validation failed: authority = 'insert::departments::name' is required in column whiteList to execute SQL = 'INSERT INTO departments (name) VALUES ('HR')'.`,
      });
    });

    it('should fail when the is-sql assertion fails due to missing table authority for MySQL Database syntax', async () => {
      const output = 'UPDATE a SET id = 1';

      const result: GradingResult = await runAssertion({
        prompt: 'Some prompt',
        provider: new OpenAiChatCompletionProvider('gpt-4o-mini'),
        assertion: isSqlAssertionWithDatabaseAndBothList,
        test: {} as AtomicTestCase,
        providerResponse: { output },
      });
      expect(result).toMatchObject({
        pass: false,
        reason: `SQL validation failed: authority = 'update::null::a' is required in table whiteList to execute SQL = 'UPDATE a SET id = 1'.`,
      });
    });

    it('should fail when the is-sql assertion fails due to missing authorities for DELETE statement in MySQL Database syntax', async () => {
      const output = `DELETE FROM employees;`;

      const result: GradingResult = await runAssertion({
        prompt: 'Some prompt',
        provider: new OpenAiChatCompletionProvider('gpt-4o-mini'),
        assertion: isSqlAssertionWithDatabaseAndBothList,
        test: {} as AtomicTestCase,
        providerResponse: { output },
      });
      expect(result).toMatchObject({
        pass: false,
        reason: `SQL validation failed: authority = 'delete::null::employees' is required in table whiteList to execute SQL = 'DELETE FROM employees;'. SQL validation failed: authority = 'delete::employees::(.*)' is required in column whiteList to execute SQL = 'DELETE FROM employees;'.`,
      });
    });

    it('should pass when the contains-sql assertion passes', async () => {
      const output = 'wassup\n```\nSELECT id, name FROM users\n```\nyolo';

      const result: GradingResult = await runAssertion({
        prompt: 'Some prompt',
        provider: new OpenAiChatCompletionProvider('gpt-4o-mini'),
        assertion: {
          type: 'contains-sql',
        },
        test: {} as AtomicTestCase,
        providerResponse: { output },
      });
      expect(result).toMatchObject({
        pass: true,
        reason: 'Assertion passed',
      });
    });

    it('should pass when the contains-sql assertion sees `sql` in code block', async () => {
      const output = 'wassup\n```sql\nSELECT id, name FROM users\n```\nyolo';

      const result: GradingResult = await runAssertion({
        prompt: 'Some prompt',
        provider: new OpenAiChatCompletionProvider('gpt-4o-mini'),
        assertion: {
          type: 'contains-sql',
        },
        test: {} as AtomicTestCase,
        providerResponse: { output },
      });
      expect(result).toMatchObject({
        pass: true,
        reason: 'Assertion passed',
      });
    });

    it('should pass when the contains-sql assertion sees sql without code block', async () => {
      const output = 'SELECT id, name FROM users';

      const result: GradingResult = await runAssertion({
        prompt: 'Some prompt',
        provider: new OpenAiChatCompletionProvider('gpt-4o-mini'),
        assertion: {
          type: 'contains-sql',
        },
        test: {} as AtomicTestCase,
        providerResponse: { output },
      });
      expect(result).toMatchObject({
        pass: true,
        reason: 'Assertion passed',
      });
    });

    it('should fail when the contains-sql does not contain code block', async () => {
      const output = 'nothin';

      const result: GradingResult = await runAssertion({
        prompt: 'Some prompt',
        provider: new OpenAiChatCompletionProvider('gpt-4o-mini'),
        assertion: {
          type: 'contains-sql',
        },
        test: {} as AtomicTestCase,
        providerResponse: { output },
      });
      expect(result).toMatchObject({
        pass: false,
      });
    });

    it('should fail when the contains-sql does not contain sql in code block', async () => {
      const output = '```python\nprint("Hello, World!")\n```';

      const result: GradingResult = await runAssertion({
        prompt: 'Some prompt',
        provider: new OpenAiChatCompletionProvider('gpt-4o-mini'),
        assertion: {
          type: 'contains-sql',
        },
        test: {} as AtomicTestCase,
        providerResponse: { output },
      });
      expect(result).toMatchObject({
        pass: false,
      });
    });
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

  it('should pass when the javascript assertion passes', async () => {
    const output = 'Expected output';

    const result: GradingResult = await runAssertion({
      prompt: 'Some prompt',
      provider: new OpenAiChatCompletionProvider('gpt-4o-mini'),
      assertion: javascriptStringAssertion,
      test: {} as AtomicTestCase,
      providerResponse: { output },
    });
    expect(result).toMatchObject({
      pass: true,
      reason: 'Assertion passed',
    });
  });

  it('should pass a score through when the javascript returns a number', async () => {
    const output = 'Expected output';

    const result: GradingResult = await runAssertion({
      prompt: 'Some prompt',
      provider: new OpenAiChatCompletionProvider('gpt-4o-mini'),
      assertion: javascriptStringAssertionWithNumber,
      test: {} as AtomicTestCase,
      providerResponse: { output },
    });
    expect(result).toMatchObject({
      pass: true,
      score: output.length * 10,
      reason: 'Assertion passed',
    });
  });

  it('should pass when javascript returns an output string that is smaller than the maximum size threshold', async () => {
    const output = 'Expected output';

    const result: GradingResult = await runAssertion({
      prompt: 'Some prompt',
      provider: new OpenAiChatCompletionProvider('gpt-4o-mini'),
      assertion: javascriptBooleanAssertionWithConfig,
      test: {} as AtomicTestCase,
      providerResponse: { output },
    });
    expect(result).toMatchObject({
      pass: true,
      score: 1.0,
      reason: 'Assertion passed',
    });
  });

  it('should disregard invalid inputs for assert index', async () => {
    const output = 'Expected output';

    const result: GradingResult = await runAssertion({
      prompt: 'Some prompt',
      provider: new OpenAiChatCompletionProvider('gpt-4o-mini'),
      assertion: javascriptBooleanAssertionWithConfig,
      test: {
        assert: [
          {
            type: 'javascript',
            value: 'output.length <= context.config.maximumOutputSize',
            config: {
              maximumOutputSize: 1,
            },
          } as Assertion,
        ],
      } as AtomicTestCase,
      providerResponse: { output },
      assertIndex: 45,
    });
    expect(result).toMatchObject({
      pass: true,
      score: 1.0,
      reason: 'Assertion passed',
    });
  });

  it('should fail when javascript returns an output string that is larger than the maximum size threshold', async () => {
    const output = 'Expected output with some extra characters';

    const result: GradingResult = await runAssertion({
      prompt: 'Some prompt',
      provider: new OpenAiChatCompletionProvider('gpt-4o-mini'),
      assertion: javascriptBooleanAssertionWithConfig,
      test: {} as AtomicTestCase,
      providerResponse: { output },
    });
    expect(result).toMatchObject({
      pass: false,
      score: 0,
      reason: expect.stringContaining('Custom function returned false'),
    });
  });

  it('should pass when javascript returns a number above threshold', async () => {
    const output = 'Expected output';

    const result: GradingResult = await runAssertion({
      prompt: 'Some prompt',
      provider: new OpenAiChatCompletionProvider('gpt-4o-mini'),
      assertion: javascriptStringAssertionWithNumberAndThreshold,
      test: {} as AtomicTestCase,
      providerResponse: { output },
    });
    expect(result).toMatchObject({
      pass: true,
      score: output.length * 10,
      reason: 'Assertion passed',
    });
  });

  it('should fail when javascript returns a number below threshold', async () => {
    const output = '';

    const result: GradingResult = await runAssertion({
      prompt: 'Some prompt',
      provider: new OpenAiChatCompletionProvider('gpt-4o-mini'),
      assertion: javascriptStringAssertionWithNumberAndThreshold,
      test: {} as AtomicTestCase,
      providerResponse: { output },
    });
    expect(result).toMatchObject({
      pass: false,
      score: output.length * 10,
      reason: expect.stringContaining('Custom function returned false'),
    });
  });

  it('should set score when javascript returns false', async () => {
    const output = 'Test output';

    const assertion: Assertion = {
      type: 'javascript',
      value: 'output.length < 1',
    };

    const result: GradingResult = await runAssertion({
      prompt: 'Some prompt',
      provider: new OpenAiChatCompletionProvider('gpt-4o-mini'),
      assertion,
      test: {} as AtomicTestCase,
      providerResponse: { output },
    });
    expect(result).toMatchObject({
      pass: false,
      score: 0,
      reason: expect.stringContaining('Custom function returned false'),
    });
  });

  it('should fail when the javascript assertion fails', async () => {
    const output = 'Different output';

    const result: GradingResult = await runAssertion({
      prompt: 'Some prompt',
      provider: new OpenAiChatCompletionProvider('gpt-4o-mini'),
      assertion: javascriptStringAssertion,
      test: {} as AtomicTestCase,
      providerResponse: { output },
    });
    expect(result).toMatchObject({
      pass: false,
      reason: 'Custom function returned false\noutput === "Expected output"',
    });
  });

  it('should pass when assertion passes - with vars', async () => {
    const output = 'Expected output';

    const assertion: Assertion = {
      type: 'equals',
      value: '{{ foo }}',
    };
    const result: GradingResult = await runAssertion({
      prompt: 'variable value',
      provider: new OpenAiChatCompletionProvider('gpt-4o-mini'),
      assertion,
      test: { vars: { foo: 'Expected output' } } as AtomicTestCase,
      providerResponse: { output },
    });
    expect(result).toMatchObject({
      pass: true,
      reason: 'Assertion passed',
    });
  });

  const notContainsAssertion: Assertion = {
    type: 'not-contains',
    value: 'Unexpected output',
  };

  it('should pass when the not-contains assertion passes', async () => {
    const output = 'Expected output';

    const result: GradingResult = await runAssertion({
      prompt: 'Some prompt',
      assertion: notContainsAssertion,
      test: {} as AtomicTestCase,
      providerResponse: { output },
      provider: new OpenAiChatCompletionProvider('gpt-4o-mini'),
    });
    expect(result).toMatchObject({
      pass: true,
      reason: 'Assertion passed',
    });
  });

  it('should fail when the not-contains assertion fails', async () => {
    const output = 'Unexpected output';

    const result: GradingResult = await runAssertion({
      prompt: 'Some prompt',
      assertion: notContainsAssertion,
      test: {} as AtomicTestCase,
      providerResponse: { output },
      provider: new OpenAiChatCompletionProvider('gpt-4o-mini'),
    });
    expect(result).toMatchObject({
      pass: false,
      reason: 'Expected output to not contain "Unexpected output"',
    });
  });

  // Test for icontains assertion
  const containsLowerAssertion: Assertion = {
    type: 'icontains',
    value: 'expected output',
  };

  it('should pass when the icontains assertion passes', async () => {
    const output = 'EXPECTED OUTPUT';

    const result: GradingResult = await runAssertion({
      prompt: 'Some prompt',
      assertion: containsLowerAssertion,
      test: {} as AtomicTestCase,
      providerResponse: { output },
      provider: new OpenAiChatCompletionProvider('gpt-4o-mini'),
    });
    expect(result).toMatchObject({
      pass: true,
      reason: 'Assertion passed',
    });
  });

  it('should fail when the icontains assertion fails', async () => {
    const output = 'Different output';

    const result: GradingResult = await runAssertion({
      prompt: 'Some prompt',
      assertion: containsLowerAssertion,
      test: {} as AtomicTestCase,
      providerResponse: { output },
      provider: new OpenAiChatCompletionProvider('gpt-4o-mini'),
    });
    expect(result).toMatchObject({
      pass: false,
      reason: 'Expected output to contain "expected output"',
    });
  });

  // Test for not-icontains assertion
  const notContainsLowerAssertion: Assertion = {
    type: 'not-icontains',
    value: 'unexpected output',
  };

  it('should pass when the not-icontains assertion passes', async () => {
    const output = 'Expected output';

    const result: GradingResult = await runAssertion({
      prompt: 'Some prompt',
      assertion: notContainsLowerAssertion,
      test: {} as AtomicTestCase,
      providerResponse: { output },
      provider: new OpenAiChatCompletionProvider('gpt-4o-mini'),
    });
    expect(result).toMatchObject({
      pass: true,
      reason: 'Assertion passed',
    });
  });

  it('should fail when the not-icontains assertion fails', async () => {
    const output = 'UNEXPECTED OUTPUT';

    const result: GradingResult = await runAssertion({
      prompt: 'Some prompt',
      assertion: notContainsLowerAssertion,
      test: {} as AtomicTestCase,
      providerResponse: { output },
      provider: new OpenAiChatCompletionProvider('gpt-4o-mini'),
    });
    expect(result).toMatchObject({
      pass: false,
      reason: 'Expected output to not contain "unexpected output"',
    });
  });

  // Test for contains-any assertion
  const containsAnyAssertion: Assertion = {
    type: 'contains-any',
    value: ['option1', 'option2', 'option3'],
  };

  it('should pass when the contains-any assertion passes', async () => {
    const output = 'This output contains option1';

    const result: GradingResult = await runAssertion({
      prompt: 'Some prompt',
      assertion: containsAnyAssertion,
      test: {} as AtomicTestCase,
      providerResponse: { output },
      provider: new OpenAiChatCompletionProvider('gpt-4o-mini'),
    });
    expect(result).toMatchObject({
      pass: true,
      reason: 'Assertion passed',
    });
  });

  it('should fail when the contains-any assertion fails', async () => {
    const output = 'This output does not contain any option';

    const result: GradingResult = await runAssertion({
      prompt: 'Some prompt',
      assertion: containsAnyAssertion,
      test: {} as AtomicTestCase,
      providerResponse: { output },
      provider: new OpenAiChatCompletionProvider('gpt-4o-mini'),
    });
    expect(result).toMatchObject({
      pass: false,
      reason: 'Expected output to contain one of "option1, option2, option3"',
    });
  });

  it('should pass when the icontains-any assertion passes', async () => {
    const output = 'This output contains OPTION1';

    const result: GradingResult = await runAssertion({
      prompt: 'Some prompt',
      assertion: {
        type: 'icontains-any',
        value: ['option1', 'option2', 'option3'],
      },
      test: {} as AtomicTestCase,
      providerResponse: { output },
      provider: new OpenAiChatCompletionProvider('gpt-4o-mini'),
    });
    expect(result).toMatchObject({
      pass: true,
      reason: 'Assertion passed',
    });
  });

  it('should fail when the icontains-any assertion fails', async () => {
    const output = 'This output does not contain any option';

    const result: GradingResult = await runAssertion({
      prompt: 'Some prompt',
      assertion: {
        type: 'icontains-any',
        value: ['option1', 'option2', 'option3'],
      },
      test: {} as AtomicTestCase,
      providerResponse: { output },
      provider: new OpenAiChatCompletionProvider('gpt-4o-mini'),
    });
    expect(result).toMatchObject({
      pass: false,
      reason: 'Expected output to contain one of "option1, option2, option3"',
    });
  });

  // Test for contains-all assertion
  const containsAllAssertion: Assertion = {
    type: 'contains-all',
    value: ['option1', 'option2', 'option3'],
  };

  it('should pass when the contains-all assertion passes', async () => {
    const output = 'This output contains option1, option2, and option3';

    const result: GradingResult = await runAssertion({
      prompt: 'Some prompt',
      assertion: containsAllAssertion,
      test: {} as AtomicTestCase,
      providerResponse: { output },
      provider: new OpenAiChatCompletionProvider('gpt-4o-mini'),
    });
    expect(result).toMatchObject({
      pass: true,
      reason: 'Assertion passed',
    });
  });

  it('should fail when the contains-all assertion fails', async () => {
    const output = 'This output contains only option1 and option2';

    const result: GradingResult = await runAssertion({
      prompt: 'Some prompt',
      assertion: containsAllAssertion,
      test: {} as AtomicTestCase,
      providerResponse: { output },
      provider: new OpenAiChatCompletionProvider('gpt-4o-mini'),
    });
    expect(result).toMatchObject({
      pass: false,
      reason: 'Expected output to contain all of [option1, option2, option3]. Missing: [option3]',
    });
  });

  it('should pass when the icontains-all assertion passes', async () => {
    const output = 'This output contains OPTION1, option2, and opTiOn3';

    const result: GradingResult = await runAssertion({
      prompt: 'Some prompt',
      assertion: {
        type: 'icontains-all',
        value: ['option1', 'option2', 'option3'],
      },
      test: {} as AtomicTestCase,
      providerResponse: { output },
      provider: new OpenAiChatCompletionProvider('gpt-4o-mini'),
    });
    expect(result).toMatchObject({
      pass: true,
      reason: 'Assertion passed',
    });
  });

  it('should fail when the icontains-all assertion fails', async () => {
    const output = 'This output contains OPTION1, option2, and opTiOn3';

    const result: GradingResult = await runAssertion({
      prompt: 'Some prompt',
      assertion: {
        type: 'icontains-all',
        value: ['option1', 'option2', 'option3', 'option4'],
      },
      test: {} as AtomicTestCase,
      providerResponse: { output },
      provider: new OpenAiChatCompletionProvider('gpt-4o-mini'),
    });
    expect(result).toMatchObject({
      pass: false,
      reason:
        'Expected output to contain all of [option1, option2, option3, option4]. Missing: [option4]',
    });
  });

  // Test for regex assertion
  const containsRegexAssertion: Assertion = {
    type: 'regex',
    value: '\\d{3}-\\d{2}-\\d{4}',
  };

  it('should pass when the regex assertion passes', async () => {
    const output = 'This output contains 123-45-6789';

    const result: GradingResult = await runAssertion({
      prompt: 'Some prompt',
      assertion: containsRegexAssertion,
      test: {} as AtomicTestCase,
      providerResponse: { output },
      provider: new OpenAiChatCompletionProvider('gpt-4o-mini'),
    });
    expect(result).toMatchObject({
      pass: true,
      reason: 'Assertion passed',
    });
  });

  it('should fail when the regex assertion fails', async () => {
    const output = 'This output does not contain the pattern';

    const result: GradingResult = await runAssertion({
      prompt: 'Some prompt',
      assertion: containsRegexAssertion,
      test: {} as AtomicTestCase,
      providerResponse: { output },
      provider: new OpenAiChatCompletionProvider('gpt-4o-mini'),
    });
    expect(result).toMatchObject({
      pass: false,
      reason: 'Expected output to match regex "\\d{3}-\\d{2}-\\d{4}"',
    });
  });

  // Test for not-regex assertion
  const notContainsRegexAssertion: Assertion = {
    type: 'not-regex',
    value: '\\d{3}-\\d{2}-\\d{4}',
  };

  it('should pass when the not-regex assertion passes', async () => {
    const output = 'This output does not contain the pattern';

    const result: GradingResult = await runAssertion({
      prompt: 'Some prompt',
      assertion: notContainsRegexAssertion,
      test: {} as AtomicTestCase,
      providerResponse: { output },
      provider: new OpenAiChatCompletionProvider('gpt-4o-mini'),
    });
    expect(result).toMatchObject({
      pass: true,
      reason: 'Assertion passed',
    });
  });

  it('should fail when the not-regex assertion fails', async () => {
    const output = 'This output contains 123-45-6789';

    const result: GradingResult = await runAssertion({
      prompt: 'Some prompt',
      assertion: notContainsRegexAssertion,
      test: {} as AtomicTestCase,
      providerResponse: { output },
      provider: new OpenAiChatCompletionProvider('gpt-4o-mini'),
    });
    expect(result).toMatchObject({
      pass: false,
      reason: 'Expected output to not match regex "\\d{3}-\\d{2}-\\d{4}"',
    });
  });

  // Tests for webhook assertion
  const webhookAssertion: Assertion = {
    type: 'webhook',
    value: 'https://example.com/webhook',
  };

  it('should pass when the webhook assertion passes', async () => {
    const output = 'Expected output';

    jest.mocked(fetchWithRetries).mockImplementation(() =>
      Promise.resolve(
        new Response(JSON.stringify({ pass: true }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      ),
    );

    const result: GradingResult = await runAssertion({
      prompt: 'Some prompt',
      assertion: webhookAssertion,
      test: {} as AtomicTestCase,
      providerResponse: { output },
      provider: new OpenAiChatCompletionProvider('gpt-4o-mini'),
    });
    expect(result).toMatchObject({
      pass: true,
      reason: 'Assertion passed',
    });
  });

  it('should fail when the webhook assertion fails', async () => {
    const output = 'Different output';
    jest.mocked(fetchWithRetries).mockImplementation(() =>
      Promise.resolve(
        new Response(JSON.stringify({ pass: false }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      ),
    );

    const result: GradingResult = await runAssertion({
      prompt: 'Some prompt',
      assertion: webhookAssertion,
      test: {} as AtomicTestCase,
      providerResponse: { output },
      provider: new OpenAiChatCompletionProvider('gpt-4o-mini'),
    });
    expect(result).toMatchObject({
      pass: false,
      reason: 'Webhook returned false',
    });
  });

  it('should fail when the webhook returns an error', async () => {
    const output = 'Expected output';

    jest.mocked(fetchWithRetries).mockImplementation(() =>
      Promise.resolve(
        new Response('', {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        }),
      ),
    );

    const result: GradingResult = await runAssertion({
      prompt: 'Some prompt',
      assertion: webhookAssertion,
      test: {} as AtomicTestCase,
      providerResponse: { output },
      provider: new OpenAiChatCompletionProvider('gpt-4o-mini'),
    });
    expect(result).toMatchObject({
      pass: false,
      reason: 'Webhook error: Webhook response status: 500',
    });
  });

  // Test for rouge-n assertion
  const rougeNAssertion: Assertion = {
    type: 'rouge-n',
    value: 'This is the expected output.',
    threshold: 0.75,
  };

  it('should pass when the rouge-n assertion passes', async () => {
    const output = 'This is the expected output.';

    const result: GradingResult = await runAssertion({
      prompt: 'Some prompt',
      assertion: rougeNAssertion,
      test: {} as AtomicTestCase,
      providerResponse: { output },
      provider: new OpenAiChatCompletionProvider('gpt-4o-mini'),
    });
    expect(result).toMatchObject({
      pass: true,
      reason: 'ROUGE-N score 1.00 is greater than or equal to threshold 0.75',
    });
  });

  it('should fail when the rouge-n assertion fails', async () => {
    const output = 'some different output';

    const result: GradingResult = await runAssertion({
      prompt: 'Some prompt',
      assertion: rougeNAssertion,
      test: {} as AtomicTestCase,
      providerResponse: { output },
      provider: new OpenAiChatCompletionProvider('gpt-4o-mini'),
    });
    expect(result).toMatchObject({
      pass: false,
      reason: 'ROUGE-N score 0.17 is less than threshold 0.75',
    });
  });

  // Test for starts-with assertion
  const startsWithAssertion: Assertion = {
    type: 'starts-with',
    value: 'Expected',
  };

  it('should pass when the starts-with assertion passes', async () => {
    const output = 'Expected output';

    const result: GradingResult = await runAssertion({
      prompt: 'Some prompt',
      assertion: startsWithAssertion,
      test: {} as AtomicTestCase,
      providerResponse: { output },
      provider: new OpenAiChatCompletionProvider('gpt-4o-mini'),
    });
    expect(result).toMatchObject({
      pass: true,
      reason: 'Assertion passed',
    });
  });

  it('should fail when the starts-with assertion fails', async () => {
    const output = 'Different output';

    const result: GradingResult = await runAssertion({
      prompt: 'Some prompt',
      assertion: startsWithAssertion,
      test: {} as AtomicTestCase,
      providerResponse: { output },
      provider: new OpenAiChatCompletionProvider('gpt-4o-mini'),
    });
    expect(result).toMatchObject({
      pass: false,
      reason: 'Expected output to start with "Expected"',
    });
  });

  it('should use the provider from the assertion if it exists', async () => {
    // Assertion grader passes
    const output = 'Expected output';
    const assertion: Assertion = {
      type: 'llm-rubric',
      value: 'Expected output',
      provider: Grader,
    };

    // Test grader fails
    const BogusGrader: ApiProvider = {
      id(): string {
        return 'BogusGrader';
      },
      async callApi(): Promise<ProviderResponse> {
        throw new Error('Should not be called');
      },
    };
    const test: AtomicTestCase = {
      assert: [assertion],
      options: {
        provider: BogusGrader,
      },
    };

    // Expect test to pass because assertion grader takes priority
    const result: GradingResult = await runAssertion({
      prompt: 'Some prompt',
      assertion,
      test,
      providerResponse: { output },
      provider: new OpenAiChatCompletionProvider('gpt-4o-mini'),
    });
    expect(result).toMatchObject({
      pass: true,
      reason: 'Test grading output',
    });
  });

  // Test for levenshtein assertion
  const levenshteinAssertion: Assertion = {
    type: 'levenshtein',
    value: 'Expected output',
    threshold: 5,
  };

  it('should pass when the levenshtein assertion passes', async () => {
    const output = 'Expected output';

    const result: GradingResult = await runAssertion({
      prompt: 'Some prompt',
      provider: new OpenAiChatCompletionProvider('gpt-4o-mini'),
      assertion: levenshteinAssertion,
      test: {} as AtomicTestCase,
      providerResponse: { output },
    });
    expect(result).toMatchObject({
      pass: true,
      reason: 'Assertion passed',
    });
  });

  it('should fail when the levenshtein assertion fails', async () => {
    const output = 'Different output';

    const result: GradingResult = await runAssertion({
      prompt: 'Some prompt',
      provider: new OpenAiChatCompletionProvider('gpt-4o-mini'),
      assertion: levenshteinAssertion,
      test: {} as AtomicTestCase,
      providerResponse: { output },
    });
    expect(result).toMatchObject({
      pass: false,
      reason: 'Levenshtein distance 8 is greater than threshold 5',
    });
  });

  describe('latency assertion', () => {
    it('should pass when the latency assertion passes', async () => {
      const output = 'Expected output';

      const provider = new OpenAiChatCompletionProvider('gpt-4o-mini');
      const providerResponse = { output };
      const result: GradingResult = await runAssertion({
        prompt: 'Some prompt',
        provider,
        assertion: {
          type: 'latency',
          threshold: 100,
        },
        latencyMs: 50,
        test: {} as AtomicTestCase,
        providerResponse,
      });
      expect(result).toMatchObject({
        pass: true,
        reason: 'Assertion passed',
      });
    });

    it('should fail when the latency assertion fails', async () => {
      const output = 'Expected output';

      const provider = new OpenAiChatCompletionProvider('gpt-4o-mini');
      const providerResponse = { output };
      const result: GradingResult = await runAssertion({
        prompt: 'Some prompt',
        provider,
        assertion: {
          type: 'latency',
          threshold: 100,
        },
        latencyMs: 1000,
        test: {} as AtomicTestCase,
        providerResponse,
      });
      expect(result).toMatchObject({
        pass: false,
        reason: 'Latency 1000ms is greater than threshold 100ms',
      });
    });

    it('should throw an error when grading result is missing latencyMs', async () => {
      const output = 'Expected output';

      await expect(
        runAssertion({
          prompt: 'Some prompt',
          provider: new OpenAiChatCompletionProvider('gpt-4o-mini'),
          assertion: {
            type: 'latency',
            threshold: 100,
          },
          test: {} as AtomicTestCase,
          providerResponse: { output },
        }),
      ).rejects.toThrow(
        'Latency assertion does not support cached results. Rerun the eval with --no-cache',
      );
    });

    it('should pass when the latency is 0ms', async () => {
      const output = 'Expected output';

      const provider = new OpenAiChatCompletionProvider('gpt-4o-mini');
      const providerResponse = { output };
      const result: GradingResult = await runAssertion({
        prompt: 'Some prompt',
        provider,
        assertion: {
          type: 'latency',
          threshold: 100,
        },
        latencyMs: 0,
        test: {} as AtomicTestCase,
        providerResponse,
      });
      expect(result).toMatchObject({
        pass: true,
        reason: 'Assertion passed',
      });
    });

    it('should throw an error when threshold is not provided', async () => {
      const output = 'Expected output';

      await expect(
        runAssertion({
          prompt: 'Some prompt',
          provider: new OpenAiChatCompletionProvider('gpt-4o-mini'),
          assertion: {
            type: 'latency',
          },
          latencyMs: 50,
          test: {} as AtomicTestCase,
          providerResponse: { output },
        }),
      ).rejects.toThrow('Latency assertion must have a threshold in milliseconds');
    });

    it('should handle latency equal to threshold', async () => {
      const output = 'Expected output';

      const provider = new OpenAiChatCompletionProvider('gpt-4o-mini');
      const providerResponse = { output };
      const result: GradingResult = await runAssertion({
        prompt: 'Some prompt',
        provider,
        assertion: {
          type: 'latency',
          threshold: 100,
        },
        latencyMs: 100,
        test: {} as AtomicTestCase,
        providerResponse,
      });
      expect(result).toMatchObject({
        pass: true,
        reason: 'Assertion passed',
      });
    });
  });

  describe('perplexity assertion', () => {
    it('should pass when the perplexity assertion passes', async () => {
      const logProbs = [-0.2, -0.4, -0.1, -0.3]; // Dummy logProbs for testing
      const provider = {
        callApi: jest.fn().mockResolvedValue({ logProbs }),
      } as unknown as ApiProvider;
      const providerResponse = { output: 'Some output', logProbs };
      const result: GradingResult = await runAssertion({
        prompt: 'Some prompt',
        provider,
        assertion: {
          type: 'perplexity',
          threshold: 2,
        },
        test: {} as AtomicTestCase,
        providerResponse,
      });
      expect(result).toMatchObject({
        pass: true,
        reason: 'Assertion passed',
      });
    });

    it('should fail when the perplexity assertion fails', async () => {
      const logProbs = [-0.2, -0.4, -0.1, -0.3]; // Dummy logProbs for testing
      const provider = {
        callApi: jest.fn().mockResolvedValue({ logProbs }),
      } as unknown as ApiProvider;
      const providerResponse = { output: 'Some output', logProbs };
      const result: GradingResult = await runAssertion({
        prompt: 'Some prompt',
        provider,
        assertion: {
          type: 'perplexity',
          threshold: 0.2,
        },
        test: {} as AtomicTestCase,
        providerResponse,
      });
      expect(result).toMatchObject({
        pass: false,
        reason: 'Perplexity 1.28 is greater than threshold 0.2',
      });
    });
  });

  describe('perplexity-score assertion', () => {
    it('should pass when the perplexity-score assertion passes', async () => {
      const logProbs = [-0.2, -0.4, -0.1, -0.3];
      const provider = {
        callApi: jest.fn().mockResolvedValue({ logProbs }),
      } as unknown as ApiProvider;
      const providerResponse = { output: 'Some output', logProbs };
      const result: GradingResult = await runAssertion({
        prompt: 'Some prompt',
        provider,
        assertion: {
          type: 'perplexity-score',
          threshold: 0.25,
        },
        test: {} as AtomicTestCase,
        providerResponse,
      });
      expect(result).toMatchObject({
        pass: true,
        reason: 'Assertion passed',
      });
    });

    it('should fail when the perplexity-score assertion fails', async () => {
      const logProbs = [-0.2, -0.4, -0.1, -0.3];
      const provider = {
        callApi: jest.fn().mockResolvedValue({ logProbs }),
      } as unknown as ApiProvider;
      const providerResponse = { output: 'Some output', logProbs };
      const result: GradingResult = await runAssertion({
        prompt: 'Some prompt',
        provider,
        assertion: {
          type: 'perplexity-score',
          threshold: 0.5,
        },
        test: {} as AtomicTestCase,
        providerResponse,
      });
      expect(result).toMatchObject({
        pass: false,
        reason: 'Perplexity score 0.44 is less than threshold 0.5',
      });
    });
  });

  describe('cost assertion', () => {
    it('should pass when the cost is below the threshold', async () => {
      const cost = 0.0005;
      const provider = {
        callApi: jest.fn().mockResolvedValue({ cost }),
      } as unknown as ApiProvider;
      const providerResponse = { output: 'Some output', cost };
      const result: GradingResult = await runAssertion({
        prompt: 'Some prompt',
        provider,
        assertion: {
          type: 'cost',
          threshold: 0.001,
        },
        test: {} as AtomicTestCase,
        providerResponse,
      });
      expect(result).toMatchObject({
        pass: true,
        reason: 'Assertion passed',
      });
    });

    it('should fail when the cost exceeds the threshold', async () => {
      const cost = 0.002;
      const provider = {
        callApi: jest.fn().mockResolvedValue({ cost }),
      } as unknown as ApiProvider;
      const providerResponse = { output: 'Some output', cost };
      const result: GradingResult = await runAssertion({
        prompt: 'Some prompt',
        provider,
        assertion: {
          type: 'cost',
          threshold: 0.001,
        },
        test: {} as AtomicTestCase,
        providerResponse,
      });
      expect(result).toMatchObject({
        pass: false,
        reason: 'Cost 0.0020 is greater than threshold 0.001',
      });
    });
  });

  describe('Similarity assertion', () => {
    beforeEach(() => {
      jest.spyOn(DefaultEmbeddingProvider, 'callEmbeddingApi').mockImplementation((text) => {
        if (text === 'Test output' || text.startsWith('Similar output')) {
          return Promise.resolve({
            embedding: [1, 0, 0],
            tokenUsage: { total: 5, prompt: 2, completion: 3 },
          });
        } else if (text.startsWith('Different output')) {
          return Promise.resolve({
            embedding: [0, 1, 0],
            tokenUsage: { total: 5, prompt: 2, completion: 3 },
          });
        }
        return Promise.reject(new Error('Unexpected input'));
      });
    });

    afterEach(() => {
      jest.restoreAllMocks();
    });

    it('should pass for a similar assertion with a string value', async () => {
      const output = 'Test output';

      const result: GradingResult = await runAssertion({
        prompt: 'Some prompt',
        assertion: {
          type: 'similar',
          value: 'Similar output',
        },
        test: {} as AtomicTestCase,
        providerResponse: { output },
      });

      expect(result).toMatchObject({
        pass: true,
        reason: 'Similarity 1.00 is greater than threshold 0.75',
      });
    });

    it('should fail for a similar assertion with a string value', async () => {
      const output = 'Test output';

      const result: GradingResult = await runAssertion({
        prompt: 'Some prompt',
        assertion: {
          type: 'similar',
          value: 'Different output',
        },
        test: {} as AtomicTestCase,
        providerResponse: { output },
      });

      expect(result).toMatchObject({
        pass: false,
        reason: 'Similarity 0.00 is less than threshold 0.75',
      });
    });

    it('should pass for a similar assertion with an array of string values', async () => {
      const output = 'Test output';

      const result: GradingResult = await runAssertion({
        prompt: 'Some prompt',
        assertion: {
          type: 'similar',
          value: ['Similar output 1', 'Different output 1'],
        },
        test: {} as AtomicTestCase,
        providerResponse: { output },
      });

      expect(result).toMatchObject({
        pass: true,
        reason: 'Similarity 1.00 is greater than threshold 0.75',
      });
    });

    it('should fail for a similar assertion with an array of string values', async () => {
      const output = 'Test output';

      const result: GradingResult = await runAssertion({
        prompt: 'Some prompt',
        assertion: {
          type: 'similar',
          value: ['Different output 1', 'Different output 2'],
        },
        test: {} as AtomicTestCase,
        providerResponse: { output },
      });
      expect(result).toMatchObject({
        pass: false,
        reason: 'None of the provided values met the similarity threshold',
      });
    });
  });

  describe('is-xml', () => {
    const provider = {
      callApi: jest.fn().mockResolvedValue({ cost: 0.001 }),
    } as unknown as ApiProvider;

    it('should pass when the output is valid XML', async () => {
      const output = '<root><child>Content</child></root>';
      const assertion: Assertion = { type: 'is-xml' };

      const result = await runAssertion({
        prompt: 'Generate XML',
        provider,
        assertion,
        test: {} as AtomicTestCase,
        providerResponse: { output },
      });

      expect(result).toEqual({
        pass: true,
        score: 1,
        reason: 'Assertion passed',
        assertion,
      });
    });

    it('should fail when the output is not valid XML', async () => {
      const output = '<root><child>Content</child></root';
      const assertion: Assertion = { type: 'is-xml' };

      const result = await runAssertion({
        prompt: 'Generate XML',
        provider,
        assertion,
        test: {} as AtomicTestCase,
        providerResponse: { output },
      });

      expect(result).toMatchObject({
        pass: false,
        score: 0,
        reason: expect.stringMatching(/XML parsing failed/),
        assertion,
      });
    });

    it('should pass when required elements are present', async () => {
      const output =
        '<analysis><classification>T-shirt</classification><color>Red</color></analysis>';
      const assertion: Assertion = {
        type: 'is-xml',
        value: 'analysis.classification,analysis.color',
      };

      const result = await runAssertion({
        prompt: 'Generate XML',
        provider,
        assertion,
        test: {} as AtomicTestCase,
        providerResponse: { output },
      });

      expect(result).toEqual({
        pass: true,
        score: 1,
        reason: 'Assertion passed',
        assertion,
      });
    });

    it('should fail when required elements are missing', async () => {
      const output = '<analysis><classification>T-shirt</classification></analysis>';
      const assertion: Assertion = {
        type: 'is-xml',
        value: 'analysis.classification,analysis.color',
      };

      const result = await runAssertion({
        prompt: 'Generate XML',
        provider,
        assertion,
        test: {} as AtomicTestCase,
        providerResponse: { output },
      });

      expect(result).toEqual({
        pass: false,
        score: 0,
        reason: 'XML is missing required elements: analysis.color',
        assertion,
      });
    });

    it('should pass when nested elements are present', async () => {
      const output =
        '<root><parent><child><grandchild>Content</grandchild></child></parent></root>';
      const assertion: Assertion = {
        type: 'is-xml',
        value: 'root.parent.child.grandchild',
      };

      const result = await runAssertion({
        prompt: 'Generate XML',
        provider,
        assertion,
        test: {} as AtomicTestCase,
        providerResponse: { output },
      });

      expect(result).toEqual({
        pass: true,
        score: 1,
        reason: 'Assertion passed',
        assertion,
      });
    });

    it('should handle inverse assertion correctly', async () => {
      const output = 'This is not XML';
      const assertion: Assertion = { type: 'not-is-xml' };

      const result = await runAssertion({
        prompt: 'Generate non-XML',
        provider,
        assertion,
        test: {} as AtomicTestCase,
        providerResponse: { output },
      });

      expect(result).toEqual({
        pass: true,
        score: 1,
        reason: 'Assertion passed',
        assertion,
      });
    });

    it('should pass when required elements are specified as an array', async () => {
      const output = '<root><element1>Content1</element1><element2>Content2</element2></root>';
      const assertion: Assertion = {
        type: 'is-xml',
        value: ['root.element1', 'root.element2'],
      };

      const result = await runAssertion({
        prompt: 'Generate XML',
        provider,
        assertion,
        test: {} as AtomicTestCase,
        providerResponse: { output },
      });

      expect(result).toEqual({
        pass: true,
        score: 1,
        reason: 'Assertion passed',
        assertion,
      });
    });

    it('should pass when required elements are specified as an object', async () => {
      const output = '<root><element1>Content1</element1><element2>Content2</element2></root>';
      const assertion: Assertion = {
        type: 'contains-xml',
        value: {
          requiredElements: ['root.element1', 'root.element2'],
        },
      };

      const result = await runAssertion({
        prompt: 'Generate XML',
        provider,
        assertion,
        test: {} as AtomicTestCase,
        providerResponse: { output },
      });

      expect(result).toEqual({
        pass: true,
        score: 1,
        reason: 'Assertion passed',
        assertion,
      });
    });

    it('should throw an error when xml assertion value is invalid', async () => {
      const output = '<root><element1>Content1</element1><element2>Content2</element2></root>';
      const assertion: Assertion = {
        type: 'is-xml',
        value: { invalidKey: ['root.element1', 'root.element2'] },
      };

      await expect(
        runAssertion({
          prompt: 'Generate XML',
          provider,
          assertion,
          test: {} as AtomicTestCase,
          providerResponse: { output },
        }),
      ).rejects.toThrow('xml assertion must contain a string, array value, or no value');
    });

    it('should handle multiple XML blocks in contains-xml assertion', async () => {
      const output = 'Some text <xml1>content1</xml1> more text <xml2>content2</xml2>';
      const assertion: Assertion = {
        type: 'contains-xml',
        value: ['xml1', 'xml2'],
      };

      const result = await runAssertion({
        prompt: 'Generate text with multiple XML blocks',
        provider,
        assertion,
        test: {} as AtomicTestCase,
        providerResponse: { output },
      });

      expect(result).toEqual({
        pass: true,
        score: 1,
        reason: 'Assertion passed',
        assertion,
      });
    });
  });

  describe('contains-xml', () => {
    const provider = {
      callApi: jest.fn().mockResolvedValue({ cost: 0.001 }),
    } as unknown as ApiProvider;
    it('should pass when the output contains valid XML', async () => {
      const output = 'Some text before <root><child>Content</child></root> and after';
      const assertion: Assertion = { type: 'contains-xml' };

      const result = await runAssertion({
        prompt: 'Generate text with XML',
        provider,
        assertion,
        test: {} as AtomicTestCase,
        providerResponse: { output },
      });

      expect(result).toEqual({
        pass: true,
        score: 1,
        reason: 'Assertion passed',
        assertion,
      });
    });

    it('should fail when the output does not contain valid XML', async () => {
      const output = 'This is just plain text without any XML';
      const assertion: Assertion = { type: 'contains-xml' };

      const result = await runAssertion({
        prompt: 'Generate text without XML',
        provider,
        assertion,
        test: {} as AtomicTestCase,
        providerResponse: { output },
      });

      expect(result).toEqual({
        pass: false,
        score: 0,
        reason: 'No XML content found in the output',
        assertion,
      });
    });

    it('should pass when required elements are present in the XML', async () => {
      const output =
        'Before <analysis><classification>T-shirt</classification><color>Red</color></analysis> After';
      const assertion: Assertion = {
        type: 'contains-xml',
        value: 'analysis.classification,analysis.color',
      };

      const result = await runAssertion({
        prompt: 'Generate text with specific XML',
        provider,
        assertion,
        test: {} as AtomicTestCase,
        providerResponse: { output },
      });

      expect(result).toEqual({
        pass: true,
        score: 1,
        reason: 'Assertion passed',
        assertion,
      });
    });

    it('should fail when required elements are missing in the XML', async () => {
      const output = 'Before <analysis><classification>T-shirt</classification></analysis> After';
      const assertion: Assertion = {
        type: 'contains-xml',
        value: 'analysis.classification,analysis.color',
      };

      const result = await runAssertion({
        prompt: 'Generate text with specific XML',
        provider,
        assertion,
        test: {} as AtomicTestCase,
        providerResponse: { output },
      });

      expect(result).toEqual({
        pass: false,
        score: 0,
        reason: 'No valid XML content found matching the requirements',
        assertion,
      });
    });

    it('should pass when nested elements are present in the XML', async () => {
      const output =
        'Start <root><parent><child><grandchild>Content</grandchild></child></parent></root> End';
      const assertion: Assertion = {
        type: 'contains-xml',
        value: 'root.parent.child.grandchild',
      };

      const result = await runAssertion({
        prompt: 'Generate text with nested XML',
        provider,
        assertion,
        test: {} as AtomicTestCase,
        providerResponse: { output },
      });

      expect(result).toEqual({
        pass: true,
        score: 1,
        reason: 'Assertion passed',
        assertion,
      });
    });

    it('should handle inverse assertion correctly', async () => {
      const output = 'This is just plain text without any XML';
      const assertion: Assertion = { type: 'not-contains-xml' };

      const result = await runAssertion({
        prompt: 'Generate text without XML',
        provider,
        assertion,
        test: {} as AtomicTestCase,
        providerResponse: { output },
      });

      expect(result).toEqual({
        pass: true,
        score: 1,
        reason: 'Assertion passed',
        assertion,
      });
    });

    it('should fail inverse assertion when XML is present', async () => {
      const output = 'Some text with <xml>content</xml> in it';
      const assertion: Assertion = { type: 'not-contains-xml' };

      const result = await runAssertion({
        prompt: 'Generate text without XML',
        provider,
        assertion,
        test: {} as AtomicTestCase,
        providerResponse: { output },
      });

      expect(result).toEqual({
        pass: false,
        score: 0,
        reason: 'XML is valid and contains all required elements',
        assertion,
      });
    });
  });

  describe('context-relevance assertion', () => {
    it('should pass when all required vars are present', async () => {
      const assertion: Assertion = {
        type: 'context-relevance',
        threshold: 0.7,
      };
      const test: AtomicTestCase = {
        vars: {
          query: 'What is the capital of France?',
          context: 'Paris is the capital of France.',
        },
      };

      const result = await runAssertion({
        assertion,
        test,
        providerResponse: { output: 'Some output' },
      });

      expect(result).toEqual({
        pass: true,
        score: 1,
        reason: 'Mocked reason',
        assertion,
      });
    });

    it('should throw an error when vars object is missing', async () => {
      const assertion: Assertion = {
        type: 'context-relevance',
        threshold: 0.7,
      };
      const test: AtomicTestCase = {};

      await expect(
        runAssertion({
          assertion,
          test,
          providerResponse: { output: 'Some output' },
        }),
      ).rejects.toThrow('context-relevance assertion type must have a vars object');
    });

    it('should throw an error when query var is missing', async () => {
      const assertion: Assertion = {
        type: 'context-relevance',
        threshold: 0.7,
      };
      const test: AtomicTestCase = {
        vars: {
          context: 'Paris is the capital of France.',
        },
      };

      await expect(
        runAssertion({
          assertion,
          test,
          providerResponse: { output: 'Some output' },
        }),
      ).rejects.toThrow('context-relevance assertion type must have a query var');
    });

    it('should throw an error when context var is missing', async () => {
      const assertion: Assertion = {
        type: 'context-relevance',
        threshold: 0.7,
      };
      const test: AtomicTestCase = {
        vars: {
          query: 'What is the capital of France?',
        },
      };

      await expect(
        runAssertion({
          assertion,
          test,
          providerResponse: { output: 'Some output' },
        }),
      ).rejects.toThrow('context-relevance assertion type must have a context var');
    });
  });

  describe('context-faithfulness assertion', () => {
    it('should pass when all required vars are present', async () => {
      const assertion: Assertion = {
        type: 'context-faithfulness',
        threshold: 0.7,
      };
      const test: AtomicTestCase = {
        vars: {
          query: 'What is the capital of France?',
          context: 'Paris is the capital of France.',
        },
      };

      const result = await runAssertion({
        assertion,
        test,
        providerResponse: { output: 'The capital of France is Paris.' },
      });

      expect(result).toEqual({
        pass: true,
        score: 1,
        reason: 'Mocked reason',
        assertion,
      });
    });

    it('should throw an error when vars object is missing', async () => {
      const assertion: Assertion = {
        type: 'context-faithfulness',
        threshold: 0.7,
      };
      const test: AtomicTestCase = {};

      await expect(
        runAssertion({
          assertion,
          test,
          providerResponse: { output: 'Some output' },
        }),
      ).rejects.toThrow('context-faithfulness assertion type must have a vars object');
    });

    it('should throw an error when query var is missing', async () => {
      const assertion: Assertion = {
        type: 'context-faithfulness',
        threshold: 0.7,
      };
      const test: AtomicTestCase = {
        vars: {
          context: 'Paris is the capital of France.',
        },
      };

      await expect(
        runAssertion({
          assertion,
          test,
          providerResponse: { output: 'Some output' },
        }),
      ).rejects.toThrow('context-faithfulness assertion type must have a query var');
    });

    it('should throw an error when context var is missing', async () => {
      const assertion: Assertion = {
        type: 'context-faithfulness',
        threshold: 0.7,
      };
      const test: AtomicTestCase = {
        vars: {
          query: 'What is the capital of France?',
        },
      };

      await expect(
        runAssertion({
          assertion,
          test,
          providerResponse: { output: 'Some output' },
        }),
      ).rejects.toThrow('context-faithfulness assertion type must have a context var');
    });

    it('should throw an error when output is not a string', async () => {
      const assertion: Assertion = {
        type: 'context-faithfulness',
        threshold: 0.7,
      };
      const test: AtomicTestCase = {
        vars: {
          query: 'What is the capital of France?',
          context: 'Paris is the capital of France.',
        },
      };

      await expect(
        runAssertion({
          assertion,
          test,
          providerResponse: { output: { some: 'object' } },
        }),
      ).rejects.toThrow('context-faithfulness assertion type must have a string output');
    });
  });

  describe('file references', () => {
    it('should handle file reference in string value', async () => {
      const assertion: Assertion = {
        type: 'equals',
        value: 'file://expected_output.txt',
      };

      const expectedContent = 'Expected output';
      jest.mocked(fs.readFileSync).mockReturnValue(expectedContent);
      jest.mocked(path.resolve).mockReturnValue('/base/path/expected_output.txt');
      jest.mocked(path.extname).mockReturnValue('.txt');

      const result: GradingResult = await runAssertion({
        prompt: 'Some prompt',
        provider: new OpenAiChatCompletionProvider('gpt-4o-mini'),
        assertion,
        test: {} as AtomicTestCase,
        providerResponse: { output: 'Expected output' },
      });

      expect(fs.readFileSync).toHaveBeenCalledWith('/base/path/expected_output.txt', 'utf8');
      expect(result.pass).toBe(true);
    });

    it('should handle file references in array values', async () => {
      const assertion: Assertion = {
        type: 'contains-any',
        value: ['The expected output', 'string output', 'file://my_expected_output.txt'],
      };

      const fileContent = 'file content';
      jest.mocked(fs.readFileSync).mockReturnValue(fileContent);
      jest.mocked(path.resolve).mockReturnValue('/base/path/my_expected_output.txt');
      jest.mocked(path.extname).mockReturnValue('.txt');

      await expect(
        runAssertion({
          prompt: 'Some prompt',
          provider: new OpenAiChatCompletionProvider('gpt-4o-mini'),
          assertion,
          test: {} as AtomicTestCase,
          providerResponse: { output: 'file content' },
        }),
      ).resolves.toEqual(
        expect.objectContaining({
          pass: true,
        }),
      );
      expect(fs.readFileSync).toHaveBeenCalledWith('/base/path/my_expected_output.txt', 'utf8');

      await expect(
        runAssertion({
          prompt: 'Some prompt',
          provider: new OpenAiChatCompletionProvider('gpt-4o-mini'),
          assertion,
          test: {} as AtomicTestCase,
          providerResponse: { output: 'string output' },
        }),
      ).resolves.toEqual(
        expect.objectContaining({
          pass: true,
        }),
      );
    });

    it('should handle file reference in object value', async () => {
      const assertion: Assertion = {
        type: 'is-json',
        value: 'file://schema.json',
      };

      const schemaContent = JSON.stringify({
        type: 'object',
        properties: {
          key: { type: 'string' },
        },
      });
      jest.mocked(fs.readFileSync).mockReturnValue(schemaContent);
      jest.mocked(path.resolve).mockReturnValue('/base/path/schema.json');
      jest.mocked(path.extname).mockReturnValue('.json');

      const result: GradingResult = await runAssertion({
        prompt: 'Some prompt',
        provider: new OpenAiChatCompletionProvider('gpt-4o-mini'),
        assertion,
        test: {} as AtomicTestCase,
        providerResponse: { output: '{"key": "value"}' },
      });

      expect(fs.readFileSync).toHaveBeenCalledWith('/base/path/schema.json', 'utf8');
      expect(result.pass).toBe(true);
    });
  });
});

describe('validateXml', () => {
  it('should validate a simple valid XML string', () => {
    expect(validateXml('<root><child>Content</child></root>')).toEqual({
      isValid: true,
      reason: 'XML is valid and contains all required elements',
    });
  });

  it('should invalidate a malformed XML string', () => {
    expect(validateXml('<root><child>Content</child></root')).toEqual({
      isValid: false,
      reason: expect.stringContaining('XML parsing failed'),
    });
  });

  it('should validate XML with attributes', () => {
    expect(validateXml('<root><child id="1">Content</child></root>')).toEqual({
      isValid: true,
      reason: 'XML is valid and contains all required elements',
    });
  });

  it('should validate XML with namespaces', () => {
    expect(
      validateXml('<root xmlns:ns="http://example.com"><ns:child>Content</ns:child></root>'),
    ).toEqual({
      isValid: true,
      reason: 'XML is valid and contains all required elements',
    });
  });

  it('should validate when all required elements are present', () => {
    expect(
      validateXml(
        '<analysis><classification>T-shirt</classification><color>Red</color></analysis>',
        ['analysis.classification', 'analysis.color'],
      ),
    ).toEqual({
      isValid: true,
      reason: 'XML is valid and contains all required elements',
    });
  });

  it('should invalidate when a required element is missing', () => {
    expect(
      validateXml('<analysis><classification>T-shirt</classification></analysis>', [
        'analysis.classification',
        'analysis.color',
      ]),
    ).toEqual({
      isValid: false,
      reason: 'XML is missing required elements: analysis.color',
    });
  });

  it('should validate nested elements correctly', () => {
    expect(
      validateXml('<root><parent><child><grandchild>Content</grandchild></child></parent></root>', [
        'root.parent.child.grandchild',
      ]),
    ).toEqual({
      isValid: true,
      reason: 'XML is valid and contains all required elements',
    });
  });

  it('should invalidate when a nested required element is missing', () => {
    expect(
      validateXml('<root><parent><child></child></parent></root>', [
        'root.parent.child.grandchild',
      ]),
    ).toEqual({
      isValid: false,
      reason: 'XML is missing required elements: root.parent.child.grandchild',
    });
  });

  it('should handle empty elements correctly', () => {
    expect(
      validateXml('<root><emptyChild></emptyChild><nonEmptyChild>Content</nonEmptyChild></root>', [
        'root.emptyChild',
        'root.nonEmptyChild',
      ]),
    ).toEqual({
      isValid: true,
      reason: 'XML is valid and contains all required elements',
    });
  });

  it('should validate XML with multiple siblings', () => {
    expect(
      validateXml('<root><child>Content1</child><child>Content2</child></root>', ['root.child']),
    ).toEqual({
      isValid: true,
      reason: 'XML is valid and contains all required elements',
    });
  });

  it('should handle XML with CDATA sections', () => {
    expect(
      validateXml('<root><child><![CDATA[<p>This is CDATA content</p>]]></child></root>', [
        'root.child',
      ]),
    ).toEqual({
      isValid: true,
      reason: 'XML is valid and contains all required elements',
    });
  });

  it('should validate XML with processing instructions', () => {
    const xml =
      '<?xml version="1.0" encoding="UTF-8"?><?xml-stylesheet type="text/xsl" href="style.xsl"?><root><child>Content</child></root>';
    expect(validateXml(xml, ['root.child'])).toEqual({
      isValid: true,
      reason: 'XML is valid and contains all required elements',
    });
  });

  it('should handle XML with comments', () => {
    expect(
      validateXml('<root><!-- This is a comment --><child>Content</child></root>', ['root.child']),
    ).toEqual({
      isValid: true,
      reason: 'XML is valid and contains all required elements',
    });
  });

  it('should validate the example XML structure', () => {
    const xml = dedent`
      <analysis>
        <classification>T-shirt/top</classification>
        <color>White with black print</color>
        <features>Large circular graphic design on the front, resembling a smiley face or emoji</features>
        <style>Modern, casual streetwear</style>
        <confidence>9</confidence>
        <reasoning>The image clearly shows a short-sleeved garment with a round neckline, which is characteristic of a T-shirt. The large circular graphic on the front is distinctive and appears to be a stylized smiley face or emoji design, which is popular in contemporary casual fashion. The stark contrast between the white fabric and black print is very clear, leaving little room for misinterpretation. The style is unmistakably modern and aligned with current trends in graphic tees. My confidence is high (9) because all elements of the image are clear and consistent with a typical graphic T-shirt design.</reasoning>
      </analysis>
    `;
    expect(
      validateXml(xml, [
        'analysis.classification',
        'analysis.color',
        'analysis.features',
        'analysis.style',
        'analysis.confidence',
        'analysis.reasoning',
      ]),
    ).toEqual({
      isValid: true,
      reason: 'XML is valid and contains all required elements',
    });
  });
});

describe('containsXml', () => {
  it('should return true when valid XML is present', () => {
    const input = 'Some text <root><child>Content</child></root> more text';
    const result = containsXml(input);
    expect(result.isValid).toBe(true);
  });

  it('should return false when no XML is present', () => {
    const input = 'This is just plain text';
    expect(containsXml(input)).toEqual({
      isValid: false,
      reason: 'No XML content found in the output',
    });
  });

  it('should validate required elements', () => {
    const input = 'Text <root><child>Content</child></root> more';
    const result = containsXml(input, ['root.child']);
    expect(result.isValid).toBe(true);
  });

  it('should return false when required elements are missing', () => {
    const input = 'Text <root><child>Content</child></root> more';
    expect(containsXml(input, ['root.missing'])).toEqual({
      isValid: false,
      reason: 'No valid XML content found matching the requirements',
    });
  });

  it('should handle multiple XML fragments', () => {
    const input = '<root1>Content</root1> text <root2><child>More</child></root2>';
    const result = containsXml(input, ['root2.child']);
    expect(result.isValid).toBe(true);
  });
});
