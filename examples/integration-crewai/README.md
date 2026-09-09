# integration-crewai (CrewAI Integration)

This example shows how to use **CrewAI agents** with promptfoo to evaluate AI agent performance.

## What is CrewAI?

CrewAI is a framework for orchestrating role-playing, autonomous AI agents. By fostering collaborative intelligence, CrewAI empowers agents to work together seamlessly, tackling complex tasks.

## Quick Start

You can run this example with:

```bash
npx promptfoo@latest init --example integration-crewai
cd integration-crewai
```

## Prerequisites

This example requires the following:

1. **Python 3.10+**
2. **Node.js >=22.22.0 (Node.js 24 LTS recommended)**
3. **Provider credentials** - The default model requires a valid OpenAI API key

## Environment Setup

For the default OpenAI model, set the OpenAI API key. Choose one of these methods:

### Option 1: Environment Variable (Recommended)

```bash
export OPENAI_API_KEY=your-api-key-here
```

### Option 2: .env File

Create a `.env` file in this directory:

```dotenv
OPENAI_API_KEY=your-api-key-here
```

If using a `.env` file, uncomment `python-dotenv` in `requirements.txt` and reinstall dependencies.

## Installation

Install Python packages:

```bash
pip install -r requirements.txt
```

Note: The openai package and other dependencies (langchain, pydantic, etc.) will be automatically installed as dependencies of crewai.

Install promptfoo CLI:

```bash
npm install -g promptfoo
```

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
promptfoo eval
```

Explore results in browser:

```bash
promptfoo view
```

## Troubleshooting

If you see authentication errors:

- Ensure the API key for your selected provider is set correctly
- Verify the key is valid and has sufficient quota
- Check that the environment variable is accessible to the Python process
