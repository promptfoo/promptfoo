# google-adk-agents

This example demonstrates how to build AI agents using Google's Agent Development Kit (ADK) with promptfoo.

## Overview

We provide two examples showing ADK best practices:

1. **Single Agent** (`simple_agent.py`): A focused weather assistant
2. **Multi-Agent** (`multi_agent_example.py`): A party planning system with three collaborative agents

Both examples demonstrate:

- Clean agent configuration
- Tool integration (including web search and code execution)
- Clear instructions for specialized behavior
- Comprehensive testing with promptfoo
- Latest Gemini 2.5 Flash model

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

## Running the Examples

### Test the Agents Directly

**Single Agent (Weather):**

```bash
python simple_agent.py
```

**Multi-Agent System (Party Planning):**

```bash
python multi_agent_example.py
```

### Run promptfoo Evaluation

Test both examples:

```bash
npx promptfoo@latest eval
```

View results:

```bash
npx promptfoo@latest view
```

## Examples Explained

### Single Agent Example

The weather assistant (`simple_agent.py`) shows:

- Simple agent with one tool
- Focused behavior through clear instructions
- Tool integration (`get_weather`)
- Proper error handling

```python
weather_agent = Agent(
    name="weather_assistant",
    model="gemini-2.5-flash",
    instruction="...",
    tools=[FunctionTool(get_weather)]
)
```

### Multi-Agent Party Planning System

The party planning system (`multi_agent_example.py`) demonstrates:

- **Coordinator**: Manages the overall planning process, has web search
- **Task Planner**: Creates organized task lists with priorities
- **Python Executor**: Handles calculations, budgets, and visualizations

Key features:

- Automatic delegation using `sub_agents`
- Multiple tool types (custom functions, web search, code execution)
- Collaborative problem solving

```python
coordinator = Agent(
    name="party_coordinator",
    model="gemini-2.5-flash",
    instruction="...",
    sub_agents=[task_planner, budget_calculator],
    tools=[google_search_tool]
)
```

### Tools Available

1. **Custom Tools**: `get_weather`, `create_task_list`
2. **Built-in Tools**:
   - `google_search`: Find venues, vendors, ideas
   - `code_execution_tool`: Budget calculations, visualizations

## Test Configuration

The `promptfooconfig.yaml` includes tests for both systems:

**Single Agent Tests:**

- Weather queries
- Non-weather handling
- Tool usage verification

**Multi-Agent Tests:**

- Party planning tasks
- Budget calculations
- Venue searches
- Timeline generation
- Food quantity calculations

## Extending the Examples

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
    model="gemini-2.5-flash",
    instruction="Plan games, music, and activities",
    tools=[FunctionTool(search_entertainment)]
)

# Add to coordinator
coordinator = Agent(
    sub_agents=[task_planner, code_executor, entertainment_agent]
)
```

## Project Structure

```
google-adk-agents/
├── README.md               # This file
├── simple_agent.py         # Weather assistant (single agent)
├── multi_agent_example.py  # Party planning (multi-agent)
├── provider.py             # Promptfoo provider
├── promptfooconfig.yaml    # Test configuration
├── requirements.txt        # Dependencies
├── setup.sh               # Setup script
└── env.example            # Environment template
```

## Key ADK Concepts

1. **Agent**: AI assistant with model, instructions, and tools
2. **Tool**: Functions agents can call (custom, web search, code execution)
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
- Some tools (like code execution) may require additional setup

## Learn More

- [Google ADK Documentation](https://google.github.io/adk-docs/)
- [Promptfoo Documentation](https://promptfoo.dev/)
- [Gemini API Documentation](https://ai.google.dev/)
