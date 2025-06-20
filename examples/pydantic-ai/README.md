# PydanticAI Example

This example demonstrates how to evaluate [PydanticAI](https://ai.pydantic.dev/) agents using promptfoo. PydanticAI is a Python agent framework that provides structured outputs and type safety for AI applications.

## Quick Start

```bash
npx promptfoo@latest init --example pydantic-ai
cd pydantic-ai
pip install -r requirements.txt
export OPENAI_API_KEY=your_openai_api_key_here
npx promptfoo@latest eval
npx promptfoo@latest view
```

## What This Shows

- Creating a PydanticAI agent with structured outputs
- Using promptfoo's Python provider to evaluate agents
- Testing structured JSON responses with type validation
- Evaluating agent tool usage

## Example Structure

- `agent.py` - Simple PydanticAI weather agent with structured output
- `provider.py` - Promptfoo Python provider that runs the agent
- `promptfooconfig.yaml` - Evaluation configuration with test cases
- `requirements.txt` - Python dependencies

The weather agent demonstrates structured outputs by returning consistent, typed weather data using Pydantic models.
