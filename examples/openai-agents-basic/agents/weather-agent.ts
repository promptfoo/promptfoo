import { Agent } from '@openai/agents';
import weatherTools from '../tools/weather-tools.js';

/**
 * Simple weather agent that can get weather information
 */
export default new Agent({
  name: 'Weather Agent',
  instructions:
    'You are a helpful weather assistant. Use the available tools to get weather information and provide clear, concise responses.',
  model: 'gpt-4o-mini',
  tools: weatherTools,
});
