# Google ADK Agents Example

This example demonstrates how to evaluate [Google's Agent Development Kit (ADK)](https://github.com/google/adk-python) agents using promptfoo. ADK is Google's open-source Python framework for building, evaluating, and deploying sophisticated AI agents with flexibility and control.

**Model**: This example uses **Gemini 2.5 Flash** (preview), Google's latest hybrid reasoning model with thinking capabilities, offering an optimal balance between performance, cost, and reasoning depth.

## Quick Start

Run this example with:

```bash
npx promptfoo@latest init --example google-adk-agents
```

## Setup

```bash
cd google-adk-agents

# Install Python dependencies (required!)
pip install -r requirements.txt

# Set environment variables
export GOOGLE_API_KEY=your_google_ai_studio_api_key_here
export GOOGLE_GENAI_USE_VERTEXAI=FALSE

# Verify setup
python test_example.py

# Run the agent with ADK Web UI
adk web

# Or run evaluation with promptfoo
npx promptfoo@latest eval
npx promptfoo@latest view
```

**Note**: Make sure to install the Python dependencies and set up your Google API key before running.

## What This Shows

This example demonstrates a multi-agent travel planning system with:

- **Multi-Agent Architecture**: A coordinator agent that delegates to specialized agents
- **Tool Integration**: Built-in tools (Google Search) and custom tools (weather, destination info)
- **Structured Outputs**: Pydantic models for type-safe agent responses
- **Mock Data**: Example implementations that can be replaced with real APIs

### Agent Hierarchy

```
Travel Coordinator (Root Agent)
├── Flight Agent - Searches for flights
├── Hotel Agent - Finds accommodations
└── Activity Agent - Plans daily itineraries
```

## Running the Agent

ADK agents are designed to be run through the ADK command-line tools:

### Interactive Web UI

```bash
adk web
```

Then open http://localhost:8000 and select "travel_coordinator" from the dropdown.

### Command Line

```bash
adk run .
```

### With Promptfoo

```bash
npx promptfoo@latest eval
npx promptfoo@latest view
```

**Note**: The promptfoo evaluation uses a mock provider (`mock_provider.py`) that simulates ADK agent responses, since ADK agents are designed to run through the `adk` CLI tool. For actual agent execution, use `adk web` or `adk run`.

## Test Scenarios

The example includes tests for:

- Weather inquiries
- Flight searches
- Hotel recommendations
- Activity planning
- Complete trip planning
- Budget-conscious travel
- Specific date requests
- Multi-destination trips

## Extending the Example

To customize this example:

1. **Replace Mock Data**: Update the tool implementations in the `tools/` directory
2. **Add New Agents**: Create new specialized agents in the `agents/` directory
3. **Modify Prompts**: Adjust agent instructions for different behaviors
4. **Add Real APIs**: Integrate with actual travel APIs (flights, hotels, etc.)

## Troubleshooting

### "Module not found" errors

Make sure you've installed dependencies:

```bash
pip install -r requirements.txt
```

### "GOOGLE_API_KEY not set" error

Set your Google AI Studio API key:

```bash
export GOOGLE_API_KEY=your_key_here
export GOOGLE_GENAI_USE_VERTEXAI=FALSE
```

### Agent not appearing in ADK web

Make sure you're running `adk web` from the example directory and that `__init__.py` properly exports the root agent.

## How It Works

1. **Coordinator Agent**: Receives user requests and analyzes what type of help is needed
2. **Delegation**: Routes requests to appropriate sub-agents based on the task
3. **Tool Usage**: Agents use tools to fetch weather, destination info, and search for options
4. **Response Synthesis**: Coordinator combines sub-agent responses into a comprehensive plan

## Gemini 2.5 Flash with Thinking Mode

This example uses **Gemini 2.5 Flash** (gemini-2.5-flash-preview-04-17), which is Google's first fully hybrid reasoning model. Key features:

- **Hybrid Reasoning**: Can toggle thinking mode on/off for optimal performance
- **Thinking Budget**: Configurable token budget for reasoning (0-24,576 tokens)
- **Smart Adaptation**: Automatically adjusts thinking based on task complexity
- **Cost Efficiency**: Best price-to-performance ratio among reasoning models

### Thinking Mode Configuration

While ADK doesn't yet directly expose thinking configuration, you can control reasoning behavior:

- **Complex Tasks**: The model automatically applies more reasoning for multi-step problems
- **Simple Queries**: Minimal reasoning overhead for straightforward requests
- **Future Support**: ADK may add explicit thinking_budget configuration in future releases

For direct Gemini API usage with thinking configuration, see `thinking_mode_example.py`:

```python
# Example for direct Gemini API (not ADK)
from google import genai

response = client.models.generate_content(
    model="gemini-2.5-flash-preview-04-17",
    contents="Plan a complex multi-city trip...",
    config=genai.types.GenerateContentConfig(
        thinking_config=genai.types.ThinkingConfig(
            thinking_budget=1024  # Tokens for reasoning
        )
    )
)
```

Run the example:

```bash
python thinking_mode_example.py
```

## Learn More

- [ADK Documentation](https://github.com/google/adk-python)
- [Promptfoo Documentation](https://promptfoo.dev)
- [Google AI Studio](https://makersuite.google.com)
- [Gemini 2.5 Flash Documentation](https://developers.googleblog.com/en/start-building-with-gemini-25-flash/)
