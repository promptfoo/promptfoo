# Perplexity Example

This example demonstrates how to use Perplexity's search-augmented chat models to get up-to-date answers with scientific citations.

## Features

- Real-time web search with academic citations
- Source filtering to trusted science domains (nature.com, science.org, newscientist.com)
- Time-based filtering for recent research (last month)
- Multiple search-powered models with different capabilities
- Control over search context size for cost/comprehensiveness balance
- Chain of Thought (CoT) reasoning
- Automatic follow-up question suggestions

## Setup

1. Get your Perplexity API key from [Perplexity Settings](https://www.perplexity.ai/settings/api)
2. Set up your environment:

```bash
export PERPLEXITY_API_KEY=your_api_key_here
export OPENAI_API_KEY=your_api_key_here  # For comparison model
```

## Usage

Initialize and run the example:

```bash
npx promptfoo@latest init --example perplexity.ai-example
cd perplexity.ai-example
npx promptfoo@latest eval
npx promptfoo@latest view
```

## How It Works

This example compares scientific question-answering between:

- Traditional LLM: OpenAI GPT-4o-mini (without search capabilities)
- Perplexity models (with real-time web search):
  - `sonar`: Lightweight search model with medium search context
  - `sonar-pro`: Advanced search model with high search context
  - `sonar-reasoning`: Fast reasoning model with explicit step-by-step thinking

The example asks about recent scientific discoveries in:
- Dark matter
- Quantum computing

You'll see how different Perplexity models:
- Back answers with academic citations
- Focus on trusted scientific sources
- Provide recent research findings (within the last month)
- Use different amounts of search context
- Show explicit reasoning (in reasoning models)
- Suggest relevant follow-up questions (sonar model)
