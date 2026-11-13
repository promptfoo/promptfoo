# integration-strands-agents (Strands Agents SDK example)

This example demonstrates how to evaluate [Strands Agents SDK](https://github.com/strands-agents/sdk-python) with [promptfoo](https://promptfoo.dev).

[Strands Agents](https://strandsagents.com/) is an open-source AI agent framework developed by [AWS](https://github.com/strands-agents) that provides a model-driven approach to building AI agents.

You can run this example with:

On Windows (PowerShell), use `npx.cmd` instead of `npx` for the Promptfoo commands in this guide.

```bash
npx promptfoo@latest init --example integration-strands-agents
cd integration-strands-agents
```

## Overview

This example showcases:

- Creating a [Strands agent](https://strandsagents.com/latest/user-guide/concepts/agents/) with custom tools
- Using the [`@tool` decorator](https://strandsagents.com/latest/user-guide/concepts/tools/python-tools/) to define agent capabilities
- Evaluating agent responses with various [promptfoo assertions](https://promptfoo.dev/docs/configuration/expected-outputs/)
- Testing tool usage with mock weather and temperature conversion tools

## Prerequisites

- Python 3.10+
- [OpenAI API key](https://platform.openai.com/api-keys) (default) or other supported provider

## Setup

### 1. Install Python dependencies

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

This installs Strands 1.56 or newer within the 1.x release series:

- [`strands-agents[openai]`](https://pypi.org/project/strands-agents/) - The Strands Agents SDK with OpenAI support

### 2. Set environment variables

On macOS/Linux:

```bash
export OPENAI_API_KEY=your-api-key-here
```

On Windows (PowerShell):

```powershell
$env:OPENAI_API_KEY = "your-api-key-here"
```

### Alternative: use Anthropic or Bedrock

[Strands supports multiple model providers](https://strandsagents.com/latest/user-guide/concepts/model-providers/). To use [Anthropic](https://www.anthropic.com/):

```bash
python -m pip install "strands-agents[anthropic]>=1.56.0,<2"
```

On Windows, run the install command with `.\.venv\Scripts\python.exe -m pip` instead of `python -m pip`. Set `ANTHROPIC_API_KEY` using the syntax for your shell shown above. Then modify `agent.py` to use [`AnthropicModel`](https://strandsagents.com/latest/user-guide/concepts/model-providers/anthropic/) instead of [`OpenAIModel`](https://strandsagents.com/latest/user-guide/concepts/model-providers/openai/).

Amazon Bedrock support is included in the base SDK; no additional Python package is required. Configure AWS credentials, a region, and access to your chosen Bedrock model. In `agent.py`, replace the OpenAI import and model construction with:

```python
from strands.models import BedrockModel

# Inside create_agent(): Bedrock parameters are top-level keyword arguments.
model = BedrockModel(model_id=model_id, temperature=0.7)
```

Set `providers[0].config.model_id` in `promptfooconfig.yaml` to a Bedrock model or inference-profile ID available in your region. Also update the `gpt-4o-mini` defaults in `agent.py` and `agent_provider.py` if you want standalone calls or calls without a configured model to use Bedrock. The optional standalone checks in those files currently require `OPENAI_API_KEY`; remove that OpenAI-specific check when adapting them for AWS credentials. See the [Strands Bedrock guide](https://strandsagents.com/docs/user-guide/sdk/model-providers/amazon-bedrock/) for AWS setup and supported model IDs.

## Running the example

```bash
# Run evaluation
npx promptfoo@latest eval --no-cache

# View results in the web UI
npx promptfoo@latest view
```

## How it works

### Agent structure

The agent is defined in `agent.py` using the [Strands Agent class](https://strandsagents.com/latest/user-guide/concepts/agents/) with two tools:

- `get_weather`: Returns mock weather data for cities (New York, London, Tokyo, Paris, Seattle, San Francisco)
- `convert_temperature`: Converts temperatures between Fahrenheit and Celsius

Tools are defined using the [`@tool` decorator](https://strandsagents.com/latest/user-guide/concepts/tools/python-tools/) which automatically exposes them to the LLM based on their docstrings.

### Provider integration

`agent_provider.py` exposes a `call_api` function that [promptfoo's Python provider](https://promptfoo.dev/docs/providers/python/) calls to interact with the Strands agent.

### Test cases and assertion types

The [promptfoo config](https://promptfoo.dev/docs/configuration/guide/) includes 5 test cases that demonstrate different [assertion types](https://promptfoo.dev/docs/configuration/expected-outputs/):

| Test                                | Description                | Assertion types used                    |
| ----------------------------------- | -------------------------- | --------------------------------------- |
| Weather query for New York          | Basic tool usage           | `contains-any`, `llm-rubric`, `latency` |
| Weather query for London            | Verify temperature format  | `contains-any`, `javascript`, `latency` |
| Weather query for Tokyo             | Case-insensitive matching  | `icontains`, `javascript`, `latency`    |
| Weather with temperature conversion | Multi-tool chaining        | `llm-rubric`, `javascript`, `latency`   |
| Weather for unknown city            | Graceful fallback handling | `icontains`, `not-contains`, `latency`  |

#### Assertion types explained

- **[`latency`](https://promptfoo.dev/docs/configuration/expected-outputs/#latency)** - Ensures responses complete within 30 seconds (applied to all tests via `defaultTest`)
- **[`contains-any`](https://promptfoo.dev/docs/configuration/expected-outputs/#contains)** - Verifies the agent returns expected city names and weather data from the mock tool
- **[`icontains`](https://promptfoo.dev/docs/configuration/expected-outputs/#contains)** - Case-insensitive matching to verify city names appear regardless of formatting
- **[`not-contains`](https://promptfoo.dev/docs/configuration/expected-outputs/#not-contains)** - Ensures the agent handles unknown cities gracefully without error messages
- **[`javascript`](https://promptfoo.dev/docs/configuration/expected-outputs/#javascript)** - Validates temperature format (°F/°C symbols) and response length requirements
- **[`llm-rubric`](https://promptfoo.dev/docs/configuration/expected-outputs/model-graded/)** - Semantically evaluates whether the agent correctly chains weather lookup with temperature conversion
