import fs from 'fs';
import path from 'path';
import { runAssertion } from '../../src/assertions';
import { handleIsValidGoogleFunctionCall } from '../../src/assertions/google';
import { AIStudioChatProvider } from '../../src/providers/google/ai.studio';
import { GoogleMMLiveProvider } from '../../src/providers/google/live';
import { VertexChatProvider } from '../../src/providers/google/vertex';
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

const functionAssertion: Assertion = {
  type: 'is-valid-google-function-call',
};

const mockProvider = {
  id: () => 'test-provider',
  config: {
    tools: [
      {
        functionDeclarations: [
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
      {
        googleSearch: {},
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

describe('Google assertions', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    mockedPath.resolve.mockImplementation((...args) => args[args.length - 1]);
    mockedFs.existsSync.mockReturnValue(true);
  });

  describe('API agnostic handleIsValidGoogleFunctionCall assertions', () => {
    it('should pass when function call matches schema', () => {
      const functionOutput = {
        name: 'getCurrentTemperature',
        args: '{"location": "San Francisco, CA", "unit": "Fahrenheit"}',
      };

      const result = handleIsValidGoogleFunctionCall({
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
        args: '{"location": "San Francisco, CA", "unit": "Fahrenheit"}',
      };

      const mockYamlContent = `
      [
        {
          "functionDeclarations": [
            {
              "name": "getCurrentTemperature",
              "parameters": {
                "type": "OBJECT",
                "properties": {
                  "location": {
                    "type": "STRING"
                  },
                  "unit": {
                    "type": "STRING",
                    "enum": ["Celsius", "Fahrenheit"]
                  }
                },
                "required": ["location", "unit"]
              }
            }
          ]
        }
      ]`;

      mockedFs.readFileSync.mockReturnValue(mockYamlContent);

      const fileProvider = {
        ...mockProvider,
        config: {
          tools: 'file://./test/fixtures/weather_functions.json',
        },
      };

      const result = handleIsValidGoogleFunctionCall({
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

      expect(mockedFs.existsSync).toHaveBeenCalledWith('./test/fixtures/weather_functions.json');
      expect(mockedFs.readFileSync).toHaveBeenCalledWith(
        './test/fixtures/weather_functions.json',
        'utf8',
      );
    });

    it('should render variables in function definitions', () => {
      const functionOutput = {
        name: 'getCurrentTemperature',
        args: '{"location": "San Francisco, CA", "unit": "custom_unit"}',
      };

      const varProvider = {
        ...mockProvider,
        config: {
          tools: [
            {
              functionDeclarations: [
                {
                  name: 'getCurrentTemperature',
                  parameters: {
                    type: 'OBJECT',
                    properties: {
                      location: { type: 'STRING' },
                      unit: { type: 'STRING', enum: ['{{unit}}'] },
                    },
                    required: ['location', 'unit'],
                  },
                },
              ],
            },
          ],
        },
      };

      const result = handleIsValidGoogleFunctionCall({
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
        args: '{"location": "San Francisco, CA"}',
      };

      const emptyProvider = {
        ...mockProvider,
        config: {},
      };

      const result = handleIsValidGoogleFunctionCall({
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

      const result = handleIsValidGoogleFunctionCall({
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
        reason: expect.stringContaining('Google did not return a valid-looking function call'),
        assertion: functionAssertion,
      });
    });

    it('should fail when function call does not match schema', () => {
      const functionOutput = {
        name: 'getCurrentTemperature',
        args: '{"location": "San Francisco, CA"}', // missing required 'unit'
      };

      const result = handleIsValidGoogleFunctionCall({
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

  describe('AI Studio api is-valid-google-function-call assertion', () => {
    it('should pass for a valid function call with correct arguments', async () => {
      const output = { args: '{"x": 10, "y": 20}', name: 'add' };

      const provider = new AIStudioChatProvider('foo', {
        config: {
          tools: [
            {
              functionDeclarations: [
                {
                  name: 'add',
                  description: 'add numbers',
                  parameters: {
                    type: 'OBJECT',
                    properties: {
                      x: { type: 'NUMBER' },
                      y: { type: 'NUMBER' },
                    },
                    required: ['x', 'y'],
                  },
                },
              ],
            },
            {
              googleSearch: {},
            },
          ],
        },
      });
      const providerResponse = { output };
      const result: GradingResult = await runAssertion({
        prompt: 'Some prompt',
        provider,
        assertion: {
          type: 'is-valid-google-function-call',
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
        functionCall: { args: '{"x": 10, "y": 20}', name: 'add' },
      };

      const provider = new AIStudioChatProvider('foo', {
        config: {
          tools: [
            {
              functionDeclarations: [
                {
                  name: 'add',
                  parameters: {
                    type: 'OBJECT',
                    properties: {
                      x: { type: 'NUMBER' },
                      y: { type: 'NUMBER' },
                    },
                    required: ['x', 'y'],
                  },
                },
              ],
            },
          ],
        },
      });
      const providerResponse = { output };
      const result: GradingResult = await runAssertion({
        prompt: 'Some prompt',
        provider,
        assertion: {
          type: 'is-valid-google-function-call',
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
      const output = { args: '{"x": "10", "y": 20}', name: 'add' };

      const result: GradingResult = await runAssertion({
        prompt: 'Some prompt',
        provider: new AIStudioChatProvider('foo', {
          config: {
            tools: [
              {
                functionDeclarations: [
                  {
                    name: 'add',
                    parameters: {
                      type: 'OBJECT',
                      properties: {
                        x: { type: 'NUMBER' },
                        y: { type: 'NUMBER' },
                      },
                      required: ['x', 'y'],
                    },
                  },
                ],
              },
            ],
          },
        }),
        assertion: {
          type: 'is-valid-google-function-call',
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

  describe('Vertex api is-valid-google-function-call assertion', () => {
    it('should pass for a valid function call with correct arguments', async () => {
      const output = { args: '{"x": 10, "y": 20}', name: 'add' };

      const provider = new VertexChatProvider('foo', {
        config: {
          tools: [
            {
              functionDeclarations: [
                {
                  name: 'add',
                  description: 'add numbers',
                  parameters: {
                    type: 'OBJECT',
                    properties: {
                      x: { type: 'NUMBER' },
                      y: { type: 'NUMBER' },
                    },
                    required: ['x', 'y'],
                  },
                },
              ],
            },
            {
              googleSearch: {},
            },
          ],
        },
      });
      const providerResponse = { output };
      const result: GradingResult = await runAssertion({
        prompt: 'Some prompt',
        provider,
        assertion: {
          type: 'is-valid-google-function-call',
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
        functionCall: { args: '{"x": 10, "y": 20}', name: 'add' },
      };

      const provider = new VertexChatProvider('foo', {
        config: {
          tools: [
            {
              functionDeclarations: [
                {
                  name: 'add',
                  parameters: {
                    type: 'OBJECT',
                    properties: {
                      x: { type: 'NUMBER' },
                      y: { type: 'NUMBER' },
                    },
                    required: ['x', 'y'],
                  },
                },
              ],
            },
          ],
        },
      });
      const providerResponse = { output };
      const result: GradingResult = await runAssertion({
        prompt: 'Some prompt',
        provider,
        assertion: {
          type: 'is-valid-google-function-call',
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
      const output = { args: '{"x": "10", "y": 20}', name: 'add' };

      const result: GradingResult = await runAssertion({
        prompt: 'Some prompt',
        provider: new VertexChatProvider('foo', {
          config: {
            tools: [
              {
                functionDeclarations: [
                  {
                    name: 'add',
                    parameters: {
                      type: 'OBJECT',
                      properties: {
                        x: { type: 'NUMBER' },
                        y: { type: 'NUMBER' },
                      },
                      required: ['x', 'y'],
                    },
                  },
                ],
              },
            ],
          },
        }),
        assertion: {
          type: 'is-valid-google-function-call',
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

  describe('Live api is-valid-google-function-call assertion', () => {
    it('should pass for a valid function call with correct arguments', async () => {
      const output = { args: '{"x": 10, "y": 20}', name: 'add' };

      const provider = new GoogleMMLiveProvider('foo', {
        config: {
          tools: [
            {
              functionDeclarations: [
                {
                  name: 'add',
                  description: 'add numbers',
                  parameters: {
                    type: 'OBJECT',
                    properties: {
                      x: { type: 'NUMBER' },
                      y: { type: 'NUMBER' },
                    },
                    required: ['x', 'y'],
                  },
                },
              ],
            },
            {
              googleSearch: {},
            },
          ],
        },
      });
      const providerResponse = { output };
      const result: GradingResult = await runAssertion({
        prompt: 'Some prompt',
        provider,
        assertion: {
          type: 'is-valid-google-function-call',
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
        functionCall: { args: '{"x": 10, "y": 20}', name: 'add' },
      };

      const provider = new GoogleMMLiveProvider('foo', {
        config: {
          tools: [
            {
              functionDeclarations: [
                {
                  name: 'add',
                  parameters: {
                    type: 'OBJECT',
                    properties: {
                      x: { type: 'NUMBER' },
                      y: { type: 'NUMBER' },
                    },
                    required: ['x', 'y'],
                  },
                },
              ],
            },
          ],
        },
      });
      const providerResponse = { output };
      const result: GradingResult = await runAssertion({
        prompt: 'Some prompt',
        provider,
        assertion: {
          type: 'is-valid-google-function-call',
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
      const output = { args: '{"x": "10", "y": 20}', name: 'add' };

      const result: GradingResult = await runAssertion({
        prompt: 'Some prompt',
        provider: new GoogleMMLiveProvider('foo', {
          config: {
            tools: [
              {
                functionDeclarations: [
                  {
                    name: 'add',
                    parameters: {
                      type: 'OBJECT',
                      properties: {
                        x: { type: 'NUMBER' },
                        y: { type: 'NUMBER' },
                      },
                      required: ['x', 'y'],
                    },
                  },
                ],
              },
            ],
          },
        }),
        assertion: {
          type: 'is-valid-google-function-call',
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
});
