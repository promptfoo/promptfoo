# OpenAI Agents Basic Example

This example demonstrates how to use the OpenAI Agents SDK with promptfoo for testing multi-turn agent workflows.

## Overview

This example includes:

- **Agent Definition** (`agents/weather-agent.ts`): A simple weather agent that uses tools
- **Tools** (`tools/weather-tools.ts`): A `get_weather` tool that returns mock weather data
- **Test Configuration** (`promptfooconfig.yaml`): Test cases for the agent

## Prerequisites

1. Install dependencies:

   ```bash
   npm install
   ```

2. Set your OpenAI API key:
   ```bash
   export OPENAI_API_KEY=your-key-here
   ```

## Running the Example

From this directory, run:

```bash
promptfoo eval
```

Or from the project root:

```bash
npm run local -- eval -c examples/openai-agents-basic/promptfooconfig.yaml
```

## What to Expect

The eval will test the weather agent with three scenarios:

1. **Single city query**: Tests tool usage for one city
2. **Multiple cities query**: Tests tool usage for multiple cities
3. **Simple greeting**: Tests agent can respond without using tools

The agent will:

- Parse the user's query
- Decide whether to use the `get_weather` tool
- Call the tool with appropriate parameters
- Synthesize a response based on the tool results

## Configuration

### Agent Configuration

The agent is configured with:

- `name`: Identifier for the agent
- `instructions`: System prompt describing behavior
- `model`: The LLM model to use (gpt-4o-mini)

### Provider Configuration

The provider (`openai:agents:weather-agent`) is configured with:

- `agent`: Path to agent definition file
- `tools`: Path to tools file
- `maxTurns`: Maximum conversation turns (10)
- `executeTools`: Whether to execute tools (`real` or `mock`)
- `tracing`: Whether to enable tracing (false by default)

## Extending the Example

### Adding More Tools

Edit `tools/weather-tools.ts` to add more tools:

```typescript
export const getForecast = tool({
  name: 'get_forecast',
  description: 'Get 5-day forecast for a city',
  parameters: z.object({
    city: z.string(),
  }),
  execute: async ({ city }) => {
    return {
      city,
      forecast: ['Sunny', 'Cloudy', 'Rainy', 'Sunny', 'Sunny'],
    };
  },
});

export default [getWeather, getForecast];
```

### Enabling Tracing

Set `tracing: true` in the provider config to enable OTLP tracing:

```yaml
providers:
  - id: openai:agents:weather-agent
    config:
      tracing: true
      # ... other config
```

Then view traces in the promptfoo web UI:

```bash
promptfoo view
```

### Using Real Weather Data

Replace the mock implementation in `tools/weather-tools.ts` with a real weather API call:

```typescript
import { tool } from '@openai/agents';
import { z } from 'zod';

export const getWeather = tool({
  name: 'get_weather',
  description: 'Get the current weather for a given city',
  parameters: z.object({
    city: z.string(),
  }),
  execute: async ({ city }) => {
    const response = await fetch(
      `https://api.weather.com/v1/current?city=${city}&apiKey=${process.env.WEATHER_API_KEY}`,
    );
    return await response.json();
  },
});
```

## Next Steps

- Explore multi-agent workflows with handoffs
- Add guardrails for input/output validation
- Use tracing to debug agent behavior
- Test with real weather APIs
