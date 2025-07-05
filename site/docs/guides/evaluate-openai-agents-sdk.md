---
sidebar_label: Evaluating OpenAI Agents SDK
---

# How to Evaluate OpenAI Agents SDK

The [OpenAI Agents SDK](https://github.com/openai/swarm) (formerly Swarm) is an experimental framework for building multi-agent systems. This guide shows you how to use promptfoo to evaluate agent handoffs, tool usage, and multi-agent coordination.

## Why Evaluate OpenAI Agents?

OpenAI Agents SDK focuses on:
- **Agent handoffs** - Seamlessly transfer conversations between specialized agents
- **Lightweight coordination** - Minimal overhead for multi-agent systems
- **Tool integration** - Each agent can have its own set of tools
- **Stateful conversations** - Maintain context across agent transitions

## Basic Setup

Install the required dependencies:

```bash
pip install openai swarm
```

## Creating an OpenAI Agents Provider

Here's an example of a customer service system with multiple specialized agents:

```python title="openai_agents_provider.py"
from swarm import Swarm, Agent
from typing import Dict, Any

# Initialize Swarm client
client = Swarm()

# Define specialized agents
def transfer_to_sales():
    """Transfer to sales agent"""
    return sales_agent

def transfer_to_support():
    """Transfer to support agent"""
    return support_agent

def transfer_to_refunds():
    """Transfer to refunds agent"""
    return refunds_agent

def check_order_status(order_id: str) -> str:
    """Check the status of an order"""
    # Mock implementation
    orders = {
        "12345": "Shipped - Arriving tomorrow",
        "67890": "Processing - Ships in 2 days",
        "11111": "Delivered yesterday"
    }
    return orders.get(order_id, "Order not found")

def process_refund(order_id: str, reason: str) -> str:
    """Process a refund request"""
    return f"Refund initiated for order {order_id}. Reason: {reason}. You'll receive confirmation within 24 hours."

def get_product_info(product_name: str) -> str:
    """Get information about a product"""
    products = {
        "laptop": "TechBook Pro - $999, 16GB RAM, 512GB SSD",
        "phone": "SmartPhone X - $699, 5G, 128GB storage",
        "tablet": "TabletPlus - $499, 10-inch display, WiFi+Cellular"
    }
    return products.get(product_name.lower(), "Product not found")

# Create specialized agents
triage_agent = Agent(
    name="Triage Agent",
    instructions="""You are a customer service triage agent.
    Analyze the customer's request and transfer to the appropriate specialist:
    - Sales questions → transfer_to_sales()
    - Technical support → transfer_to_support()
    - Refunds/returns → transfer_to_refunds()
    Be polite and explain the transfer.""",
    functions=[transfer_to_sales, transfer_to_support, transfer_to_refunds]
)

sales_agent = Agent(
    name="Sales Agent",
    instructions="""You are a sales specialist.
    Help customers with product information, pricing, and purchasing decisions.
    Use get_product_info() to provide accurate details.""",
    functions=[get_product_info]
)

support_agent = Agent(
    name="Support Agent",
    instructions="""You are a technical support specialist.
    Help customers with order status and technical issues.
    Use check_order_status() to look up orders.""",
    functions=[check_order_status]
)

refunds_agent = Agent(
    name="Refunds Agent",
    instructions="""You are a refunds specialist.
    Help customers with returns and refunds.
    Use process_refund() to initiate refund requests.""",
    functions=[process_refund]
)

def call_api(prompt: str, options: Dict[str, Any], context: Dict[str, Any]) -> Dict[str, Any]:
    """Promptfoo provider function"""
    try:
        # Run the conversation starting with triage agent
        response = client.run(
            agent=triage_agent,
            messages=[{"role": "user", "content": prompt}]
        )
        
        # Extract the final response
        final_message = response.messages[-1]["content"]
        
        # Track which agents were involved
        agents_used = [msg.get("sender", "unknown") for msg in response.messages if "sender" in msg]
        
        return {
            "output": final_message,
            "metadata": {
                "agents_involved": list(set(agents_used)),
                "message_count": len(response.messages),
                "final_agent": response.agent.name if response.agent else "unknown"
            }
        }
    except Exception as e:
        return {"error": str(e), "output": f"Error: {str(e)}"}
```

## Promptfoo Configuration

Test various customer scenarios:

```yaml title="promptfooconfig.yaml"
# yaml-language-server: $schema=https://promptfoo.dev/config-schema.json
description: OpenAI Agents SDK multi-agent evaluation

providers:
  - id: file://openai_agents_provider.py
    label: "OpenAI Agents"

tests:
  # Test correct agent routing
  - vars:
      prompt: "I want to know about your laptop options and prices"
    assert:
      - type: javascript
        value: output.includes('TechBook Pro') || output.includes('laptop')
      - type: javascript
        value: metadata.final_agent === 'Sales Agent'
      - type: llm-rubric
        value: "Response should provide specific product details and pricing"
  
  # Test support handoff
  - vars:
      prompt: "Where is my order #12345?"
    assert:
      - type: contains
        value: "Shipped"
      - type: javascript
        value: metadata.final_agent === 'Support Agent'
      - type: contains
        value: "tomorrow"
  
  # Test refund process
  - vars:
      prompt: "I need to return order #67890, it arrived damaged"
    assert:
      - type: javascript
        value: metadata.final_agent === 'Refunds Agent'
      - type: contains
        value: "refund initiated"
      - type: llm-rubric
        value: "Response should be empathetic and provide clear next steps"
  
  # Test complex multi-step request
  - vars:
      prompt: "I ordered a laptop (order #11111) but I want to return it and buy a phone instead"
    assert:
      - type: javascript
        value: metadata.agents_involved.length >= 2
      - type: contains-any
        value: ["refund", "return", "SmartPhone"]
      - type: llm-rubric
        value: "Response should handle both the return and the new purchase inquiry"
```

## Advanced Testing Patterns

### Testing Agent Handoff Logic

Create tests that verify smooth transitions between agents:

```yaml title="handoff_tests.yaml"
tests:
  # Test ambiguous requests
  - vars:
      prompt: "My laptop isn't working and I might want a refund"
    assert:
      - type: javascript
        value: |
          // Should involve multiple agents for complex request
          metadata.message_count > 2
      - type: llm-rubric
        value: "Response should clarify whether customer wants technical support or a refund"
  
  # Test handoff with context preservation
  - vars:
      prompt: "I bought a phone last week. Order #12345. Can you help me set it up? If it's too complicated, I might return it."
    assert:
      - type: javascript
        value: |
          // Should maintain order context across agents
          output.includes('12345')
      - type: llm-rubric
        value: "Response should offer setup help while acknowledging the return option"
```

### Testing Tool Usage

Ensure agents use their tools appropriately:

```python title="tool_tracking_provider.py"
from swarm import Swarm, Agent
import json

# Track tool calls
tool_calls = []

def track_tool_call(func):
    """Decorator to track tool usage"""
    def wrapper(*args, **kwargs):
        tool_calls.append({
            "function": func.__name__,
            "args": args,
            "kwargs": kwargs
        })
        return func(*args, **kwargs)
    return wrapper

# Wrap all tool functions
check_order_status = track_tool_call(check_order_status)
process_refund = track_tool_call(process_refund)
get_product_info = track_tool_call(get_product_info)

def call_api(prompt, options, context):
    global tool_calls
    tool_calls = []  # Reset for each call
    
    response = client.run(
        agent=triage_agent,
        messages=[{"role": "user", "content": prompt}]
    )
    
    return {
        "output": response.messages[-1]["content"],
        "metadata": {
            "tools_used": tool_calls,
            "tool_count": len(tool_calls)
        }
    }
```

### Testing Error Handling

```yaml
tests:
  # Test invalid order lookup
  - vars:
      prompt: "Check order #INVALID"
    assert:
      - type: contains
        value: "not found"
      - type: not-contains
        value: "error"
      - type: llm-rubric
        value: "Response should politely explain the order wasn't found and offer help"
  
  # Test when no appropriate agent exists
  - vars:
      prompt: "Can you write code for me?"
    assert:
      - type: llm-rubric
        value: "Response should politely explain this is outside the scope of service"
```

## Comparing with Single Agent

Compare multi-agent performance with a single agent:

```yaml
providers:
  - id: file://multi_agent_provider.py
    label: "Multi-Agent System"
    
  - id: openai:gpt-4.1
    label: "Single Agent"
    config:
      systemPrompt: |
        You are a customer service agent handling sales, support, and refunds.
        You have access to order status, product info, and can process refunds.

tests:
  - vars:
      prompt: "I need help with order #12345 and want to know about upgrading to a laptop"
    assert:
      - type: llm-rubric
        value: "Response should address both the order inquiry and product information"
```

## Best Practices

### 1. Design Clear Agent Boundaries

```python
# Good: Clear, non-overlapping responsibilities
billing_agent = Agent(
    name="Billing Agent",
    instructions="Handle payment issues, invoices, and billing questions ONLY"
)

shipping_agent = Agent(
    name="Shipping Agent", 
    instructions="Handle shipping status, delivery issues, and tracking ONLY"
)

# Bad: Overlapping responsibilities
general_agent = Agent(
    name="General Agent",
    instructions="Handle billing, shipping, and general questions"
)
```

### 2. Test State Management

```python
def call_api_with_history(prompt, options, context):
    """Provider that maintains conversation history"""
    messages = context.get('messages', [])
    messages.append({"role": "user", "content": prompt})
    
    response = client.run(
        agent=triage_agent,
        messages=messages
    )
    
    # Save history for next turn
    context['messages'] = response.messages
    
    return {"output": response.messages[-1]["content"]}
```

### 3. Monitor Agent Performance

```yaml
# Track metrics per agent
tests:
  - vars:
      prompt: "{{customer_query}}"
    assert:
      - type: javascript
        value: |
          // Track success by agent type
          const agent = metadata.final_agent;
          const success = !output.includes('error');
          console.log(`${agent}: ${success ? 'SUCCESS' : 'FAIL'}`);
          return success;
```

## Running the Evaluation

```bash
# Run evaluation
npx promptfoo@latest eval

# Run with specific test file
npx promptfoo@latest eval -c agent_tests.yaml

# Generate detailed report
npx promptfoo@latest eval --output results.html
```

## Debugging Agent Behavior

Add verbose logging to understand agent decisions:

```python
def call_api_debug(prompt, options, context):
    """Provider with detailed debugging info"""
    import logging
    logging.basicConfig(level=logging.DEBUG)
    
    response = client.run(
        agent=triage_agent,
        messages=[{"role": "user", "content": prompt}],
        debug=True  # Enable debug mode
    )
    
    # Extract decision points
    decisions = []
    for msg in response.messages:
        if msg.get("function_call"):
            decisions.append({
                "agent": msg.get("sender"),
                "function": msg["function_call"]["name"],
                "reasoning": msg.get("content", "")
            })
    
    return {
        "output": response.messages[-1]["content"],
        "metadata": {
            "decisions": decisions,
            "full_conversation": response.messages
        }
    }
```

## OpenTelemetry Tracing

Monitor agent execution with OpenTelemetry tracing support.

### 1. Enable Tracing

Add to `promptfooconfig.yaml`:

```yaml
tracing:
  enabled: true
  otlp:
    http:
      enabled: true
      port: 4318
```

### 2. Add Tracing to Provider

```javascript
const { trace, context, SpanStatusCode } = require('@opentelemetry/api');
const { NodeTracerProvider } = require('@opentelemetry/sdk-trace-node');
const { OTLPTraceExporter } = require('@opentelemetry/exporter-trace-otlp-http');
const { SimpleSpanProcessor } = require('@opentelemetry/sdk-trace-base');

// Setup tracing
const provider = new NodeTracerProvider();
const exporter = new OTLPTraceExporter({
  url: 'http://localhost:4318/v1/traces',
});
provider.addSpanProcessor(new SimpleSpanProcessor(exporter));
provider.register();

const tracer = trace.getTracer('openai.agents');

async function callApi(prompt, { vars }, promptfooContext) {
  // Extract trace context if provided
  if (promptfooContext?.traceparent) {
    const activeContext = trace.propagation.extract(context.active(), {
      traceparent: promptfooContext.traceparent,
    });

    return context.with(activeContext, async () => {
      const span = tracer.startSpan('openai.agent.call');
      
      try {
        span.setAttribute('agent.framework', 'openai-agents-sdk');
        span.setAttribute('prompt.text', prompt);
        
        // Track agent execution
        const runSpan = tracer.startSpan('agent.run', { parent: span });
        const result = await runAgent(prompt, vars);
        runSpan.end();
        
        span.setAttribute('response.length', result.length);
        span.setStatus({ code: SpanStatusCode.OK });
        
        return { output: result };
      } catch (error) {
        span.recordException(error);
        span.setStatus({
          code: SpanStatusCode.ERROR,
          message: error.message,
        });
        throw error;
      } finally {
        span.end();
      }
    });
  }
  
  // Run without tracing
  return { output: await runAgent(prompt, vars) };
}
```

### 3. Install Dependencies

```bash
npm install @opentelemetry/api @opentelemetry/sdk-trace-node \
  @opentelemetry/exporter-trace-otlp-http @opentelemetry/sdk-trace-base
```

### 4. View Traces

Run evaluation and view traces:

```bash
promptfoo eval
promptfoo view
```

The trace timeline shows:
- Agent initialization
- Tool calls with timing
- Streaming chunks (if applicable)
- Error locations and stack traces

## Next Steps

- Try the [complete OpenAI Agents example](https://github.com/promptfoo/promptfoo/tree/main/examples/openai-agents)
- Learn about [comparing agent frameworks](/docs/guides/evaluate-any-agent-framework)
- Explore [red teaming multi-agent systems](/docs/guides/llm-redteaming) 