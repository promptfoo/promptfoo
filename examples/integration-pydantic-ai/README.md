# integration-pydantic-ai (Pydantic AI Integration)

This example demonstrates how to evaluate [PydanticAI](https://ai.pydantic.dev/) agents using promptfoo. PydanticAI is a Python agent framework that provides structured outputs and type safety for AI applications.

You can run this example with:

On Windows (PowerShell), use `npx.cmd` instead of `npx` for the Promptfoo commands in this guide.

```bash
npx promptfoo@latest init --example integration-pydantic-ai
cd integration-pydantic-ai
```

## Quick Start

Requires Python 3.10 or later. The requirements use PydanticAI’s
[slim OpenAI installation](https://pydantic.dev/docs/ai/overview/install/#slim-install),
which installs only the model provider used by this example. PydanticAI 2.46 or
newer manages the OpenAI SDK dependency; Pydantic is listed explicitly because
the example defines its output schema with `BaseModel`.

On macOS/Linux:

```bash
python3 -m venv .venv
source .venv/bin/activate
python -m pip install -r requirements.txt
export OPENAI_API_KEY=your_openai_api_key_here
npx promptfoo@latest eval --no-cache
npx promptfoo@latest view
```

On Windows (PowerShell):

```powershell
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
$env:PROMPTFOO_PYTHON = (Resolve-Path .\.venv\Scripts\python.exe).Path
$env:OPENAI_API_KEY = "your_openai_api_key_here"
npx.cmd promptfoo@latest eval --no-cache
npx.cmd promptfoo@latest view
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
