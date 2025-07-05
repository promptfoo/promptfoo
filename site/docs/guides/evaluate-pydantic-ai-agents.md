---
sidebar_label: Evaluating PydanticAI Agents
---

# How to Evaluate PydanticAI Agents

[PydanticAI](https://ai.pydantic.dev/) is a Python agent framework that provides structured outputs and type safety for AI applications. This guide shows you how to evaluate PydanticAI agents using promptfoo to ensure they produce consistent, validated responses.

## Why Evaluate PydanticAI Agents?

PydanticAI agents are particularly useful when you need:
- **Structured outputs** - Guaranteed response formats with Pydantic validation
- **Type safety** - Catch data validation errors before they reach production
- **Tool integration** - Test how agents use tools and functions
- **Consistent behavior** - Ensure agents follow expected patterns

## Basic Setup

First, install the required dependencies:

```bash
pip install pydantic-ai pydantic openai
```

## Creating a PydanticAI Provider

Here's a basic example of a customer service agent with structured outputs:

```python title="pydantic_agent.py"
from pydantic import BaseModel
from pydantic_ai import Agent, RunContext
import asyncio

# Define structured output
class CustomerResponse(BaseModel):
    """Structured customer service response"""
    intent: str  # order_inquiry, complaint, general_question
    response: str
    requires_followup: bool
    sentiment: str  # positive, neutral, negative
    confidence: float

# Define tools
def check_order_status(ctx: RunContext, order_id: str) -> dict:
    """Check order status (mock implementation)"""
    # In production, this would query your database
    mock_orders = {
        "12345": {"status": "shipped", "tracking": "ABC123"},
        "67890": {"status": "processing", "eta": "2 days"},
    }
    return mock_orders.get(order_id, {"status": "not_found"})

# Create agent
agent = Agent(
    "openai:o4-mini",
    output_type=CustomerResponse,
    system_prompt=(
        "You are a helpful customer service agent. "
        "Analyze customer messages and provide structured responses. "
        "Use the check_order_status tool when customers ask about orders."
    ),
)
agent.tool(check_order_status)

def call_api(prompt, options, context):
    """Promptfoo provider function"""
    try:
        result = asyncio.run(agent.run(prompt))
        return {"output": result.output.model_dump()}
    except Exception as e:
        return {
            "error": str(e),
            "output": {
                "intent": "error",
                "response": f"Error: {str(e)}",
                "requires_followup": True,
                "sentiment": "negative",
                "confidence": 0.0
            }
        }
```

## Promptfoo Configuration

Create a configuration to test various customer scenarios:

```yaml title="promptfooconfig.yaml"
# yaml-language-server: $schema=https://promptfoo.dev/config-schema.json
description: PydanticAI customer service agent evaluation

providers:
  - id: file://pydantic_agent.py
    label: "PydanticAI Agent"

# Validate structured output schema
defaultTest:
  assert:
    - type: is-json
      value:
        type: object
        properties:
          intent:
            type: string
            enum: [order_inquiry, complaint, general_question, error]
          response:
            type: string
          requires_followup:
            type: boolean
          sentiment:
            type: string
            enum: [positive, neutral, negative]
          confidence:
            type: number
            minimum: 0
            maximum: 1
        required: ['intent', 'response', 'requires_followup', 'sentiment', 'confidence']

tests:
  # Test order inquiries
  - vars:
      prompt: "Where is my order #12345?"
    assert:
      - type: javascript
        value: output.intent === 'order_inquiry'
      - type: javascript
        value: output.response.includes('shipped') && output.response.includes('ABC123')
      - type: javascript
        value: output.confidence > 0.8
  
  # Test complaint handling
  - vars:
      prompt: "I'm very upset! My order arrived damaged and no one is helping me!"
    assert:
      - type: javascript
        value: output.intent === 'complaint'
      - type: javascript
        value: output.sentiment === 'negative'
      - type: javascript
        value: output.requires_followup === true
      - type: llm-rubric
        value: "Response should be empathetic and offer concrete help"
  
  # Test general questions
  - vars:
      prompt: "What are your business hours?"
    assert:
      - type: javascript
        value: output.intent === 'general_question'
      - type: javascript
        value: output.sentiment === 'neutral' || output.sentiment === 'positive'
      - type: javascript
        value: output.requires_followup === false
```

## Advanced Testing Scenarios

### Testing Multiple Output Types

Create an agent that adapts its output structure based on the query:

```python title="adaptive_agent.py"
from typing import Union
from pydantic import BaseModel
from pydantic_ai import Agent
import asyncio

class OrderDetails(BaseModel):
    order_id: str
    status: str
    items: list[str]
    total: float

class ProductInfo(BaseModel):
    product_name: str
    price: float
    in_stock: bool
    description: str

class GeneralResponse(BaseModel):
    message: str
    category: str

def create_agent(prompt: str) -> Agent:
    """Create agent with appropriate output type"""
    if "order" in prompt.lower():
        return Agent(
            "openai:gpt-4.1",
            output_type=OrderDetails,
            system_prompt="Extract order information"
        )
    elif "product" in prompt.lower():
        return Agent(
            "openai:gpt-4.1",
            output_type=ProductInfo,
            system_prompt="Provide product information"
        )
    else:
        return Agent(
            "openai:o4-mini",
            output_type=GeneralResponse,
            system_prompt="Provide general assistance"
        )

def call_api(prompt, options, context):
    agent = create_agent(prompt)
    result = asyncio.run(agent.run(prompt))
    return {"output": result.output.model_dump()}
```

### Testing Tool Usage

Evaluate how well your agent uses available tools:

```yaml title="tool_usage_test.yaml"
tests:
  - vars:
      prompt: "Check the status of orders #12345 and #67890"
    assert:
      # Verify the agent called the tool
      - type: javascript
        value: |
          // Check if response mentions both orders
          output.response.includes('12345') && 
          output.response.includes('67890')
      
      # Verify correct status information
      - type: javascript
        value: |
          output.response.includes('shipped') && 
          output.response.includes('processing')
```

## Best Practices

### 1. Test Edge Cases

```yaml
tests:
  # Empty order ID
  - vars:
      prompt: "Where is my order #?"
    assert:
      - type: javascript
        value: output.requires_followup === true
  
  # Multiple intents
  - vars:
      prompt: "I want to check order #12345 and also file a complaint"
    assert:
      - type: javascript
        value: output.intent === 'order_inquiry' || output.intent === 'complaint'
```

### 2. Validate Confidence Scores

```yaml
tests:
  - vars:
      prompt: "Hdkjashd kajshd kajhsd"  # Gibberish
    assert:
      - type: javascript
        value: output.confidence < 0.5
      - type: javascript
        value: output.requires_followup === true
```

### 3. Test Error Handling

```python
# Test with invalid model
def test_error_handling():
    agent = Agent(
        "invalid-model",
        output_type=CustomerResponse,
    )
    # Should return error response with proper structure
```

## Comparing Different Models

Use promptfoo to compare how different models perform with structured outputs:

```yaml
providers:
  - id: file://pydantic_agent.py
    label: "O4 Mini"
    config:
      model: "openai:o4-mini"
  
  - id: file://pydantic_agent.py
    label: "GPT-4o"
    config:
      model: "openai:gpt-4o"
  
  - id: file://pydantic_agent.py
    label: "Claude Sonnet"
    config:
      model: "anthropic:claude-3-7-sonnet-latest"
```

## Running the Evaluation

```bash
# Run the evaluation
npx promptfoo@latest eval

# View results in the web UI
npx promptfoo@latest view
```

## Example Output

A successful evaluation shows:
- ✅ All outputs match the expected schema
- ✅ Intent classification is accurate
- ✅ Sentiment analysis aligns with message content
- ✅ Tools are used appropriately
- ✅ Error cases are handled gracefully

## Next Steps

- Try the [complete PydanticAI example](https://github.com/promptfoo/promptfoo/tree/main/examples/pydantic-ai)
- Learn about [testing other agent frameworks](/docs/guides/evaluate-any-agent-framework)
- Explore [red teaming agents](/docs/guides/llm-redteaming)

## OpenTelemetry Tracing

Promptfoo supports OpenTelemetry tracing to help you understand agent execution flow and performance.

### 1. Enable Tracing in Configuration

Add tracing configuration to your `promptfooconfig.yaml`:

```yaml
tracing:
  enabled: true
  otlp:
    http:
      enabled: true
      port: 4318  # Default OTLP HTTP port
```

### 2. Add Tracing to Your Provider

Update your provider to support tracing:

```python
from opentelemetry import trace
from opentelemetry.propagate import extract
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import SimpleSpanProcessor
from opentelemetry.exporter.otlp.proto.http.trace_exporter import OTLPSpanExporter

# Setup OpenTelemetry
provider = TracerProvider()
exporter = OTLPSpanExporter(endpoint="http://localhost:4318/v1/traces")
provider.add_span_processor(SimpleSpanProcessor(exporter))
trace.set_tracer_provider(provider)
tracer = trace.get_tracer("pydantic_ai.agent")

def call_api(prompt, options, context):
    """Promptfoo provider with tracing"""
    # Extract trace context if provided
    if 'traceparent' in context:
        ctx = extract({"traceparent": context["traceparent"]})
        with tracer.start_as_current_span("pydantic_ai.call", context=ctx) as span:
            span.set_attribute("agent.framework", "pydantic_ai")
            span.set_attribute("prompt.text", prompt)
            
            try:
                # Run agent with tracing
                with tracer.start_as_current_span("agent.run"):
                    result = agent.run_sync(prompt)
                
                span.set_attribute("response.success", True)
                return {"output": result.data.model_dump()}
            except Exception as e:
                span.record_exception(e)
                span.set_attribute("response.success", False)
                return {"error": str(e)}
    else:
        # Run without tracing
        result = agent.run_sync(prompt)
        return {"output": result.data.model_dump()}
```

### 3. Install OpenTelemetry Dependencies

```bash
pip install opentelemetry-api opentelemetry-sdk opentelemetry-exporter-otlp
```

### 4. View Traces

Run evaluation with tracing:

```bash
promptfoo eval
promptfoo view
```

In the web UI, click the magnifying glass icon on any test result to view the trace timeline showing:
- Agent execution flow
- Tool calls and their duration
- Nested spans for multi-step operations
- Error locations and stack traces

## Common Evaluation Scenarios

### 1. Customer Service Agent

```python
class ServiceResponse(BaseModel):
    response: str
    category: str  # support, billing, general
    sentiment: str  # positive, neutral, negative
    needs_escalation: bool

# Test emotional intelligence
tests:
  - vars:
      message: "I'm frustrated with your service!"
    assert:
      - type: python
        value: |
          output['sentiment'] == 'negative' and
          output['needs_escalation'] == True
      - type: llm-rubric
        value: "Response should be empathetic and professional"
```

### 2. Code Generation Agent

```python
class CodeOutput(BaseModel):
    code: str
    language: str
    explanation: str
    complexity: str  # simple, moderate, complex

# Test code quality
tests:
  - vars:
      task: "Write a function to reverse a string"
    assert:
      - type: python
        value: |
          # Test the generated code
          exec(output['code'])
          reverse_string("hello") == "olleh"
```

### 3. Data Analysis Agent

```python
class AnalysisResult(BaseModel):
    findings: List[str]
    recommendations: List[str]
    confidence_score: float
    visualizations: List[str]

# Test analysis depth
tests:
  - vars:
      data: "Sales increased 20% in Q3"
    assert:
      - type: javascript
        value: |
          output.findings.length >= 2 &&
          output.recommendations.length >= 1 &&
          output.confidence_score > 0.7
```

## Troubleshooting

### Common Issues

1. **Import Errors**: Ensure your provider can import the agent module
   ```bash
   export PYTHONPATH="${PYTHONPATH}:$(pwd)"
   ```

2. **Async/Sync Mismatch**: Use `run_sync()` for synchronous providers
   ```python
   result = agent.run_sync(prompt)  # Not agent.run()
   ```

3. **Model Access**: Set API keys before running
   ```bash
   export OPENAI_API_KEY="your-key"
   promptfoo eval
   ```

## Next Steps

- Explore [PydanticAI documentation](https://ai.pydantic.dev/)
- Learn about [advanced Promptfoo assertions](/docs/configuration/expected-outputs)
- Set up [continuous evaluation](/docs/guides/evaluate-deployments) in CI/CD
- Compare with other frameworks using [side-by-side evaluation](/docs/guides/evaluate-any-agent-framework) 