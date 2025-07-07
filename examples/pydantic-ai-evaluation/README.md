# pydantic-ai-evaluation

This example demonstrates how to evaluate PydanticAI agents with type-safe structured outputs, validation, and advanced features.

You can run this example with:

```bash
npx promptfoo@latest init --example pydantic-ai-evaluation
```

## Overview

PydanticAI is a Python framework that combines:
- **Type Safety** - Pydantic models for structured outputs
- **Validation** - Built-in data validation and error handling
- **Model Agnostic** - Works with OpenAI, Anthropic, and other providers
- **Dependency Injection** - Clean separation of concerns
- **Streaming Support** - Efficient handling of large responses

## Features Evaluated

1. **Structured Output Generation**
2. **Type Safety and Validation**
3. **Error Handling**
4. **Tool Integration**
5. **Multi-Model Support**
6. **Performance and Latency**

## Setup

### 1. Install Dependencies

```bash
pip install -r requirements.txt
```

### 2. Set Environment Variables

```bash
# Required
export OPENAI_API_KEY="your-openai-api-key"

# Optional for multi-model testing
export ANTHROPIC_API_KEY="your-anthropic-api-key"
```

### 3. Run the Evaluation

```bash
npx promptfoo eval
```

### 4. View Results

```bash
npx promptfoo view
```

## Agent Configurations

### Basic Agent
Simple agent without structured outputs for baseline comparison.

### Structured Output Agent
Returns type-safe structured data:
- **PersonInfo** - Extracts person details with validation
- **ConferencePlan** - Creates detailed event plans
- **DataPipeline** - Designs data processing workflows

### Advanced Agent with Tools
Includes tool usage for:
- Web search
- Calculations
- Data processing
- API calls

### Validated Output Agent
Strict validation with:
- Age range checks
- Email format validation
- Required field enforcement
- Custom validators

## Test Scenarios

### 1. Basic Queries
Tests fundamental agent capabilities.

### 2. Data Extraction
Evaluates structured information extraction from unstructured text.

### 3. Complex Planning
Tests multi-step reasoning and comprehensive output generation.

### 4. Calculations and Tools
Measures accuracy when using tools and performing calculations.

### 5. Error Handling
Verifies graceful handling of invalid inputs and edge cases.

### 6. Workflow Generation
Tests ability to create detailed, actionable plans.

## Implementation Examples

### Basic Agent

```python
from pydantic_ai import Agent

agent = Agent(
    model="openai:gpt-4o-mini",
    system_prompt="You are a helpful assistant."
)

result = agent.run_sync("Your query here")
print(result.data)
```

### Structured Output

```python
from pydantic import BaseModel
from pydantic_ai import Agent

class TaskOutput(BaseModel):
    title: str
    priority: int
    steps: list[str]

agent = Agent(
    model="openai:gpt-4o-mini",
    result_type=TaskOutput,
    system_prompt="Create structured task plans."
)

result = agent.run_sync("Plan a code review process")
task = result.data  # Type: TaskOutput
```

### With Validation

```python
from pydantic import BaseModel, Field, validator

class ValidatedOutput(BaseModel):
    age: int = Field(ge=0, le=150)
    email: str = Field(regex=r'^[\w\.-]+@[\w\.-]+\.\w+$')
    
    @validator('age')
    def check_reasonable_age(cls, v):
        if v > 120:
            raise ValueError('Age seems unrealistic')
        return v
```

### Tool Integration

```python
from pydantic_ai import Agent, RunContext

def calculate_tool(ctx: RunContext, expression: str) -> str:
    """Evaluate mathematical expressions"""
    try:
        result = eval(expression, {"__builtins__": {}})
        return str(result)
    except Exception as e:
        return f"Error: {e}"

agent = Agent(
    model="openai:gpt-4o-mini",
    tools=[calculate_tool]
)
```

## Best Practices for 2025

1. **Use Latest Models**
   - OpenAI: GPT-4.1, O4-mini
   - Anthropic: Claude-3.7-Sonnet
   - Open models: Llama-3.2, Qwen-2.5

2. **Implement Proper Validation**
   ```python
   class StrictModel(BaseModel):
       class Config:
           validate_assignment = True
           use_enum_values = True
           validate_default = True
   ```

3. **Handle Streaming for Large Outputs**
   ```python
   async for chunk in agent.run_stream(prompt):
       process_chunk(chunk)
   ```

4. **Use Dependency Injection**
   ```python
   class DatabaseDep:
       async def get_data(self, id: str): ...
   
   agent = Agent(
       model="openai:gpt-4o-mini",
       deps_type=DatabaseDep
   )
   ```

5. **Implement Retry Logic**
   ```python
   result = await agent.run(
       prompt,
       retry_count=3,
       retry_delay=1.0
   )
   ```

## Performance Optimization

### Model Selection
- Use O4-mini for simple structured outputs
- Use GPT-4.1 for complex reasoning
- Use Claude-3.7 for nuanced understanding

### Caching Strategies
```python
from pydantic_ai import Agent
from functools import lru_cache

@lru_cache(maxsize=100)
def get_agent(model: str) -> Agent:
    return Agent(model=model)
```

### Batch Processing
```python
results = await asyncio.gather(*[
    agent.run(prompt) for prompt in prompts
])
```

## Troubleshooting

### Common Issues

1. **Validation Errors**
   - Check model output matches schema
   - Add optional fields for flexibility
   - Use Union types for multiple formats

2. **Model Timeouts**
   - Reduce output complexity
   - Use streaming for large responses
   - Implement proper timeout handling

3. **Type Mismatches**
   - Enable strict typing in IDE
   - Use Pydantic's validation errors
   - Add custom error messages

## Advanced Features

### Custom Output Parsers
```python
def custom_parser(raw_output: str) -> dict:
    # Custom parsing logic
    return parsed_data

agent = Agent(
    model="openai:gpt-4o-mini",
    output_parser=custom_parser
)
```

### Multi-Agent Systems
```python
research_agent = Agent(model="gpt-4.1", ...)
writer_agent = Agent(model="claude-3.7", ...)

# Coordinate agents
research = await research_agent.run(topic)
article = await writer_agent.run(f"Write about: {research.data}")
```

### Testing Strategies
```python
import pytest
from pydantic_ai.testing import MockAgent

def test_agent():
    mock = MockAgent(responses=["Test response"])
    result = mock.run_sync("Any prompt")
    assert result.data == "Test response"
```

## Next Steps

- Build custom tools for your domain
- Create reusable output schemas
- Implement production monitoring
- Set up A/B testing for models
- Create validation test suites 