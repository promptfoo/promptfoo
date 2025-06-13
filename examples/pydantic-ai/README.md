# pydantic-ai (PydanticAI Agent Evaluation)

This example demonstrates how to evaluate [PydanticAI](https://ai.pydantic.dev/) agents using promptfoo. PydanticAI is a Python agent framework that makes it easier to build production-grade applications with Generative AI using structured outputs and type safety.

## What This Example Shows

- Creating a PydanticAI agent with tools and structured outputs
- Using promptfoo's Python provider to evaluate PydanticAI agents
- Testing different model providers through the same agent interface
- Evaluating structured outputs and tool usage

## Prerequisites

- Python 3.9+
- OpenAI API key (set as `OPENAI_API_KEY` environment variable)
- Optional: Anthropic API key (set as `ANTHROPIC_API_KEY` environment variable)

## Quick Start

You can run this example with:

```bash
npx promptfoo@latest init --example pydantic-ai
```

Or set it up manually:

```bash
# Install dependencies
pip install -r requirements.txt

# Set your API key
export OPENAI_API_KEY=your_openai_api_key_here

# Run the evaluation
npx promptfoo@latest eval
```

## Example Structure

- `agent.py` - PydanticAI agent with weather tools and structured output
- `provider.py` - Promptfoo Python provider that runs the PydanticAI agent
- `promptfooconfig.yaml` - Evaluation configuration
- `requirements.txt` - Python dependencies

## What Gets Evaluated

The example evaluates a weather assistant agent that:

1. **Accepts location queries** - Users can ask about weather in different cities
2. **Uses geocoding tools** - Converts location names to coordinates
3. **Fetches weather data** - Gets current weather information
4. **Returns structured output** - Provides consistent, typed responses

## Evaluation Criteria

- **Structured output validation** - Ensures responses match expected schema
- **Tool usage accuracy** - Verifies the agent calls appropriate tools
- **Response completeness** - Checks that all required fields are populated
- **Cross-model consistency** - Compares behavior across different LLMs 