---
sidebar_label: Evaluating Any-Agent Framework
---

# How to Compare Agent Frameworks with Mozilla Any-Agent

[Mozilla's Any-Agent](https://github.com/mozilla-ai/any-agent) provides a unified interface for multiple agent frameworks, making it ideal for comparing their performance side-by-side. This guide shows you how to use promptfoo to evaluate and compare different agent frameworks like LangChain, OpenAI Agents, Smolagents, and TinyAgents.

## Why Use Any-Agent for Evaluation?

Any-Agent solves a key challenge in agent development:
- **Framework lock-in** - Switch between frameworks with one line of code
- **Fair comparisons** - Same prompts, same tools, different implementations
- **Consistent interface** - Unified API across all frameworks
- **Tool portability** - Write tools once, use everywhere

## Setup

First, install Any-Agent with all framework support:

```bash
pip install "any-agent[all]"
```

Or install specific frameworks:

```bash
pip install "any-agent[langchain,tinyagent,smolagents,openai]"
```

## Basic Framework Comparison

Create providers for each framework you want to compare:

```python title="anyagent_tiny.py"
from any_agent import AnyAgent, AgentConfig
from any_agent.tools import search_web, visit_webpage

# Initialize TinyAgents framework
agent = AnyAgent.create(
    "tinyagent",
    AgentConfig(
        model_id="gpt-4o-mini",
        instructions="You are a helpful assistant. Use tools when needed.",
        tools=[search_web, visit_webpage]
    )
)

def call_api(prompt, options, context):
    """Promptfoo provider for TinyAgents"""
    try:
        trace = agent.run(prompt)
        return {
            "output": str(trace.final_output),
            "metadata": {
                "framework": "tinyagent",
                "tools_used": getattr(trace, 'tools_used', [])
            }
        }
    except Exception as e:
        return {"error": str(e), "output": ""}
```

Create similar files for other frameworks:

```python title="anyagent_langchain.py"
# Only the framework name changes!
agent = AnyAgent.create(
    "langchain",  # Different framework
    AgentConfig(
        model_id="gpt-4o-mini",
        instructions="You are a helpful assistant. Use tools when needed.",
        tools=[search_web, visit_webpage]
    )
)
```

## Promptfoo Configuration

Compare all frameworks side-by-side:

```yaml title="promptfooconfig.yaml"
# yaml-language-server: $schema=https://promptfoo.dev/config-schema.json
description: Any-Agent framework comparison

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
  # Test web search capabilities
  - vars:
      prompt: "What is the current population of Tokyo according to recent data?"
    assert:
      - type: contains
        value: "million"
      - type: javascript
        value: |
          // Check if a reasonable number is mentioned
          const numbers = output.match(/\d+\.?\d*/g);
          return numbers && numbers.some(n => parseFloat(n) > 10 && parseFloat(n) < 50);
  
  # Test multi-step reasoning
  - vars:
      prompt: "Find the latest Nobel Prize winner in Physics and explain their discovery"
    assert:
      - type: contains-any
        value: ["2024", "2023", "Nobel", "Physics"]
      - type: llm-rubric
        value: "Response should mention specific names and explain the discovery clearly"
  
  # Test tool usage efficiency
  - vars:
      prompt: "Compare the weather in London and Tokyo right now"
    assert:
      - type: javascript
        value: output.includes('London') && output.includes('Tokyo')
      - type: llm-rubric
        value: "Response should include current weather data for both cities"
```

## Advanced Testing Scenarios

### Custom Tools Across Frameworks

Create custom tools that work with all frameworks:

```python title="custom_tools.py"
from any_agent import tool
from datetime import datetime
import yfinance as yf

@tool
def get_stock_price(symbol: str) -> dict:
    """Get current stock price and daily change"""
    stock = yf.Ticker(symbol)
    info = stock.info
    return {
        "symbol": symbol,
        "price": info.get('currentPrice', 'N/A'),
        "change": info.get('regularMarketChangePercent', 'N/A'),
        "currency": info.get('currency', 'USD')
    }

@tool
def calculate_investment_return(
    principal: float, 
    annual_rate: float, 
    years: int
) -> dict:
    """Calculate investment return with compound interest"""
    final_amount = principal * (1 + annual_rate) ** years
    return {
        "initial": principal,
        "final": round(final_amount, 2),
        "gain": round(final_amount - principal, 2),
        "years": years
    }

# Use in agent configuration
agent = AnyAgent.create(
    "langchain",
    AgentConfig(
        model_id="gpt-4o-mini",
        instructions="You are a financial advisor assistant.",
        tools=[get_stock_price, calculate_investment_return]
    )
)
```

### Testing Framework-Specific Behaviors

Different frameworks may handle the same task differently:

```yaml title="behavior_comparison.yaml"
tests:
  # Test error handling
  - vars:
      prompt: "Search for information about [INVALID_URL_FORMAT]"
    assert:
      - type: not-contains
        value: "error"
      - type: llm-rubric
        value: "Agent should handle the invalid input gracefully"
  
  # Test conversation memory
  - vars:
      prompt: |
        First, tell me about Paris.
        Now, what did I just ask you about?
    assert:
      - type: contains
        value: "Paris"
      - type: llm-rubric
        value: "Agent should remember the previous question"
  
  # Test parallel tool usage
  - vars:
      prompt: "Get stock prices for AAPL, GOOGL, and MSFT"
    assert:
      - type: javascript
        value: |
          // Check if all three stocks are mentioned
          ['AAPL', 'GOOGL', 'MSFT'].every(stock => 
            output.includes(stock)
          )
```

## Performance Metrics

### Measuring Framework Efficiency

Add custom metrics to compare framework performance:

```python title="metrics_provider.py"
import time
from any_agent import AnyAgent, AgentConfig

def call_api(prompt, options, context):
    config = options.get('config', {})
    framework = config.get('framework', 'tinyagent')
    
    agent = AnyAgent.create(
        framework,
        AgentConfig(
            model_id="gpt-4o-mini",
            instructions="You are a helpful assistant.",
            tools=[]
        )
    )
    
    start_time = time.time()
    trace = agent.run(prompt)
    execution_time = time.time() - start_time
    
    return {
        "output": str(trace.final_output),
        "metadata": {
            "framework": framework,
            "execution_time": execution_time,
            "steps": len(getattr(trace, 'steps', [])),
            "tools_called": len(getattr(trace, 'tools_used', []))
        }
    }
```

### Comparing Token Usage

```yaml
providers:
  - id: file://metrics_provider.py
    label: "TinyAgents"
    config:
      framework: tinyagent
      
  - id: file://metrics_provider.py
    label: "LangChain"
    config:
      framework: langchain

tests:
  - vars:
      prompt: "Explain quantum computing in simple terms"
    assert:
      # Compare response quality
      - type: llm-rubric
        value: "Explanation should be accurate yet simple"
      
      # Check efficiency
      - type: javascript
        value: |
          // Prefer responses under 200 words
          const wordCount = output.split(/\s+/).length;
          return wordCount < 200;
```

## Best Practices

### 1. Use Consistent Prompts

```yaml
# Define prompts once, test across all frameworks
prompts:
  - file://prompts/research_task.txt
  - file://prompts/coding_task.txt
  - file://prompts/creative_writing.txt

providers:
  - file://anyagent_tiny.py
  - file://anyagent_langchain.py
  - file://anyagent_smolagents.py
  - file://anyagent_openai.py
```

### 2. Test Edge Cases

```yaml
tests:
  # Empty input
  - vars:
      prompt: ""
    assert:
      - type: not-empty
      
  # Very long input
  - vars:
      prompt: "{{repeat 'Analyze this text. ' 100}}"
    assert:
      - type: max-length
        value: 1000
```

### 3. Compare Resource Usage

```python
# Track memory and CPU usage
import psutil
import os

def call_api(prompt, options, context):
    process = psutil.Process(os.getpid())
    
    # Measure before
    mem_before = process.memory_info().rss / 1024 / 1024  # MB
    
    # Run agent
    result = agent.run(prompt)
    
    # Measure after
    mem_after = process.memory_info().rss / 1024 / 1024  # MB
    
    return {
        "output": str(result.final_output),
        "metadata": {
            "memory_used_mb": mem_after - mem_before
        }
    }
```

## Running the Comparison

```bash
# Run the evaluation
npx promptfoo@latest eval

# Generate a detailed report
npx promptfoo@latest eval --output results.json

# View in the web UI
npx promptfoo@latest view
```

## Interpreting Results

Look for:
- **Consistency** - Which frameworks produce reliable outputs?
- **Tool usage** - Which frameworks use tools most efficiently?
- **Error handling** - Which frameworks handle edge cases best?
- **Performance** - Which frameworks are fastest?
- **Token efficiency** - Which frameworks use fewer tokens?

## MCP (Model Context Protocol) Support

Any-Agent supports MCP servers for enhanced capabilities:

```python
from any_agent import AnyAgent, AgentConfig, MCPServer

# Configure MCP server
mcp_server = MCPServer("path/to/mcp/server")

agent = AnyAgent.create(
    "langchain",
    AgentConfig(
        model_id="gpt-4o-mini",
        mcp_servers=[mcp_server]
    )
)
```

## Next Steps

- Try the [complete Any-Agent example](https://github.com/promptfoo/promptfoo/tree/main/examples/mozilla-any-agent)
- Learn about [evaluating PydanticAI agents](/docs/guides/evaluate-pydantic-ai-agents)
- Explore [testing OpenAI Agents SDK](/docs/guides/evaluate-openai-agents-sdk) 