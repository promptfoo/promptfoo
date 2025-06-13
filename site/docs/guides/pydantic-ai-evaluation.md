---
sidebar_label: PydanticAI Agent Evaluation
---

# Evaluating PydanticAI Agents with Promptfoo

PydanticAI is a Python agent framework built on Pydantic that provides structured outputs and type safety for AI applications. This guide shows you how to effectively evaluate PydanticAI agents using promptfoo to ensure reliable, production-ready AI systems.

## What You'll Learn

- Setting up promptfoo to evaluate PydanticAI agents
- Testing structured outputs and tool usage
- Comparing performance across different LLM models
- Best practices for agent evaluation

## Why Evaluate PydanticAI Agents?

PydanticAI's strengths make it particularly well-suited for systematic evaluation:

- **Structured outputs**: Predictable, typed responses that can be validated programmatically
- **Tool integration**: Built-in support for function calling that can be tested end-to-end
- **Model flexibility**: Easy switching between different LLM providers for comparison
- **Type safety**: Pydantic models ensure data consistency and validation

However, even with these safeguards, thorough evaluation is essential to catch edge cases, validate tool usage, and ensure consistent behavior across different scenarios.

## Getting Started

### Prerequisites

- Python 3.9+
- Node.js for promptfoo
- OpenAI API key (or other LLM provider keys)

### Installation

```bash
# Install promptfoo
npm install -g promptfoo

# Install PydanticAI and dependencies
pip install pydantic-ai httpx
```

## Complete Tutorial: Building a Weather Agent

Let's walk through creating and evaluating a PydanticAI weather agent that demonstrates key evaluation patterns.

### Step 1: Create the PydanticAI Agent

First, create an agent with structured outputs and tools:

```python
# agent.py
import asyncio
import json
import os
from typing import Optional

import httpx
from pydantic import BaseModel, ConfigDict
from pydantic_ai import Agent, RunContext
from pydantic_ai.models import KnownModelName

# Structured output model
class WeatherResponse(BaseModel):
    location: str
    temperature: str
    description: str
    humidity: Optional[str] = None
    wind_speed: Optional[str] = None
    error: Optional[str] = None

# Agent with dependencies
class WeatherDeps(BaseModel):
    model_config = ConfigDict(arbitrary_types_allowed=True)

    http_client: httpx.AsyncClient

# Create the agent
weather_agent = Agent(
    'openai:gpt-4o-mini',
    deps_type=WeatherDeps,
    result_type=WeatherResponse,
    system_prompt="""You are a helpful weather assistant. Use the available tools to get weather information
    and provide structured responses. Always be conversational and helpful."""
)

# Tools for the agent
@weather_agent.tool
async def get_coordinates(ctx: RunContext[WeatherDeps], location: str) -> dict:
    """Get coordinates for a location."""
    # Simplified geocoding - in production, use real API
    locations = {
        'london': (51.5074, -0.1278),
        'new york': (40.7128, -74.0060),
        'tokyo': (35.6762, 139.6503),
        'sydney': (-33.8688, 151.2093),
        'boston': (42.3601, -71.0589),
        'san francisco': (37.7749, -122.4194),
        'miami': (25.7617, -80.1918),
        'central park': (40.7829, -73.9654),
    }

    location_lower = location.lower()
    for key, coords in locations.items():
        if key in location_lower:
            return {'lat': coords[0], 'lon': coords[1], 'name': key.title()}

    return {'error': f'Location {location} not found'}

@weather_agent.tool
async def get_weather(ctx: RunContext[WeatherDeps], lat: float, lon: float) -> dict:
    """Get weather data for coordinates."""
    # Mock weather data - in production, use real weather API
    import random

    conditions = ['sunny', 'cloudy', 'rainy', 'partly cloudy', 'clear']
    temp = random.randint(10, 30)
    humidity = random.randint(30, 90)
    wind = random.randint(5, 25)

    return {
        'temperature': f'{temp}°C',
        'description': random.choice(conditions),
        'humidity': f'{humidity}%',
        'wind_speed': f'{wind} km/h'
    }

# Main function to run the agent
async def run_weather_agent(query: str, model: KnownModelName = 'openai:gpt-4o-mini') -> WeatherResponse:
    """Run the weather agent with a given query."""
    async with httpx.AsyncClient() as client:
        deps = WeatherDeps(http_client=client)

        # Update agent model if different
        agent = Agent(
            model,
            deps_type=WeatherDeps,
            result_type=WeatherResponse,
            system_prompt=weather_agent.system_prompt
        )

        # Register tools
        for tool in weather_agent._function_tools.values():
            agent.tool(tool.function)

        result = await agent.run(query, deps=deps)
        return result.data
```

### Step 2: Create the Promptfoo Provider

Create a provider that bridges PydanticAI with promptfoo:

```python
# provider.py
import asyncio
import os
from typing import Dict, Any

# Set up environment variables
try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass

from agent import run_weather_agent

def call_api(prompt: str, options: Dict[str, Any], context: Dict[str, Any]) -> Dict[str, Any]:
    """Main provider function for GPT-4o-mini."""
    model = options.get('config', {}).get('model', 'openai:gpt-4o-mini')
    result = asyncio.run(run_weather_agent(prompt, model))
    return {
        'output': result.model_dump(),
        'tokenUsage': {'total': 100, 'prompt': 50, 'completion': 50}
    }

def call_api_with_gpt4(prompt: str, options: Dict[str, Any], context: Dict[str, Any]) -> Dict[str, Any]:
    """Provider function for GPT-4o."""
    result = asyncio.run(run_weather_agent(prompt, 'openai:gpt-4o'))
    return {
        'output': result.model_dump(),
        'tokenUsage': {'total': 150, 'prompt': 75, 'completion': 75}
    }
```

### Step 3: Configure Comprehensive Evaluation

Create a promptfoo configuration with multiple evaluation patterns:

```yaml
# promptfooconfig.yaml
description: PydanticAI weather agent evaluation

prompts:
  - '{{query}}'

providers:
  - id: file://provider.py
    label: PydanticAI GPT-4o-mini
    config:
      model: openai:gpt-4o-mini
  - id: file://provider.py:call_api_with_gpt4
    label: PydanticAI GPT-4o

tests:
  - description: 'Basic weather query'
    vars:
      query: "What's the weather like in London?"
    assert:
      - type: javascript
        value: "output.location && output.location.toLowerCase().includes('london')"
      - type: javascript
        value: "output.temperature && output.temperature !== 'N/A'"
      - type: latency
        threshold: 5000

  - description: 'LLM-based quality assessment'
    vars:
      query: 'Is it a good day for a picnic in Central Park?'
    assert:
      - type: llm-rubric
        value: 'Response provides weather-based recommendation for outdoor activities'

  - description: 'Performance benchmark'
    vars:
      query: 'Weather in San Francisco, New York, and Miami'
    assert:
      - type: latency
        threshold: 8000
      - type: javascript
        value: 'output.location && output.temperature'

outputPath: ./promptfoo_results.json
```

### Step 4: Run the Evaluation

```bash
# Install dependencies
pip install -r requirements.txt

# Set API keys
export OPENAI_API_KEY=your_key_here

# Run evaluation
npx promptfoo eval

# View results
npx promptfoo view
```

## Key Evaluation Patterns for PydanticAI

### 1. Structured Output Validation

PydanticAI's structured outputs make validation straightforward:

```yaml
assert:
  - type: javascript
    value: 'typeof output.temperature === "string" && output.temperature.length > 0'
  - type: contains-json
    value: { 'location': 'Expected City' }
  - type: javascript
    value: 'output.error === null || output.error === undefined'
```

### 2. Tool Usage Testing

Verify that your agent uses tools correctly:

```yaml
tests:
  - description: 'Tool usage verification'
    vars:
      query: 'Weather in an obscure location'
    assert:
      - type: javascript
        value: 'output.location || output.error' # Should handle unknown locations
```

### 3. Cross-Model Consistency

Compare behavior across different models:

```yaml
providers:
  - id: file://provider.py
    config:
      model: openai:gpt-4o-mini
  - id: file://provider.py
    config:
      model: openai:gpt-4o
  - id: file://provider.py
    config:
      model: anthropic:claude-3-5-sonnet-latest
```

### 4. Performance Testing

Monitor response times and resource usage:

```yaml
assert:
  - type: latency
    threshold: 3000 # 3 seconds max
  - type: cost
    threshold: 0.01 # Cost per request
```

### 5. LLM-Based Quality Assessment

Use AI to evaluate subjective qualities:

```yaml
assert:
  - type: llm-rubric
    value: 'Response is conversational, helpful, and provides actionable weather advice'
  - type: llm-rubric
    value: 'Information is accurate and properly formatted'
```

## Advanced Evaluation Techniques

### Regression Testing

Set up baseline comparisons to catch regressions:

```bash
# Create baseline
npx promptfoo eval --write-baseline

# Compare against baseline
npx promptfoo eval --compare-baseline
```

### A/B Testing Different Configurations

Test different system prompts or agent configurations:

```python
# Create multiple agent configurations
def create_agent_variant(system_prompt: str, model: str):
    return Agent(
        model,
        deps_type=WeatherDeps,
        result_type=WeatherResponse,
        system_prompt=system_prompt
    )

# Test in promptfoo config
providers:
  - id: file://provider.py
    config:
      variant: "helpful"
  - id: file://provider.py
    config:
      variant: "concise"
```

### Continuous Integration Integration

Add evaluation to your CI/CD pipeline:

```yaml
# .github/workflows/eval.yml
name: AI Agent Evaluation
on: [push, pull_request]

jobs:
  evaluate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - name: Setup Python
        uses: actions/setup-python@v4
        with:
          python-version: '3.9'

      - name: Install dependencies
        run: |
          pip install -r requirements.txt
          npm install -g promptfoo

      - name: Run evaluation
        env:
          OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}
        run: |
          cd examples/pydantic-ai
          promptfoo eval --no-interactive

      - name: Upload results
        uses: actions/upload-artifact@v3
        with:
          name: evaluation-results
          path: examples/pydantic-ai/promptfoo_results.json
```

### Dataset-Based Evaluation

Use external datasets for comprehensive testing:

```yaml
# Use CSV datasets
tests: file://weather_queries.csv

# Or JSON datasets
tests:
  - vars:
      query: "{{scenario.query}}"
      expected_location: "{{scenario.location}}"
    dataset: file://test_scenarios.json
```

### Custom Metrics and Assertions

Create domain-specific evaluation criteria:

```javascript
// Custom assertion for weather data quality
function validateWeatherData(output) {
  const tempPattern = /\d+°[CF]/;
  const hasValidTemp = tempPattern.test(output.temperature);

  const locationValid =
    output.location && output.location.length > 2 && !output.location.includes('unknown');

  return hasValidTemp && locationValid;
}
```

## Production Considerations

### Monitoring and Alerting

Set up monitoring for production agents:

```bash
# Regular evaluation runs
crontab -e
0 */6 * * * cd /path/to/project && promptfoo eval --no-interactive
```

### Performance Optimization

Monitor and optimize based on evaluation results:

- **Token usage**: Track costs across different models
- **Latency**: Identify slow tool calls or model responses
- **Success rates**: Monitor error rates and failure patterns
- **Quality scores**: Track LLM-based quality metrics over time

### Handling Edge Cases

Use evaluation to discover and handle edge cases:

```yaml
tests:
  - description: 'Ambiguous location query'
    vars:
      query: 'Weather in Springfield' # Multiple Springfields exist
    assert:
      - type: javascript
        value: 'output.location || output.error'

  - description: 'Non-weather query'
    vars:
      query: "What's the capital of France?"
    assert:
      - type: javascript
        value: 'output.error || output.location === null'
```

## Best Practices

1. **Start Simple**: Begin with basic functionality tests before adding complex scenarios
2. **Test Incrementally**: Add new test cases as you discover edge cases
3. **Use Real Data**: Gradually replace mock data with real API calls for production testing
4. **Monitor Costs**: Track token usage and API costs during evaluation
5. **Version Control**: Keep evaluation configs in version control alongside your code
6. **Regular Updates**: Update test cases as your agent's capabilities evolve

## Troubleshooting

### Common Issues

**Issue**: "Module not found" errors
**Solution**: Ensure all dependencies are installed and Python path is correct

**Issue**: API key errors
**Solution**: Verify environment variables are set correctly

**Issue**: Timeout errors
**Solution**: Increase latency thresholds or optimize agent performance

**Issue**: Inconsistent results
**Solution**: Add more deterministic test cases and check for model randomness

### Debugging Tips

1. **Use verbose mode**: `promptfoo eval --verbose` for detailed output
2. **Check individual tests**: `promptfoo eval --filter "test description"`
3. **Examine raw outputs**: Review the `promptfoo_results.json` file
4. **Test providers directly**: Run your provider function independently

## Next Steps

- Explore [promptfoo's assertion types](../configuration/expected-outputs) for comprehensive testing
- Set up [continuous evaluation](../integrations/github-action) in your CI/CD pipeline
- Learn about [dataset management](../configuration/datasets) for large-scale testing
- Check out other [Python integration examples](../../examples/) for inspiration

By following this guide, you'll have a robust evaluation system that ensures your PydanticAI agents perform reliably in production. The combination of structured outputs, comprehensive testing, and continuous monitoring will help you build trustworthy AI applications.
