# LLM Provider Example

This example demonstrates how to use the LLM provider to access multiple language models through the [LLM Python package](https://llm.datasette.io/).

## Features

The LLM provider allows you to:

- Access 50+ models through a single unified interface
- Use cloud models (OpenAI, Anthropic, Google) and local models (via Ollama)
- Compare outputs across different models easily
- Configure model parameters like temperature and system prompts

## Prerequisites

### 1. Install the LLM package

```bash
pip install llm
```

### 2. Install needed plugins

Depending on which models you want to use:

```bash
# For Ollama (local models)
llm install llm-ollama

# For Anthropic Claude models
llm install llm-claude-3

# For Google Gemini models
llm install llm-gemini

# For Mistral models
llm install llm-mistral
```

### 3. Set up API keys

For cloud models, configure your API keys:

```bash
# Using LLM CLI
llm keys set openai
llm keys set anthropic
llm keys set gemini

# Or using environment variables
export OPENAI_API_KEY=your-key-here
export ANTHROPIC_API_KEY=your-key-here
export GEMINI_API_KEY=your-key-here
```

### 4. For local models, install and run Ollama

```bash
# Install Ollama (macOS)
brew install ollama

# Start Ollama server
ollama serve

# Pull models you want to use
ollama pull llama3.2:latest
ollama pull mistral:latest
```

## Running the Example

```bash
npx promptfoo@latest eval
```

This will run the evaluation comparing multiple models on creative writing tasks.

## Configuration Overview

The example configuration includes:

- **Multiple providers**: OpenAI, Anthropic, Google, and local Ollama models
- **Custom configurations**: Different temperature and system prompt settings
- **Various test cases**: Testing different writing styles (poetic, technical, humorous, educational)
- **Assertions**: Using LLM rubrics and other checks to validate outputs

## Customization

You can customize this example by:

1. **Adding more models**: Any model supported by LLM can be added with the syntax `llm:model-name`
2. **Adjusting parameters**: Modify temperature, max_tokens, and system prompts in the config
3. **Creating new test cases**: Add more test scenarios with different variables
4. **Using different assertions**: Add custom validation logic for your use case

## Example Output

When you run the evaluation, you'll see a comparison table showing how each model performs on the different prompts, with pass/fail indicators for each assertion.

## Troubleshooting

### Model not found

If you get a "Model not found" error, make sure you've installed the required LLM plugin for that model.

### API key errors

Ensure your API keys are properly configured either through the LLM CLI or environment variables.

### Ollama connection errors

Make sure Ollama is running (`ollama serve`) and you've pulled the models you want to use.

## Learn More

- [LLM Documentation](https://llm.datasette.io/)
- [Promptfoo LLM Provider Documentation](https://promptfoo.dev/docs/providers/llm)
- [Available LLM Plugins](https://llm.datasette.io/en/stable/plugins/index.html)
