# integration-crewai (CrewAI Integration)

This example shows how to use **CrewAI agents** with promptfoo to evaluate AI agent performance.

## What is CrewAI?

CrewAI is a framework for orchestrating role-playing, autonomous AI agents. By fostering collaborative intelligence, CrewAI empowers agents to work together seamlessly, tackling complex tasks.

## Quick Start

You can run this example with:

On Windows (PowerShell), use `npx.cmd` instead of `npx` for the Promptfoo commands in this guide.

```bash
npx promptfoo@latest init --example integration-crewai
cd integration-crewai
```

## Prerequisites

This example requires the following:

1. **Python 3.10–3.13**
2. **Node.js >=22.22.0 (Node.js 24 LTS recommended)**
3. **Provider credentials** - The default model requires a valid OpenAI API key

## Environment Setup

For the default OpenAI model, set the OpenAI API key. Choose one of these methods:

### Option 1: Environment Variable (Recommended)

On macOS/Linux:

```bash
export OPENAI_API_KEY=your-api-key-here
```

On Windows (PowerShell):

```powershell
$env:OPENAI_API_KEY = "your-api-key-here"
```

### Option 2: .env File

Create a `.env` file in this directory:

```dotenv
OPENAI_API_KEY=your-api-key-here
```

When using a `.env` file, run `npx promptfoo@latest eval --env-file .env`.
No extra Python package is needed.

## Installation

Create an isolated environment and install the example's only direct dependency:

On macOS/Linux:

```bash
python3 -m venv .venv
source .venv/bin/activate
python -m pip install -r requirements.txt
```

On Windows (PowerShell):

```powershell
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
$env:PROMPTFOO_PYTHON = (Resolve-Path .\.venv\Scripts\python.exe).Path
```

CrewAI installs the OpenAI SDK, Pydantic, and its other runtime dependencies.
This example uses CrewAI 1.15.22 or newer within the 1.x release series.

Keep the environment activated when running Promptfoo so its Python provider uses
the installed packages. Alternatively, set `PROMPTFOO_PYTHON` to the virtual
environment's Python executable.

## Files

- `agent.py`: Contains the CrewAI agent setup and promptfoo provider interface
- `promptfooconfig.yaml`: Configures prompts, providers, and tests for evaluation

Set `providers[0].config.model` to a CrewAI model ID such as `openai/gpt-4.1`.
The provider passes it to `LLM(model=...)` through the agent's `llm` field. CrewAI
uses a slash between provider and model names.
CrewAI resolves credentials for the selected provider. If you choose another
provider, install its required CrewAI provider dependencies and set its credentials,
such as `ANTHROPIC_API_KEY` for Anthropic.

### Note on Reliability

When using a real LLM, you may notice that the agent's output is not always reliable, especially for more complex queries. For example, the agent may fail to return valid JSON or may not return a response at all. This is a common challenge when working with LLMs.

## Running the Evaluation

Run the evaluation:

```bash
npx promptfoo@latest eval --no-cache
```

Explore results in browser:

```bash
npx promptfoo@latest view
```

## Troubleshooting

If you see authentication errors:

- Ensure the API key for your selected provider is set correctly
- Verify the key is valid and has sufficient quota
- Check that the environment variable is accessible to the Python process
