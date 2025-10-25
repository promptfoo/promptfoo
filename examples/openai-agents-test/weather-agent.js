import { Agent, tool } from '@openai/agents';
import { z } from 'zod';

// Define the weather tool using the tool() helper
const getWeatherTool = tool({
  name: 'get_weather',
  description: 'Get the current weather for a city',
  parameters: z.object({
    city: z.string().describe('The city to get weather for'),
  }),
  execute: async ({ city }) => {
    console.log('[Weather Tool] Getting weather for:', city);

    return {
      city,
      temperature: '72°F',
      conditions: 'Sunny',
      humidity: '45%',
      timestamp: new Date().toISOString(),
    };
  },
});

// Create the weather agent
const weatherAgent = new Agent({
  name: 'Weather Agent',
  instructions: `You are a helpful weather assistant. When asked about weather,
use the get_weather tool to fetch current weather information.
Always be friendly and provide the temperature in the response.`,
  model: 'gpt-5-mini',
  tools: [getWeatherTool],
});

export default weatherAgent;
