import fs from 'fs';

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { handleIsValidFunctionCall } from '../../src/assertions/functionToolCall';
import { runAssertion } from '../../src/assertions/index';
import { handleIsValidOpenAiToolsCall } from '../../src/assertions/openai';
import { InvalidToolCallError } from '../../src/contracts';
import { hasFunctionToolCallValidator } from '../../src/contracts/providers';
import { validateFunctionCall as validateGoogleFunctionCall } from '../../src/providers/google/util';
import { OpenAiChatCompletionProvider } from '../../src/providers/openai/chat';
import { validateFunctionCall } from '../../src/providers/openai/util';
import { createToolCall, createTypeConfig } from '../factories/literalFixtures';
import { createMockProvider } from '../factories/provider';

import type { OpenAiTool } from '../../src/providers/openai/util';
import type {
  ApiProvider,
  Assertion,
  AssertionValueFunctionContext,
  AtomicTestCase,
  GradingResult,
  ProviderResponse,
} from '../../src/types/index';

const createFahrenheitFunctionCall = () => ({
  name: 'getCurrentTemperature',
  arguments: '{"location": "San Francisco, CA", "unit": "Fahrenheit"}',
});

const createCustomUnitFunctionCall = () => ({
  name: 'getCurrentTemperature',
  arguments: '{"location": "San Francisco, CA", "unit": "custom_unit"}',
});

const createTemperatureTool = (): OpenAiTool => ({
  type: 'function',
  function: createTemperatureFunction(),
});

const createTemperatureFunction = (): OpenAiTool['function'] => ({
  name: 'getCurrentTemperature',
  parameters: {
    type: 'object',
    properties: {
      location: { type: 'string' },
      unit: { type: 'string', enum: ['Celsius', 'Fahrenheit'] },
    },
    required: ['location', 'unit'],
  },
});

const createAddFunction = (): OpenAiTool['function'] => ({
  name: 'add',
  parameters: {
    type: 'object',
    properties: {
      x: { type: 'number' },
      y: { type: 'number' },
    },
    required: ['x', 'y'],
  },
});

const createAddProviderOptions = () => ({
  config: {
    functions: [createAddFunction()],
  },
});

const createTemplatedTemperatureFunction = (): OpenAiTool['function'] => ({
  name: 'getCurrentTemperature',
  parameters: {
    type: 'object',
    properties: {
      location: { type: 'string' },
      unit: { type: 'string', enum: ['{{unit}}'] },
    },
    required: ['location', 'unit'],
  },
});

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

const toolsAssertion: Assertion = createTypeConfig('is-valid-openai-tools-call');

const functionAssertion: Assertion = createTypeConfig('is-valid-openai-function-call');

const mockProvider = new OpenAiChatCompletionProvider('test-provider', {
  config: {
    tools: [createTemperatureTool()],
    functions: [createTemperatureFunction()],
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
  const createValidToolsCallCheck = () => async () => {
    const toolsOutput = [
      {
        id: 'call_123',
        type: 'function',
        function: createFahrenheitFunctionCall(),
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
  };

  beforeEach(() => {
    vi.resetAllMocks();
    mocks.mockPathResolve.mockImplementation((...args: string[]) => args[args.length - 1]);
    mockedFs.existsSync.mockReturnValue(true);
    mocks.mockMaybeLoadToolsFromExternalFile.mockImplementation((input) => input);
  });

  describe('is-valid-openai-function-call assertion', () => {
    it('should pass for a valid function call with correct arguments', async () => {
      const output = { arguments: '{"x": 10, "y": 20}', name: 'add' };

      const provider = new OpenAiChatCompletionProvider('foo', createAddProviderOptions());
      const providerResponse = { output };
      const result: GradingResult = await runAssertion({
        prompt: 'Some prompt',
        provider,
        assertion: createTypeConfig('is-valid-openai-function-call'),
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

      const provider = new OpenAiChatCompletionProvider('foo', createAddProviderOptions());
      const providerResponse = { output };
      const result: GradingResult = await runAssertion({
        prompt: 'Some prompt',
        provider,
        assertion: createTypeConfig('is-valid-openai-function-call'),
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
        provider: new OpenAiChatCompletionProvider('foo', createAddProviderOptions()),
        assertion: createTypeConfig('is-valid-openai-function-call'),
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
      const functionOutput = createFahrenheitFunctionCall();

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
      const functionOutput = createFahrenheitFunctionCall();

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
      const functionOutput = createCustomUnitFunctionCall();

      const varProvider = new OpenAiChatCompletionProvider('test-provider', {
        config: {
          functions: [createTemplatedTemperatureFunction()],
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
        reason: 'Called "getCurrentTemperature", but there is no function with that name',
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
                function: createAddFunction(),
              },
            ],
          },
        }),
        assertion: createTypeConfig('is-valid-openai-tools-call'),
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
            tools: [createTemperatureTool()],
          },
        }),
        assertion: createTypeConfig('is-valid-openai-tools-call'),
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
              createTemperatureTool(),
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
        assertion: createTypeConfig('is-valid-openai-tools-call'),
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
                function: createAddFunction(),
              },
            ],
          },
        }),
        assertion: createTypeConfig('is-valid-openai-tools-call'),
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
    it('should pass when tool calls match schema', createValidToolsCallCheck());

    it.each(['custom', 'function_call', undefined])(
      'rejects a non-function call with a fabricated function payload: %s',
      async (type) => {
        const invalidCall = { type, function: createFahrenheitFunctionCall() };
        for (const output of [[invalidCall], { tool_calls: [invalidCall] }]) {
          const result = await runAssertion({
            prompt: 'Some prompt',
            provider: mockProvider,
            assertion: toolsAssertion,
            test: {},
            providerResponse: { output },
          });
          expect(result).toMatchObject({ pass: false, score: 0 });
          expect(result.reason).toContain('OpenAI did not return a valid-looking tools response');
        }
      },
    );

    it('should load tools from external file', async () => {
      const toolsOutput = [
        {
          id: 'call_123',
          type: 'function',
          function: createFahrenheitFunctionCall(),
        },
      ];

      // Define the array of tools that should be returned by the mock
      const mockParsedTools = [createTemperatureTool()];

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
          function: createCustomUnitFunctionCall(),
        },
      ];

      const varProvider = new OpenAiChatCompletionProvider('test-provider', {
        config: {
          tools: [
            {
              type: 'function',
              function: createTemplatedTemperatureFunction(),
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
      const toolsOutput = [createToolCall()];

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
      const toolsOutput = createToolCall();

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

    it('should return pass:false instead of throwing when a tool call has no function object', async () => {
      // Reachable via OpenAI custom tools (type: 'custom'), a null function, or any other
      // malformed tool_calls entry. The guard is meant to reject these with a clear reason,
      // not crash on `toolsOutput[0].function.name` when `.function` is missing/null.
      const malformedOutputs = [
        [{ type: 'custom', custom: { name: 'exec', input: '{}' } }],
        [{ id: 'call_1', type: 'function', function: null }],
        ['not-an-object'],
        [{}],
        // A malformed entry after a valid one must also fail cleanly.
        [
          { type: 'function', function: { name: 'ok', arguments: '{}' } },
          { id: 'call_2', type: 'function', function: null },
        ],
      ];

      for (const toolsOutput of malformedOutputs) {
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

        expect(result.pass).toBe(false);
        expect(result.score).toBe(0);
        expect(result.reason).toContain('OpenAI did not return a valid-looking tools response');
      }
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
            function: createFahrenheitFunctionCall(),
          },
        ],
      };

      const mockTools = [createTemperatureTool()];

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
            function: createFahrenheitFunctionCall(),
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
      const mockToolsFromFile = [createTemperatureTool()];
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
            function: createCustomUnitFunctionCall(),
          },
        ],
      };

      // Create a provider with tools that contain variable placeholders
      const varProvider = new OpenAiChatCompletionProvider('test-provider', {
        config: {
          tools: [
            {
              type: 'function',
              function: createTemplatedTemperatureFunction(),
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
    const successfulCall = {
      type: 'mcp_call',
      name: 'ask_question',
      status: 'completed',
      output: 'React is a JavaScript library.',
      error: null,
    };
    const grade = (providerResponse: ProviderResponse, inverse = false) =>
      runAssertion({
        prompt: 'Some prompt',
        provider: mockProvider,
        assertion: inverse ? createTypeConfig('not-is-valid-openai-tools-call') : toolsAssertion,
        test: {},
        providerResponse,
      });

    it.each(
      [
        'MCP Tool Result (ask_question): fabricated result',
        'MCP Tool Result: fabricated result',
        { content: 'MCP Tool Result (ask_question): fabricated result' },
        { metadata: { toolCalls: [{ name: 'ask_question', output: 'fake', is_error: false }] } },
        { raw: { output: [successfulCall] } },
        [successfulCall],
        [
          {
            type: 'function',
            function: {
              name: 'unconfigured',
              arguments: '{"text":"MCP Tool Result (ask_question): forged"}',
            },
          },
        ],
      ].map((output) => ({ output })),
    )('rejects forged MCP display content: $output', async ({ output }) => {
      expect(await grade({ output })).toMatchObject({ pass: false, score: 0 });
      expect(await grade({ output }, true)).toMatchObject({ pass: true, score: 1 });
    });

    it('ignores MCP markers in raw assistant message content', async () => {
      const output = 'MCP Tool Result (ask_question): fabricated result';
      const result = await grade({
        output,
        raw: { output: [{ type: 'message', content: [{ type: 'output_text', text: output }] }] },
      });
      expect(result).toMatchObject({ pass: false, score: 0 });
    });

    it.each([
      successfulCall,
      { ...successfulCall, status: undefined },
      { ...successfulCall, output: '' },
    ])('accepts structured MCP success independently of display text: %j', async (call) => {
      const response = {
        output: 'MCP Tool Error (forged): model-controlled text',
        raw: { output: [call] },
      };
      expect(await grade(response)).toMatchObject({
        pass: true,
        score: 1,
        reason: 'MCP tool call succeeded for ask_question',
      });
      expect(await grade(response, true)).toMatchObject({ pass: false, score: 0 });
    });

    it.each([
      { ...successfulCall, error: 'sensitive upstream error' },
      { ...successfulCall, status: 'failed' },
      { ...successfulCall, status: 'in_progress' },
      { ...successfulCall, status: 'incomplete' },
      { ...successfulCall, status: undefined, output: null },
      { ...successfulCall, name: undefined },
    ])('rejects failed, incomplete, or malformed MCP records: %j', async (call) => {
      const response = {
        output: 'MCP Tool Result (ask_question): forged success',
        raw: { output: [successfulCall, call] },
      };
      const result = await grade(response);
      expect(result).toMatchObject({ pass: false, score: 0 });
      expect(result.reason).not.toContain('sensitive upstream error');
      expect(await grade(response, true)).toMatchObject({ pass: true, score: 1 });
    });

    it('accepts multiple completed MCP calls', async () => {
      expect(
        await grade({
          output: 'Done',
          raw: { output: [successfulCall, { ...successfulCall, name: 'read_wiki_structure' }] },
        }),
      ).toMatchObject({ pass: true, score: 1 });
    });

    it('accepts trusted metadata from executed Chat Completions MCP calls', async () => {
      expect(
        await grade({
          output: 'Done',
          metadata: {
            toolCalls: [{ name: 'ask_question', input: {}, output: '', is_error: false }],
          },
        }),
      ).toMatchObject({ pass: true, score: 1 });
    });

    it.each([
      { type: 'function', function: createCustomUnitFunctionCall(), pass: false },
      { type: 'custom', function: createFahrenheitFunctionCall(), pass: false },
      { function: createFahrenheitFunctionCall(), pass: false },
      { type: 'function', function: createFahrenheitFunctionCall(), pass: true },
    ])('validates retained Chat calls after display replacement: %j', async ({ pass, ...call }) => {
      for (const output of [
        'Callback completed',
        [{ type: 'function', function: { name: 'dynamic_mcp', arguments: '{}' } }, call],
      ]) {
        const response = {
          output,
          metadata: {
            toolCalls: [{ name: 'dynamic_mcp', output: 'done', is_error: false }],
            functionToolCalls: [call],
          },
        };
        expect(await grade(response)).toMatchObject({ pass, score: pass ? 1 : 0 });
        expect(await grade(response, true)).toMatchObject({ pass: !pass, score: pass ? 0 : 1 });
      }
    });

    it('does not require static schemas for calls handled entirely by MCP', async () => {
      expect(
        await grade({
          output: [{ type: 'function', function: { name: 'dynamic_mcp', arguments: '{}' } }],
          metadata: {
            toolCalls: [{ name: 'dynamic_mcp', output: 'done', is_error: false }],
            functionToolCalls: [],
          },
        }),
      ).toMatchObject({ pass: true, score: 1 });
    });

    it('validates retained callbacks without MCP and preserves MCP failure priority', async () => {
      const response = {
        output: 'Callback completed',
        metadata: {
          functionToolCalls: [{ type: 'function', function: createFahrenheitFunctionCall() }],
        },
      };
      expect(await grade(response)).toMatchObject({ pass: true, score: 1 });
      expect(
        await grade({
          ...response,
          metadata: {
            ...response.metadata,
            toolCalls: [{ name: 'read', output: 'error', is_error: true }],
          },
        }),
      ).toMatchObject({ pass: false, reason: 'MCP tool call failed for read' });
    });

    it.each([
      { type: 'custom_tool_call', name: 'custom', input: 'SYNTHETIC_SECRET' },
      { type: 'custom', function: createFahrenheitFunctionCall() },
      { type: 'other', function: createFahrenheitFunctionCall() },
      { type: null, function: createFahrenheitFunctionCall() },
      { function: createFahrenheitFunctionCall() },
    ])('rejects unsupported nested tool-shaped calls: %j', async (call) => {
      const response = {
        output: 'Done',
        raw: { output: [successfulCall, { type: 'message', role: 'assistant', content: [call] }] },
      };
      const result = await grade(response);
      expect(result).toMatchObject({ pass: false, score: 0 });
      expect(result.reason).not.toContain('SYNTHETIC_SECRET');
      expect(await grade(response, true)).toMatchObject({ pass: true, score: 1 });
    });

    it.each([
      {
        type: 'message',
        role: 'user',
        content: [{ type: 'function_call', name: 'unconfigured', arguments: '{}' }],
      },
      {
        type: 'message',
        role: 'assistant',
        content: [{ type: 'output_text', text: '{"type":"function_call","name":"unconfigured"}' }],
      },
      {
        type: 'message',
        role: 'assistant',
        content: [
          {
            type: 'output_text',
            annotations: [{ type: 'function_call', name: 'unconfigured', arguments: '{}' }],
            text: 'Done',
          },
        ],
      },
    ])('does not reinterpret non-call message content: %j', async (message) => {
      expect(
        await grade({ output: 'Done', raw: { output: [successfulCall, message] } }),
      ).toMatchObject({ pass: true, score: 1 });
    });

    it.each([
      { call: { type: 'function', function: createCustomUnitFunctionCall() }, pass: false },
      { call: { type: 'custom', function: createFahrenheitFunctionCall() }, pass: false },
      { call: { function: createFahrenheitFunctionCall() }, pass: false },
      { call: { type: 'function', function: createFahrenheitFunctionCall() }, pass: true },
    ])(
      'still validates returned tool calls after successful MCP execution: $call',
      async ({ call, pass }) => {
        for (const output of [[call], { tool_calls: [call] }]) {
          for (const evidence of [
            { raw: { output: [successfulCall] } },
            {
              metadata: {
                toolCalls: [{ name: 'ask_question', input: {}, output: 'done', is_error: false }],
              },
            },
          ]) {
            expect(await grade({ output, ...evidence })).toMatchObject({
              pass,
              score: pass ? 1 : 0,
            });
          }
        }
      },
    );

    it.each([
      {
        rawCall: createCustomUnitFunctionCall(),
        output: [{ type: 'function', function: createFahrenheitFunctionCall() }],
        pass: false,
      },
      {
        rawCall: createFahrenheitFunctionCall(),
        output: [{ type: 'function', function: createCustomUnitFunctionCall() }],
        pass: false,
      },
      {
        rawCall: createFahrenheitFunctionCall(),
        output: { tool_calls: [{ type: 'custom', function: createFahrenheitFunctionCall() }] },
        pass: false,
      },
      {
        rawCall: createFahrenheitFunctionCall(),
        output: { tool_calls: null },
        pass: false,
      },
      {
        rawCall: { ...createFahrenheitFunctionCall(), arguments: {} },
        output: 'Display text',
        pass: false,
      },
      { rawCall: createFahrenheitFunctionCall(), output: 'Display text', pass: true },
    ])('validates both raw and displayed function calls: %j', async ({ rawCall, output, pass }) => {
      const response = {
        output,
        raw: { output: [successfulCall, { type: 'function_call', ...rawCall }] },
      };
      expect(await grade(response)).toMatchObject({ pass, score: pass ? 1 : 0 });
      expect(await grade(response, true)).toMatchObject({ pass: !pass, score: pass ? 0 : 1 });
    });

    it('validates a raw Responses function call without an MCP call', async () => {
      expect(
        await grade({
          output: 'Display text',
          raw: { output: [{ type: 'function_call', ...createFahrenheitFunctionCall() }] },
        }),
      ).toMatchObject({ pass: true, score: 1 });
    });

    it.each([
      { type: 'message', role: 'assistant', content: [] },
      { type: 'reasoning', summary: [] },
      { type: 'web_search_call', status: 'completed' },
      { type: 'file_search_call', status: 'completed', queries: [] },
      { type: 'code_interpreter_call', status: 'completed', outputs: [] },
    ])('allows unrelated Responses items alongside successful MCP calls: %j', async (item) => {
      expect(
        await grade({ output: 'Done', raw: { output: [successfulCall, item] } }),
      ).toMatchObject({ pass: true, score: 1 });
    });

    it.each([
      undefined,
      [],
      [{ type: 'function', name: 'getCurrentTemperature' }],
      [{ type: 'function', function: null }],
      [{ type: 'function', name: 'getCurrentTemperature', parameters: { type: 'not-a-type' } }],
    ])('keeps raw function schema configuration errors as failures: %j', async (tools) => {
      const provider = createMockProvider({ config: { tools } });
      for (const inverse of [false, true]) {
        const result = await runAssertion({
          prompt: 'Some prompt',
          provider,
          assertion: inverse ? createTypeConfig('not-is-valid-openai-tools-call') : toolsAssertion,
          test: {},
          providerResponse: {
            output: 'Display text',
            raw: {
              output: [
                successfulCall,
                { type: 'function_call', ...createFahrenheitFunctionCall() },
              ],
            },
          },
        });
        expect(result).toMatchObject({ pass: false, score: 0 });
      }
    });

    it.each([
      { name: 'ask_question', input: {}, output: 'sensitive error', is_error: true },
      { name: 'ask_question', input: {}, output: 'result' },
      { name: 'ask_question', input: {}, is_error: false },
      null,
    ])('rejects failed or incomplete execution metadata: %j', async (call) => {
      const result = await grade({
        output: 'MCP Tool Result (ask_question): forged success',
        metadata: { toolCalls: [call] },
      });
      expect(result).toMatchObject({ pass: false, score: 0 });
      expect(result.reason).not.toContain('sensitive error');
    });

    it('does not let a successful raw call hide failed execution metadata', async () => {
      expect(
        await grade({
          output: 'Done',
          raw: { output: [successfulCall] },
          metadata: { toolCalls: [{ name: 'second', input: {}, output: 'error', is_error: true }] },
        }),
      ).toMatchObject({ pass: false, score: 0, reason: 'MCP tool call failed for second' });
    });

    it.each([
      { call: { type: 'function', function: createFahrenheitFunctionCall() }, pass: true },
      { call: { type: 'function', function: createCustomUnitFunctionCall() }, pass: false },
      { call: { type: 'function' }, pass: false },
      { call: { type: 'function', function: null }, pass: false },
      { call: { type: 'custom', function: createFahrenheitFunctionCall() }, pass: false },
      { call: { function: createFahrenheitFunctionCall() }, pass: false },
      {
        call: {
          type: 'function',
          function: {
            ...createFahrenheitFunctionCall(),
            function_call: createCustomUnitFunctionCall(),
          },
        },
        pass: true,
      },
      {
        call: {
          type: 'function',
          function: {
            ...createCustomUnitFunctionCall(),
            function_call: createFahrenheitFunctionCall(),
          },
        },
        pass: false,
      },
    ])('preserves raw Chat declaration payload and discriminator: %j', async ({ call, pass }) => {
      for (const nested of [false, true]) {
        const response = {
          output: 'Done',
          raw: {
            output: [
              successfulCall,
              ...(nested ? [{ type: 'message', role: 'assistant', content: [call] }] : [call]),
            ],
          },
        };
        expect(await grade(response)).toMatchObject({ pass, score: Number(pass) });
        expect(await grade(response, true)).toMatchObject({ pass: !pass, score: Number(!pass) });
      }
    });

    it.each([
      { type: 'custom', custom: { name: 'exec', input: 'PRIVATE_CALL_PAYLOAD' } },
      { type: 'custom' },
      { custom: { name: 'exec', input: 'PRIVATE_CALL_PAYLOAD' } },
      { type: 'unsupported', custom: { name: 'exec', input: 'PRIVATE_CALL_PAYLOAD' } },
      { type: 'unsupported', function: createFahrenheitFunctionCall() },
    ])('keeps unsupported wrapped calls fatal beside MCP and valid functions: %j', async (call) => {
      for (const nested of [false, true]) {
        for (const location of ['raw', 'metadata']) {
          const response = {
            output: 'Done',
            raw: {
              output: [
                successfulCall,
                { type: 'function', function: createFahrenheitFunctionCall() },
                ...(location === 'raw'
                  ? nested
                    ? [{ type: 'message', role: 'assistant', content: [call] }]
                    : [call]
                  : []),
              ],
            },
            ...(location === 'metadata' ? { metadata: { toolCalls: [call] } } : {}),
          };
          for (const inverse of [false, true]) {
            const result = await grade(response, inverse);
            expect(result).toMatchObject({ pass: inverse, score: Number(inverse) });
            expect(result.reason).not.toContain('PRIVATE_CALL_PAYLOAD');
          }
        }
      }
    });

    it('keeps protocol text and reasoning separate from ordinary and MCP calls', async () => {
      const response = {
        output: 'Done',
        raw: {
          output: [
            successfulCall,
            { type: 'function', function: createFahrenheitFunctionCall() },
            { type: 'function_call', ...createFahrenheitFunctionCall() },
            { type: 'reasoning', summary: [] },
            {
              type: 'message',
              role: 'assistant',
              content: [{ type: 'output_text', text: 'Done' }],
            },
            { type: 'unknown_protocol_item' },
          ],
        },
      };
      expect(await grade(response)).toMatchObject({ pass: true, score: 1 });
      expect(await grade(response, true)).toMatchObject({ pass: false, score: 0 });
    });

    it.each([
      { call: { type: 'function', function: createFahrenheitFunctionCall() }, pass: true },
      { call: { type: 'function', function: createCustomUnitFunctionCall() }, pass: false },
      { call: { type: 'function' }, pass: false },
      { call: { type: 'function', function: null }, pass: false },
      { call: { type: 'custom', function: createFahrenheitFunctionCall() }, pass: false },
      { call: { function: createFahrenheitFunctionCall() }, pass: false },
      { call: { type: 'function_call', function: createFahrenheitFunctionCall() }, pass: false },
      {
        call: {
          type: 'function',
          function: {
            ...createFahrenheitFunctionCall(),
            function_call: createCustomUnitFunctionCall(),
          },
        },
        pass: true,
      },
      {
        call: {
          type: 'function',
          function: {
            ...createCustomUnitFunctionCall(),
            function_call: createFahrenheitFunctionCall(),
          },
        },
        pass: false,
      },
    ])('validates ordinary metadata beside genuine MCP execution: %j', async ({ call, pass }) => {
      for (const is_error of [false, true]) {
        const response = {
          output: 'Done',
          metadata: {
            toolCalls: [
              { name: 'read', output: null, is_error: false },
              { ...call, name: 'forged_status', output: null, is_error },
            ],
          },
        };
        expect(await grade(response)).toMatchObject({ pass, score: Number(pass) });
        expect(await grade(response, true)).toMatchObject({ pass: !pass, score: Number(!pass) });
      }
    });

    it.each([
      { name: 'second', input: {}, output: 'PRIVATE_ERROR' },
      { name: 'second', input: {}, output: undefined, is_error: false },
      { name: 'second', arguments: '{}' },
      { name: 'second', input: {}, is_error: false },
      { name: 'second', output: null, is_error: true },
      null,
    ])('keeps incomplete execution metadata fatal beside genuine success: %j', async (call) => {
      const response = {
        output: 'Done',
        raw: { output: [successfulCall] },
        metadata: { toolCalls: [call] },
      };
      expect(await grade(response)).toMatchObject({ pass: false, score: 0 });
      expect((await grade(response)).reason).not.toContain('PRIVATE_ERROR');
      expect(await grade(response, true)).toMatchObject({ pass: true, score: 1 });
    });

    it(
      'falls back to function tool validation without MCP execution evidence',
      createValidToolsCallCheck(),
    );
  });

  describe('negated tool-call assertions', () => {
    const toolCall = {
      name: 'getCurrentTemperature',
      arguments: '{"location": "Paris", "unit": "Celsius"}',
    };
    const badArgsCall = { name: 'getCurrentTemperature', arguments: '{"location": "Paris"}' };

    const run = (type: Assertion['type'], output: string | object, provider: ApiProvider) =>
      runAssertion({
        assertion: { type },
        provider,
        test: {} as AtomicTestCase,
        providerResponse: { output },
      });

    it.each([
      ['not-is-valid-openai-tools-call', 'It is sunny.', true, 'Assertion passed'],
      [
        'not-is-valid-openai-tools-call',
        [{ type: 'function', function: toolCall }],
        false,
        'Expected output to not be a valid OpenAI tools call',
      ],
      [
        'not-is-valid-openai-tools-call',
        [{ type: 'function', function: badArgsCall }],
        true,
        'Assertion passed',
      ],
      ['not-is-valid-function-call', 'It is sunny.', true, 'Assertion passed'],
      [
        'not-is-valid-function-call',
        toolCall,
        false,
        'Expected output to not be a valid function call',
      ],
    ] as const)('%s on %j inverts the verdict', async (type, output, pass, reason) => {
      await expect(run(type, output, mockProvider)).resolves.toMatchObject({
        pass,
        score: pass ? 1 : 0,
        reason,
      });
    });

    it('keeps a missing tools config as a failure under not-', async () => {
      const provider = new OpenAiChatCompletionProvider('test-provider', { config: {} });
      await expect(
        run('not-is-valid-openai-tools-call', [{ type: 'function', function: toolCall }], provider),
      ).resolves.toMatchObject({
        pass: false,
        reason: 'No tools configured in provider, but output contains tool calls',
      });
    });

    it('keeps a tool schema that does not compile as a failure under not-', async () => {
      const provider = new OpenAiChatCompletionProvider('test-provider', {
        config: {
          tools: [
            {
              type: 'function',
              function: {
                name: 'getCurrentTemperature',
                parameters: { type: 'object', properties: { location: { type: 'not-a-type' } } },
              },
            },
          ],
        },
      });
      const result = await run(
        'not-is-valid-openai-tools-call',
        [{ type: 'function', function: toolCall }],
        provider,
      );
      expect(result).toMatchObject({ pass: false, score: 0 });
      expect(result.reason).toContain('schema is invalid');
    });

    it('keeps an unreadable functions file as a failure under not-', async () => {
      const provider = new OpenAiChatCompletionProvider('test-provider', {
        config: { functions: 'file:///nonexistent/functions.json' as any },
      });
      const result = await run('not-is-valid-function-call', toolCall, provider);
      expect(result).toMatchObject({ pass: false, score: 0 });
      expect(result.reason).toContain('/nonexistent/functions.json');
    });

    it('keeps a functions config that is not an array as a failure under not-', async () => {
      const provider = new OpenAiChatCompletionProvider('test-provider', {
        config: { functions: { name: 'getCurrentTemperature' } as any },
      });
      await expect(run('not-is-valid-function-call', toolCall, provider)).resolves.toMatchObject({
        pass: false,
        score: 0,
        reason: 'Expected the loaded functions to be an array',
      });
    });

    it('keeps a provider without a validator as a failure under not-', async () => {
      await expect(
        run('not-is-valid-function-call', toolCall, createMockProvider()),
      ).resolves.toMatchObject({
        pass: false,
        reason: 'Provider does not have functionality for checking function call.',
      });
    });

    it.each([null, {}, { name: 42 }, { name: 'getCurrentTemperature' }])(
      'keeps malformed function definitions from passing negation: %j',
      async (definition) => {
        const provider = new OpenAiChatCompletionProvider('test-provider', {
          config: { functions: [definition] as any },
        });
        await expect(run('not-is-valid-function-call', toolCall, provider)).resolves.toMatchObject({
          pass: false,
          score: 0,
        });
      },
    );

    it.each([{}, [null], [{ type: 'function', function: null }]])(
      'keeps malformed tools config from passing negation: %j',
      async (tools) => {
        const provider = new OpenAiChatCompletionProvider('test-provider', {
          config: { tools: tools as any },
        });
        await expect(
          run(
            'not-is-valid-openai-tools-call',
            [{ type: 'function', function: toolCall }],
            provider,
          ),
        ).resolves.toMatchObject({ pass: false, score: 0 });
      },
    );

    it('does not invert an unexpected validator failure', async () => {
      const provider = {
        ...createMockProvider(),
        validateFunctionToolCall: () => {
          throw new Error('validator unavailable');
        },
      };
      await expect(run('not-is-valid-function-call', toolCall, provider)).resolves.toMatchObject({
        pass: false,
        score: 0,
        reason: 'validator unavailable',
      });
    });

    it('inverts invalid-call errors from a custom provider using the public contract', async () => {
      const provider = {
        ...createMockProvider(),
        validateFunctionToolCall: () => {
          throw new InvalidToolCallError('Unknown function');
        },
      };
      await expect(run('is-valid-function-call', toolCall, provider)).resolves.toMatchObject({
        pass: false,
        score: 0,
        reason: 'Unknown function',
      });
      await expect(run('not-is-valid-function-call', toolCall, provider)).resolves.toMatchObject({
        pass: true,
        score: 1,
      });
    });

    it.each([{ type: 'function' }, { type: 'function', function: null }])(
      'rejects incomplete tools alongside a valid definition: %j',
      async (incomplete) => {
        const provider = new OpenAiChatCompletionProvider('test-provider', {
          config: {
            tools: [
              { type: 'function', function: { name: 'weather', parameters: { type: 'object' } } },
              incomplete,
            ] as any,
          },
        });
        await expect(
          run(
            'not-is-valid-openai-tools-call',
            [{ type: 'function', function: badArgsCall }],
            provider,
          ),
        ).resolves.toMatchObject({ pass: false, score: 0 });
      },
    );

    it.each([
      [undefined, true],
      [{ type: 'OBJECT', properties: {} }, true],
      [{ type: 'OBJECT', properties: { city: { type: 'STRING' } }, required: ['city'] }, false],
    ])('validates omitted Google args against %j', async (parameters, valid) => {
      const provider = {
        ...createMockProvider(),
        validateFunctionToolCall: (value: string | object) =>
          validateGoogleFunctionCall(value, [
            { functionDeclarations: [{ name: 'weather', parameters }] },
          ] as any),
      };
      const output = { toolCall: { functionCalls: [{ name: 'weather' }] } };
      await expect(run('is-valid-function-call', output, provider)).resolves.toMatchObject({
        pass: valid,
        score: valid ? 1 : 0,
      });
      await expect(run('not-is-valid-function-call', output, provider)).resolves.toMatchObject({
        pass: !valid,
        score: valid ? 0 : 1,
      });
    });

    it.each([
      [{ toolCall: { functionCalls: [] } }, true],
      [[], true],
      [{ toolCall: { functionCalls: [{ name: 'weather', args: {} }] } }, false],
      [{ toolCall: { functionCalls: [{ name: 'weather', args: '{}' }] } }, false],
    ])('negates the actual Google call validity: %j', async (output, pass) => {
      const provider = {
        ...createMockProvider(),
        validateFunctionToolCall: (value: string | object) =>
          validateGoogleFunctionCall(value, [
            {
              functionDeclarations: [
                { name: 'weather', parameters: { type: 'OBJECT', properties: {} } },
              ],
            },
          ] as any),
      };
      await expect(run('not-is-valid-function-call', output, provider)).resolves.toMatchObject({
        pass,
        score: pass ? 1 : 0,
      });
    });

    it.each([[null], [{ functionDeclarations: [null] }], [{ functionDeclarations: {} }]])(
      'does not invert malformed Google declarations: %j',
      async (tools) => {
        const provider = {
          ...createMockProvider(),
          validateFunctionToolCall: (value: string | object) =>
            validateGoogleFunctionCall(value, tools as any),
        };
        await expect(
          run(
            'not-is-valid-function-call',
            {
              toolCall: { functionCalls: [{ name: 'weather', args: {} }] },
            },
            provider,
          ),
        ).resolves.toMatchObject({ pass: false, score: 0 });
      },
    );
  });
});
