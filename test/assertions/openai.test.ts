import fs from 'fs';
import path from 'path';
import { runAssertion } from '../../src/assertions';
import { handleIsValidFunctionCall } from '../../src/assertions/functionToolCall';
import { handleIsValidOpenAiToolsCall } from '../../src/assertions/openai';
import { OpenAiChatCompletionProvider } from '../../src/providers/openai/chat';
import { validateFunctionCall } from '../../src/providers/openai/util';
import type { OpenAiTool } from '../../src/providers/openai/util';
import type {
  Assertion,
  ApiProvider,
  AssertionValueFunctionContext,
  AtomicTestCase,
  GradingResult,
} from '../../src/types';
import { maybeLoadToolsFromExternalFile } from '../../src/util';

jest.mock('fs');
jest.mock('path', () => ({
  ...jest.requireActual('path'),
  resolve: jest.fn(),
}));
jest.mock('../../src/util', () => ({
  ...jest.requireActual('../../src/util'),
  maybeLoadToolsFromExternalFile: jest.fn(),
}));

const mockedFs = jest.mocked(fs);
const mockedPath = jest.mocked(path);
const mockMaybeLoadToolsFromExternalFile = jest.mocked(maybeLoadToolsFromExternalFile);

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
    jest.resetAllMocks();
    mockedPath.resolve.mockImplementation((...args) => args[args.length - 1]);
    mockedFs.existsSync.mockReturnValue(true);
    mockMaybeLoadToolsFromExternalFile.mockImplementation((input) => input);
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
    it('should pass when function call matches schema', () => {
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
        context: mockContext,
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

    it('should load functions from external file', () => {
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

      const fileProvider = {
        id: () => 'test-provider',
        config: {
          functions: 'file://./test/fixtures/weather_functions.yaml',
        },
        callApi: async () => ({ output: '' }),
      } as ApiProvider;

      expect(() => {
        validateFunctionCall(functionOutput, fileProvider.config.functions, {});
      }).not.toThrow();

      expect(mockedFs.existsSync).toHaveBeenCalledWith('./test/fixtures/weather_functions.yaml');
      expect(mockedFs.readFileSync).toHaveBeenCalledWith(
        './test/fixtures/weather_functions.yaml',
        'utf8',
      );
    });

    it('should render variables in function definitions', () => {
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
        context: mockContext,
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

    it('should fail when functions are not defined', () => {
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
        context: mockContext,
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

    it('should fail when function output is not an object', () => {
      const functionOutput = 'not an object';

      const result = handleIsValidFunctionCall({
        assertion: functionAssertion,
        output: functionOutput,
        provider: mockProvider,
        test: { vars: {} },
        baseType: functionAssertion.type,
        context: mockContext,
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

    it('should fail when function call does not match schema', () => {
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
        context: mockContext,
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
    it('should pass when tool calls match schema', () => {
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

      const result = handleIsValidOpenAiToolsCall({
        assertion: toolsAssertion,
        output: toolsOutput,
        provider: mockProvider,
        test: { vars: {} },
        baseType: toolsAssertion.type,
        context: mockContext,
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

    it('should load tools from external file', () => {
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
      mockMaybeLoadToolsFromExternalFile.mockReturnValue(mockParsedTools);

      const fileProvider = {
        id: () => 'test-provider',
        config: {
          tools: 'file://./test/fixtures/weather_tools.json' as unknown as OpenAiTool[],
        },
        callApi: async () => ({ output: '' }),
      } as ApiProvider;

      const result = handleIsValidOpenAiToolsCall({
        assertion: toolsAssertion,
        output: toolsOutput,
        provider: fileProvider,
        test: { vars: {} },
        baseType: toolsAssertion.type,
        context: mockContext,
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

      // Verify mockMaybeLoadToolsFromExternalFile was called with the file path
      expect(mockMaybeLoadToolsFromExternalFile).toHaveBeenCalledWith(
        'file://./test/fixtures/weather_tools.json',
        {},
      );
    });

    it('should render variables in tool definitions', () => {
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

      const result = handleIsValidOpenAiToolsCall({
        assertion: toolsAssertion,
        output: toolsOutput,
        provider: varProvider,
        test: { vars: { unit: 'custom_unit' } },
        baseType: toolsAssertion.type,
        context: mockContext,
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

    it('should fail when tools are not defined', () => {
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

      expect(() =>
        handleIsValidOpenAiToolsCall({
          assertion: toolsAssertion,
          output: toolsOutput,
          provider: emptyProvider,
          test: { vars: {} },
          baseType: toolsAssertion.type,
          context: mockContext,
          inverse: false,
          outputString: JSON.stringify(toolsOutput),
          providerResponse: { output: toolsOutput },
        }),
      ).toThrow('Tools are expected to be an array of objects with a function property');
    });

    it('should fail when tool output is not an array', () => {
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

      const result = handleIsValidOpenAiToolsCall({
        assertion: toolsAssertion,
        output: toolsOutput,
        provider: emptyToolsProvider,
        test: { vars: {} },
        baseType: toolsAssertion.type,
        context: mockContext,
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

    it('should fail when tool call does not match schema', () => {
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

      const result = handleIsValidOpenAiToolsCall({
        assertion: toolsAssertion,
        output: toolsOutput,
        provider: mockProvider,
        test: { vars: {} },
        baseType: toolsAssertion.type,
        context: mockContext,
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

    it('should use maybeLoadToolsFromExternalFile to process tools', () => {
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
      mockMaybeLoadToolsFromExternalFile.mockReturnValue(mockTools);

      const result = handleIsValidOpenAiToolsCall({
        assertion: toolsAssertion,
        output: toolOutput,
        provider: mockProvider,
        test: { vars: { city: 'San Francisco, CA' } },
        baseType: toolsAssertion.type,
        context: mockContext,
        inverse: false,
        outputString: JSON.stringify(toolOutput),
        providerResponse: { output: toolOutput },
      });

      expect(mockMaybeLoadToolsFromExternalFile).toHaveBeenCalledWith(mockProvider.config.tools, {
        city: 'San Francisco, CA',
      });

      expect(result).toEqual({
        pass: true,
        score: 1,
        reason: 'Assertion passed',
        assertion: toolsAssertion,
      });
    });

    it('should handle external file references for tools', () => {
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
      mockMaybeLoadToolsFromExternalFile.mockReturnValue(mockToolsFromFile);

      const result = handleIsValidOpenAiToolsCall({
        assertion: toolsAssertion,
        output: toolOutput,
        provider: fileProvider,
        test: { vars: {} },
        baseType: toolsAssertion.type,
        context: { ...mockContext, provider: fileProvider },
        inverse: false,
        outputString: JSON.stringify(toolOutput),
        providerResponse: { output: toolOutput },
      });

      // Check that the function was called with the file path
      expect(mockMaybeLoadToolsFromExternalFile).toHaveBeenCalledWith(
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

    it('should handle variable substitution in tools', () => {
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
      mockMaybeLoadToolsFromExternalFile.mockReturnValue(processedTools);

      const result = handleIsValidOpenAiToolsCall({
        assertion: toolsAssertion,
        output: toolOutput,
        provider: varProvider,
        test: { vars: { unit: 'custom_unit' } },
        baseType: toolsAssertion.type,
        context: { ...mockContext, provider: varProvider },
        inverse: false,
        outputString: JSON.stringify(toolOutput),
        providerResponse: { output: toolOutput },
      });

      // Verify the function was called with variables
      expect(mockMaybeLoadToolsFromExternalFile).toHaveBeenCalledWith(varProvider.config.tools, {
        unit: 'custom_unit',
      });

      expect(result).toEqual({
        pass: true,
        score: 1,
        reason: 'Assertion passed',
        assertion: toolsAssertion,
      });
    });
  });

  describe('handleIsValidOpenAiToolsCall with MCP support', () => {
    it('should pass when MCP tool call succeeds', () => {
      const mcpOutput =
        'MCP Tool Result (ask_question): React is a JavaScript library for building user interfaces.';

      const result = handleIsValidOpenAiToolsCall({
        assertion: toolsAssertion,
        output: mcpOutput,
        provider: mockProvider,
        test: { vars: {} },
        baseType: toolsAssertion.type,
        context: mockContext,
        inverse: false,
        outputString: mcpOutput,
        providerResponse: { output: mcpOutput },
      });

      expect(result).toEqual({
        pass: true,
        score: 1,
        reason: 'MCP tool call succeeded for ask_question',
        assertion: toolsAssertion,
      });
    });

    it('should fail when MCP tool call has an error', () => {
      const mcpOutput = 'MCP Tool Error (ask_question): Repository not found';

      const result = handleIsValidOpenAiToolsCall({
        assertion: toolsAssertion,
        output: mcpOutput,
        provider: mockProvider,
        test: { vars: {} },
        baseType: toolsAssertion.type,
        context: mockContext,
        inverse: false,
        outputString: mcpOutput,
        providerResponse: { output: mcpOutput },
      });

      expect(result).toEqual({
        pass: false,
        score: 0,
        reason: 'MCP tool call failed for ask_question: Repository not found',
        assertion: toolsAssertion,
      });
    });

    it('should handle MCP tool result with complex tool name', () => {
      const mcpOutput =
        'MCP Tool Result (read_wiki_structure): Successfully retrieved repository structure.';

      const result = handleIsValidOpenAiToolsCall({
        assertion: toolsAssertion,
        output: mcpOutput,
        provider: mockProvider,
        test: { vars: {} },
        baseType: toolsAssertion.type,
        context: mockContext,
        inverse: false,
        outputString: mcpOutput,
        providerResponse: { output: mcpOutput },
      });

      expect(result).toEqual({
        pass: true,
        score: 1,
        reason: 'MCP tool call succeeded for read_wiki_structure',
        assertion: toolsAssertion,
      });
    });

    it('should handle MCP tool error with complex error message', () => {
      const mcpOutput =
        'MCP Tool Error (stripe_payment): Authentication failed: Invalid API key provided';

      const result = handleIsValidOpenAiToolsCall({
        assertion: toolsAssertion,
        output: mcpOutput,
        provider: mockProvider,
        test: { vars: {} },
        baseType: toolsAssertion.type,
        context: mockContext,
        inverse: false,
        outputString: mcpOutput,
        providerResponse: { output: mcpOutput },
      });

      expect(result).toEqual({
        pass: false,
        score: 0,
        reason:
          'MCP tool call failed for stripe_payment: Authentication failed: Invalid API key provided',
        assertion: toolsAssertion,
      });
    });

    it('should handle mixed MCP and regular content', () => {
      const mcpOutput = `
        Here's what I found:
        MCP Tool Result (ask_question): TypeScript is a programming language.
        Based on this information, TypeScript adds static typing to JavaScript.
      `;

      const result = handleIsValidOpenAiToolsCall({
        assertion: toolsAssertion,
        output: mcpOutput,
        provider: mockProvider,
        test: { vars: {} },
        baseType: toolsAssertion.type,
        context: mockContext,
        inverse: false,
        outputString: mcpOutput,
        providerResponse: { output: mcpOutput },
      });

      expect(result).toEqual({
        pass: true,
        score: 1,
        reason: 'MCP tool call succeeded for ask_question',
        assertion: toolsAssertion,
      });
    });

    it('should handle multiple MCP tool results in output', () => {
      const mcpOutput = `
        MCP Tool Result (ask_question): First result here.
        MCP Tool Result (read_wiki_structure): Second result here.
        Both tools executed successfully.
      `;

      const result = handleIsValidOpenAiToolsCall({
        assertion: toolsAssertion,
        output: mcpOutput,
        provider: mockProvider,
        test: { vars: {} },
        baseType: toolsAssertion.type,
        context: mockContext,
        inverse: false,
        outputString: mcpOutput,
        providerResponse: { output: mcpOutput },
      });

      expect(result).toEqual({
        pass: true,
        score: 1,
        reason: 'MCP tool call succeeded for ask_question',
        assertion: toolsAssertion,
      });
    });

    it('should prioritize MCP errors over successes', () => {
      const mcpOutput = `
        MCP Tool Result (ask_question): First result here.
        MCP Tool Error (read_wiki_structure): Failed to read structure.
        Mixed results from tools.
      `;

      const result = handleIsValidOpenAiToolsCall({
        assertion: toolsAssertion,
        output: mcpOutput,
        provider: mockProvider,
        test: { vars: {} },
        baseType: toolsAssertion.type,
        context: mockContext,
        inverse: false,
        outputString: mcpOutput,
        providerResponse: { output: mcpOutput },
      });

      expect(result).toEqual({
        pass: false,
        score: 0,
        reason: 'MCP tool call failed for read_wiki_structure: Failed to read structure.',
        assertion: toolsAssertion,
      });
    });

    it('should handle MCP tool error without tool name match', () => {
      const mcpOutput = 'MCP Tool Error: General error occurred';

      const result = handleIsValidOpenAiToolsCall({
        assertion: toolsAssertion,
        output: mcpOutput,
        provider: mockProvider,
        test: { vars: {} },
        baseType: toolsAssertion.type,
        context: mockContext,
        inverse: false,
        outputString: mcpOutput,
        providerResponse: { output: mcpOutput },
      });

      expect(result).toEqual({
        pass: false,
        score: 0,
        reason: 'MCP tool call failed for unknown: unknown error',
        assertion: toolsAssertion,
      });
    });

    it('should handle MCP tool result without tool name match', () => {
      const mcpOutput = 'MCP Tool Result: General success';

      const result = handleIsValidOpenAiToolsCall({
        assertion: toolsAssertion,
        output: mcpOutput,
        provider: mockProvider,
        test: { vars: {} },
        baseType: toolsAssertion.type,
        context: mockContext,
        inverse: false,
        outputString: mcpOutput,
        providerResponse: { output: mcpOutput },
      });

      expect(result).toEqual({
        pass: true,
        score: 1,
        reason: 'MCP tool call succeeded for unknown',
        assertion: toolsAssertion,
      });
    });

    it('should fall back to traditional function tool validation when no MCP content', () => {
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

      const result = handleIsValidOpenAiToolsCall({
        assertion: toolsAssertion,
        output: toolsOutput,
        provider: mockProvider,
        test: { vars: {} },
        baseType: toolsAssertion.type,
        context: mockContext,
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

    it('should handle object output with MCP content', () => {
      const outputObject = {
        content: 'MCP Tool Result (ask_question): React is a JavaScript library.',
        metadata: { source: 'mcp' },
      };

      const result = handleIsValidOpenAiToolsCall({
        assertion: toolsAssertion,
        output: outputObject,
        provider: mockProvider,
        test: { vars: {} },
        baseType: toolsAssertion.type,
        context: mockContext,
        inverse: false,
        outputString: JSON.stringify(outputObject),
        providerResponse: { output: outputObject },
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
