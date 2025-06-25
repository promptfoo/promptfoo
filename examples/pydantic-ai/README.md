# pydantic-ai

This example demonstrates how to evaluate [PydanticAI](https://ai.pydantic.dev/) agents using promptfoo. PydanticAI is a Python agent framework that provides structured outputs and type safety for AI applications.

You can run this example with:

```bash
npx promptfoo@latest init --example pydantic-ai
```

## Quick Start

```bash
cd pydantic-ai
pip install -r requirements.txt
export OPENAI_API_KEY=your_openai_api_key_here
npx promptfoo@latest eval
npx promptfoo@latest view
```

## What This Shows

- Creating a PydanticAI agent with structured outputs
- Using promptfoo's Python provider to evaluate agents
- JSON schema validation with `is-json` assertions
- Multiple assertion types: JavaScript, Python, and LLM-rubric evaluations
- Evaluating agent tool usage

## Example Structure

- `agent.py` - Simple PydanticAI weather agent with structured output
- `provider.py` - Promptfoo Python provider that runs the agent
- `promptfooconfig.yaml` - Evaluation configuration with diverse assertion types
- `requirements.txt` - Python dependencies
