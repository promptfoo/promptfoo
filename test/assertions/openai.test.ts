import fs from 'fs';
import path from 'path';
import {
  handleIsValidOpenAiToolsCall,
  handleIsValidOpenAiFunctionCall,
} from '../../src/assertions/openai';
import type { Assertion, ApiProvider, AssertionValueFunctionContext } from '../../src/types';

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

const mockProvider = {
  id: () => 'test-provider',
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
  callApi: async () => ({ output: '' }),
} as ApiProvider;

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
        ...mockProvider,
        config: {
          tools: 'file://./test/fixtures/weather_tools.yaml',
        },
      };

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

      const varProvider = {
        ...mockProvider,
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
      };

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

      const emptyProvider = {
        ...mockProvider,
        config: {},
      };

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

      const emptyToolsProvider = {
        ...mockProvider,
        config: {
          tools: [],
        },
      };

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

  describe('handleIsValidOpenAiFunctionCall', () => {
    it('should pass when function call matches schema', () => {
      const functionOutput = {
        name: 'getCurrentTemperature',
        arguments: '{"location": "San Francisco, CA", "unit": "Fahrenheit"}',
      };

      const result = handleIsValidOpenAiFunctionCall({
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
        ...mockProvider,
        config: {
          functions: 'file://./test/fixtures/weather_functions.yaml',
        },
      };

      const result = handleIsValidOpenAiFunctionCall({
        assertion: functionAssertion,
        output: functionOutput,
        provider: fileProvider,
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

      const varProvider = {
        ...mockProvider,
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
      };

      const result = handleIsValidOpenAiFunctionCall({
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

      const emptyProvider = {
        ...mockProvider,
        config: {},
      };

      const result = handleIsValidOpenAiFunctionCall({
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

      const result = handleIsValidOpenAiFunctionCall({
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

      const result = handleIsValidOpenAiFunctionCall({
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
});
