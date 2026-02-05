import { describe, expect, it } from 'vitest';
import { formatToolsAsJSDocs } from './discovery';

interface Tool {
  name: string;
  description: string;
  arguments?: Array<{
    name: string;
    description: string;
    type: string;
  }>;
}

describe('formatToolsAsJSDocs', () => {
  it('should return a formatted JSDoc string for each Tool in the array when given an array of valid Tool objects with arguments', () => {
    const tools: Tool[] = [
      {
        name: 'getWeather',
        description: 'Fetches the current weather for a given location.',
        arguments: [
          {
            name: 'location',
            description: 'The city and state, e.g. San Francisco, CA',
            type: 'string',
          },
          {
            name: 'unit',
            description: 'The temperature unit, "celsius" or "fahrenheit"',
            type: 'string',
          },
        ],
      },
      {
        name: 'sendEmail',
        description: 'Sends an email to a recipient.',
        arguments: [
          {
            name: 'recipient',
            description: 'The email address of the recipient.',
            type: 'string',
          },
          {
            name: 'subject',
            description: 'The subject of the email.',
            type: 'string',
          },
        ],
      },
    ];

    const expectedJSDoc = `/**
 * Fetches the current weather for a given location.
 * @param {string} location - The city and state, e.g. San Francisco, CA
 * @param {string} unit - The temperature unit, "celsius" or "fahrenheit"
 */
getWeather(location: string, unit: string)

/**
 * Sends an email to a recipient.
 * @param {string} recipient - The email address of the recipient.
 * @param {string} subject - The subject of the email.
 */
sendEmail(recipient: string, subject: string)`;

    const result = formatToolsAsJSDocs(tools);

    expect(result).toBe(expectedJSDoc);
  });

  it('should return a JSDoc string with only the description and a parameterless function signature when a Tool has no arguments', () => {
    const tools: Tool[] = [
      {
        name: 'getCurrentTime',
        description: 'Returns the current time.',
      },
    ];

    const expectedJSDoc = `/**
 * Returns the current time.
 */
getCurrentTime()`;

    const result = formatToolsAsJSDocs(tools);

    expect(result).toBe(expectedJSDoc);
  });

  it('should ignore null values in the input array and only generate JSDoc comments for valid Tool objects', () => {
    const tools: (Tool | null)[] = [
      {
        name: 'getWeather',
        description: 'Fetches the current weather for a given location.',
        arguments: [
          {
            name: 'location',
            description: 'The city and state, e.g. San Francisco, CA',
            type: 'string',
          },
          {
            name: 'unit',
            description: 'The temperature unit, "celsius" or "fahrenheit"',
            type: 'string',
          },
        ],
      },
      null,
      {
        name: 'sendEmail',
        description: 'Sends an email to a recipient.',
        arguments: [
          {
            name: 'recipient',
            description: 'The email address of the recipient.',
            type: 'string',
          },
          {
            name: 'subject',
            description: 'The subject of the email.',
            type: 'string',
          },
        ],
      },
      null,
    ];

    const expectedJSDoc = `/**
 * Fetches the current weather for a given location.
 * @param {string} location - The city and state, e.g. San Francisco, CA
 * @param {string} unit - The temperature unit, "celsius" or "fahrenheit"
 */
getWeather(location: string, unit: string)

/**
 * Sends an email to a recipient.
 * @param {string} recipient - The email address of the recipient.
 * @param {string} subject - The subject of the email.
 */
sendEmail(recipient: string, subject: string)`;

    const result = formatToolsAsJSDocs(tools);

    expect(result).toBe(expectedJSDoc);
  });

  it('should handle malformed Tool objects (missing name or description) without throwing an error', () => {
    const tools: (Tool | null)[] = [
      {
        description: 'Missing name',
      } as any,
      {
        name: 'Missing description',
      } as any,
      {
        name: 'tool1',
        description: 'Valid tool',
        arguments: [],
      },
    ];

    const expectedJSDoc = `/**
 * Missing name
 */
undefined()

/**
 * undefined
 */
Missing description()

/**
 * Valid tool
 */
tool1()`;

    const result = formatToolsAsJSDocs(tools);

    expect(result).toBe(expectedJSDoc);
  });

  it('should handle tools with descriptions or argument descriptions containing JSDoc special characters like "*/"', () => {
    const tools: Tool[] = [
      {
        name: 'testTool',
        description: 'This is a test tool with a special character: */',
        arguments: [
          {
            name: 'testArg',
            description: 'This is a test argument with a special character: */',
            type: 'string',
          },
        ],
      },
    ];

    const expectedJSDoc = `/**
 * This is a test tool with a special character: */
 * @param {string} testArg - This is a test argument with a special character: */
 */
testTool(testArg: string)`;

    const result = formatToolsAsJSDocs(tools);
    expect(result).toBe(expectedJSDoc);
  });

  it('should handle tools with malformed argument properties without throwing an error', () => {
    const tools: Tool[] = [
      {
        name: 'badTool',
        description: 'A tool with bad arguments',
        arguments: [
          {
            name: 'badArg1',
            description: 123 as any,
          },
          {
            name: 'badArg2',
            description: 'Bad arg 2',
            type: null as any,
          },
          {
            name: 'badArg3',
            description: 'Bad arg 3',
          } as any,
        ],
      },
    ];

    const result = formatToolsAsJSDocs(tools);

    expect(typeof result).toBe('string');
  });

  it('should handle tools with extremely long names, descriptions, and a large number of arguments without breaking', () => {
    const longString = 'A'.repeat(2000);
    const manyArguments = Array.from({ length: 50 }, (_, i) => ({
      name: `arg${i}`,
      description: `${longString} description`,
      type: 'string',
    }));

    const tool: Tool = {
      name: longString,
      description: longString,
      arguments: manyArguments,
    };

    const tools: Tool[] = [tool];

    const result = formatToolsAsJSDocs(tools);

    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(1000);
  });

  it('should handle tools with arguments that have the same name', () => {
    const tools: Tool[] = [
      {
        name: 'processData',
        description: 'Processes data with potentially conflicting parameters.',
        arguments: [
          {
            name: 'input',
            description: 'The primary input data.',
            type: 'string',
          },
          {
            name: 'input',
            description: 'Additional input data for processing.',
            type: 'number',
          },
        ],
      },
    ];

    const expectedJSDoc = `/**
 * Processes data with potentially conflicting parameters.
 * @param {string} input - The primary input data.
 * @param {number} input - Additional input data for processing.
 */
processData(input: string, input: number)`;

    const result = formatToolsAsJSDocs(tools);
    expect(result).toBe(expectedJSDoc);
  });

  it('should handle tools with empty strings for name or description properties', () => {
    const tools: Tool[] = [
      {
        name: '',
        description: '',
        arguments: [],
      },
      {
        name: 'toolWithEmptyDescription',
        description: '',
        arguments: [],
      },
      {
        name: '',
        description: 'toolWithEmptyNameDescription',
        arguments: [],
      },
    ];

    const expectedJSDoc = `/**
 * 
 */
()

/**
 * 
 */
toolWithEmptyDescription()

/**
 * toolWithEmptyNameDescription
 */
()`;

    const result = formatToolsAsJSDocs(tools);
    expect(result).toBe(expectedJSDoc);
  });

  it.each([
    { input: null, description: 'null' },
    { input: undefined, description: 'undefined' },
    { input: 'not an array', description: 'not an array' },
  ])('should return an empty string when tools parameter is $description', ({ input }) => {
    const result = formatToolsAsJSDocs(input as any);
    expect(result).toBe('');
  });
});
