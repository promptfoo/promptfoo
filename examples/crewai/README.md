# crewai

This example shows how to use **CrewAI agents** with promptfoo to evaluate AI agent performance.

## What is CrewAI?

CrewAI is a framework for orchestrating role-playing, autonomous AI agents. By fostering collaborative intelligence, CrewAI empowers agents to work together seamlessly, tackling complex tasks.

## Quick Start

You can run this example with:

```bash
npx promptfoo@latest init --example crewai
```

## Prerequisites

This example requires the following:

1. **Python 3.10+**
2. **Node.js 14+**
3. **OpenAI API Key** - You MUST have a valid OpenAI API key to run this example

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

- Ensure your OpenAI API key is set correctly
- Verify the key is valid and has sufficient quota
- Check that the environment variable is accessible to the Python process
