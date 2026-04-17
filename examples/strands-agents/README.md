# strands-agents (Strands Agents SDK example)

This example demonstrates how to evaluate [Strands Agents SDK](https://github.com/strands-agents/sdk-python) with [promptfoo](https://promptfoo.dev).

[Strands Agents](https://strandsagents.com/) is an open-source AI agent framework developed by [AWS](https://github.com/strands-agents) that provides a model-driven approach to building AI agents.

You can run this example with:

```bash
npx promptfoo@latest init --example strands-agents
```

## Overview

This example showcases:

- Creating a [Strands agent](https://strandsagents.com/latest/user-guide/concepts/agents/) with custom tools
- Using the [`@tool` decorator](https://strandsagents.com/latest/user-guide/concepts/tools/python-tools/) to define agent capabilities
- Evaluating agent responses with various [promptfoo assertions](https://promptfoo.dev/docs/configuration/expected-outputs/)
- Testing tool usage with mock weather and temperature conversion tools

## Prerequisites

- Python 3.9+
- [OpenAI API key](https://platform.openai.com/api-keys) (default) or other supported provider

## Setup

### 1. Install Python dependencies

```bash
pip install -r requirements.txt
```

This installs:

- [`strands-agents[openai]`](https://pypi.org/project/strands-agents/) - The Strands Agents SDK with OpenAI support
- [`pydantic`](https://docs.pydantic.dev/) - Data validation library required by Strands

### 2. Set environment variables

```bash
export OPENAI_API_KEY=your-api-key-here
```

### Alternative: use Anthropic or Bedrock

[Strands supports multiple model providers](https://strandsagents.com/latest/user-guide/concepts/model-providers/). To use [Anthropic](https://www.anthropic.com/):

```bash
pip install 'strands-agents[anthropic]'
export ANTHROPIC_API_KEY=your-key
```

Then modify `agent.py` to use [`AnthropicModel`](https://strandsagents.com/latest/user-guide/concepts/model-providers/anthropic/) instead of [`OpenAIModel`](https://strandsagents.com/latest/user-guide/concepts/model-providers/openai/).

To use [Amazon Bedrock](https://strandsagents.com/latest/user-guide/concepts/model-providers/amazon-bedrock/):

```bash
pip install 'strands-agents[bedrock]'
```

## Running the example

```bash
# Run evaluation
npx promptfoo eval

# View results in the web UI
npx promptfoo view
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
