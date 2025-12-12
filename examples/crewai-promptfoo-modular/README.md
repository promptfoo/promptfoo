# crewai-modular

This example shows how to use **CrewAI-style modular prompts** with **Promptfoo** to evaluate AI agent performance, where agent and task definitions are split into YAML files (`agents.yaml` and `tasks.yaml`) and composed dynamically for testing and benchmarking.

## What is CrewAI?

CrewAI is a framework for orchestrating role-playing, autonomous AI agents. In modular setups, agent definitions include `role`, `goal`, and `backstory` (in `agents.yaml`), while tasks include `description` and `expected_output` (in `tasks.yaml`).

By separating these components, you can manage prompt complexity more effectively and evaluate them independently or in combination.

## Quick Start

You can run this example with:

```bash
npx promptfoo@latest init --example crewai-promptfoo-modular
```

## Prerequisites

This example requires the following:

1. Python 3.10+ – Required to run the modular prompt composer (composer.py) and integrate with CrewAI.
2. Node.js 20+ – Required to run the Promptfoo CLI and execute evaluations.
3. OpenAI API Key – You must have a valid OpenAI API key to run LLM-based evaluations.
4. pip and npm – Make sure Python’s package manager (pip) and Node’s package manager (npm) are installed and updated.
5. (Optional) Ollama or other local LLMs – If you want to evaluate prompts locally without API calls, you can integrate with Ollama (e.g., ollama:llama3.1).

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

`agents.yaml` – Defines modular agent roles, goals, and backstories. Each agent here represents a distinct persona or responsibility (e.g., market analyst, recruiter, researcher) that will later be paired with tasks.
`tasks.yaml` – Defines the task descriptions and expected outputs that agents must complete. Each task is linked to a specific agent defined in agents.yaml.
`composer.py` – Combines agents.yaml and tasks.yaml into a fully-composed prompt dynamically at runtime. This script is the bridge between modular prompt components and the evaluation pipeline.
`promptfooconfig.yaml` – Core configuration file for Promptfoo. It specifies providers, test cases, assertions, and how composed prompts are passed into evaluations.

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
