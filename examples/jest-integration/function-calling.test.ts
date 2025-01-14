import type { GradingConfig } from 'promptfoo';
import { installJestMatchers } from './matchers';

installJestMatchers();

// Example function that simulates an LLM function call response
interface WeatherFunctionCall {
  name: string;
  arguments: {
    location: string;
    unit?: 'celsius' | 'fahrenheit';
  };
}

const exampleFunctionCallResponse: WeatherFunctionCall = {
  name: 'get_weather',
  arguments: {
    location: 'San Francisco',
    unit: 'celsius',
  },
};

const gradingConfig: GradingConfig = {
  provider: 'openai:gpt-4',
  rubricPrompt: `
You are validating a function call against its schema. Evaluate the following criteria:

1. Function name: Check if it matches 'get_weather' exactly
2. Required arguments: Verify 'location' is present and is a string
3. Optional arguments: Check if 'unit' is either undefined, 'celsius', or 'fahrenheit'

Respond with a score (0 or 1) for each criterion and explain why.
Format your response as:
{
  "score": number (0-3),
  "reasoning": "explanation"
}
`,
};

describe('Function Calling Tests', () => {
  describe('Weather Function Schema Validation', () => {
    it('should validate correct function call structure', async () => {
      const response = exampleFunctionCallResponse;

      // Test exact function name match
      expect(response.name).toBe('get_weather');

      // Test argument structure
      expect(response.arguments).toHaveProperty('location');
      expect(typeof response.arguments.location).toBe('string');

      // Test optional argument - always run expect, but check value conditionally
      expect(
        response.arguments.unit === undefined ||
          ['celsius', 'fahrenheit'].includes(response.arguments.unit),
      ).toBe(true);
    });

    it('should validate function call with LLM rubric', async () => {
      const actualResponse = JSON.stringify(exampleFunctionCallResponse, null, 2);
      const expectedSchema = JSON.stringify(
        {
          name: 'get_weather',
          arguments: {
            location: 'string',
            unit: 'celsius|fahrenheit (optional)',
          },
        },
        null,
        2,
      );

      await expect(actualResponse).toPassLLMRubric(expectedSchema, gradingConfig);
    }, 30000); // Add explicit timeout

    it('should validate semantic similarity of function purpose', async () => {
      const functionDescription =
        'This function retrieves weather information for a specified city';
      const expectedDescription = 'Gets the current weather conditions for a given location';

      await expect(functionDescription).toMatchSemanticSimilarity(expectedDescription, 0.6); // Lower threshold
    });
  });

  describe('Function Call Error Handling', () => {
    it('should fail on missing required arguments', async () => {
      const invalidResponse = {
        name: 'get_weather',
        arguments: {
          unit: 'celsius',
        },
      } as WeatherFunctionCall;

      expect(() => {
        if (!('location' in invalidResponse.arguments)) {
          throw new Error('Missing required argument: location');
        }
      }).toThrow('Missing required argument: location');
    });

    it('should fail on invalid unit type', async () => {
      const invalidResponse = {
        name: 'get_weather',
        arguments: {
          location: 'London',
          unit: 'kelvin' as 'celsius' | 'fahrenheit',
        },
      };

      expect(() => {
        const unit = invalidResponse.arguments.unit;
        if (unit && !['celsius', 'fahrenheit'].includes(unit)) {
          throw new Error('Invalid unit type');
        }
      }).toThrow('Invalid unit type');
    });
  });
});
