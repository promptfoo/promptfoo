# openai-agents-evaluation

This example demonstrates how to evaluate OpenAI Agents SDK (Swarm) with multi-agent orchestration, tool usage, and agent handoffs.

You can run this example with:

```bash
npx promptfoo@latest init --example openai-agents-evaluation
```

## Overview

The OpenAI Agents SDK (Swarm) is designed for building multi-agent systems with:
- **Agent Handoffs** - Seamless transfer between specialized agents
- **Tool Integration** - Agents can use functions and external tools
- **Context Preservation** - Maintain conversation state across agents
- **Lightweight Orchestration** - Minimal overhead for agent coordination

## Features Evaluated

1. **Single vs Multi-Agent Performance**
2. **Agent Handoff Effectiveness**
3. **Tool Usage Accuracy**
4. **Context Retention Across Agents**
5. **Error Handling and Recovery**
6. **Response Latency**

## Setup

### 1. Install Dependencies

```bash
pip install -r requirements.txt
```

### 2. Set Environment Variables

```bash
export OPENAI_API_KEY="your-openai-api-key"
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

### Single Agent
A basic agent that handles all tasks independently.

### Multi-Agent System
Specialized agents with automatic routing:
- **Router Agent** - Analyzes requests and routes to specialists
- **Travel Planner** - Handles travel bookings and itineraries
- **Culture Expert** - Provides language and cultural information
- **Technical Support** - Resolves API and technical issues
- **Billing Specialist** - Manages payments and subscriptions

### Tool-Using Agent
Agent equipped with:
- Calculator for mathematical operations
- Web search for real-time information
- Code executor for running snippets

## Test Scenarios

### 1. Simple Queries
Tests basic agent capabilities and response quality.

### 2. Multi-Step Tasks
Evaluates complex reasoning and planning abilities.

### 3. Tool Usage
Measures accuracy when using external tools.

### 4. Agent Handoffs
Tests seamless transfer between specialized agents.

### 5. Error Handling
Verifies graceful handling of impossible requests.

### 6. Context Retention
Checks if agents maintain context throughout conversation.

## Implementation Details

### Agent Definition

```python
from swarm import Agent

agent = Agent(
    name="Assistant",
    instructions="You are a helpful assistant...",
    functions=[tool1, tool2],  # Optional tools
    model="gpt-4.1"
)
```

### Multi-Agent Handoffs

```python
def transfer_to_specialist():
    """Transfer to a specialist agent"""
    return specialist_agent

router_agent.functions = [transfer_to_specialist]
```

### Running Conversations

```python
from swarm import Swarm

client = Swarm()
response = client.run(
    agent=starting_agent,
    messages=messages,
    context_variables={"user_id": "123"},
    max_turns=5
)
```

## Best Practices for 2025

1. **Use Latest Models** - GPT-4.1 and O4-mini for optimal performance
2. **Implement Tracing** - Full OpenTelemetry support for debugging
3. **Structured Outputs** - Use response schemas when possible
4. **Rate Limiting** - Handle API limits gracefully
5. **Context Windows** - Manage token usage efficiently
6. **Error Recovery** - Implement retry logic with exponential backoff

## Customization

### Adding New Agents

```python
new_agent = Agent(
    name="Custom Specialist",
    instructions="Your specialized instructions...",
    functions=[custom_tool]
)
```

### Creating Custom Tools

```python
def custom_tool(query: str) -> str:
    """Tool description for the agent"""
    # Implementation
    return result
```

### Modifying Test Scenarios

Add new test cases in `promptfooconfig.yaml`:

```yaml
tests:
  - vars:
      task: "Your custom task"
    assert:
      - type: llm-rubric
        value: "Expected behavior"
```

## Performance Metrics

The evaluation measures:
- **Response Quality** - LLM rubric scoring
- **Latency** - Time to complete tasks
- **Handoff Efficiency** - Number of transfers needed
- **Tool Accuracy** - Correct tool selection and usage
- **Error Rate** - Handling of edge cases

## Troubleshooting

### Common Issues

1. **Agent Not Transferring**
   - Check transfer function returns correct agent
   - Verify instructions mention when to transfer

2. **Tools Not Called**
   - Ensure tool descriptions are clear
   - Check function signatures match expected format

3. **Context Lost Between Agents**
   - Use context_variables to pass state
   - Include relevant history in transfers

## Next Steps

- Implement production monitoring with traces
- Add more specialized agents for your use case
- Create custom tools for domain-specific tasks
- Build evaluation datasets for your scenarios
- Set up automated testing in CI/CD 