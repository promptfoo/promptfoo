---
sidebar_label: PydanticAI Agent Evaluation
---

# Evaluating PydanticAI Agents with Promptfoo

PydanticAI is a Python agent framework built on Pydantic that provides structured outputs and type safety for AI applications. This guide shows you how to evaluate PydanticAI agents using promptfoo.

## Quick Start

Get started with the example:

```bash
npx promptfoo@latest init --example pydantic-ai
```

Or set up manually:

```bash
# Install dependencies
pip install -r requirements.txt

# Set your API key
export OPENAI_API_KEY=your_openai_api_key_here

# Run evaluation
npx promptfoo@latest eval

# View results
npx promptfoo@latest view
```

## Why Evaluate PydanticAI Agents?

PydanticAI's structured approach makes evaluation straightforward:

- **Structured outputs**: Predictable, typed responses for reliable testing
- **Tool integration**: End-to-end testing of function calling capabilities
- **Model flexibility**: Easy comparison across different LLM providers
- **Type safety**: Pydantic validation ensures data consistency

## Building and Evaluating a Weather Agent

### 1. Create the PydanticAI Agent

```python
# agent.py
from typing import Optional
from pydantic import BaseModel
from pydantic_ai import Agent, RunContext
import httpx
import os

class WeatherResponse(BaseModel):
    location: str
    temperature: str
    description: str
    humidity: Optional[str] = None
    wind_speed: Optional[str] = None
    error: Optional[str] = None

class Deps(BaseModel):
    model_config = {'arbitrary_types_allowed': True}
    client: httpx.AsyncClient
    weather_api_key: Optional[str] = None
    geo_api_key: Optional[str] = None

def get_weather_agent(model: str = 'openai:gpt-4o-mini') -> Agent:
    agent = Agent(
        model,
        deps_type=Deps,
        output_type=WeatherResponse,
        system_prompt=(
            'You are a helpful weather assistant. '
            'Use the geocoding tool to get coordinates for locations, '
            'then use the weather tool to get current conditions.'
        ),
    )
    agent.tool(get_coordinates)
    agent.tool(get_weather)
    return agent

@agent.tool
async def get_coordinates(ctx: RunContext[Deps], location: str) -> dict[str, float]:
    """Get latitude and longitude for a location."""
    # Mock implementation for demo
    mock_coords = {
        "london": {"lat": 51.5074, "lng": -0.1278},
        "new york": {"lat": 40.7128, "lng": -74.0060},
        "tokyo": {"lat": 35.6762, "lng": 139.6503},
    }
    location_lower = location.lower()
    for city, coords in mock_coords.items():
        if city in location_lower:
            return coords
    return {"lat": 51.5074, "lng": -0.1278}  # Default to London

@agent.tool
async def get_weather(ctx: RunContext[Deps], lat: float, lng: float, location_name: str) -> dict:
    """Get current weather for coordinates."""
    import random
    conditions = [
        {"temp": "22°C", "desc": "Sunny", "humidity": "45%", "wind": "10 km/h"},
        {"temp": "18°C", "desc": "Partly Cloudy", "humidity": "60%", "wind": "15 km/h"},
        {"temp": "12°C", "desc": "Rainy", "humidity": "85%", "wind": "20 km/h"},
    ]
    weather = random.choice(conditions)
    return {
        'location': location_name,
        'temperature': weather['temp'],
        'description': weather['desc'],
        'humidity': weather['humidity'],
        'wind_speed': weather['wind']
    }

async def run_weather_agent(query: str, model: str = 'openai:gpt-4o-mini') -> WeatherResponse:
    async with httpx.AsyncClient() as client:
        deps = Deps(client=client)
        try:
            agent = get_weather_agent(model)
            result = await agent.run(query, deps=deps)
            return result.output
        except Exception as e:
            return WeatherResponse(
                location="Unknown",
                temperature="N/A",
                description="Error occurred",
                error=str(e)
            )
```

### 2. Create the Promptfoo Provider

```python
# provider.py
import asyncio
import os
from typing import Dict, Any

try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass

from agent import run_weather_agent

def call_api(prompt: str, options: Dict[str, Any], context: Dict[str, Any]) -> Dict[str, Any]:
    """Main provider function for PydanticAI weather agent."""
    model = options.get('config', {}).get('model', 'openai:gpt-4o-mini')
    result = asyncio.run(run_weather_agent(prompt, model))

    output_dict = result.model_dump() if hasattr(result, 'model_dump') else result

    return {
        'output': output_dict,
        'tokenUsage': {'total': 100, 'prompt': 50, 'completion': 50},
        'metadata': {
            'model': model,
            'agent_type': 'pydantic_ai_weather',
            'has_error': bool(output_dict.get('error')),
        }
    }

def call_api_with_gpt4(prompt: str, options: Dict[str, Any], context: Dict[str, Any]) -> Dict[str, Any]:
    """Provider function for GPT-4o."""
    options_copy = options.copy()
    if 'config' not in options_copy:
        options_copy['config'] = {}
    options_copy['config']['model'] = 'openai:gpt-4o'
    return call_api(prompt, options_copy, context)
```

### 3. Configure Comprehensive Evaluation

```yaml
# promptfooconfig.yaml
description: PydanticAI weather agent evaluation

prompts:
  - '{{query}}'

providers:
  - id: file://provider.py
    label: PydanticAI GPT-4o-mini
  - id: file://provider.py:call_api_with_gpt4
    label: PydanticAI GPT-4o

tests:
  # Basic functionality
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

  # Structured output validation
  - description: 'JSON structure validation'
    vars:
      query: 'Weather in Boston'
    assert:
      - type: javascript
        value: 'output.location && output.temperature && output.description'
      - type: contains-json
        value: { 'location': 'Boston' }

  # Quality assessment
  - description: 'Decision support quality'
    vars:
      query: 'Is it a good day for a picnic in Central Park?'
    assert:
      - type: llm-rubric
        value: 'Response provides weather-based recommendation for outdoor activities'

  # Error handling
  - description: 'Error handling test'
    vars:
      query: "What's the weather like in Atlantis?"
    assert:
      - type: javascript
        value: 'Boolean(output.location || output.error)'

outputPath: ./promptfoo_results.json
```

## Key Evaluation Patterns

### Structured Output Validation

```yaml
assert:
  - type: javascript
    value: 'typeof output.temperature === "string" && output.temperature.length > 0'
  - type: contains-json
    value: { 'location': 'Expected City' }
  - type: javascript
    value: 'output.error === null || output.error === undefined'
```

### Cross-Model Consistency

```yaml
providers:
  - id: file://provider.py
    config: { model: 'openai:gpt-4o-mini' }
  - id: file://provider.py
    config: { model: 'openai:gpt-4o' }
  - id: file://provider.py
    config: { model: 'anthropic:claude-3-5-sonnet-latest' }
```

### Performance Testing

```yaml
assert:
  - type: latency
    threshold: 3000 # 3 seconds max
  - type: cost
    threshold: 0.01 # Cost per request
```

### Quality Assessment with LLM Grading

```yaml
assert:
  - type: llm-rubric
    value: 'Response is conversational, helpful, and provides actionable weather advice'
```

## Advanced Techniques

### A/B Testing Different Configurations

```python
def create_agent_variant(system_prompt: str, model: str):
    return Agent(
        model,
        deps_type=Deps,
        output_type=WeatherResponse,
        system_prompt=system_prompt
    )

# Test in promptfoo config
providers:
  - id: file://provider.py
    config: { variant: "helpful" }
  - id: file://provider.py
    config: { variant: "concise" }
```

### Continuous Integration

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
          promptfoo eval
```

### Dataset-Based Evaluation

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

## Production Considerations

### Monitor Key Metrics

- **Token usage**: Track costs across different models
- **Latency**: Identify slow tool calls or model responses
- **Success rates**: Monitor error rates and failure patterns
- **Quality scores**: Track LLM-based quality metrics over time

### Best Practices

1. **Start simple**: Begin with basic functionality tests
2. **Add incrementally**: Build test cases as you discover edge cases
3. **Use real data**: Replace mock data with real APIs for production testing
4. **Monitor costs**: Track token usage during evaluation
5. **Version control**: Keep configs in version control with your code
6. **Regular updates**: Update test cases as agent capabilities evolve

### Common Issues

| Issue                   | Solution                                                 |
| ----------------------- | -------------------------------------------------------- |
| Module not found errors | Ensure dependencies installed and Python path correct    |
| API key errors          | Verify environment variables are set                     |
| Timeout errors          | Increase latency thresholds or optimize performance      |
| Inconsistent results    | Add deterministic test cases, check for model randomness |

## Example Results

When you run the evaluation, you'll see:

- ✅ Basic weather queries (location detection, temperature reporting)
- ✅ Structured output format compliance
- ✅ Tool usage accuracy
- ✅ Response quality and usefulness
- ✅ Performance benchmarks
- ✅ Error handling

The structured outputs and comprehensive testing ensure your PydanticAI agents perform reliably in production.
