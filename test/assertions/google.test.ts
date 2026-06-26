import fs from 'fs';

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { runAssertion } from '../../src/assertions/index';
import { AIStudioChatProvider } from '../../src/providers/google/ai.studio';
import { GoogleLiveProvider } from '../../src/providers/google/live';
import { GoogleProvider } from '../../src/providers/google/provider';
import { validateFunctionCall } from '../../src/providers/google/util';
import { VertexChatProvider } from '../../src/providers/google/vertex';
import { createMockProvider } from '../factories/provider';

import type { Tool } from '../../src/providers/google/types';
import type { ApiProvider, AtomicTestCase, GradingResult } from '../../src/types/index';

// Create hoisted mocks for stable references
const mocks = vi.hoisted(() => ({
  mockPathResolve: vi.fn(),
}));

vi.mock('fs');
vi.mock('path', async () => {
  const actual = await vi.importActual<typeof import('path')>('path');
  return {
    ...actual,
    resolve: mocks.mockPathResolve,
  };
});

const mockedFs = vi.mocked(fs);

const mockProvider = createMockProvider({
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
  response: { output: '' },
}) as ApiProvider;

describe('Google assertions', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.mockPathResolve.mockImplementation((...args: string[]) => args[args.length - 1]);
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
      }).toThrow("must have required property 'location'");
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

      // Note: existsSync is no longer called - we use try/catch on readFileSync instead (TOCTOU fix)
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
      }).toThrow('No function schemas configured in provider, but output contains a function call');
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

  describe('Unified GoogleProvider api is-valid-function-call assertion', () => {
    it('should pass for a direct GoogleProvider instance', async () => {
      const output = [{ functionCall: { args: '{"x": 10, "y": 20}', name: 'add' } }];

      const provider = new GoogleProvider('foo', {
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
      const result: GradingResult = await runAssertion({
        prompt: 'Some prompt',
        provider,
        assertion: {
          type: 'is-valid-function-call',
        },
        test: {} as AtomicTestCase,
        providerResponse: { output },
      });

      expect(result).toMatchObject({
        pass: true,
        reason: 'Assertion passed',
      });
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

    it('should validate function declarations across all tool groups', async () => {
      const output = JSON.stringify({
        toolCall: { functionCalls: [{ args: '{}', name: 'secondTool' }] },
      });
      const provider = new GoogleLiveProvider('foo', {
        config: {
          tools: [
            { functionDeclarations: [{ name: 'firstTool' }] },
            { functionDeclarations: [{ name: 'secondTool' }] },
          ],
        },
      });

      const result = await runAssertion({
        prompt: 'Some prompt',
        provider,
        assertion: { type: 'is-valid-function-call' },
        test: {} as AtomicTestCase,
        providerResponse: { output },
      });

      expect(result).toMatchObject({
        pass: true,
        score: 1,
        reason: 'Assertion passed',
      });
    });

    it('does not invert an unused malformed function declaration', async () => {
      const output = JSON.stringify({
        toolCall: { functionCalls: [{ args: '{}', name: 'valid' }] },
      });
      const provider = new GoogleLiveProvider('foo', {
        config: {
          tools: [
            { functionDeclarations: [{ name: 'valid' }] },
            {
              functionDeclarations: [
                {
                  name: 'broken',
                  parameters: { type: 'TYPE_UNSPECIFIED' as never },
                },
              ],
            },
          ],
        },
      });

      const [positive, inverse] = await Promise.all(
        (['is-valid-function-call', 'not-is-valid-function-call'] as const).map((type) =>
          runAssertion({
            prompt: 'Some prompt',
            provider,
            assertion: { type },
            test: {} as AtomicTestCase,
            providerResponse: { output },
          }),
        ),
      );

      expect(positive).toMatchObject({
        pass: false,
        score: 0,
        reason: expect.stringContaining("Tool schema doesn't compile with ajv"),
      });
      expect(inverse).toMatchObject({
        pass: false,
        score: 0,
        reason: expect.stringContaining("Tool schema doesn't compile with ajv"),
      });
    });

    it.each([
      [
        'property ordering',
        {
          type: 'OBJECT',
          properties: { value: { type: 'STRING' } },
          propertyOrdering: ['value'],
        },
      ],
      [
        'string array bounds',
        {
          type: 'OBJECT',
          properties: {
            values: {
              type: 'ARRAY',
              items: { type: 'STRING' },
              minItems: '1',
              maxItems: '2',
            },
          },
        },
      ],
      [
        'custom format',
        {
          type: 'OBJECT',
          properties: {
            choice: { type: 'STRING', format: 'enum', enum: ['A', 'B'] },
          },
        },
      ],
    ] as const)('does not let an unused valid %s schema poison another call', async (_name, parameters) => {
      const output = JSON.stringify({
        toolCall: { functionCalls: [{ name: 'plain' }] },
      });
      const provider = new GoogleLiveProvider('foo', {
        config: {
          tools: [
            { functionDeclarations: [{ name: 'plain' }] },
            {
              functionDeclarations: [{ name: 'unused', parameters: parameters as never }],
            },
          ],
        },
      });

      const [positive, inverse] = await Promise.all(
        (['is-valid-function-call', 'not-is-valid-function-call'] as const).map((type) =>
          runAssertion({
            prompt: 'Some prompt',
            provider,
            assertion: { type },
            test: {} as AtomicTestCase,
            providerResponse: { output },
          }),
        ),
      );

      expect(positive).toMatchObject({ pass: true, score: 1 });
      expect(inverse).toMatchObject({ pass: false, score: 0 });
    });

    it.each([
      'propertyOrdering',
      'property_ordering',
    ] as const)('validates an argument property named %s', async (propertyName) => {
      const provider = new AIStudioChatProvider('foo', {
        config: {
          tools: [
            {
              functionDeclarations: [
                {
                  name: 'collision',
                  parameters: {
                    type: 'OBJECT',
                    properties: { [propertyName]: { type: 'STRING' } },
                    propertyOrdering: [propertyName],
                    required: [propertyName],
                  },
                },
              ],
            },
          ],
        },
      });
      const run = (value: unknown, type: 'is-valid-function-call' | 'not-is-valid-function-call') =>
        runAssertion({
          prompt: 'Some prompt',
          provider,
          assertion: { type },
          test: {} as AtomicTestCase,
          providerResponse: {
            output: [{ functionCall: { name: 'collision', args: { [propertyName]: value } } }],
          },
        });

      const [invalidPositive, invalidInverse, validPositive, validInverse] = await Promise.all([
        run(42, 'is-valid-function-call'),
        run(42, 'not-is-valid-function-call'),
        run('ordered', 'is-valid-function-call'),
        run('ordered', 'not-is-valid-function-call'),
      ]);

      expect(invalidPositive).toMatchObject({
        pass: false,
        score: 0,
        reason: expect.stringContaining('does not match schema'),
      });
      expect(invalidInverse).toMatchObject({ pass: true, score: 1 });
      expect(validPositive).toMatchObject({ pass: true, score: 1 });
      expect(validInverse).toMatchObject({ pass: false, score: 0 });
    });

    it('does not invert duplicate function names across tool groups', async () => {
      const output = JSON.stringify({
        toolCall: { functionCalls: [{ args: '{}', name: 'duplicate' }] },
      });
      const provider = new GoogleLiveProvider('foo', {
        config: {
          tools: [
            { functionDeclarations: [{ name: 'duplicate' }] },
            { functionDeclarations: [{ name: 'duplicate' }] },
          ],
        },
      });

      const [positive, inverse] = await Promise.all(
        (['is-valid-function-call', 'not-is-valid-function-call'] as const).map((type) =>
          runAssertion({
            prompt: 'Some prompt',
            provider,
            assertion: { type },
            test: {} as AtomicTestCase,
            providerResponse: { output },
          }),
        ),
      );

      expect(positive).toMatchObject({
        pass: false,
        score: 0,
        reason: expect.stringContaining('Duplicate function schema'),
      });
      expect(inverse).toMatchObject({
        pass: false,
        score: 0,
        reason: expect.stringContaining('Duplicate function schema'),
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

    it('should pass the inverse assertion when no function was called', async () => {
      const output = JSON.stringify({ toolCall: { functionCalls: [] } });
      const provider = new GoogleLiveProvider('foo', { config: { tools: [] } });

      const result = await runAssertion({
        prompt: 'Some prompt',
        provider,
        assertion: { type: 'not-is-valid-function-call' },
        test: {} as AtomicTestCase,
        providerResponse: { output },
      });

      expect(result).toMatchObject({
        pass: true,
        score: 1,
        reason: 'Assertion passed',
      });
    });

    it.each([
      [
        'optional parameters',
        {
          type: 'OBJECT',
          properties: { label: { type: 'STRING' } },
        },
        true,
        false,
      ],
      [
        'required parameters',
        {
          type: 'OBJECT',
          properties: { label: { type: 'STRING' } },
          required: ['label'],
        },
        false,
        true,
      ],
      ['malformed parameters', { type: 'TYPE_UNSPECIFIED' }, false, false],
      ['null parameters', null, false, false],
    ] as const)('validates empty arguments against %s through the dispatcher', async (_name, parameters, positivePass, inversePass) => {
      const output = JSON.stringify({
        toolCall: { functionCalls: [{ args: '{}', name: 'lookup' }] },
      });
      const provider = new GoogleLiveProvider('foo', {
        config: {
          tools: [
            {
              functionDeclarations: [{ name: 'lookup', parameters: parameters as never }],
            },
          ],
        },
      });

      const [positive, inverse] = await Promise.all(
        (['is-valid-function-call', 'not-is-valid-function-call'] as const).map((type) =>
          runAssertion({
            prompt: 'Some prompt',
            provider,
            assertion: { type },
            test: {} as AtomicTestCase,
            providerResponse: { output },
          }),
        ),
      );

      expect(positive).toMatchObject({ pass: positivePass, score: positivePass ? 1 : 0 });
      expect(inverse).toMatchObject({ pass: inversePass, score: inversePass ? 1 : 0 });
      if (_name === 'malformed parameters') {
        expect(positive.reason).toContain("Tool schema doesn't compile with ajv");
        expect(inverse.reason).toContain("Tool schema doesn't compile with ajv");
      } else if (_name === 'null parameters') {
        expect(positive.reason).toContain('Invalid function schema configured in provider');
        expect(inverse.reason).toContain('Invalid function schema configured in provider');
      }
    });

    it.each([
      ['empty object', '{}', true, false],
      ['omitted value', undefined, true, false],
      ['array', '[]', false, true],
      ['number', '0', false, true],
      ['boolean', 'false', false, true],
    ] as const)('validates %s arguments for a parameterless function', async (_name, args, positivePass, inversePass) => {
      const output = JSON.stringify({
        toolCall: { functionCalls: [{ args, name: 'noop' }] },
      });
      const provider = new GoogleLiveProvider('foo', {
        config: { tools: [{ functionDeclarations: [{ name: 'noop' }] }] },
      });

      const [positive, inverse] = await Promise.all(
        (['is-valid-function-call', 'not-is-valid-function-call'] as const).map((type) =>
          runAssertion({
            prompt: 'Some prompt',
            provider,
            assertion: { type },
            test: {} as AtomicTestCase,
            providerResponse: { output },
          }),
        ),
      );

      expect(positive).toMatchObject({ pass: positivePass, score: positivePass ? 1 : 0 });
      expect(inverse).toMatchObject({ pass: inversePass, score: inversePass ? 1 : 0 });
    });

    it.each([
      [
        'optional schema',
        { type: 'OBJECT', properties: { value: { type: 'STRING' } } },
        true,
        false,
      ],
      [
        'required schema',
        {
          type: 'OBJECT',
          properties: { value: { type: 'STRING' } },
          required: ['value'],
        },
        false,
        true,
      ],
    ] as const)('validates omitted arguments against a %s', async (_name, parameters, positivePass, inversePass) => {
      const output = [{ functionCall: { name: 'lookup' } }];
      const provider = new AIStudioChatProvider('foo', {
        config: {
          tools: [{ functionDeclarations: [{ name: 'lookup', parameters: parameters as never }] }],
        },
      });

      const [positive, inverse] = await Promise.all(
        (['is-valid-function-call', 'not-is-valid-function-call'] as const).map((type) =>
          runAssertion({
            prompt: 'Some prompt',
            provider,
            assertion: { type },
            test: {} as AtomicTestCase,
            providerResponse: { output },
          }),
        ),
      );

      expect(positive).toMatchObject({ pass: positivePass, score: positivePass ? 1 : 0 });
      expect(inverse).toMatchObject({ pass: inversePass, score: inversePass ? 1 : 0 });
    });

    it.each([
      ['within bounds', ['one'], true, false],
      ['below minimum', [], false, true],
      ['above maximum', ['one', 'two', 'three'], false, true],
    ] as const)('validates string-valued Google array bounds when %s', async (_name, values, positivePass, inversePass) => {
      const output = JSON.stringify({
        toolCall: { functionCalls: [{ args: { values }, name: 'bounded' }] },
      });
      const provider = new GoogleLiveProvider('foo', {
        config: {
          tools: [
            {
              functionDeclarations: [
                {
                  name: 'bounded',
                  parameters: {
                    type: 'OBJECT',
                    properties: {
                      values: {
                        type: 'ARRAY',
                        items: { type: 'STRING' },
                        minItems: '1',
                        maxItems: '2',
                      },
                    },
                    required: ['values'],
                  },
                },
              ],
            },
          ],
        },
      });

      const [positive, inverse] = await Promise.all(
        (['is-valid-function-call', 'not-is-valid-function-call'] as const).map((type) =>
          runAssertion({
            prompt: 'Some prompt',
            provider,
            assertion: { type },
            test: {} as AtomicTestCase,
            providerResponse: { output },
          }),
        ),
      );

      expect(positive).toMatchObject({ pass: positivePass, score: positivePass ? 1 : 0 });
      expect(inverse).toMatchObject({ pass: inversePass, score: inversePass ? 1 : 0 });
    });

    it('should not invert a Google tool schema compilation error', async () => {
      const output = JSON.stringify({
        toolCall: {
          functionCalls: [{ args: '{"value": "test"}', name: 'broken' }],
        },
      });
      const provider = new GoogleLiveProvider('foo', {
        config: {
          tools: [
            {
              functionDeclarations: [
                {
                  name: 'broken',
                  parameters: {
                    type: 'OBJECT',
                    properties: { value: { type: 'TYPE_UNSPECIFIED' as never } },
                  },
                },
              ],
            },
          ],
        },
      });

      const result = await runAssertion({
        prompt: 'Some prompt',
        provider,
        assertion: { type: 'not-is-valid-function-call' },
        test: {} as AtomicTestCase,
        providerResponse: { output },
      });

      expect(result).toMatchObject({
        pass: false,
        score: 0,
        reason: expect.stringContaining("Tool schema doesn't compile with ajv"),
      });
    });

    it.each([
      ['missing tools', undefined, 'No function schemas configured in provider'],
      ['empty tools', [], 'No function schemas configured in provider'],
      [
        'tools without function declarations',
        [{ googleSearch: {} }],
        'No function schemas configured in provider',
      ],
      [
        'malformed function declarations',
        [{ functionDeclarations: [{}] }],
        'Invalid function schema configured in provider',
      ],
      [
        'non-array function declarations',
        [{ functionDeclarations: {} }],
        'Invalid function schema configured in provider',
      ],
      [
        'partially malformed function declarations',
        [{ functionDeclarations: [{ name: 'lookup' }, {}] }],
        'Invalid function schema configured in provider',
      ],
    ])('should not invert %s configuration', async (_name, tools, expectedReason) => {
      const output = JSON.stringify({
        toolCall: { functionCalls: [{ args: '{}', name: 'lookup' }] },
      });
      const provider = new GoogleLiveProvider('foo', {
        config: tools === undefined ? {} : { tools: tools as never },
      });

      const result = await runAssertion({
        prompt: 'Some prompt',
        provider,
        assertion: { type: 'not-is-valid-function-call' },
        test: {} as AtomicTestCase,
        providerResponse: { output },
      });

      expect(result).toMatchObject({
        pass: false,
        score: 0,
        reason: expect.stringContaining(expectedReason),
      });
    });
  });
});
