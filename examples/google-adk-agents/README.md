# google-adk-agents

This example demonstrates how to build collaborative AI agents using Google's Agent Development Kit (ADK) with promptfoo.

## Overview

This example shows a **Multi-Agent Party Planning System** with three collaborative agents:

- **Coordinator**: Manages the overall planning process, delegates to specialists
- **Task Planner**: Creates organized task lists with priorities
- **Budget Calculator**: Handles financial planning and budget breakdowns

Key features demonstrated:

- Clean agent configuration
- Tool integration (custom functions)
- Automatic delegation using `sub_agents`
- Collaborative problem solving
- Comprehensive testing with promptfoo
- Configurable Gemini model selection

## Quick Start

You can run this example with:

```bash
npx promptfoo@latest init --example google-adk-agents
```

## Prerequisites

1. **Get a Gemini API Key**:
   - Visit [Google AI Studio](https://aistudio.google.com/)
   - Create an API key
   - Set it as an environment variable:

   ```bash
   export GOOGLE_API_KEY=your-api-key-here
   ```

   **Optional**: For LLM-based test assertions, also set an OpenAI API key:

   ```bash
   export OPENAI_API_KEY=your-openai-api-key  # Optional for llm-rubric tests
   ```

2. **Install Dependencies**:
   ```bash
   pip install -r requirements.txt
   ```

## Running the Example

### Test the Multi-Agent System Directly

```bash
python multi_agent_example.py
```

### Run promptfoo Evaluation

Test the system:

```bash
npx promptfoo@latest eval
```

View results:

```bash
npx promptfoo@latest view
```

### Run with Different Model

Test with Gemini Pro model:

```bash
npx promptfoo@latest eval -c promptfooconfig.custom.yaml
```

## Configuration

The system supports configuring which Gemini model to use. Simply update the `model` field in your promptfoo configuration:

```yaml
providers:
  - id: file://provider.py:call_api
    config:
      model: gemini-2.0-flash # Options: gemini-2.0-flash, gemini-2.0-pro, etc.
```

### Available Models

- `gemini-2.0-flash` - Fast, efficient model for most tasks (default)
- `gemini-1.5-pro` - More capable model for complex planning scenarios
- `gemini-1.5-flash` - Previous generation flash model
- Other Gemini models as they become available

### Example Configurations

**Default (Flash model for speed):**

```yaml
config:
  model: gemini-2.0-flash
```

**Pro model for complex tasks:**

```yaml
config:
  model: gemini-1.5-pro
```

## Multi-Agent Party Planning System

The party planning system demonstrates advanced multi-agent collaboration:

### Agent Roles

1. **Party Coordinator** (`party_coordinator`):
   - Main entry point for user requests
   - Understands party planning needs
   - Delegates to specialized agents
   - Provides venue and theme suggestions based on knowledge

2. **Task Planner** (`task_planner`):
   - Creates organized task lists
   - Prioritizes activities
   - Estimates time requirements
   - Uses `create_task_list` tool

3. **Budget Calculator** (`budget_calculator`):
   - Handles financial planning
   - Creates budget breakdowns
   - Suggests cost-saving measures
   - Uses `calculate_party_budget` tool

### Implementation Example

```python
coordinator = Agent(
    name="party_coordinator",
    model="gemini-2.0-flash",  # Configurable model
    instruction="...",
    sub_agents=[task_planner, budget_calculator]
)
```

### Available Tools

**Custom Tools**:

- `create_task_list`: Generates prioritized task lists
- `calculate_party_budget`: Computes budget breakdowns

## Test Configuration

The `promptfooconfig.yaml` includes comprehensive tests:

- Party planning for different events (birthdays, weddings)
- Budget calculations for various guest counts
- Venue suggestions for specific locations
- Timeline generation for events
- Food quantity calculations

## Extending the Example

### Add a New Tool

```python
def check_availability(date: str, venue: str) -> bool:
    """Check if a venue is available on a date"""
    # Implementation
    return availability_status

# Add to agent
agent = Agent(
    tools=[FunctionTool(existing_tool), FunctionTool(check_availability)]
)
```

### Add a New Specialist Agent

```python
# Create entertainment specialist
entertainment_agent = Agent(
    name="entertainment_specialist",
    model="gemini-2.0-flash",
    instruction="Plan games, music, and activities",
    tools=[FunctionTool(search_entertainment)]
)

# Add to coordinator
coordinator = Agent(
    sub_agents=[task_planner, budget_calculator, entertainment_agent]
)
```

## Project Structure

```
google-adk-agents/
├── README.md               # This file
├── multi_agent_example.py  # Party planning multi-agent system
├── provider.py             # Promptfoo provider
├── promptfooconfig.yaml    # Test configuration
├── promptfooconfig.custom.yaml  # Example with different model
├── requirements.txt        # Dependencies
├── setup.sh               # Setup script
└── env.example            # Environment template
```

## Key ADK Concepts

1. **Agent**: AI assistant with model, instructions, and tools
2. **Tool**: Functions agents can call (custom functions)
3. **Sub-agents**: Specialized agents managed by a coordinator
4. **Provider**: Connects agents to promptfoo for testing

## Troubleshooting

### API Key Issues

- Ensure `GOOGLE_API_KEY` is set correctly
- Verify the key at [Google AI Studio](https://aistudio.google.com/)

### Import Errors

- Run: `pip install -r requirements.txt`
- Ensure Python 3.9+ is installed

### Test Failures

- Check the promptfoo viewer for actual vs expected responses
- Review agent instructions if behavior doesn't match
- Some models may have limitations with certain tool configurations

## Learn More

- [Google ADK Documentation](https://google.github.io/adk-docs/)
- [Promptfoo Documentation](https://promptfoo.dev/)
- [Gemini API Documentation](https://ai.google.dev/)
