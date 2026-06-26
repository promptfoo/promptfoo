# integration-crewai (CrewAI Integration)

This example shows how to use **CrewAI agents** with promptfoo to evaluate AI agent performance.

## What is CrewAI?

CrewAI is a framework for coordinating agents in multi-step workflows.

## Quick Start

You can run this example with:

```bash
npx promptfoo@latest init --example integration-crewai
cd integration-crewai
```

## Prerequisites

This example requires the following:

1. **Python `>=3.10,<3.14`**
2. **Node.js `^20.20.0` or `>=22.22.0`**
3. **OpenAI API key** with access to the configured model

## Environment Setup

You need to set the OpenAI API key. Choose one of these methods:

### Option 1: Environment Variable (Recommended)

```bash
export OPENAI_API_KEY=your-api-key-here
```

### Option 2: .env File

Create a `.env` file in this directory:

```dotenv
OPENAI_API_KEY=your-api-key-here
```

When running the evaluation, pass this file to Promptfoo with `--env-file .env`.

## Installation

Install Python packages:

```bash
pip install -r requirements.txt
```

CrewAI installs the Python dependencies used by this example, including OpenAI, Pydantic, and python-dotenv; LangChain is not required.

Install promptfoo CLI:

```bash
npm install -g promptfoo
```

## Files

- `agent.py`: Contains the CrewAI agent setup and promptfoo provider interface
- `promptfooconfig.yaml`: Configures prompts, providers, and tests for evaluation

### Note on Reliability

When using a real LLM, you may notice that the agent's output is not always reliable, especially for more complex queries. For example, the agent may fail to return valid JSON or may not return a response at all. This is a common challenge when working with LLMs.

## Running the Evaluation

Run the evaluation with an exported API key:

```bash
promptfoo eval
```

Or load the key from `.env` explicitly:

```bash
promptfoo eval --env-file .env
```

Explore results in browser:

```bash
promptfoo view
```

## Troubleshooting

If you see authentication errors:

- Ensure your OpenAI API key is set correctly
- Verify the key is valid and has sufficient quota
- Check that the environment variable is accessible to the Python process
