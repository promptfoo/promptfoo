---
sidebar_position: 11
sidebar_label: Google ADK Agents
description: Build and test multi-agent AI systems with Google's Agent Development Kit (ADK) and Promptfoo
keywords:
  - Google ADK
  - Agent Development Kit
  - AI agents
  - multi-agent systems
  - Gemini
  - LLM agents
  - agent testing
  - promptfoo
  - agent orchestration
  - agentic AI
---

# Testing Google ADK Agents with Promptfoo

Google's Agent Development Kit (ADK) is an open-source Python framework for building, orchestrating, and deploying sophisticated AI agents. This guide shows you how to combine ADK's powerful agent capabilities with Promptfoo's comprehensive testing framework.

## What is Google ADK?

The [Agent Development Kit (ADK)](https://github.com/google/adk-python) is a flexible framework designed to make AI agent development feel like regular software development. Key features include:

- **Multi-agent orchestration** - Build teams of specialized agents that collaborate
- **Model-agnostic** - Works with Gemini, Claude, GPT, and 100+ other models
- **Tool integration** - Connect agents to APIs, databases, and external services
- **Production-ready** - Deploy agents locally, on Google Cloud, or anywhere Docker runs

## Quick Start

Get started with a complete multi-agent example in minutes:

```bash
# Initialize the ADK agents example
npx promptfoo@latest init --example google-adk-agents

# Navigate to the example
cd google-adk-agents

# Install Python dependencies
pip install -r requirements.txt

# Run the evaluation
npx promptfoo@latest eval
```

## Understanding ADK Agents

ADK provides three types of agents for different use cases:

### 1. LLM Agents

Powered by language models, these agents can reason, plan, and make decisions:

```python
from google.adk.agents import LlmAgent

agent = LlmAgent(
    name="assistant",
    model="gemini-2.5-flash-preview-04-17",
    instruction="You are a helpful assistant that answers questions accurately.",
    tools=[search_tool, calculator_tool]
)
```

### 2. Workflow Agents

For predictable, structured processes without LLM overhead:

- **SequentialAgent** - Execute steps in order
- **ParallelAgent** - Run multiple operations simultaneously
- **LoopAgent** - Repeat operations until a condition is met

### 3. Custom Agents

Build specialized agents by extending the `BaseAgent` class for unique requirements.

## Setting Up Your First Agent

### Step 1: Install ADK

```bash
pip install google-adk
```

### Step 2: Create an Agent

Create a simple agent that can answer questions:

```python
# my_agent/__init__.py
from google.adk.agents import LlmAgent

root_agent = LlmAgent(
    name="root_agent",
    model="gemini-2.5-flash-preview-04-17",
    description="A knowledgeable assistant",
    instruction="""You are a helpful AI assistant.
    Answer questions accurately and concisely.
    If you don't know something, say so."""
)
```

### Step 3: Configure Promptfoo

Create a Python provider to integrate with Promptfoo:

```python
# provider.py
import os
from google import genai

def call_api(prompt, options, context):
    """Promptfoo provider for ADK agents"""
    try:
        # Initialize Gemini client
        api_key = os.getenv("GOOGLE_API_KEY")
        client = genai.Client(api_key=api_key)

        # Include agent instructions in the prompt
        full_prompt = f"""{root_agent.instruction}

User: {prompt}"""

        # Generate response
        response = client.models.generate_content(
            model=root_agent.model,
            contents=full_prompt
        )

        return {"output": response.text}

    except Exception as e:
        return {"error": str(e)}
```

### Step 4: Create Test Configuration

```yaml
# promptfooconfig.yaml
description: 'Google ADK Agent Testing'

providers:
  - id: file://provider.py
    label: ADK Agent

prompts:
  - '{{query}}'

tests:
  - vars:
      query: 'What is the capital of France?'
    assert:
      - type: contains
        value: 'Paris'

  - vars:
      query: 'Calculate 15% tip on $80'
    assert:
      - type: contains-any
        value: ['12', '$12', '12.00']
```

## Building Multi-Agent Systems

ADK excels at orchestrating multiple specialized agents. Here's how to build a team:

### Example: Customer Support System

```python
# agents/coordinator.py
from google.adk.agents import LlmAgent
from agents.product_agent import product_agent
from agents.order_agent import order_agent
from agents.technical_agent import technical_agent

coordinator = LlmAgent(
    name="support_coordinator",
    model="gemini-2.5-flash-preview-04-17",
    instruction="""You coordinate customer support requests.

    Route requests to the appropriate specialist:
    - Product questions → product_agent
    - Order issues → order_agent
    - Technical problems → technical_agent

    Summarize their responses for the customer.""",
    sub_agents=[product_agent, order_agent, technical_agent]
)
```

### Testing Multi-Agent Coordination

```yaml
# Test agent delegation and coordination
tests:
  - description: 'Product inquiry routing'
    vars:
      query: 'What features does the Pro plan include?'
    assert:
      - type: llm-rubric
        value: 'Response includes product details from product specialist'

  - description: 'Complex multi-agent request'
    vars:
      query: 'My Pro subscription isnt working and I need a refund'
    assert:
      - type: llm-rubric
        value: |
          Response addresses both:
          1. Technical troubleshooting steps
          2. Refund process information
```

## Integrating Tools and APIs

Agents become powerful when connected to external tools:

### Built-in Tools

```python
from google.adk.tools import google_search

search_agent = LlmAgent(
    name="research_agent",
    tools=[google_search],
    instruction="Search for current information to answer questions"
)
```

### Custom Tools

```python
def get_weather(city: str) -> dict:
    """Get current weather for a city"""
    # Implementation here
    return {"temp": 72, "conditions": "sunny"}

weather_agent = LlmAgent(
    name="weather_agent",
    tools=[get_weather],
    instruction="Provide weather information when asked"
)
```

### Testing Tool Usage

```yaml
tests:
  - description: 'Agent uses weather tool correctly'
    vars:
      query: 'Whats the weather in San Francisco?'
    assert:
      - type: contains
        value: 'San Francisco'
      - type: javascript
        value: |
          // Verify tool was called
          output.includes('weather') || output.includes('temperature')
```

## Best Practices

### 1. Design Clear Agent Responsibilities

Each agent should have a focused role:

```python
# Good: Specific, focused responsibility
email_agent = LlmAgent(
    name="email_composer",
    instruction="You write professional emails. Keep them concise and friendly."
)

# Avoid: Too broad
generic_agent = LlmAgent(
    name="helper",
    instruction="You help with everything"
)
```

### 2. Use Structured Outputs

Leverage Pydantic models for type-safe responses:

```python
from pydantic import BaseModel

class EmailDraft(BaseModel):
    subject: str
    body: str
    tone: str

email_agent = LlmAgent(
    name="email_agent",
    instruction="Generate email drafts",
    response_model=EmailDraft
)
```

### 3. Test Agent Interactions

Verify agents work together correctly:

```yaml
tests:
  - description: 'Agents collaborate on complex task'
    vars:
      query: 'Plan a team workshop on AI safety'
    assert:
      - type: llm-rubric
        value: |
          Response includes contributions from multiple agents:
          - Venue suggestions
          - Agenda items
          - Technical requirements
          - Budget estimates
```

### 4. Handle Errors Gracefully

```python
coordinator = LlmAgent(
    instruction="""If a sub-agent fails or returns an error:
    1. Try an alternative approach
    2. Provide partial results if available
    3. Clearly explain any limitations"""
)
```

## Advanced Patterns

### Sequential Processing

```python
from google.adk.agents import SequentialAgent

pipeline = SequentialAgent(
    name="document_pipeline",
    agents=[
        extract_agent,    # Extract key information
        analyze_agent,    # Analyze extracted data
        summarize_agent   # Create summary
    ]
)
```

### Parallel Execution

```python
from google.adk.agents import ParallelAgent

parallel_search = ParallelAgent(
    name="multi_search",
    agents=[
        web_search_agent,
        database_agent,
        file_search_agent
    ]
)
```

### Memory and State

```python
from google.adk.memory import InMemoryMemoryService

agent_with_memory = LlmAgent(
    name="stateful_agent",
    memory_service=InMemoryMemoryService(),
    instruction="Remember user preferences across conversations"
)
```

## Running and Debugging

### Interactive Testing

ADK provides a web UI for testing:

```bash
# From your agent directory
adk web
```

Access the UI at http://localhost:8000 to interact with your agents.

### Command Line Testing

```bash
# Run agent from terminal
adk run .
```

### Integration with Promptfoo

Promptfoo adds systematic testing capabilities:

```bash
# Run all tests
npx promptfoo@latest eval

# View results in web UI
npx promptfoo@latest view

# Run specific test scenarios
npx promptfoo@latest eval -t "customer support"
```

## Common Patterns and Solutions

### Pattern: Specialized Expert Agents

Create focused agents for specific domains:

```python
legal_agent = LlmAgent(
    name="legal_advisor",
    instruction="Provide legal information (not advice) based on general knowledge"
)

financial_agent = LlmAgent(
    name="financial_analyst",
    instruction="Analyze financial data and provide insights"
)

coordinator = LlmAgent(
    name="advisor",
    sub_agents=[legal_agent, financial_agent],
    instruction="Route questions to appropriate experts"
)
```

### Pattern: Validation and Safety

Add validation agents to ensure quality:

```python
validator_agent = LlmAgent(
    name="response_validator",
    instruction="""Review responses for:
    - Accuracy
    - Completeness
    - Appropriate tone
    - No harmful content"""
)
```

### Pattern: Fallback Handling

```python
primary_agent = LlmAgent(
    name="primary",
    instruction="Try to answer using available tools"
)

fallback_agent = LlmAgent(
    name="fallback",
    instruction="Provide general guidance when specific answers unavailable"
)
```

## Deployment Considerations

### Environment Variables

```bash
# .env file
GOOGLE_API_KEY=your_api_key
GOOGLE_CLOUD_PROJECT=your_project
GOOGLE_CLOUD_REGION=us-central1
```

### Production Checklist

1. **API Key Security** - Use environment variables, never hardcode
2. **Error Handling** - Graceful degradation for tool/agent failures
3. **Rate Limiting** - Implement appropriate throttling
4. **Monitoring** - Log agent interactions and performance
5. **Testing** - Comprehensive test coverage with Promptfoo

## Troubleshooting

### Common Issues

**Agent not responding correctly:**

- Check agent instructions are clear and specific
- Verify model has access to required context
- Test with simpler prompts first

**Tool execution failures:**

- Ensure tool functions have clear docstrings
- Verify authentication/API keys are configured
- Check tool return types match expectations

**Multi-agent coordination issues:**

- Confirm sub-agents are properly registered
- Test each agent individually first
- Add logging to track agent interactions

## Next Steps

1. **Explore the example**: Review the [google-adk-agents example](https://github.com/promptfoo/promptfoo/tree/main/examples/google-adk-agents) for a complete implementation
2. **Read ADK docs**: Deep dive into [ADK documentation](https://github.com/google/adk-python)
3. **Join the community**: Connect with other developers building with ADK

## Additional Resources

- [Google ADK GitHub Repository](https://github.com/google/adk-python)
- [ADK Documentation](https://google.github.io/adk-docs/)
- [Promptfoo Python Provider Guide](/docs/providers/python)
- [Multi-agent Example](https://github.com/promptfoo/promptfoo/tree/main/examples/google-adk-agents)

---

By combining Google ADK's agent orchestration capabilities with Promptfoo's testing framework, you can build reliable, well-tested AI agent systems that scale from simple assistants to complex multi-agent applications.
