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
    "openai:gpt-4o-mini",
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
            "openai:gpt-4o-mini",
            output_type=OrderDetails,
            system_prompt="Extract order information"
        )
    elif "product" in prompt.lower():
        return Agent(
            "openai:gpt-4o-mini",
            output_type=ProductInfo,
            system_prompt="Provide product information"
        )
    else:
        return Agent(
            "openai:gpt-4o-mini",
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
    label: "GPT-4o Mini"
    config:
      model: "openai:gpt-4o-mini"
  
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