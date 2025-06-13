---
sidebar_label: PydanticAI Agent Evaluation
---

# Evaluating PydanticAI Agents with Promptfoo

[PydanticAI](https://ai.pydantic.dev/) is a Python agent framework that makes it easier to build production-grade applications with Generative AI using structured outputs and type safety. This guide shows you how to systematically evaluate your PydanticAI agents using promptfoo.

## What You'll Learn

- Setting up promptfoo to evaluate PydanticAI agents
- Testing structured outputs and tool usage
- Comparing performance across different LLM models
- Best practices for agent evaluation

## Why Evaluate PydanticAI Agents?

PydanticAI agents are powerful because they provide:

- **Structured outputs** - Type-safe responses using Pydantic models
- **Tool integration** - Function calling capabilities for external data
- **Model flexibility** - Easy switching between different LLMs
- **Type safety** - Full TypeScript-like type checking in Python

However, with this power comes complexity. Evaluating these agents helps ensure:

- Consistent structured output format
- Reliable tool usage across different scenarios
- Stable performance when switching models
- Proper error handling

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

## Example: Weather Agent Evaluation

Let's build a weather assistant agent and evaluate it across different scenarios.

### Step 1: Create the PydanticAI Agent

First, create your agent with structured outputs and tools:

```python
# agent.py
from typing import Optional
from pydantic import BaseModel
from pydantic_ai import Agent, RunContext
import httpx
import os

class WeatherResponse(BaseModel):
    """Structured weather response"""
    location: str
    temperature: str
    description: str
    humidity: Optional[str] = None
    wind_speed: Optional[str] = None
    error: Optional[str] = None

class Deps(BaseModel):
    """Dependencies for the weather agent"""
    model_config = {'arbitrary_types_allowed': True}
    
    client: httpx.AsyncClient
    weather_api_key: Optional[str] = None

def get_weather_agent(model: str = 'openai:gpt-4o-mini') -> Agent:
    """Get or create the weather agent with the specified model"""
    agent = Agent(
        model,
        deps_type=Deps,
        output_type=WeatherResponse,
        system_prompt=(
            'You are a helpful weather assistant. '
            'Use the geocoding tool to get coordinates for locations, '
            'then use the weather tool to get current conditions. '
            'Always provide clear, accurate weather information.'
        ),
    )
    
    # Add tools to the agent
    agent.tool(get_coordinates)
    agent.tool(get_weather)
    
    return agent

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

async def get_weather(ctx: RunContext[Deps], lat: float, lng: float, location_name: str) -> dict:
    """Get current weather for coordinates."""
    # Mock weather data for demo
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
    """Run the weather agent with a query."""
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

### Step 2: Create the Promptfoo Provider

Create a Python provider that interfaces between promptfoo and your PydanticAI agent:

```python
# provider.py
import asyncio
import os
from typing import Dict, Any
from agent import run_weather_agent

def call_api(prompt: str, options: Dict[str, Any], context: Dict[str, Any]) -> Dict[str, Any]:
    """Promptfoo provider for the PydanticAI weather agent"""
    
    # Get model from config
    config = options.get('config', {})
    model = config.get('model', 'openai:gpt-4o-mini')
    
    # Ensure API keys are available
    if not os.getenv('OPENAI_API_KEY'):
        # Try to load from .env file
        env_file = '../../.env'
        if os.path.exists(env_file):
            with open(env_file, 'r') as f:
                for line in f:
                    if line.startswith('OPENAI_API_KEY='):
                        key = line.split('=', 1)[1].strip().strip('"\'')
                        os.environ['OPENAI_API_KEY'] = key
                        break
    
    try:
        result = asyncio.run(run_weather_agent(prompt, model))
        output_dict = result.model_dump()
        
        return {
            "output": output_dict,
            "metadata": {
                "model": model,
                "agent_type": "pydantic_ai_weather",
                "has_error": output_dict.get("error") is not None,
            }
        }
        
    except Exception as e:
        error_output = {
            "location": "Unknown",
            "temperature": "N/A", 
            "description": "Error occurred",
            "error": str(e)
        }
        return {
            "output": error_output,
            "metadata": {
                "model": model,
                "agent_type": "pydantic_ai_weather",
                "has_error": True,
            }
        }

def call_api_with_gpt4(prompt: str, options: Dict[str, Any], context: Dict[str, Any]) -> Dict[str, Any]:
    """Provider variant using GPT-4"""
    options_copy = options.copy()
    if 'config' not in options_copy:
        options_copy['config'] = {}
    options_copy['config']['model'] = 'openai:gpt-4o'
    
    return call_api(prompt, options_copy, context)
```

### Step 3: Configure the Evaluation

Create your promptfoo configuration:

```yaml
# promptfooconfig.yaml
# yaml-language-server: $schema=https://promptfoo.dev/config-schema.json
description: PydanticAI weather agent evaluation

prompts:
  - "{{query}}"

providers:
  - id: file://provider.py
    label: PydanticAI GPT-4o-mini
    config:
      model: openai:gpt-4o-mini

  - id: file://provider.py:call_api_with_gpt4 
    label: PydanticAI GPT-4o

tests:
  - description: "Basic weather query for major city"
    vars:
      query: "What's the weather like in London?"
    assert:
      - type: javascript
        value: "typeof output === 'object' && output.location && output.location.toLowerCase().includes('london')"
      - type: javascript
        value: "output.temperature && output.temperature !== 'N/A'"

  - description: "Weather query with specific format request"
    vars:
      query: "Can you tell me the current weather conditions in New York including humidity?"
    assert:
      - type: javascript
        value: "output.location && output.location.toLowerCase().includes('new york')"
      - type: javascript
        value: "output.humidity && output.humidity !== null"

  - description: "International city weather query"
    vars:
      query: "How's the weather in Tokyo today?"
    assert:
      - type: javascript
        value: "output.location && output.location.toLowerCase().includes('tokyo')"
      - type: javascript
        value: "!output.error"

  - description: "Weather query with multiple details requested"
    vars:
      query: "Tell me about the weather in Sydney - temperature, conditions, and wind speed please"
    assert:
      - type: javascript
        value: "output.location && output.location.toLowerCase().includes('sydney')"
      - type: javascript
        value: "output.wind_speed && output.wind_speed !== null"

  - description: "Error handling test"
    vars:
      query: "What's the weather like in Atlantis?"  
    assert:
      - type: javascript
        value: "Boolean(output.location || output.error)"

outputPath: ./promptfoo_results.json
```

### Step 4: Run the Evaluation

```bash
# Install dependencies
pip install -r requirements.txt

# Set your API key
export OPENAI_API_KEY=your_openai_api_key_here

# Run the evaluation
promptfoo eval
```

## Key Evaluation Patterns

### Testing Structured Outputs

When evaluating PydanticAI agents, focus on validating the structured nature of responses:

```yaml
tests:
  - description: "Structured output validation"
    vars:
      query: "Weather in Boston"
    assert:
      # Validate required fields are present
      - type: javascript
        value: "output.location && output.temperature && output.description"
      
      # Validate field types
      - type: javascript
        value: "typeof output.location === 'string'"
      
      # Validate no required fields are null
      - type: javascript
        value: "output.location !== null && output.temperature !== null"
```

### Testing Tool Usage

Verify that your agent correctly uses tools:

```yaml
tests:
  - description: "Tool usage verification"
    vars:
      query: "Get weather for coordinates 40.7128, -74.0060"
    assert:
      # Should use geocoding tool
      - type: contains-json
        value: { "location": "New York" }
      
      # Should provide complete weather data
      - type: javascript
        value: "output.temperature && output.description && output.humidity"
```

### Cross-Model Consistency

Test your agent across different models to ensure consistent behavior:

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

tests:
  - description: "Cross-model consistency test"
    vars:
      query: "Weather in San Francisco"
    assert:
      # All models should detect the location
      - type: javascript
        value: "output.location.toLowerCase().includes('san francisco')"
      
      # All models should provide temperature
      - type: javascript
        value: "output.temperature && output.temperature !== 'N/A'"
```

### Error Handling

Test how your agent handles edge cases:

```yaml
tests:
  - description: "Invalid location handling"
    vars:
      query: "Weather in Narnia"
    assert:
      # Should either provide a location or an error
      - type: javascript
        value: "output.location || output.error"
      
      # Should not crash
      - type: javascript
        value: "typeof output === 'object'"

  - description: "Ambiguous query handling"
    vars:
      query: "It's cold"
    assert:
      # Should ask for clarification or provide default
      - type: javascript
        value: "output.error || output.location"
```

## Advanced Evaluation Techniques

### Performance Metrics

Track performance across evaluations:

```yaml
tests:
  - description: "Performance benchmark"
    vars:
      query: "Current weather in major cities worldwide"
    assert:
      - type: latency
        threshold: 5000  # 5 seconds max
      
      - type: javascript
        value: "output.location && output.temperature"
```

### Regression Testing

Ensure changes don't break existing functionality:

```yaml
# Store baseline results
outputPath: ./baseline_results.json

# Compare against baseline
tests:
  - description: "Regression test"
    vars:
      query: "Weather in London"
    assert:
      - type: similar
        value: "file://baseline_london_response.json"
        threshold: 0.8
```

### A/B Testing

Compare different agent configurations:

```yaml
providers:
  - id: file://provider.py
    label: "Agent v1"
    config:
      model: openai:gpt-4o-mini
      system_prompt: "You are a weather assistant."
  
  - id: file://provider_v2.py
    label: "Agent v2"
    config:
      model: openai:gpt-4o-mini
      system_prompt: "You are a helpful weather assistant with local knowledge."
```

## Best Practices

### 1. Start Simple

Begin with basic functionality tests before adding complex scenarios:

```yaml
# Start with this
tests:
  - vars: { query: "Weather in London" }
    assert:
      - type: javascript
        value: "output.location"

# Then add complexity
tests:
  - vars: { query: "Detailed forecast for London including UV index and air quality" }
    assert:
      - type: javascript
        value: "output.location && output.uv_index && output.air_quality"
```

### 2. Test Edge Cases

Don't just test the happy path:

```yaml
tests:
  # Happy path
  - vars: { query: "Weather in New York" }
    
  # Edge cases
  - vars: { query: "Weather in NYC" }  # Abbreviation
  - vars: { query: "What's it like outside?" }  # No location
  - vars: { query: "Temperature in 123" }  # Invalid location
  - vars: { query: "" }  # Empty query
```

### 3. Use Meaningful Assertions

Write assertions that test business logic, not just technical functionality:

```yaml
# Good - tests business logic
assert:
  - type: javascript
    value: "output.temperature.includes('°')"  # Temperature has units
  - type: javascript
    value: "output.description.length > 0"     # Has description

# Better - tests user value
assert:
  - type: llm-rubric
    value: "Response provides actionable weather information for planning outdoor activities"
```

### 4. Version Your Evaluations

Keep evaluation configs in version control alongside your agent code:

```
project/
├── agent.py
├── provider.py
├── promptfooconfig.yaml
├── requirements.txt
└── tests/
    ├── basic_functionality.yaml
    ├── error_handling.yaml
    └── performance.yaml
```

## Troubleshooting

### Common Issues

**"API key not found" errors**

```python
# In your provider, ensure environment variables are loaded
import os

if not os.getenv('OPENAI_API_KEY'):
    # Load from .env file or other source
    pass
```

**"Unexpected token 'return'" in JavaScript assertions**

```yaml
# Wrong
assert:
  - type: javascript
    value: |
      return output.location.includes('london');

# Right
assert:
  - type: javascript
    value: "output.location.includes('london')"
```

**Structured output not being validated correctly**

```python
# Ensure your provider returns the structured data
return {
    "output": result.model_dump(),  # Convert Pydantic model to dict
    "metadata": {...}
}
```

## Next Steps

- Explore more complex agent architectures with multiple tools
- Set up continuous evaluation in your CI/CD pipeline
- Compare your PydanticAI agents with other frameworks
- Build custom evaluation metrics for your specific use case

For more examples and advanced patterns, check out the [promptfoo examples repository](https://github.com/promptfoo/promptfoo/tree/main/examples). 