# crewai-example

This example demonstrates how to use CrewAI with promptfoo, including multi-agent coordination and structured output evaluation.

You can run this example with:

```
npx promptfoo@latest init --example crewai
```

## Environment Variables

This example requires the following environment variables:

- `OPENAI_API_KEY` – Your OpenAI API key (required by CrewAI)

You can set this in a `.env` file or directly in your environment.

## Prerequisites

- Python 3.10+
- Node.js v18+
- OpenAI API access (for GPT-4o, GPT-4o-mini, or other models)
- An OpenAI API key

Install Python packages:

```
pip install crewai openai python-dotenv
```

Install promptfoo CLI:

```
npm install -g promptfoo
```

## Files

- `agent.py`: Defines a recruitment agent using CrewAI
- `provider.py`: Wraps the agent for promptfoo integration
- `promptfooconfig.yaml`: Configures prompts, providers, and tests for evaluation

Run the evaluation:

```
promptfoo eval
```

Explore results in browser:

```
promptfoo view
```

---
