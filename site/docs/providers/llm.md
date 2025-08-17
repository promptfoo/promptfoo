---
sidebar_label: LLM (Python Package)
description: 'Use the LLM Python package to access 50+ models including OpenAI, Anthropic, Google Gemini, and local models via Ollama'
---

# LLM Provider

The LLM provider integrates with the [LLM Python package](https://llm.datasette.io/), providing a unified interface to access over 50 different language models through a single provider. This includes models from OpenAI, Anthropic, Google, local models via Ollama, and many more.

## Prerequisites

Before using the LLM provider, you need to install the LLM Python package:

```bash
pip install llm
```

For specific model providers, you may need to install additional plugins:

```bash
# For Ollama support
llm install llm-ollama

# For Anthropic Claude models
llm install llm-claude-3

# For Google Gemini models
llm install llm-gemini

# For Mistral models
llm install llm-mistral
```

## Basic Usage

The LLM provider uses the syntax `llm:<model-name>`:

```yaml
providers:
  - llm:gpt-4o-mini
  - llm:claude-3-haiku
  - llm:gemini-2.0-flash
  - llm:llama3.2:latest # Ollama model
```

## Configuration

### API Keys

API keys can be configured in multiple ways:

#### 1. Environment Variables

```bash
export OPENAI_API_KEY=your-key-here
export ANTHROPIC_API_KEY=your-key-here
export GEMINI_API_KEY=your-key-here
```

#### 2. LLM CLI Configuration

```bash
llm keys set openai
llm keys set anthropic
llm keys set gemini
```

#### 3. Provider Configuration

```yaml
providers:
  - id: llm:gpt-4o-mini
    config:
      openai_api_key: ${OPENAI_API_KEY}
      temperature: 0.7
      max_tokens: 1000
```

### Model Parameters

All standard model parameters are supported:

```yaml
providers:
  - id: llm:gpt-4o-mini
    config:
      temperature: 0.7
      max_tokens: 1500
      system_prompt: 'You are a helpful assistant'
```

## Examples

### Basic Evaluation

```yaml
# promptfooconfig.yaml
providers:
  - llm:gpt-4o-mini
  - llm:claude-3-haiku

prompts:
  - 'Write a haiku about {{topic}}'

tests:
  - vars:
      topic: 'artificial intelligence'
    assert:
      - type: contains
        value: '5-7-5'
  - vars:
      topic: 'nature'
    assert:
      - type: llm-rubric
        value: 'The haiku follows traditional structure'
```

### Using Local Models with Ollama

First, ensure Ollama is installed and running:

```bash
# Install Ollama
brew install ollama  # macOS
# or visit https://ollama.ai for other platforms

# Start Ollama
ollama serve

# Pull a model
ollama pull llama3.2:latest

# Install LLM Ollama plugin
llm install llm-ollama
```

Then use in your configuration:

```yaml
providers:
  - llm:llama3.2:latest
  - llm:mistral:latest
  - llm:codellama:latest

prompts:
  - 'Explain {{concept}} in simple terms'

tests:
  - vars:
      concept: 'quantum computing'
```

### Multi-Provider Comparison

```yaml
providers:
  # OpenAI models
  - llm:gpt-4o-mini
  - llm:gpt-3.5-turbo

  # Anthropic models
  - llm:claude-3-haiku
  - llm:claude-3.5-sonnet

  # Google models
  - llm:gemini-2.0-flash
  - llm:gemini-pro

  # Local models via Ollama
  - llm:llama3.2:latest
  - llm:mistral:latest

prompts:
  - 'Generate a creative story about {{theme}}'

tests:
  - vars:
      theme: 'time travel'
    assert:
      - type: javascript
        value: output.length > 100
```

### Custom System Prompts

```yaml
providers:
  - id: llm:gpt-4o-mini
    label: 'GPT-4o-mini Creative'
    config:
      system_prompt: 'You are a creative writing assistant. Be imaginative and descriptive.'
      temperature: 0.9

  - id: llm:gpt-4o-mini
    label: 'GPT-4o-mini Technical'
    config:
      system_prompt: 'You are a technical documentation writer. Be precise and clear.'
      temperature: 0.3

prompts:
  - 'Describe {{topic}}'

tests:
  - vars:
      topic: 'a sunset'
```

### Using with Custom LLM Binary

If the LLM CLI is not in your PATH or you want to use a specific installation:

```yaml
providers:
  - id: llm:gpt-4o-mini
    config:
      llm_binary: /path/to/venv/bin/llm
```

## Supported Models

The LLM provider supports all models available through the LLM package. Some popular options include:

### OpenAI

- `gpt-4o`, `gpt-4o-mini`
- `gpt-4.1`, `gpt-4.1-mini`
- `gpt-3.5-turbo`
- `o1-preview`, `o1-mini`

### Anthropic

- `claude-3-opus`, `claude-3.5-sonnet`, `claude-3-haiku`
- `claude-3.7-sonnet` (latest)

### Google

- `gemini-2.0-flash`
- `gemini-pro`
- `gemini-pro-vision`

### Local Models (via Ollama)

- `llama3.2:latest`
- `mistral:latest`
- `codellama:latest`
- `phi:latest`
- `neural-chat:latest`

### Others

Many more models are available through various LLM plugins. Check the [LLM documentation](https://llm.datasette.io/) for a complete list.

## Advanced Features

### Embeddings

The LLM provider also supports embedding generation:

```yaml
providers:
  - id: llm:text-embedding-ada-002
    config:
      model_name: text-embedding-ada-002

prompts:
  - 'Generate embedding for: {{text}}'

tests:
  - vars:
      text: 'Machine learning is fascinating'
```

### Conversation History

The provider supports multi-turn conversations:

```yaml
prompts:
  - role: system
    content: 'You are a helpful coding assistant'
  - role: user
    content: 'Write a Python function to {{task}}'
  - role: assistant
    content: "Here's a Python function for that task:"
  - role: user
    content: 'Can you add error handling?'

tests:
  - vars:
      task: 'sort a list'
```

## Troubleshooting

### Common Issues

1. **Model not found error**

   ```
   Error: Model 'model-name' not found
   ```

   Solution: Ensure the required LLM plugin is installed:

   ```bash
   llm install llm-[provider-name]
   ```

2. **API key not configured**

   ```
   Error: No API key configured for provider
   ```

   Solution: Set the API key using one of the methods described above.

3. **Python/Package not found**

   ```
   Error: The 'llm' package is not installed
   ```

   Solution: Install the LLM package:

   ```bash
   pip install llm
   ```

4. **Ollama connection error**
   ```
   Error: Cannot connect to Ollama
   ```
   Solution: Ensure Ollama is running:
   ```bash
   ollama serve
   ```

### Debug Mode

Enable debug logging to see detailed information:

```bash
LOG_LEVEL=debug npx promptfoo@latest eval
```

## Benefits

- **Unified Interface**: Access 50+ models through a single provider
- **Local and Cloud**: Support for both local models (Ollama) and cloud APIs
- **Cost Tracking**: Built-in token usage tracking
- **Extensible**: Easy to add new models via LLM plugins
- **Well-Maintained**: Active development and community support

## See Also

- [LLM Documentation](https://llm.datasette.io/)
- [LLM GitHub Repository](https://github.com/simonw/llm)
- [Available LLM Plugins](https://llm.datasette.io/en/stable/plugins/index.html)
