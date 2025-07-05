# mozilla-any-agent

This example shows how to use [Mozilla's Any-Agent framework](https://github.com/mozilla-ai/any-agent) with Promptfoo to compare different agent frameworks using a unified interface.

You can run this example with:

```bash
npx promptfoo@latest init --example mozilla-any-agent
```

## What is Any-Agent?

Any-Agent is a Python library that provides a unified interface to multiple agent frameworks (LangChain, OpenAI Agents, Smolagents, TinyAgents, etc.). This allows you to:

- Switch between frameworks with a single line change
- Compare framework performance side-by-side
- Use the same code across different agent implementations

## Prerequisites

1. Install Any-Agent:
   ```bash
   pip install "any-agent[all]"
   ```

2. Set your OpenAI API key:
   ```bash
   export OPENAI_API_KEY="your-api-key-here"
   ```

## Running the Example

```bash
npx promptfoo@latest eval
```

This will run a comparison between TinyAgents and LangChain frameworks using the same prompts.

## Example Structure

- `anyagent_tiny.py` - Provider using TinyAgents framework
- `anyagent_langchain.py` - Provider using LangChain framework
- `promptfooconfig.yaml` - Configuration comparing both frameworks

## How It Works

Each provider file creates an Any-Agent instance with a specific framework:

```python
# TinyAgents
agent = AnyAgent.create(
    "tinyagent",
    AgentConfig(
        model_id="gpt-4o-mini",
        instructions="You are a helpful assistant."
    )
)

# LangChain
agent = AnyAgent.create(
    "langchain",
    AgentConfig(
        model_id="gpt-4o-mini",
        instructions="You are a helpful assistant."
    )
)
```

The same agent configuration works across different frameworks, making it easy to compare their behavior and performance.

## Extending the Example

To add more frameworks, create a new provider file with a different framework name:
- `"openai"` for OpenAI Agents
- `"smolagents"` for Smolagents
- `"agno"` for Agno
- `"llama-index"` for LlamaIndex

See the [Any-Agent documentation](https://github.com/mozilla-ai/any-agent) for more details on available frameworks and features. 