# xai (xAI Grok Models Evaluation)

This example demonstrates how to evaluate xAI's Grok models across their main capabilities: text generation with reasoning, image creation, and live search.

You can run this example with:

```bash
npx promptfoo@latest init --example xai
```

## Environment Variables

This example requires the following environment variable:

- `XAI_API_KEY` - Your xAI API key. You can obtain this from the [xAI Console](https://console.x.ai/)

## Quick Start

```bash
# Set your API key
export XAI_API_KEY=your_api_key_here

# Run the main evaluation
promptfoo eval

# View results in the web interface
promptfoo view
```

## What's Tested

This example includes configurations to test different Grok capabilities:

- **Text Generation** (`promptfooconfig.yaml`) - Mathematical reasoning with Grok 4.1 Fast, Grok 4 Fast, Grok 4, and Grok 3 models
- **Image Generation** (`promptfooconfig.images.yaml`) - Artistic image creation using Grok's image models
- **Live Search** (`promptfooconfig.search.yaml`) - Real-time web and X search using Live Search
- **Agent Tools (Responses API)** (`promptfooconfig.responses.yaml`) - Autonomous web and X search using Agent Tools
- **Search Demo** (`promptfooconfig.promptfoo-search.yaml`) - Live Search with assertions example

## Run Individual Tests

```bash
# Text generation with mathematical reasoning
promptfoo eval -c promptfooconfig.yaml

# Image generation with artistic styles
promptfoo eval -c promptfooconfig.images.yaml

# Live Search with web and X sources (deprecated Dec 15, 2025)
promptfoo eval -c promptfooconfig.search.yaml

# Agent Tools with Responses API (recommended)
promptfoo eval -c promptfooconfig.responses.yaml

# Search demo with assertions
promptfoo eval -c promptfooconfig.promptfoo-search.yaml
```

## Featured Models

### Grok 4.1 Fast (Latest)

The newest frontier model optimized for agentic tool calling with a 2M context window:

- `xai:grok-4-1-fast-reasoning` - Maximum intelligence with reasoning
- `xai:grok-4-1-fast-non-reasoning` - Fast responses without reasoning

### Grok 4 Fast

Fast reasoning models with 2M context:

- `xai:grok-4-fast-reasoning` - Reasoning variant
- `xai:grok-4-fast-non-reasoning` - Non-reasoning variant

### Grok 4

Flagship reasoning model:

- `xai:grok-4` - Full reasoning capabilities

### Agent Tools (Responses API)

Enable autonomous tool execution via the Responses API:

```yaml
providers:
  - id: xai:responses:grok-4-1-fast-reasoning
    config:
      tools:
        - type: web_search
        - type: x_search
        - type: code_interpreter
```

### Live Search (Deprecated Dec 15, 2025)

Enable real-time search via `search_parameters`:

```yaml
providers:
  - id: xai:grok-4-1-fast-reasoning
    config:
      search_parameters:
        mode: auto
        return_citations: true
        sources:
          - type: web
          - type: x
```

## Expected Results

- **Text Generation**: Grok will provide step-by-step mathematical solutions with clear reasoning
- **Image Generation**: Generated images in the requested artistic styles
- **Live Search**: Current information from web and X with source citations
