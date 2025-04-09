import fs from 'fs';
import path from 'path';
import { runAssertion } from '../../src/assertions';
import { handleIsValidFunctionCall } from '../../src/assertions/functionToolCall';
import { handleIsValidOpenAiToolsCall } from '../../src/assertions/openai';
import { OpenAiChatCompletionProvider } from '../../src/providers/openai/chat';
import { validateFunctionCall } from '../../src/providers/openai/util';
import type {
  Assertion,
  ApiProvider,
  AssertionValueFunctionContext,
  AtomicTestCase,
  GradingResult,
} from '../../src/types';

jest.mock('fs');
jest.mock('path');

const mockedFs = jest.mocked(fs);
const mockedPath = jest.mocked(path);

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
    // Basic validation tests
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

    // External file loading tests
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

      const mockYamlContent = `
- type: function
  function:
    name: getCurrentTemperature
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
          tools: 'file://./test/fixtures/weather_tools.yaml',
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

      expect(mockedFs.existsSync).toHaveBeenCalledWith('./test/fixtures/weather_tools.yaml');
      expect(mockedFs.readFileSync).toHaveBeenCalledWith(
        './test/fixtures/weather_tools.yaml',
        'utf8',
      );
    });

    // Variable rendering tests
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

    // Error cases
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
  });
});
