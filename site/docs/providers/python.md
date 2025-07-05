---
sidebar_label: Custom Python
---

# Python Provider

The Python provider enables you to create custom evaluation logic using Python scripts. This allows you to integrate Promptfoo with any Python-based model, API, or custom logic.

**Common use cases:**

- Integrating proprietary or local models
- Adding custom preprocessing/postprocessing logic
- Implementing complex evaluation workflows
- Using Python-specific ML libraries
- Creating mock providers for testing

## Prerequisites

Before using the Python provider, ensure you have:

- Python 3.7 or higher installed
- Basic familiarity with Promptfoo configuration
- Understanding of Python dictionaries and JSON

## Quick Start

Let's create a simple Python provider that echoes back the input with a prefix.

### Step 1: Create your Python script

```python
# echo_provider.py
def call_api(prompt, options, context):
    """Simple provider that echoes the prompt with a prefix."""
    config = options.get('config', {})
    prefix = config.get('prefix', 'Tell me about: ')

    return {
        "output": f"{prefix}{prompt}"
    }
```

### Step 2: Configure Promptfoo

```yaml
# promptfooconfig.yaml
providers:
  - id: 'file://echo_provider.py'

prompts:
  - 'Tell me a joke'
  - 'What is 2+2?'
```

### Step 3: Run the evaluation

```bash
npx promptfoo@latest eval
```

That's it! You've created your first custom Python provider.

## How It Works

When Promptfoo evaluates a test case with a Python provider:

1. **Promptfoo** prepares the prompt based on your configuration
2. **Python Script** is called with three parameters:
   - `prompt`: The final prompt string
   - `options`: Provider configuration from your YAML
   - `context`: Variables and metadata for the current test
3. **Your Code** processes the prompt and returns a response
4. **Promptfoo** validates the response and continues evaluation

```
┌─────────────┐     ┌──────────────┐     ┌─────────────┐
│ Promptfoo   │────▶│ Your Python  │────▶│ Your Logic  │
│ Evaluation  │     │ Provider     │     │ (API/Model) │
└─────────────┘     └──────────────┘     └─────────────┘
       ▲                    │
       │                    ▼
       │            ┌──────────────┐
       └────────────│   Response   │
                    └──────────────┘
```

## Basic Usage

### Function Interface

Your Python script must implement one or more of these functions. Both synchronous and asynchronous versions are supported:

**Synchronous Functions:**

```python
def call_api(prompt: str, options: dict, context: dict) -> dict:
    """Main function for text generation tasks."""
    pass

def call_embedding_api(prompt: str, options: dict, context: dict) -> dict:
    """For embedding generation tasks."""
    pass

def call_classification_api(prompt: str, options: dict, context: dict) -> dict:
    """For classification tasks."""
    pass
```

**Asynchronous Functions:**

```python
async def call_api(prompt: str, options: dict, context: dict) -> dict:
    """Async main function for text generation tasks."""
    pass

async def call_embedding_api(prompt: str, options: dict, context: dict) -> dict:
    """Async function for embedding generation tasks."""
    pass

async def call_classification_api(prompt: str, options: dict, context: dict) -> dict:
    """Async function for classification tasks."""
    pass
```

### Understanding Parameters

#### The `prompt` Parameter

The prompt can be either:

- A simple string: `"What is the capital of France?"`
- A JSON-encoded conversation: `'[{"role": "user", "content": "Hello"}]'`

```python
def call_api(prompt, options, context):
    # Check if prompt is a conversation
    try:
        messages = json.loads(prompt)
        # Handle as chat messages
        for msg in messages:
            print(f"{msg['role']}: {msg['content']}")
    except:
        # Handle as simple string
        print(f"Prompt: {prompt}")
```

#### The `options` Parameter

Contains your provider configuration:

```python
{
    "id": "file://my_provider.py",
    "config": {
        # Your custom configuration from promptfooconfig.yaml
        "model_name": "gpt-3.5-turbo",
        "temperature": 0.7,
        "max_tokens": 100
    }
}
```

#### The `context` Parameter

Provides information about the current test case:

```python
{
    "vars": {
        # Variables used in this test case
        "user_input": "Hello world",
        "system_prompt": "You are a helpful assistant"
    }
}
```

### Return Format

Your function must return a dictionary with these fields:

```python
def call_api(prompt, options, context):
    # Required field
    result = {
        "output": "Your response here"
    }

    # Optional fields
    result["tokenUsage"] = {
        "total": 150,
        "prompt": 50,
        "completion": 100
    }

    result["cost"] = 0.0025  # in dollars
    result["cached"] = False
    result["logProbs"] = [-0.5, -0.3, -0.1]

    # Error handling
    if something_went_wrong:
        result["error"] = "Description of what went wrong"

    return result
```

### Types

The types passed into the Python script function and the `ProviderResponse` return type are defined as follows:

```python
class ProviderOptions:
    id: Optional[str]
    config: Optional[Dict[str, Any]]

class CallApiContextParams:
    vars: Dict[str, str]

class TokenUsage:
    total: int
    prompt: int
    completion: int

class ProviderResponse:
    output: Optional[Union[str, Dict[str, Any]]]
    error: Optional[str]
    tokenUsage: Optional[TokenUsage]
    cost: Optional[float]
    cached: Optional[bool]
    logProbs: Optional[List[float]]

class ProviderEmbeddingResponse:
    embedding: List[float]
    tokenUsage: Optional[TokenUsage]
    cached: Optional[bool]

class ProviderClassificationResponse:
    classification: Dict[str, Any]
    tokenUsage: Optional[TokenUsage]
    cached: Optional[bool]

```

:::tip
Always include the `output` field in your response, even if it's an empty string when an error occurs.
:::

## Complete Examples

### Example 1: OpenAI-Compatible Provider

```python
# openai_provider.py
import os
import json
from openai import OpenAI

def call_api(prompt, options, context):
    """Provider that calls OpenAI API."""
    config = options.get('config', {})

    # Initialize client
    client = OpenAI(
        api_key=os.getenv('OPENAI_API_KEY'),
        base_url=config.get('base_url', 'https://api.openai.com/v1')
    )

    # Parse messages if needed
    try:
        messages = json.loads(prompt)
    except:
        messages = [{"role": "user", "content": prompt}]

    # Make API call
    try:
        response = client.chat.completions.create(
            model=config.get('model', 'gpt-3.5-turbo'),
            messages=messages,
            temperature=config.get('temperature', 0.7),
            max_tokens=config.get('max_tokens', 150)
        )

        return {
            "output": response.choices[0].message.content,
            "tokenUsage": {
                "total": response.usage.total_tokens,
                "prompt": response.usage.prompt_tokens,
                "completion": response.usage.completion_tokens
            }
        }
    except Exception as e:
        return {
            "output": "",
            "error": str(e)
        }
```

### Example 2: Local Model with Preprocessing

```python
# local_model_provider.py
import torch
from transformers import pipeline

# Initialize model once
generator = pipeline('text-generation', model='gpt2')

def preprocess_prompt(prompt, context):
    """Add context-specific preprocessing."""
    template = context['vars'].get('template', '{prompt}')
    return template.format(prompt=prompt)

def call_api(prompt, options, context):
    """Provider using a local Hugging Face model."""
    config = options.get('config', {})

    # Preprocess
    processed_prompt = preprocess_prompt(prompt, context)

    # Generate
    result = generator(
        processed_prompt,
        max_length=config.get('max_length', 100),
        temperature=config.get('temperature', 0.7),
        do_sample=True
    )

    return {
        "output": result[0]['generated_text'],
        "cached": False
    }
```

### Example 3: Mock Provider for Testing

```python
# mock_provider.py
import time
import random

def call_api(prompt, options, context):
    """Mock provider for testing evaluation pipelines."""
    config = options.get('config', {})

    # Simulate processing time
    delay = config.get('delay', 0.1)
    time.sleep(delay)

    # Simulate different response types
    if "error" in prompt.lower():
        return {
            "output": "",
            "error": "Simulated error for testing"
        }

    # Generate mock response
    responses = config.get('responses', [
        "This is a mock response.",
        "Mock provider is working correctly.",
        "Test response generated successfully."
    ])

    response = random.choice(responses)
    mock_tokens = len(prompt.split()) + len(response.split())

    return {
        "output": response,
        "tokenUsage": {
            "total": mock_tokens,
            "prompt": len(prompt.split()),
            "completion": len(response.split())
        },
        "cost": mock_tokens * 0.00001
    }
```

## Configuration

### Basic Configuration

```yaml
providers:
  - id: 'file://my_provider.py'
    label: 'My Custom Provider' # Optional display name
    config:
      # Any configuration your provider needs
      api_key: ${CUSTOM_API_KEY}
      endpoint: https://api.example.com
      model_params:
        temperature: 0.7
        max_tokens: 100
```

### Using External Configuration Files

You can load configuration from external files:

```yaml
providers:
  - id: 'file://my_provider.py'
    config:
      # Load entire config from JSON
      settings: file://config/model_settings.json

      # Load from YAML with specific function
      prompts: file://config/prompts.yaml

      # Load from Python function
      preprocessing: file://config/preprocess.py:get_config

      # Nested file references
      models:
        primary: file://config/primary_model.json
        fallback: file://config/fallback_model.yaml
```

Supported formats:

- **JSON** (`.json`) - Parsed as objects/arrays
- **YAML** (`.yaml`, `.yml`) - Parsed as objects/arrays
- **Text** (`.txt`, `.md`) - Loaded as strings
- **Python** (`.py`) - Must export a function returning config
- **JavaScript** (`.js`, `.mjs`) - Must export a function returning config

### Environment Configuration

#### Custom Python Executable

```yaml
providers:
  - id: 'file://my_provider.py'
    config:
      pythonExecutable: /path/to/venv/bin/python
```

#### Environment Variables

```bash
# Use specific Python version
export PROMPTFOO_PYTHON=/usr/bin/python3.11

# Add custom module paths
export PYTHONPATH=/path/to/my/modules:$PYTHONPATH

# Run evaluation
npx promptfoo@latest eval
```

## Advanced Features

### Custom Function Names

Override the default function name:

```yaml
providers:
  - id: 'file://my_provider.py:generate_response'
    config:
      model: 'custom-model'
```

```python
# my_provider.py
def generate_response(prompt, options, context):
    # Your custom function
    return {"output": "Custom response"}
```

### Handling Different Input Types

```python
def call_api(prompt, options, context):
    """Handle various prompt formats."""

    # Text prompt
    if isinstance(prompt, str):
        try:
            # Try parsing as JSON
            data = json.loads(prompt)
            if isinstance(data, list):
                # Chat format
                return handle_chat(data, options)
            elif isinstance(data, dict):
                # Structured prompt
                return handle_structured(data, options)
        except:
            # Plain text
            return handle_text(prompt, options)
```

### Implementing Guardrails

```python
def call_api(prompt, options, context):
    """Provider with safety guardrails."""

    # Check for prohibited content
    prohibited_terms = config.get('prohibited_terms', [])
    for term in prohibited_terms:
        if term.lower() in prompt.lower():
            return {
                "output": "I cannot process this request.",
                "guardrails": {
                    "flagged": True,
                    "reason": "Prohibited content detected"
                }
            }

    # Process normally
    result = generate_response(prompt)

    # Post-process checks
    if check_output_safety(result):
        return {"output": result}
    else:
        return {
            "output": "[Content filtered]",
            "guardrails": {"flagged": True}
        }
```

## Troubleshooting

### Common Issues and Solutions

| Issue                     | Solution                                                            |
| ------------------------- | ------------------------------------------------------------------- |
| "Module not found" errors | Set `PYTHONPATH` or use `pythonExecutable` for virtual environments |
| Script not executing      | Check file path is relative to `promptfooconfig.yaml`               |
| No output visible         | Use `LOG_LEVEL=debug` to see print statements                       |
| JSON parsing errors       | Ensure prompt format matches your parsing logic                     |
| Timeout errors            | Optimize initialization code, load models once                      |

### Debugging Tips

1. **Enable debug logging:**

   ```bash
   LOG_LEVEL=debug npx promptfoo@latest eval
   ```

2. **Add logging to your provider:**

   ```python
   import sys

   def call_api(prompt, options, context):
       print(f"Received prompt: {prompt}", file=sys.stderr)
       print(f"Config: {options.get('config', {})}", file=sys.stderr)
       # Your logic here
   ```

3. **Test your provider standalone:**

   ```python
   # test_provider.py
   from my_provider import call_api

   result = call_api(
       "Test prompt",
       {"config": {"model": "test"}},
       {"vars": {}}
   )
   print(result)
   ```

4. **Use Python debugger (pdb) for interactive debugging:**

   ```bash
   export PROMPTFOO_PYTHON_DEBUG_ENABLED=true
   ```

   With this environment variable set, you can use `import pdb; pdb.set_trace()` in your Python code to set breakpoints:

   ```python
   def call_api(prompt, options, context):
       import pdb; pdb.set_trace()  # Execution will pause here
       # Your provider logic
       return {"output": result}
   ```

   This allows interactive debugging directly in your terminal during evaluation runs.

### Performance Optimization

:::tip
Initialize expensive resources (models, connections) outside the function to avoid reloading on each call:

```python
# Initialize once
model = load_model()

def call_api(prompt, options, context):
    # Use pre-loaded model
    return {"output": model.generate(prompt)}
```

:::

## Migration Guide

### From HTTP Provider

If you're currently using an HTTP provider, you can wrap your API calls:

```python
# http_wrapper.py
import requests

def call_api(prompt, options, context):
    config = options.get('config', {})
    response = requests.post(
        config.get('url'),
        json={"prompt": prompt},
        headers=config.get('headers', {})
    )
    return response.json()
```

### From JavaScript Provider

The Python provider follows the same interface as JavaScript providers:

```javascript
// JavaScript
module.exports = {
  async callApi(prompt, options, context) {
    return { output: `Echo: ${prompt}` };
  },
};
```

```python
# Python equivalent
def call_api(prompt, options, context):
    return {"output": f"Echo: {prompt}"}
```

## Using Mozilla Any-Agent Framework

[Mozilla's Any-Agent](https://github.com/mozilla-ai/any-agent) provides a unified interface for multiple agent frameworks (LangChain, OpenAI Agents, Smolagents, TinyAgents, etc.), making it ideal for comparing agent performance with Promptfoo.

### Basic Any-Agent Provider

Here's how to create a Promptfoo provider using Any-Agent:

```python
# anyagent_provider.py
from any_agent import AnyAgent, AgentConfig
from any_agent.tools import search_web, visit_webpage

# Initialize agent with your chosen framework
agent = AnyAgent.create(
    "langchain",  # or "tinyagent", "smolagents", "openai"
    AgentConfig(
        model_id="gpt-4o-mini",
        instructions="You are a helpful assistant. Use tools when needed.",
        tools=[search_web, visit_webpage]
    )
)

def call_api(prompt, options, context):
    """Promptfoo provider using Any-Agent."""
    try:
        # Run the agent
        trace = agent.run(prompt)
        
        return {
            "output": str(trace.final_output),
            "metadata": {
                "framework": "langchain",
                "tools_used": getattr(trace, 'tools_used', [])
            }
        }
    except Exception as e:
        return {
            "error": str(e),
            "output": ""
        }
```

### Comparing Multiple Frameworks

Any-Agent's strength is switching between frameworks with minimal code changes:

```yaml
# promptfooconfig.yaml
providers:
  - id: file://anyagent_tiny.py
    label: "TinyAgents"
    
  - id: file://anyagent_langchain.py
    label: "LangChain"
    
  - id: file://anyagent_smolagents.py
    label: "Smolagents"
    
  - id: file://anyagent_openai.py
    label: "OpenAI Agents"

tests:
  - vars:
      prompt: "What is the current population of Paris?"
    assert:
      - type: contains
        value: "million"
```

Each provider file only differs in the framework name:

```python
# anyagent_tiny.py
agent = AnyAgent.create("tinyagent", config)

# anyagent_langchain.py  
agent = AnyAgent.create("langchain", config)

# anyagent_smolagents.py
agent = AnyAgent.create("smolagents", config)

# anyagent_openai.py
agent = AnyAgent.create("openai", config)
```

### Custom Tools with Any-Agent

You can create custom tools that work across all frameworks:

```python
from any_agent import tool

@tool
def calculate_compound_interest(principal: float, rate: float, years: int) -> float:
    """Calculate compound interest."""
    return principal * (1 + rate) ** years

# Use in agent configuration
agent = AnyAgent.create(
    "langchain",
    AgentConfig(
        model_id="gpt-4o-mini",
        tools=[calculate_compound_interest, search_web]
    )
)
```

### Complete Example

See our [Mozilla Any-Agent example](/examples/mozilla-any-agent/) for a comprehensive guide on:
- Setting up Any-Agent with Promptfoo
- Comparing multiple agent frameworks
- Using built-in and custom tools
- Evaluating agent performance across frameworks

### Benefits

Using Any-Agent with Promptfoo allows you to:
1. **Compare frameworks objectively** - Same prompts, same tools, different implementations
2. **Switch frameworks easily** - Change one line to test a different framework
3. **Use consistent tooling** - Tools work across all supported frameworks
4. **Leverage Promptfoo's evaluation** - Get detailed metrics on each framework's performance

## Using PydanticAI Framework

[PydanticAI](https://ai.pydantic.dev/) is a Python agent framework that provides structured outputs and type safety for AI applications. It's particularly useful when you need consistent, validated responses from your agents.

### Basic PydanticAI Provider

Here's how to create a Promptfoo provider using PydanticAI:

```python
# pydantic_provider.py
from pydantic import BaseModel
from pydantic_ai import Agent, RunContext
import asyncio

# Define structured output
class CustomerResponse(BaseModel):
    """Structured customer service response"""
    intent: str
    response: str
    requires_followup: bool
    sentiment: str

# Define tools
def check_order_status(ctx: RunContext, order_id: str) -> dict:
    """Check order status (mock implementation)"""
    return {
        "order_id": order_id,
        "status": "shipped",
        "tracking": "ABC123"
    }

# Create agent
agent = Agent(
    "openai:gpt-4o-mini",
    output_type=CustomerResponse,
    system_prompt="You are a helpful customer service agent.",
)
agent.tool(check_order_status)

def call_api(prompt, options, context):
    """Promptfoo provider using PydanticAI."""
    try:
        # Run the agent
        result = asyncio.run(agent.run(prompt))
        
        # Return structured output
        return {
            "output": result.output.model_dump(),
            "metadata": {
                "model": "gpt-4o-mini",
                "structured": True
            }
        }
    except Exception as e:
        return {
            "error": str(e),
            "output": {}
        }
```

### Testing Structured Outputs

PydanticAI excels at providing consistent, validated outputs. Here's how to test them:

```yaml
# promptfooconfig.yaml
providers:
  - id: file://pydantic_provider.py
    label: "PydanticAI Agent"

defaultTest:
  assert:
    - type: is-json
      value:
        type: object
        properties:
          intent:
            type: string
          response:
            type: string
          requires_followup:
            type: boolean
          sentiment:
            type: string
        required: ['intent', 'response', 'requires_followup', 'sentiment']

tests:
  - vars:
      prompt: "Where is my order #12345?"
    assert:
      - type: javascript
        value: output.intent === 'order_inquiry'
      
  - vars:
      prompt: "I'm very upset about the delay!"
    assert:
      - type: javascript
        value: output.sentiment === 'negative' && output.requires_followup === true
```

### Advanced PydanticAI Features

#### Multiple Output Types

```python
from typing import Union

class FAQResponse(BaseModel):
    question: str
    answer: str
    category: str

class OrderResponse(BaseModel):
    order_id: str
    status: str
    next_steps: list[str]

# Agent with dynamic output types
def create_agent(output_type: type[BaseModel]):
    return Agent(
        "openai:gpt-4o-mini",
        output_type=output_type,
        system_prompt="Provide structured responses."
    )

def call_api(prompt, options, context):
    config = options.get('config', {})
    
    # Determine output type based on prompt
    if "order" in prompt.lower():
        agent = create_agent(OrderResponse)
    else:
        agent = create_agent(FAQResponse)
    
    result = asyncio.run(agent.run(prompt))
    return {"output": result.output.model_dump()}
```

#### Streaming Responses

```python
async def stream_response(prompt):
    """Stream responses for real-time feedback."""
    async with agent.run_stream(prompt) as stream:
        chunks = []
        async for chunk in stream:
            chunks.append(chunk)
        
        # Get final result
        result = await stream.get_result()
        return result.output

def call_api(prompt, options, context):
    result = asyncio.run(stream_response(prompt))
    return {"output": result.model_dump()}
```

### Complete Example

See our [PydanticAI example](/examples/pydantic-ai/) for a working demonstration that includes:
- Weather agent with structured outputs
- Tool usage with mock implementations
- JSON schema validation
- Multiple assertion types

### Benefits of PydanticAI

1. **Type Safety** - Guaranteed structured outputs with Pydantic validation
2. **Tool Integration** - Easy tool definition with automatic parameter validation
3. **Async Support** - Built for modern async Python applications
4. **Model Agnostic** - Works with OpenAI, Anthropic, and other providers
5. **Testing Friendly** - Structured outputs make assertions predictable

## Next Steps

- Learn about [custom assertions](/docs/configuration/expected-outputs/)
- Set up [CI/CD integration](/docs/integrations/github-action.md)
