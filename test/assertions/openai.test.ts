import fs from 'fs';

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { handleIsValidFunctionCall } from '../../src/assertions/functionToolCall';
import { runAssertion } from '../../src/assertions/index';
import { handleIsValidOpenAiToolsCall } from '../../src/assertions/openai';
import { hasFunctionToolCallValidator } from '../../src/contracts/providers';
import { OpenAiChatCompletionProvider } from '../../src/providers/openai/chat';
import { validateFunctionCall } from '../../src/providers/openai/util';
import { createMockProvider } from '../factories/provider';

import type { OpenAiTool } from '../../src/providers/openai/util';
import type {
  ApiProvider,
  Assertion,
  AssertionValueFunctionContext,
  AtomicTestCase,
  GradingResult,
} from '../../src/types/index';

// Create hoisted mocks for stable references
const mocks = vi.hoisted(() => ({
  mockPathResolve: vi.fn(),
  mockMaybeLoadToolsFromExternalFile: vi.fn(),
}));

vi.mock('fs');
vi.mock('path', async () => {
  const actual = await vi.importActual<typeof import('path')>('path');
  return {
    ...actual,
    resolve: mocks.mockPathResolve,
  };
});
vi.mock('../../src/util', async () => {
  const actual = await vi.importActual('../../src/util');
  return {
    ...actual,
    maybeLoadToolsFromExternalFile: mocks.mockMaybeLoadToolsFromExternalFile,
  };
});

const mockedFs = vi.mocked(fs);

const toolsAssertion: Assertion = {
  type: 'is-valid-openai-tools-call',
};

const functionAssertion: Assertion = {
  type: 'is-valid-openai-function-call',
};

const mockProvider = new OpenAiChatCompletionProvider('test-provider', {
  config: {
    tools: [
      {
        type: 'function',
        function: {
          name: 'getCurrentTemperature',
          parameters: {
            type: 'object',
            properties: {
              location: { type: 'string' },
              unit: { type: 'string', enum: ['Celsius', 'Fahrenheit'] },
            },
            required: ['location', 'unit'],
          },
        },
      },
    ],
    functions: [
      {
        name: 'getCurrentTemperature',
        parameters: {
          type: 'object',
          properties: {
            location: { type: 'string' },
            unit: { type: 'string', enum: ['Celsius', 'Fahrenheit'] },
          },
          required: ['location', 'unit'],
        },
      },
    ],
  },
});

const mockContext: AssertionValueFunctionContext = {
  prompt: '',
  vars: {},
  test: { vars: {} },
  logProbs: [],
  provider: mockProvider,
  providerResponse: { output: '' },
};

describe('OpenAI assertions', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.mockPathResolve.mockImplementation((...args: string[]) => args[args.length - 1]);
    mockedFs.existsSync.mockReturnValue(true);
    mocks.mockMaybeLoadToolsFromExternalFile.mockImplementation((input) => input);
  });

  describe('is-valid-openai-function-call assertion', () => {
    it('should pass for a valid function call with correct arguments', async () => {
      const output = { arguments: '{"x": 10, "y": 20}', name: 'add' };

      const provider = new OpenAiChatCompletionProvider('foo', {
        config: {
          functions: [
            {
              name: 'add',
              parameters: {
                type: 'object',
                properties: {
                  x: { type: 'number' },
                  y: { type: 'number' },
                },
                required: ['x', 'y'],
              },
            },
          ],
        },
      });
      const providerResponse = { output };
      const result: GradingResult = await runAssertion({
        prompt: 'Some prompt',
        provider,
        assertion: {
          type: 'is-valid-openai-function-call',
        },
        test: {} as AtomicTestCase,
        providerResponse,
      });

      expect(result).toMatchObject({
        pass: true,
        reason: 'Assertion passed',
      });
    });

    it('should pass for a nested function_call output', async () => {
      const output = {
        function_call: { arguments: '{"x": 10, "y": 20}', name: 'add' },
      };

      const provider = new OpenAiChatCompletionProvider('foo', {
        config: {
          functions: [
            {
              name: 'add',
              parameters: {
                type: 'object',
                properties: {
                  x: { type: 'number' },
                  y: { type: 'number' },
                },
                required: ['x', 'y'],
              },
            },
          ],
        },
      });
      const providerResponse = { output };
      const result: GradingResult = await runAssertion({
        prompt: 'Some prompt',
        provider,
        assertion: {
          type: 'is-valid-openai-function-call',
        },
        test: {} as AtomicTestCase,
        providerResponse,
      });

      expect(result).toMatchObject({
        pass: true,
        reason: 'Assertion passed',
      });
    });

    it('should fail for an invalid function call with incorrect arguments', async () => {
      const output = { arguments: '{"x": "10", "y": 20}', name: 'add' };

      const result: GradingResult = await runAssertion({
        prompt: 'Some prompt',
        provider: new OpenAiChatCompletionProvider('foo', {
          config: {
            functions: [
              {
                name: 'add',
                parameters: {
                  type: 'object',
                  properties: {
                    x: { type: 'number' },
                    y: { type: 'number' },
                  },
                  required: ['x', 'y'],
                },
              },
            ],
          },
        }),
        assertion: {
          type: 'is-valid-openai-function-call',
        },
        test: {} as AtomicTestCase,
        providerResponse: { output },
      });

      expect(result).toMatchObject({
        pass: false,
        reason: expect.stringContaining('Call to "add" does not match schema'),
      });
    });
  });

  describe('handleIsValidFunctionCall', () => {
    it.each([
      ['undefined provider', undefined, false],
      ['null provider', null, false],
      ['primitive provider', 'provider', false],
      ['missing capability', {}, false],
      ['string capability', { validateFunctionToolCall: 'validate' }, false],
      ['boolean capability', { validateFunctionToolCall: true }, false],
      ['object capability', { validateFunctionToolCall: {} }, false],
      ['function capability', { validateFunctionToolCall: vi.fn() }, true],
    ])('identifies %s', (_label, provider, expected) => {
      expect(hasFunctionToolCallValidator(provider)).toBe(expected);
    });

    it('should fail when provider does not expose the validator capability', () => {
      const output = { arguments: '{"x": 10}', name: 'add' };

      const result = handleIsValidFunctionCall({
        assertion: functionAssertion,
        output,
        provider: createMockProvider(),
        test: { vars: {} },
        baseType: functionAssertion.type,
        assertionValueContext: mockContext,
        inverse: false,
        outputString: JSON.stringify(output),
        providerResponse: { output },
      });

      expect(result).toEqual({
        pass: false,
        score: 0,
        reason: 'Provider does not have functionality for checking function call.',
        assertion: functionAssertion,
      });
    });

    it('should delegate to a structural provider capability', () => {
      const validateFunctionToolCall = vi.fn();
      const provider = {
        ...createMockProvider(),
        validateFunctionToolCall,
      };
      const output = { arguments: '{"x": 10}', name: 'add' };

      const result = handleIsValidFunctionCall({
        assertion: functionAssertion,
        output,
        provider,
        test: { vars: { value: 10 } },
        baseType: functionAssertion.type,
        assertionValueContext: mockContext,
        inverse: false,
        outputString: JSON.stringify(output),
        providerResponse: { output },
      });

      expect(validateFunctionToolCall).toHaveBeenCalledWith(output, { value: 10 });
      expect(result).toEqual({
        pass: true,
        score: 1,
        reason: 'Assertion passed',
        assertion: functionAssertion,
      });
    });

    it('should pass when function call matches schema', async () => {
      const functionOutput = {
        name: 'getCurrentTemperature',
        arguments: '{"location": "San Francisco, CA", "unit": "Fahrenheit"}',
      };

      const result = handleIsValidFunctionCall({
        assertion: functionAssertion,
        output: functionOutput,
        provider: mockProvider,
        test: { vars: {} },
        baseType: functionAssertion.type,
        assertionValueContext: mockContext,
        inverse: false,
        outputString: JSON.stringify(functionOutput),
        providerResponse: { output: functionOutput },
      });

      expect(result).toEqual({
        pass: true,
        score: 1,
        reason: 'Assertion passed',
        assertion: functionAssertion,
      });
    });

    it('should load functions from external file', async () => {
      const functionOutput = {
        name: 'getCurrentTemperature',
        arguments: '{"location": "San Francisco, CA", "unit": "Fahrenheit"}',
      };

      const mockYamlContent = `
- name: getCurrentTemperature
  parameters:
    type: object
    properties:
      location:
        type: string
      unit:
        type: string
        enum: [Celsius, Fahrenheit]
    required: [location, unit]
`;

      mockedFs.readFileSync.mockReturnValue(mockYamlContent);

      const fileProvider = createMockProvider({
        config: { functions: 'file://./test/fixtures/weather_functions.yaml' },
        response: { output: '' },
      }) as ApiProvider;

      expect(() => {
        validateFunctionCall(functionOutput, fileProvider.config.functions, {});
      }).not.toThrow();

      // Note: existsSync is no longer called - we use try/catch on readFileSync instead (TOCTOU fix)
      expect(mockedFs.readFileSync).toHaveBeenCalledWith(
        './test/fixtures/weather_functions.yaml',
        'utf8',
      );
    });

    it('should render variables in function definitions', async () => {
      const functionOutput = {
        name: 'getCurrentTemperature',
        arguments: '{"location": "San Francisco, CA", "unit": "custom_unit"}',
      };

      const varProvider = new OpenAiChatCompletionProvider('test-provider', {
        config: {
          functions: [
            {
              name: 'getCurrentTemperature',
              parameters: {
                type: 'object',
                properties: {
                  location: { type: 'string' },
                  unit: { type: 'string', enum: ['{{unit}}'] },
                },
                required: ['location', 'unit'],
              },
            },
          ],
        },
      });

      const result = handleIsValidFunctionCall({
        assertion: functionAssertion,
        output: functionOutput,
        provider: varProvider,
        test: { vars: { unit: 'custom_unit' } },
        baseType: functionAssertion.type,
        assertionValueContext: mockContext,
        inverse: false,
        outputString: JSON.stringify(functionOutput),
        providerResponse: { output: functionOutput },
      });

      expect(result).toEqual({
        pass: true,
        score: 1,
        reason: 'Assertion passed',
        assertion: functionAssertion,
      });
    });

    it('should fail when functions are not defined', async () => {
      const functionOutput = {
        name: 'getCurrentTemperature',
        arguments: '{"location": "San Francisco, CA"}',
      };

      const emptyProvider = new OpenAiChatCompletionProvider('test-provider', {
        config: {},
      });

      const result = handleIsValidFunctionCall({
        assertion: functionAssertion,
        output: functionOutput,
        provider: emptyProvider,
        test: { vars: {} },
        baseType: functionAssertion.type,
        assertionValueContext: mockContext,
        inverse: false,
        outputString: JSON.stringify(functionOutput),
        providerResponse: { output: functionOutput },
      });

      expect(result).toEqual({
        pass: false,
        score: 0,
        reason: 'No function schemas configured in provider, but output contains a function call',
        assertion: functionAssertion,
      });
    });

    it('should fail when function output is not an object', async () => {
      const functionOutput = 'not an object';

      const result = handleIsValidFunctionCall({
        assertion: functionAssertion,
        output: functionOutput,
        provider: mockProvider,
        test: { vars: {} },
        baseType: functionAssertion.type,
        assertionValueContext: mockContext,
        inverse: false,
        outputString: JSON.stringify(functionOutput),
        providerResponse: { output: functionOutput },
      });

      expect(result).toEqual({
        pass: false,
        score: 0,
        reason: expect.stringContaining('OpenAI did not return a valid-looking function call'),
        assertion: functionAssertion,
      });
    });

    it('should fail when function call does not match schema', async () => {
      const functionOutput = {
        name: 'getCurrentTemperature',
        arguments: '{"location": "San Francisco, CA"}', // missing required 'unit'
      };

      const result = handleIsValidFunctionCall({
        assertion: functionAssertion,
        output: functionOutput,
        provider: mockProvider,
        test: { vars: {} },
        baseType: functionAssertion.type,
        assertionValueContext: mockContext,
        inverse: false,
        outputString: JSON.stringify(functionOutput),
        providerResponse: { output: functionOutput },
      });

      expect(result).toEqual({
        pass: false,
        score: 0,
        reason: expect.stringContaining('must have required property'),
        assertion: functionAssertion,
      });
    });

    it('should not invert a function schema compilation error', async () => {
      const functionOutput = { name: 'get_weather', arguments: '{}' };
      const provider = new OpenAiChatCompletionProvider('test-provider', {
        config: {
          functions: [
            {
              name: 'get_weather',
              parameters: { type: 'object', properties: {} },
            },
            {
              name: 'broken',
              parameters: {
                type: 'invalid' as never,
                properties: { value: { type: 'number' } },
              },
            },
          ],
        },
      });

      const result = await runAssertion({
        assertion: { type: 'not-is-valid-function-call' },
        prompt: 'Some prompt',
        provider,
        providerResponse: { output: functionOutput },
        test: {} as AtomicTestCase,
      });

      expect(result).toMatchObject({
        pass: false,
        score: 0,
        reason: expect.stringContaining('schema is invalid'),
      });
    });

    it.each([
      ['missing', {}, 'No function schemas configured in provider'],
      ['empty', { functions: [] }, 'No function schemas configured in provider'],
      [
        'malformed',
        { functions: [null] as never },
        'Invalid function schema configured in provider',
      ],
      [
        'partially malformed',
        {
          functions: [
            { name: 'get_weather', parameters: { type: 'object', properties: {} } },
            null,
          ] as never,
        },
        'Invalid function schema configured in provider',
      ],
      [
        'empty-name',
        { functions: [{ name: '', parameters: { type: 'object', properties: {} } }] },
        'Invalid function schema configured in provider',
      ],
    ])('should not invert %s function schema configuration', async (_name, config, reason) => {
      const provider = new OpenAiChatCompletionProvider('test-provider', {
        config: config as never,
      });

      const result = await runAssertion({
        assertion: { type: 'not-is-valid-function-call' },
        prompt: 'Some prompt',
        provider,
        providerResponse: { output: { name: 'get_weather', arguments: '{}' } },
        test: {} as AtomicTestCase,
      });

      expect(result).toMatchObject({
        pass: false,
        score: 0,
        reason: expect.stringContaining(reason),
      });
    });

    it.each([
      ['empty arguments', '{}', true, false],
      ['unexpected arguments', '{"unexpected":true}', false, true],
    ] as const)('validates a parameterless function with %s', async (_name, argumentsJson, positivePass, inversePass) => {
      const provider = new OpenAiChatCompletionProvider('test-provider', {
        config: { functions: [{ name: 'noop' }] },
      });
      const providerResponse = {
        output: { name: 'noop', arguments: argumentsJson },
      };

      const [positive, inverse] = await Promise.all(
        (['is-valid-function-call', 'not-is-valid-function-call'] as const).map((type) =>
          runAssertion({
            assertion: { type },
            prompt: 'Some prompt',
            provider,
            providerResponse,
            test: {} as AtomicTestCase,
          }),
        ),
      );

      expect(positive).toMatchObject({ pass: positivePass, score: positivePass ? 1 : 0 });
      expect(inverse).toMatchObject({ pass: inversePass, score: inversePass ? 1 : 0 });
    });

    it.each([
      ['null parameters', [{ name: 'noop', parameters: null as never }], 'usable parameters'],
      ['duplicate names', [{ name: 'noop' }, { name: 'noop' }], 'Duplicate function schema'],
    ])('does not invert %s', async (_name, functions, reason) => {
      const provider = new OpenAiChatCompletionProvider('test-provider', {
        config: { functions },
      });
      const providerResponse = { output: { name: 'noop', arguments: '{}' } };

      const [positive, inverse] = await Promise.all(
        (['is-valid-function-call', 'not-is-valid-function-call'] as const).map((type) =>
          runAssertion({
            assertion: { type },
            prompt: 'Some prompt',
            provider,
            providerResponse,
            test: {} as AtomicTestCase,
          }),
        ),
      );

      expect(positive).toMatchObject({
        pass: false,
        score: 0,
        reason: expect.stringContaining(reason),
      });
      expect(inverse).toMatchObject({
        pass: false,
        score: 0,
        reason: expect.stringContaining(reason),
      });
    });
  });

  describe('is-valid-openai-tools-call assertion', () => {
    it('should pass for a valid tools call with correct arguments', async () => {
      const output = [
        { type: 'function', function: { arguments: '{"x": 10, "y": 20}', name: 'add' } },
      ];

      const result: GradingResult = await runAssertion({
        prompt: 'Some prompt',
        provider: new OpenAiChatCompletionProvider('foo', {
          config: {
            tools: [
              {
                type: 'function',
                function: {
                  name: 'add',
                  parameters: {
                    type: 'object',
                    properties: {
                      x: { type: 'number' },
                      y: { type: 'number' },
                    },
                    required: ['x', 'y'],
                  },
                },
              },
            ],
          },
        }),
        assertion: {
          type: 'is-valid-openai-tools-call',
        },
        test: {} as AtomicTestCase,
        providerResponse: { output },
      });

      expect(result).toMatchObject({
        pass: true,
        reason: 'Assertion passed',
      });
    });

    it('should pass for a nested tool_calls output', async () => {
      const output = {
        content: 'Let me check the weather...',
        tool_calls: [
          {
            id: 'call_123',
            type: 'function',
            function: {
              name: 'getCurrentTemperature',
              arguments: '{"location": "San Francisco", "unit": "Fahrenheit"}',
            },
          },
        ],
      };

      const result: GradingResult = await runAssertion({
        prompt: 'Some prompt',
        provider: new OpenAiChatCompletionProvider('foo', {
          config: {
            tools: [
              {
                type: 'function',
                function: {
                  name: 'getCurrentTemperature',
                  parameters: {
                    type: 'object',
                    properties: {
                      location: { type: 'string' },
                      unit: { type: 'string', enum: ['Celsius', 'Fahrenheit'] },
                    },
                    required: ['location', 'unit'],
                  },
                },
              },
            ],
          },
        }),
        assertion: {
          type: 'is-valid-openai-tools-call',
        },
        test: {} as AtomicTestCase,
        providerResponse: { output },
      });

      expect(result).toMatchObject({
        pass: true,
        reason: 'Assertion passed',
      });
    });

    it('should pass for multiple tool calls in parallel', async () => {
      const output = {
        content: 'Checking weather data...',
        tool_calls: [
          {
            id: 'call_123',
            type: 'function',
            function: {
              name: 'getCurrentTemperature',
              arguments: '{"location": "London", "unit": "Celsius"}',
            },
          },
          {
            id: 'call_456',
            type: 'function',
            function: {
              name: 'getRainProbability',
              arguments: '{"location": "London"}',
            },
          },
        ],
      };

      const result: GradingResult = await runAssertion({
        prompt: 'Some prompt',
        provider: new OpenAiChatCompletionProvider('foo', {
          config: {
            tools: [
              {
                type: 'function',
                function: {
                  name: 'getCurrentTemperature',
                  parameters: {
                    type: 'object',
                    properties: {
                      location: { type: 'string' },
                      unit: { type: 'string', enum: ['Celsius', 'Fahrenheit'] },
                    },
                    required: ['location', 'unit'],
                  },
                },
              },
              {
                type: 'function',
                function: {
                  name: 'getRainProbability',
                  parameters: {
                    type: 'object',
                    properties: {
                      location: { type: 'string' },
                    },
                    required: ['location'],
                  },
                },
              },
            ],
          },
        }),
        assertion: {
          type: 'is-valid-openai-tools-call',
        },
        test: {} as AtomicTestCase,
        providerResponse: { output },
      });

      expect(result).toMatchObject({
        pass: true,
        reason: 'Assertion passed',
      });
    });

    it('should fail for an invalid tools call with incorrect arguments', async () => {
      const output = [
        { type: 'function', function: { arguments: '{"x": "foobar", "y": 20}', name: 'add' } },
      ];

      const result: GradingResult = await runAssertion({
        prompt: 'Some prompt',
        provider: new OpenAiChatCompletionProvider('foo', {
          config: {
            tools: [
              {
                type: 'function',
                function: {
                  name: 'add',
                  parameters: {
                    type: 'object',
                    properties: {
                      x: { type: 'number' },
                      y: { type: 'number' },
                    },
                    required: ['x', 'y'],
                  },
                },
              },
            ],
          },
        }),
        assertion: {
          type: 'is-valid-openai-tools-call',
        },
        test: {} as AtomicTestCase,
        providerResponse: { output },
      });

      expect(result).toMatchObject({
        pass: false,
        reason: expect.stringContaining('Call to "add" does not match schema'),
      });
    });
  });

  describe('handleIsValidOpenAiToolsCall', () => {
    it('should pass when tool calls match schema', async () => {
      const toolsOutput = [
        {
          id: 'call_123',
          type: 'function',
          function: {
            name: 'getCurrentTemperature',
            arguments: '{"location": "San Francisco, CA", "unit": "Fahrenheit"}',
          },
        },
      ];

      const result = await handleIsValidOpenAiToolsCall({
        assertion: toolsAssertion,
        output: toolsOutput,
        provider: mockProvider,
        test: { vars: {} },
        baseType: toolsAssertion.type,
        assertionValueContext: mockContext,
        inverse: false,
        outputString: JSON.stringify(toolsOutput),
        providerResponse: { output: toolsOutput },
      });

      expect(result).toEqual({
        pass: true,
        score: 1,
        reason: 'Assertion passed',
        assertion: toolsAssertion,
      });
    });

    it('inverse (not-is-valid-openai-tools-call) fails when the call IS valid', async () => {
      const toolsOutput = [
        {
          id: 'call_123',
          type: 'function',
          function: {
            name: 'getCurrentTemperature',
            arguments: '{"location": "San Francisco, CA", "unit": "Fahrenheit"}',
          },
        },
      ];

      const result = await runAssertion({
        assertion: { type: 'not-is-valid-openai-tools-call' },
        prompt: 'Some prompt',
        provider: mockProvider,
        test: { vars: {} },
        providerResponse: { output: toolsOutput },
      });

      expect(result.pass).toBe(false);
      expect(result.score).toBe(0);
      expect(result.reason).toBe('Expected output to not be a valid OpenAI tools call, but it was');
    });

    it('inverse (not-is-valid-openai-tools-call) passes when the call is NOT valid', async () => {
      const toolsOutput: unknown[] = [];

      const result = await runAssertion({
        assertion: { type: 'not-is-valid-openai-tools-call' },
        prompt: 'Some prompt',
        provider: mockProvider,
        test: { vars: {} },
        providerResponse: { output: toolsOutput },
      });

      expect(result.pass).toBe(true);
      expect(result.score).toBe(1);
      expect(result.reason).toBe('OpenAI did not return a valid-looking tools response: []');
    });

    it.each([
      ['missing function', [{}]],
      ['null entry', [null]],
      ['null output', null],
      [
        'malformed later entry',
        [
          {
            type: 'function',
            function: { name: 'getCurrentTemperature', arguments: '{}' },
          },
          {},
        ],
      ],
    ])('inverse returns an invalid verdict for %s', async (_name, output) => {
      const result = await runAssertion({
        assertion: { type: 'not-is-valid-openai-tools-call' },
        prompt: 'Some prompt',
        provider: mockProvider,
        test: { vars: {} },
        providerResponse: { output: output as never },
      });

      expect(result).toMatchObject({
        pass: true,
        score: 1,
        reason: expect.stringContaining('did not return a valid-looking tools response'),
      });
    });

    it('does not invert missing tools configuration', async () => {
      const toolsOutput = [
        {
          type: 'function',
          function: { name: 'getCurrentTemperature', arguments: '{}' },
        },
      ];
      const provider = new OpenAiChatCompletionProvider('test-provider', { config: {} });

      const result = await runAssertion({
        assertion: { type: 'not-is-valid-openai-tools-call' },
        prompt: 'Some prompt',
        provider,
        test: { vars: {} },
        providerResponse: { output: toolsOutput },
      });

      expect(result).toEqual({
        pass: false,
        score: 0,
        reason: 'No tools configured in provider, but output contains tool calls',
        assertion: { type: 'not-is-valid-openai-tools-call' },
      });
    });

    it.each([
      ['an empty tools array', [], 'No function tool schemas configured in provider'],
      [
        'only non-function tools',
        [{ type: 'web_search_preview' }],
        'No function tool schemas configured in provider',
      ],
      ['a malformed tools entry', [null], 'Invalid tool schema configured in provider'],
      [
        'a partially malformed function tool',
        [
          {
            type: 'function',
            function: {
              name: 'getCurrentTemperature',
              parameters: { type: 'object', properties: {} },
            },
          },
          { type: 'function', function: {} },
        ],
        'Invalid function tool schema configured in provider',
      ],
      [
        'an empty-name function tool',
        [
          {
            type: 'function',
            function: { name: '', parameters: { type: 'object', properties: {} } },
          },
        ],
        'Invalid function tool schema configured in provider',
      ],
    ])('does not invert %s', async (_name, tools, reason) => {
      const toolsOutput = [
        {
          type: 'function',
          function: { name: 'getCurrentTemperature', arguments: '{}' },
        },
      ];
      const provider = new OpenAiChatCompletionProvider('test-provider', {
        config: { tools: tools as never },
      });

      const result = await runAssertion({
        assertion: { type: 'not-is-valid-openai-tools-call' },
        prompt: 'Some prompt',
        provider,
        test: { vars: {} },
        providerResponse: { output: toolsOutput },
      });

      expect(result).toMatchObject({
        pass: false,
        score: 0,
        reason: expect.stringContaining(reason),
      });
    });

    it('does not invert a tool schema compilation error', async () => {
      const toolsOutput = [
        {
          type: 'function',
          function: { name: 'get_weather', arguments: '{}' },
        },
      ];
      const provider = new OpenAiChatCompletionProvider('test-provider', {
        config: {
          tools: [
            {
              type: 'function',
              function: {
                name: 'get_weather',
                parameters: { type: 'object', properties: {} },
              },
            },
            {
              type: 'function',
              function: {
                name: 'broken',
                parameters: {
                  type: 'invalid' as never,
                  properties: { value: { type: 'number' } },
                },
              },
            },
          ],
        },
      });

      const result = await runAssertion({
        assertion: { type: 'not-is-valid-openai-tools-call' },
        prompt: 'Some prompt',
        provider,
        test: { vars: {} },
        providerResponse: { output: toolsOutput },
      });

      expect(result).toMatchObject({
        pass: false,
        score: 0,
        reason: expect.stringContaining('schema is invalid'),
      });
    });

    it.each([
      ['empty arguments', '{}', true, false],
      ['unexpected arguments', '{"unexpected":true}', false, true],
    ] as const)('validates a parameterless tool with %s', async (_name, argumentsJson, positivePass, inversePass) => {
      const provider = new OpenAiChatCompletionProvider('test-provider', {
        config: {
          tools: [{ type: 'function', function: { name: 'noop' } }],
        },
      });
      const providerResponse = {
        output: [{ type: 'function', function: { name: 'noop', arguments: argumentsJson } }],
      };

      const [positive, inverse] = await Promise.all(
        (['is-valid-openai-tools-call', 'not-is-valid-openai-tools-call'] as const).map((type) =>
          runAssertion({
            assertion: { type },
            prompt: 'Some prompt',
            provider,
            providerResponse,
            test: { vars: {} },
          }),
        ),
      );

      expect(positive).toMatchObject({ pass: positivePass, score: positivePass ? 1 : 0 });
      expect(inverse).toMatchObject({ pass: inversePass, score: inversePass ? 1 : 0 });
    });

    it.each([
      [
        'null parameters',
        [{ type: 'function', function: { name: 'noop', parameters: null as never } }],
        'usable parameters',
      ],
      [
        'duplicate names',
        [
          { type: 'function', function: { name: 'noop' } },
          { type: 'function', function: { name: 'noop' } },
        ],
        'Duplicate function schema',
      ],
    ])('does not invert %s tool configuration', async (_name, tools, reason) => {
      const provider = new OpenAiChatCompletionProvider('test-provider', {
        config: { tools: tools as never },
      });
      const providerResponse = {
        output: [{ type: 'function', function: { name: 'noop', arguments: '{}' } }],
      };

      const [positive, inverse] = await Promise.all(
        (['is-valid-openai-tools-call', 'not-is-valid-openai-tools-call'] as const).map((type) =>
          runAssertion({
            assertion: { type },
            prompt: 'Some prompt',
            provider,
            providerResponse,
            test: { vars: {} },
          }),
        ),
      );

      expect(positive).toMatchObject({
        pass: false,
        score: 0,
        reason: expect.stringContaining(reason),
      });
      expect(inverse).toMatchObject({
        pass: false,
        score: 0,
        reason: expect.stringContaining(reason),
      });
    });

    it('does not invert a tool file loading failure', async () => {
      mocks.mockMaybeLoadToolsFromExternalFile.mockRejectedValue(new Error('unable to load tools'));
      const provider = new OpenAiChatCompletionProvider('test-provider', {
        config: { tools: 'file://missing-tools.json' as never },
      });
      const providerResponse = {
        output: [{ type: 'function', function: { name: 'noop', arguments: '{}' } }],
      };

      const [positive, inverse] = await Promise.all(
        (['is-valid-openai-tools-call', 'not-is-valid-openai-tools-call'] as const).map((type) =>
          runAssertion({
            assertion: { type },
            prompt: 'Some prompt',
            provider,
            providerResponse,
            test: { vars: {} },
          }),
        ),
      );

      expect(positive).toMatchObject({ pass: false, score: 0, reason: 'unable to load tools' });
      expect(inverse).toMatchObject({ pass: false, score: 0, reason: 'unable to load tools' });
    });

    it('should load tools from external file', async () => {
      const toolsOutput = [
        {
          id: 'call_123',
          type: 'function',
          function: {
            name: 'getCurrentTemperature',
            arguments: '{"location": "San Francisco, CA", "unit": "Fahrenheit"}',
          },
        },
      ];

      // Define the array of tools that should be returned by the mock
      const mockParsedTools = [
        {
          type: 'function',
          function: {
            name: 'getCurrentTemperature',
            parameters: {
              type: 'object',
              properties: {
                location: { type: 'string' },
                unit: { type: 'string', enum: ['Celsius', 'Fahrenheit'] },
              },
              required: ['location', 'unit'],
            },
          },
        },
      ];

      // Make sure the mock returns an array, not a string or object
      mocks.mockMaybeLoadToolsFromExternalFile.mockResolvedValue(mockParsedTools);

      const fileProvider = createMockProvider({
        config: {
          tools: 'file://./test/fixtures/weather_tools.json' as unknown as OpenAiTool[],
        },
        response: { output: '' },
      }) as ApiProvider;

      const result = await handleIsValidOpenAiToolsCall({
        assertion: toolsAssertion,
        output: toolsOutput,
        provider: fileProvider,
        test: { vars: {} },
        baseType: toolsAssertion.type,
        assertionValueContext: mockContext,
        inverse: false,
        outputString: JSON.stringify(toolsOutput),
        providerResponse: { output: toolsOutput },
      });

      expect(result).toEqual({
        pass: true,
        score: 1,
        reason: 'Assertion passed',
        assertion: toolsAssertion,
      });

      // Verify mocks.mockMaybeLoadToolsFromExternalFile was called with the file path
      expect(mocks.mockMaybeLoadToolsFromExternalFile).toHaveBeenCalledWith(
        'file://./test/fixtures/weather_tools.json',
        {},
      );
    });

    it('should render variables in tool definitions', async () => {
      const toolsOutput = [
        {
          id: 'call_123',
          type: 'function',
          function: {
            name: 'getCurrentTemperature',
            arguments: '{"location": "San Francisco, CA", "unit": "custom_unit"}',
          },
        },
      ];

      const varProvider = new OpenAiChatCompletionProvider('test-provider', {
        config: {
          tools: [
            {
              type: 'function',
              function: {
                name: 'getCurrentTemperature',
                parameters: {
                  type: 'object',
                  properties: {
                    location: { type: 'string' },
                    unit: { type: 'string', enum: ['{{unit}}'] },
                  },
                  required: ['location', 'unit'],
                },
              },
            },
          ],
        },
      });

      const result = await handleIsValidOpenAiToolsCall({
        assertion: toolsAssertion,
        output: toolsOutput,
        provider: varProvider,
        test: { vars: { unit: 'custom_unit' } },
        baseType: toolsAssertion.type,
        assertionValueContext: mockContext,
        inverse: false,
        outputString: JSON.stringify(toolsOutput),
        providerResponse: { output: toolsOutput },
      });

      expect(result).toEqual({
        pass: true,
        score: 1,
        reason: 'Assertion passed',
        assertion: toolsAssertion,
      });
    });

    it('should fail when tools are not defined', async () => {
      const toolsOutput = [
        {
          id: 'call_123',
          type: 'function',
          function: {
            name: 'getCurrentTemperature',
            arguments: '{"location": "San Francisco, CA"}',
          },
        },
      ];

      const emptyProvider = new OpenAiChatCompletionProvider('test-provider', {
        config: {},
      });

      const result = await handleIsValidOpenAiToolsCall({
        assertion: toolsAssertion,
        output: toolsOutput,
        provider: emptyProvider,
        test: { vars: {} },
        baseType: toolsAssertion.type,
        assertionValueContext: mockContext,
        inverse: false,
        outputString: JSON.stringify(toolsOutput),
        providerResponse: { output: toolsOutput },
      });

      expect(result).toMatchObject({
        pass: false,
        score: 0,
        reason: 'No tools configured in provider, but output contains tool calls',
      });
    });

    it('should fail when tool output is not an array', async () => {
      const toolsOutput = {
        id: 'call_123',
        type: 'function',
        function: {
          name: 'getCurrentTemperature',
          arguments: '{"location": "San Francisco, CA"}',
        },
      };

      const emptyToolsProvider = new OpenAiChatCompletionProvider('test-provider', {
        config: {
          tools: [],
        },
      });

      const result = await handleIsValidOpenAiToolsCall({
        assertion: toolsAssertion,
        output: toolsOutput,
        provider: emptyToolsProvider,
        test: { vars: {} },
        baseType: toolsAssertion.type,
        assertionValueContext: mockContext,
        inverse: false,
        outputString: JSON.stringify(toolsOutput),
        providerResponse: { output: toolsOutput },
      });

      expect(result).toEqual({
        pass: false,
        score: 0,
        reason: expect.stringContaining('OpenAI did not return a valid-looking tools response'),
        assertion: toolsAssertion,
      });
    });

    it('should fail when tool call does not match schema', async () => {
      const toolsOutput = [
        {
          id: 'call_123',
          type: 'function',
          function: {
            name: 'getCurrentTemperature',
            arguments: '{"location": "San Francisco, CA"}', // missing required 'unit'
          },
        },
      ];

      const result = await handleIsValidOpenAiToolsCall({
        assertion: toolsAssertion,
        output: toolsOutput,
        provider: mockProvider,
        test: { vars: {} },
        baseType: toolsAssertion.type,
        assertionValueContext: mockContext,
        inverse: false,
        outputString: JSON.stringify(toolsOutput),
        providerResponse: { output: toolsOutput },
      });

      expect(result).toEqual({
        pass: false,
        score: 0,
        reason: expect.stringContaining('must have required property'),
        assertion: toolsAssertion,
      });
    });

    it('should use maybeLoadToolsFromExternalFile to process tools', async () => {
      const toolOutput = {
        tool_calls: [
          {
            type: 'function',
            function: {
              name: 'getCurrentTemperature',
              arguments: '{"location": "San Francisco, CA", "unit": "Fahrenheit"}',
            },
          },
        ],
      };

      const mockTools = [
        {
          type: 'function',
          function: {
            name: 'getCurrentTemperature',
            parameters: {
              type: 'object',
              properties: {
                location: { type: 'string' },
                unit: { type: 'string', enum: ['Celsius', 'Fahrenheit'] },
              },
              required: ['location', 'unit'],
            },
          },
        },
      ];

      // Set up the mock to return processed tools
      mocks.mockMaybeLoadToolsFromExternalFile.mockResolvedValue(mockTools);

      const result = await handleIsValidOpenAiToolsCall({
        assertion: toolsAssertion,
        output: toolOutput,
        provider: mockProvider,
        test: { vars: { city: 'San Francisco, CA' } },
        baseType: toolsAssertion.type,
        assertionValueContext: mockContext,
        inverse: false,
        outputString: JSON.stringify(toolOutput),
        providerResponse: { output: toolOutput },
      });

      expect(mocks.mockMaybeLoadToolsFromExternalFile).toHaveBeenCalledWith(
        mockProvider.config.tools,
        {
          city: 'San Francisco, CA',
        },
      );

      expect(result).toEqual({
        pass: true,
        score: 1,
        reason: 'Assertion passed',
        assertion: toolsAssertion,
      });
    });

    it('should handle external file references for tools', async () => {
      const toolOutput = {
        tool_calls: [
          {
            type: 'function',
            function: {
              name: 'getCurrentTemperature',
              arguments: '{"location": "San Francisco, CA", "unit": "Fahrenheit"}',
            },
          },
        ],
      };

      // Mock a provider with tools from a file reference
      const fileProvider = new OpenAiChatCompletionProvider('test-provider', {
        config: {
          tools: 'file://./test/fixtures/weather_tools.json' as unknown as OpenAiTool[],
        },
      });

      // Set up the mock to return processed tools from the external file
      const mockToolsFromFile = [
        {
          type: 'function',
          function: {
            name: 'getCurrentTemperature',
            parameters: {
              type: 'object',
              properties: {
                location: { type: 'string' },
                unit: { type: 'string', enum: ['Celsius', 'Fahrenheit'] },
              },
              required: ['location', 'unit'],
            },
          },
        },
      ];
      mocks.mockMaybeLoadToolsFromExternalFile.mockResolvedValue(mockToolsFromFile);

      const result = await handleIsValidOpenAiToolsCall({
        assertion: toolsAssertion,
        output: toolOutput,
        provider: fileProvider,
        test: { vars: {} },
        baseType: toolsAssertion.type,
        assertionValueContext: { ...mockContext, provider: fileProvider },
        inverse: false,
        outputString: JSON.stringify(toolOutput),
        providerResponse: { output: toolOutput },
      });

      // Check that the function was called with the file path
      expect(mocks.mockMaybeLoadToolsFromExternalFile).toHaveBeenCalledWith(
        'file://./test/fixtures/weather_tools.json',
        {},
      );

      expect(result).toEqual({
        pass: true,
        score: 1,
        reason: 'Assertion passed',
        assertion: toolsAssertion,
      });
    });

    it('should handle variable substitution in tools', async () => {
      const toolOutput = {
        tool_calls: [
          {
            type: 'function',
            function: {
              name: 'getCurrentTemperature',
              arguments: '{"location": "San Francisco, CA", "unit": "custom_unit"}',
            },
          },
        ],
      };

      // Create a provider with tools that contain variable placeholders
      const varProvider = new OpenAiChatCompletionProvider('test-provider', {
        config: {
          tools: [
            {
              type: 'function',
              function: {
                name: 'getCurrentTemperature',
                parameters: {
                  type: 'object',
                  properties: {
                    location: { type: 'string' },
                    unit: { type: 'string', enum: ['{{unit}}'] },
                  },
                  required: ['location', 'unit'],
                },
              },
            },
          ],
        },
      });

      // Set up the mock to return tools with variables resolved
      const processedTools = [
        {
          type: 'function',
          function: {
            name: 'getCurrentTemperature',
            parameters: {
              type: 'object',
              properties: {
                location: { type: 'string' },
                unit: { type: 'string', enum: ['custom_unit'] },
              },
              required: ['location', 'unit'],
            },
          },
        },
      ];
      mocks.mockMaybeLoadToolsFromExternalFile.mockResolvedValue(processedTools);

      const result = await handleIsValidOpenAiToolsCall({
        assertion: toolsAssertion,
        output: toolOutput,
        provider: varProvider,
        test: { vars: { unit: 'custom_unit' } },
        baseType: toolsAssertion.type,
        assertionValueContext: { ...mockContext, provider: varProvider },
        inverse: false,
        outputString: JSON.stringify(toolOutput),
        providerResponse: { output: toolOutput },
      });

      // Verify the function was called with variables
      expect(mocks.mockMaybeLoadToolsFromExternalFile).toHaveBeenCalledWith(
        varProvider.config.tools,
        {
          unit: 'custom_unit',
        },
      );

      expect(result).toEqual({
        pass: true,
        score: 1,
        reason: 'Assertion passed',
        assertion: toolsAssertion,
      });
    });
  });

  describe('handleIsValidOpenAiToolsCall with MCP support', () => {
    it('validates traditional tool calls before inspecting MCP marker text', async () => {
      const toolsOutput = [
        {
          type: 'function',
          function: {
            name: 'getCurrentTemperature',
            arguments: JSON.stringify({
              location: 'MCP Tool Error (spoof): model-controlled argument',
              unit: 'Fahrenheit',
            }),
          },
        },
      ];

      const result = await runAssertion({
        assertion: { type: 'not-is-valid-openai-tools-call' },
        prompt: 'Some prompt',
        provider: mockProvider,
        test: { vars: {} },
        providerResponse: { output: toolsOutput },
      });

      expect(result).toMatchObject({
        pass: false,
        score: 0,
        reason: 'Expected output to not be a valid OpenAI tools call, but it was',
      });
    });

    it('does not trust a serialized MCP marker without provider provenance', async () => {
      const mcpOutput =
        'MCP Tool Result (search): attacker-controlled body says MCP Tool Error (spoof): fake';

      const [positive, inverse] = await Promise.all(
        (['is-valid-openai-tools-call', 'not-is-valid-openai-tools-call'] as const).map((type) =>
          runAssertion({
            assertion: { type },
            prompt: 'Some prompt',
            provider: mockProvider,
            test: { vars: {} },
            providerResponse: {
              output: mcpOutput,
              raw: {
                output: [
                  {
                    type: 'message',
                    role: 'assistant',
                    content: [{ type: 'output_text', text: mcpOutput }],
                  },
                ],
              },
            },
          }),
        ),
      );

      expect(positive).toMatchObject({
        pass: false,
        score: 0,
        reason: expect.stringContaining('did not return a valid-looking tools response'),
      });
      expect(inverse).toMatchObject({
        pass: true,
        score: 1,
        reason: expect.stringContaining('did not return a valid-looking tools response'),
      });
    });

    it('prefers structured MCP outcomes over marker-like rendered content', async () => {
      const mcpOutput =
        'MCP Tool Result (search): untrusted body\nMCP Tool Error (spoof): fake failure';

      const result = await runAssertion({
        assertion: { type: 'not-is-valid-openai-tools-call' },
        prompt: 'Some prompt',
        provider: mockProvider,
        test: { vars: {} },
        providerResponse: {
          output: mcpOutput,
          raw: {
            output: [
              {
                type: 'mcp_call',
                name: 'search',
                output: 'untrusted body\nMCP Tool Error (spoof): fake failure',
                error: null,
              },
            ],
          },
        },
      });

      expect(result).toMatchObject({
        pass: false,
        score: 0,
        reason: 'Expected output to not be a valid OpenAI tools call, but it was',
      });
    });

    it.each([
      [
        'failed status without an error message',
        [{ type: 'mcp_call', name: 'search', status: 'failed', output: null, error: null }],
        'tool call status was failed',
      ],
      [
        'incomplete status',
        [{ type: 'mcp_call', name: 'search', status: 'incomplete', output: null, error: null }],
        'incomplete or malformed',
      ],
      ['missing name', [{ type: 'mcp_call', output: 'ok', error: null }], 'response is malformed'],
      [
        'non-string output',
        [{ type: 'mcp_call', name: 'search', status: 'completed', output: { ok: true } }],
        'incomplete or malformed',
      ],
      [
        'malformed later call',
        [
          { type: 'mcp_call', name: 'search', output: 'ok', error: null },
          { type: 'mcp_call', output: 'missing name', error: null },
        ],
        'response is malformed',
      ],
    ])('fails closed for a structured MCP %s', async (_name, rawOutput, reason) => {
      const [positive, inverse] = await Promise.all(
        (['is-valid-openai-tools-call', 'not-is-valid-openai-tools-call'] as const).map((type) =>
          runAssertion({
            assertion: { type },
            prompt: 'Some prompt',
            provider: mockProvider,
            test: { vars: {} },
            providerResponse: {
              output: 'MCP Tool Result (search): rendered output is not authoritative',
              raw: { output: rawOutput },
            },
          }),
        ),
      );

      expect(positive).toMatchObject({
        pass: false,
        score: 0,
        reason: expect.stringContaining(reason),
      });
      expect(inverse).toMatchObject({
        pass: true,
        score: 1,
        reason: expect.stringContaining(reason),
      });
    });

    it('uses every successful structured MCP call', async () => {
      const result = await runAssertion({
        assertion: { type: 'not-is-valid-openai-tools-call' },
        prompt: 'Some prompt',
        provider: mockProvider,
        test: { vars: {} },
        providerResponse: {
          output: 'rendered MCP results',
          raw: {
            output: [
              { type: 'mcp_call', name: 'first', status: 'completed', output: 'one' },
              { type: 'mcp_call', name: 'second', status: 'completed', output: 'two' },
            ],
          },
        },
      });

      expect(result).toMatchObject({
        pass: false,
        score: 0,
        reason: 'Expected output to not be a valid OpenAI tools call, but it was',
      });
    });

    it('does not let structured MCP provenance bypass an assertion transform', async () => {
      const result = await runAssertion({
        assertion: {
          type: 'is-valid-openai-tools-call',
          transform: '"ordinary transformed text"',
        },
        prompt: 'Some prompt',
        provider: mockProvider,
        test: { vars: {} },
        providerResponse: {
          output: 'MCP Tool Result (search): ok',
          raw: {
            output: [{ type: 'mcp_call', name: 'search', output: 'ok', error: null }],
          },
        },
      });

      expect(result).toMatchObject({
        pass: false,
        score: 0,
        reason: expect.stringContaining('did not return a valid-looking tools response'),
      });
    });

    it('does not let structured MCP provenance bypass a test transform', async () => {
      const result = await runAssertion({
        assertion: { type: 'is-valid-openai-tools-call' },
        prompt: 'Some prompt',
        provider: mockProvider,
        test: { options: { transform: '"ordinary transformed text"' }, vars: {} },
        providerResponse: {
          output: 'ordinary transformed text',
          providerTransformedOutput: 'MCP Tool Result (search): ok',
          raw: {
            output: [{ type: 'mcp_call', name: 'search', output: 'ok', error: null }],
          },
        },
      });

      expect(result).toMatchObject({
        pass: false,
        score: 0,
        reason: expect.stringContaining('did not return a valid-looking tools response'),
      });
    });

    it('does not let structured MCP provenance bypass a changed provider transform', async () => {
      const provider = new OpenAiChatCompletionProvider('test-provider', {
        config: {},
      });
      (provider as ApiProvider).transform = '"ordinary transformed text"';
      const result = await runAssertion({
        assertion: { type: 'is-valid-openai-tools-call' },
        prompt: 'Some prompt',
        provider,
        test: { vars: {} },
        providerResponse: {
          output: 'ordinary transformed text',
          providerTransformChanged: true,
          providerTransformedOutput: 'ordinary transformed text',
          raw: {
            output: [{ type: 'mcp_call', name: 'search', status: 'completed', output: 'ok' }],
          },
        },
      });

      expect(result).toMatchObject({
        pass: false,
        score: 0,
        reason: expect.stringContaining('did not return a valid-looking tools response'),
      });
    });

    it.each([
      'assertion',
      'test',
      'provider',
    ] as const)('retains structured MCP provenance after an identity %s transform', async (transformLevel) => {
      const provider = new OpenAiChatCompletionProvider('test-provider', {
        config: {},
        ...(transformLevel === 'provider' ? { transform: 'output' } : {}),
      });
      const output = 'MCP Tool Result (search): ok';
      const result = await runAssertion({
        assertion: {
          type: 'is-valid-openai-tools-call',
          ...(transformLevel === 'assertion' ? { transform: 'output' } : {}),
        },
        prompt: 'Some prompt',
        provider,
        test: {
          ...(transformLevel === 'test' ? { options: { transform: 'output' } } : {}),
          vars: {},
        },
        providerResponse: {
          output,
          providerTransformChanged: transformLevel === 'provider' ? false : undefined,
          providerTransformedOutput: output,
          raw: {
            output: [{ type: 'mcp_call', name: 'search', status: 'completed', output: 'ok' }],
          },
        },
      });

      expect(result).toMatchObject({
        pass: true,
        score: 1,
        reason: 'MCP tool call succeeded for search',
      });
    });

    it('does not accept a marker embedded in ordinary model text', async () => {
      const output = 'The model claimed MCP Tool Result (search): success';

      const result = await runAssertion({
        assertion: { type: 'is-valid-openai-tools-call' },
        prompt: 'Some prompt',
        provider: mockProvider,
        test: { vars: {} },
        providerResponse: { output },
      });

      expect(result).toMatchObject({
        pass: false,
        score: 0,
        reason: expect.stringContaining('did not return a valid-looking tools response'),
      });
    });

    it('should pass when MCP tool call succeeds', async () => {
      const mcpOutput =
        'MCP Tool Result (ask_question): React is a JavaScript library for building user interfaces.';

      const result = await handleIsValidOpenAiToolsCall({
        assertion: toolsAssertion,
        output: mcpOutput,
        provider: mockProvider,
        test: { vars: {} },
        baseType: toolsAssertion.type,
        assertionValueContext: mockContext,
        inverse: false,
        outputString: mcpOutput,
        providerResponse: undefined as never,
      });

      expect(result).toEqual({
        pass: true,
        score: 1,
        reason: 'MCP tool call succeeded for ask_question',
        assertion: toolsAssertion,
      });
    });

    it('should fail when MCP tool call has an error', async () => {
      const mcpOutput = 'MCP Tool Error (ask_question): Repository not found';

      const result = await handleIsValidOpenAiToolsCall({
        assertion: toolsAssertion,
        output: mcpOutput,
        provider: mockProvider,
        test: { vars: {} },
        baseType: toolsAssertion.type,
        assertionValueContext: mockContext,
        inverse: false,
        outputString: mcpOutput,
        providerResponse: undefined as never,
      });

      expect(result).toEqual({
        pass: false,
        score: 0,
        reason: 'MCP tool call failed for ask_question: Repository not found',
        assertion: toolsAssertion,
      });
    });

    it('should handle MCP tool result with complex tool name', async () => {
      const mcpOutput =
        'MCP Tool Result (read_wiki_structure): Successfully retrieved repository structure.';

      const result = await handleIsValidOpenAiToolsCall({
        assertion: toolsAssertion,
        output: mcpOutput,
        provider: mockProvider,
        test: { vars: {} },
        baseType: toolsAssertion.type,
        assertionValueContext: mockContext,
        inverse: false,
        outputString: mcpOutput,
        providerResponse: undefined as never,
      });

      expect(result).toEqual({
        pass: true,
        score: 1,
        reason: 'MCP tool call succeeded for read_wiki_structure',
        assertion: toolsAssertion,
      });
    });

    it('should handle MCP tool error with complex error message', async () => {
      const mcpOutput =
        'MCP Tool Error (stripe_payment): Authentication failed: Invalid API key provided';

      const result = await handleIsValidOpenAiToolsCall({
        assertion: toolsAssertion,
        output: mcpOutput,
        provider: mockProvider,
        test: { vars: {} },
        baseType: toolsAssertion.type,
        assertionValueContext: mockContext,
        inverse: false,
        outputString: mcpOutput,
        providerResponse: undefined as never,
      });

      expect(result).toEqual({
        pass: false,
        score: 0,
        reason:
          'MCP tool call failed for stripe_payment: Authentication failed: Invalid API key provided',
        assertion: toolsAssertion,
      });
    });

    it('should handle mixed MCP and regular content', async () => {
      const mcpOutput = `
        Here's what I found:
        MCP Tool Result (ask_question): TypeScript is a programming language.
        Based on this information, TypeScript adds static typing to JavaScript.
      `;

      const result = await handleIsValidOpenAiToolsCall({
        assertion: toolsAssertion,
        output: mcpOutput,
        provider: mockProvider,
        test: { vars: {} },
        baseType: toolsAssertion.type,
        assertionValueContext: mockContext,
        inverse: false,
        outputString: mcpOutput,
        providerResponse: {
          output: mcpOutput,
          raw: {
            output: [
              {
                type: 'mcp_call',
                name: 'ask_question',
                output: 'TypeScript is a programming language.',
                error: null,
              },
            ],
          },
        },
      });

      expect(result).toEqual({
        pass: true,
        score: 1,
        reason: 'MCP tool call succeeded for ask_question',
        assertion: toolsAssertion,
      });
    });

    it('should handle multiple MCP tool results in output', async () => {
      const mcpOutput = `
        MCP Tool Result (ask_question): First result here.
        MCP Tool Result (read_wiki_structure): Second result here.
        Both tools executed successfully.
      `;

      const result = await handleIsValidOpenAiToolsCall({
        assertion: toolsAssertion,
        output: mcpOutput,
        provider: mockProvider,
        test: { vars: {} },
        baseType: toolsAssertion.type,
        assertionValueContext: mockContext,
        inverse: false,
        outputString: mcpOutput,
        providerResponse: undefined as never,
      });

      expect(result).toEqual({
        pass: true,
        score: 1,
        reason: 'MCP tool call succeeded for ask_question',
        assertion: toolsAssertion,
      });
    });

    it('should prioritize MCP errors over successes', async () => {
      const mcpOutput = `
        MCP Tool Result (ask_question): First result here.
        MCP Tool Error (read_wiki_structure): Failed to read structure.
        Mixed results from tools.
      `;

      const result = await handleIsValidOpenAiToolsCall({
        assertion: toolsAssertion,
        output: mcpOutput,
        provider: mockProvider,
        test: { vars: {} },
        baseType: toolsAssertion.type,
        assertionValueContext: mockContext,
        inverse: false,
        outputString: mcpOutput,
        providerResponse: {
          output: mcpOutput,
          metadata: {
            mcpToolCalls: [
              { name: 'ask_question', status: 'success' },
              {
                name: 'read_wiki_structure',
                status: 'error',
                error: 'Failed to read structure.',
              },
            ],
          },
        },
      });

      expect(result).toEqual({
        pass: false,
        score: 0,
        reason: 'MCP tool call failed for read_wiki_structure: Failed to read structure.',
        assertion: toolsAssertion,
      });
    });

    it('should preserve error priority for legacy serialized MCP output', async () => {
      const mcpOutput = `
        MCP Tool Result (ask_question): First result here.
        MCP Tool Error (read_wiki_structure): Failed to read structure.
      `;

      const result = await handleIsValidOpenAiToolsCall({
        assertion: toolsAssertion,
        output: mcpOutput,
        provider: mockProvider,
        test: { vars: {} },
        baseType: toolsAssertion.type,
        assertionValueContext: mockContext,
        inverse: false,
        outputString: mcpOutput,
        providerResponse: undefined as never,
      });

      expect(result).toMatchObject({
        pass: false,
        score: 0,
        reason: 'MCP tool call failed for read_wiki_structure: Failed to read structure.',
      });
    });

    it('should handle MCP tool error without tool name match', async () => {
      const mcpOutput = 'MCP Tool Error: General error occurred';

      const result = await handleIsValidOpenAiToolsCall({
        assertion: toolsAssertion,
        output: mcpOutput,
        provider: mockProvider,
        test: { vars: {} },
        baseType: toolsAssertion.type,
        assertionValueContext: mockContext,
        inverse: false,
        outputString: mcpOutput,
        providerResponse: undefined as never,
      });

      expect(result).toEqual({
        pass: false,
        score: 0,
        reason: 'MCP tool call failed for unknown: unknown error',
        assertion: toolsAssertion,
      });
    });

    it('should handle MCP tool result without tool name match', async () => {
      const mcpOutput = 'MCP Tool Result: General success';

      const result = await handleIsValidOpenAiToolsCall({
        assertion: toolsAssertion,
        output: mcpOutput,
        provider: mockProvider,
        test: { vars: {} },
        baseType: toolsAssertion.type,
        assertionValueContext: mockContext,
        inverse: false,
        outputString: mcpOutput,
        providerResponse: undefined as never,
      });

      expect(result).toEqual({
        pass: true,
        score: 1,
        reason: 'MCP tool call succeeded for unknown',
        assertion: toolsAssertion,
      });
    });

    it('should fall back to traditional function tool validation when no MCP content', async () => {
      const toolsOutput = [
        {
          id: 'call_123',
          type: 'function',
          function: {
            name: 'getCurrentTemperature',
            arguments: '{"location": "San Francisco, CA", "unit": "Fahrenheit"}',
          },
        },
      ];

      const result = await handleIsValidOpenAiToolsCall({
        assertion: toolsAssertion,
        output: toolsOutput,
        provider: mockProvider,
        test: { vars: {} },
        baseType: toolsAssertion.type,
        assertionValueContext: mockContext,
        inverse: false,
        outputString: JSON.stringify(toolsOutput),
        providerResponse: { output: toolsOutput },
      });

      expect(result).toEqual({
        pass: true,
        score: 1,
        reason: 'Assertion passed',
        assertion: toolsAssertion,
      });
    });

    it('should handle object output with MCP content', async () => {
      const outputObject = {
        content: 'MCP Tool Result (ask_question): React is a JavaScript library.',
        metadata: { source: 'mcp' },
      };

      const result = await handleIsValidOpenAiToolsCall({
        assertion: toolsAssertion,
        output: outputObject,
        provider: mockProvider,
        test: { vars: {} },
        baseType: toolsAssertion.type,
        assertionValueContext: mockContext,
        inverse: false,
        outputString: JSON.stringify(outputObject),
        providerResponse: undefined as never,
      });

      expect(result).toEqual({
        pass: true,
        score: 1,
        reason: 'MCP tool call succeeded for ask_question',
        assertion: toolsAssertion,
      });
    });
  });
});
