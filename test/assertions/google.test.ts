import fs from 'fs';
import path from 'path';

import { runAssertion } from '../../src/assertions';
import { AIStudioChatProvider } from '../../src/providers/google/ai.studio';
import { GoogleLiveProvider } from '../../src/providers/google/live';
import { validateFunctionCall } from '../../src/providers/google/util';
import { VertexChatProvider } from '../../src/providers/google/vertex';

import type { Tool } from '../../src/providers/google//types';
import type { ApiProvider, AtomicTestCase, GradingResult } from '../../src/types';

jest.mock('fs');
jest.mock('path', () => ({
  ...jest.requireActual('path'),
  resolve: jest.fn(),
}));

const mockedFs = jest.mocked(fs);
const mockedPath = jest.mocked(path);

const mockProvider = {
  id: () => 'test-provider',
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
                unit: { type: 'STRING', enum: ['Celsius', 'Fahrenheit'] },
              },
              required: ['location', 'unit'],
            },
          },
          {
            name: 'addOne',
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

describe('Google assertions', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    mockedPath.resolve.mockImplementation((...args) => args[args.length - 1]);
    mockedFs.existsSync.mockReturnValue(true);
  });

  describe('API agnostic handleIsValidFunctionCall assertions', () => {
    it('should pass when vertex/ais function call matches schema', () => {
      const functionOutput = [
        { text: 'test text' },
        {
          functionCall: {
            name: 'getCurrentTemperature',
            args: '{"location": "San Francisco, CA", "unit": "Fahrenheit"}',
          },
        },
      ];

      expect(() => {
        validateFunctionCall(functionOutput, mockProvider.config.tools, {});
      }).not.toThrow();
    });

    it('should pass when Live function call matches schema', () => {
      const functionOutput = {
        toolCall: {
          functionCalls: [
            {
              name: 'getCurrentTemperature',
              args: '{"location": "San Francisco, CA", "unit": "Fahrenheit"}',
            },
          ],
        },
      };

      expect(() => {
        validateFunctionCall(JSON.stringify(functionOutput), mockProvider.config.tools, {});
      }).not.toThrow();
    });

    it('should pass when matches schema no args', () => {
      const functionOutput = [
        {
          functionCall: {
            name: 'addOne',
            args: '{}',
          },
        },
      ];

      expect(() => {
        validateFunctionCall(functionOutput, mockProvider.config.tools, {});
      }).not.toThrow();
    });

    it('should fail when doesnt match schema parameters', () => {
      const functionOutput = [
        {
          functionCall: {
            name: 'addOne',
            args: '{"number": 1}',
          },
        },
      ];

      expect(() => {
        validateFunctionCall(functionOutput, mockProvider.config.tools, {});
      }).toThrow(
        'Call to "addOne":\n{"name":"addOne","args":"{\\"number\\": 1}"}\ndoes not match schema:\n{"name":"addOne"}',
      );
    });

    it('should fail when matches schema no args', () => {
      const functionOutput = [
        {
          functionCall: {
            name: 'getCurrentTemperature',
            args: '{}',
          },
        },
      ];

      expect(() => {
        validateFunctionCall(functionOutput, mockProvider.config.tools, {});
      }).toThrow(
        'Call to "getCurrentTemperature":\n{"name":"getCurrentTemperature","args":"{}"}\ndoes not match schema:\n{"name":"getCurrentTemperature","parameters":{"type":"OBJECT","properties":{"location":{"type":"STRING"},"unit":{"type":"STRING","enum":["Celsius","Fahrenheit"]}},"required":["location","unit"]}}',
      );
    });

    it('should load functions from external file', () => {
      const functionOutput = [
        {
          functionCall: {
            name: 'getCurrentTemperature',
            args: '{"location": "San Francisco, CA", "unit": "Fahrenheit"}',
          },
        },
      ];

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

      expect(() => {
        validateFunctionCall(functionOutput, fileProvider.config.tools, {});
      }).not.toThrow();

      expect(mockedFs.existsSync).toHaveBeenCalledWith('./test/fixtures/weather_functions.json');
      expect(mockedFs.readFileSync).toHaveBeenCalledWith(
        './test/fixtures/weather_functions.json',
        'utf8',
      );
    });

    it('should render variables in function definitions', () => {
      const functionOutput = [
        {
          functionCall: {
            name: 'getCurrentTemperature',
            args: '{"location": "San Francisco, CA", "unit": "custom_unit"}',
          },
        },
      ];

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

      expect(() => {
        validateFunctionCall(functionOutput, varProvider.config.tools as Tool[], {
          unit: 'custom_unit',
        });
      }).not.toThrow();
    });

    it('should fail when functions are not defined', () => {
      const functionOutput = [
        {
          functionCall: {
            name: 'getCurrentTemperature',
            args: '{"location": "San Francisco, CA"}',
          },
        },
      ];

      const emptyProvider = {
        ...mockProvider,
        config: {
          tools: [],
        },
      };
      expect(() => {
        validateFunctionCall(functionOutput, emptyProvider.config.tools, {});
      }).toThrow('Called "getCurrentTemperature", but there is no function with that name');
    });

    it('should fail when function output is not an object', () => {
      const functionOutput = 'not an object';
      expect(() => {
        validateFunctionCall(functionOutput, mockProvider.config.tools, {});
      }).toThrow('Google did not return a valid-looking function call');
    });

    it('should fail when function call does not match schema', () => {
      const functionOutput = [
        {
          functionCall: {
            name: 'getCurrentTemperature',
            args: '{"location": "San Francisco, CA"}', // missing required 'unit'
          },
        },
      ];
      expect(() => {
        validateFunctionCall(functionOutput, mockProvider.config.tools, {});
      }).toThrow(
        'Call to "getCurrentTemperature":\n{"name":"getCurrentTemperature","args":"{\\"location\\": \\"San Francisco, CA\\"}"}\ndoes not match schema:\n[{"instancePath":"","schemaPath":"#/required","keyword":"required","params":{"missingProperty":"unit"},"message":"must have required property \'unit\'"}]',
      );
    });
  });

  describe('AI Studio api is-valid-function-call assertion', () => {
    it('should pass for a valid function call with correct arguments', async () => {
      const output = [{ functionCall: { args: '{"x": 10, "y": 20}', name: 'add' } }];

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
          type: 'is-valid-function-call',
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
      const output = [
        {
          functionCall: { args: '{"x": "10", "y": 20}', name: 'add' },
        },
      ];

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
          type: 'is-valid-function-call',
        },
        test: {} as AtomicTestCase,
        providerResponse: { output },
      });

      expect(result).toMatchObject({
        pass: false,
        reason: expect.stringContaining('Call to "add":'),
      });
    });
  });

  describe('Vertex api is-valid-function-call assertion', () => {
    it('should pass for a valid function call with correct arguments', async () => {
      const output = [{ functionCall: { args: '{"x": 10, "y": 20}', name: 'add' } }];

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
          type: 'is-valid-function-call',
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
      const output = [
        {
          functionCall: { args: '{"x": "10", "y": 20}', name: 'add' },
        },
      ];

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
          type: 'is-valid-function-call',
        },
        test: {} as AtomicTestCase,
        providerResponse: { output },
      });

      expect(result).toMatchObject({
        pass: false,
        reason: expect.stringContaining('Call to "add":'),
      });
    });
  });

  describe('Live api is-valid-function-call assertion', () => {
    it('should pass for a valid function call with correct arguments', async () => {
      const output = JSON.stringify({
        toolCall: { functionCalls: [{ args: { x: 10, y: 20 }, name: 'add' }] },
      });

      const provider = new GoogleLiveProvider('foo', {
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
          type: 'is-valid-function-call',
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
      const output = JSON.stringify({
        toolCall: { functionCalls: [{ args: '{"x": "10", "y": 20}', name: 'add' }] },
      });

      const result: GradingResult = await runAssertion({
        prompt: 'Some prompt',
        provider: new GoogleLiveProvider('foo', {
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
          type: 'is-valid-function-call',
        },
        test: {} as AtomicTestCase,
        providerResponse: { output },
      });

      expect(result).toMatchObject({
        pass: false,
        reason: expect.stringContaining('Call to "add":'),
      });
    });
  });
});
