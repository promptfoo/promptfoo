import { tool } from '@openai/agents';
import { z } from 'zod';

/**
 * Tool to get weather information for a city
 */
export const getWeather = tool({
  name: 'get_weather',
  description: 'Get the current weather for a given city',
  parameters: z.object({
    city: z.string().describe('The city to get weather for'),
  }),
  execute: async ({ city }) => {
    // Mock implementation - in real usage, this would call a weather API
    return {
      city,
      temperature: '20°C',
      conditions: 'Sunny with some clouds',
      humidity: '65%',
      windSpeed: '10 km/h',
    };
  },
});

export default [getWeather];
