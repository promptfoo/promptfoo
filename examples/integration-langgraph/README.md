# integration-langgraph (LangGraph Integration)

This example demonstrates how to use LangGraph with Promptfoo, including a research agent setup, structured output, and red teaming or evaluation.

You can run this example with:

```bash
npx promptfoo@latest init --example integration-langgraph
cd integration-langgraph
```

## Environment Variables

This example requires the following environment variables:

- `OPENAI_API_KEY` – Your OpenAI API key (required by LangGraph to use ChatOpenAI)

Export the key in your environment, or pass `--env-file .env` to Promptfoo.

## Prerequisites

- Python 3.10 or newer
- Node.js >=22.22.0 (Node.js 24 LTS recommended)
- OpenAI API access for GPT-4o, the model selected by this example
- An OpenAI API key

Install Python packages:

```bash
python3 -m pip install -r requirements.txt
```

Only LangGraph, its OpenAI integration, and directly imported Pydantic are
required. The umbrella LangChain package and python-dotenv are unnecessary.
Keep your virtual environment active when running Promptfoo, or set
`PROMPTFOO_PYTHON` to its Python executable.

Install promptfoo CLI:

```bash
npm install -g promptfoo
```

## Files

- `agent.py`: Defines the LangGraph Research Agent, using a StateGraph that processes user queries and summarizes AI research trends.
- `provider.py`: Wraps the agent logic into a callable function for Promptfoo, exposing a call_api() handler.
- `promptfooconfig.yaml`: Configures Promptfoo to:

- Provide test prompts
- Call the LangGraph provider
- Check outputs using assertions

Run the evaluation:

```bash
npx promptfoo eval --no-cache -o results.json
```

Explore results in browser:

```bash
npx promptfoo view
```

---

## Provider options and local checks

Set `providers[0].config.model` to select another model, or `apiBaseUrl` to use an
OpenAI-compatible endpoint. Failed model requests are reported as provider errors.

```bash
python3 -m unittest discover -s . -p '*_test.py'
```

These tests execute the real graph with a deterministic local model response. A
live evaluation still requires an API key and model access.
