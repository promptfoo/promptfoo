# Perplexity Example

This example demonstrates how to use Perplexity's search-augmented chat models to get up-to-date answers with scientific citations.

## Features

- Real-time web search with academic citations
- Source filtering to trusted science domains (nature.com, science.org, newscientist.com)
- Time-based filtering for recent research (last month)
- Automatic follow-up question suggestions
- Consistent responses with temperature 0.2

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
promptfoo init --example perplexity.ai-example
promptfoo eval
promptfoo view
```

## How It Works

This example compares scientific question-answering between:

- Perplexity `sonar` - Search-augmented model with real-time web access
- GPT-4o-mini - Traditional model without search capabilities

The example asks about recent scientific discoveries in:

- Dark matter
- Quantum computing

You'll see how Perplexity:

- Backs answers with academic citations
- Focuses on trusted scientific sources
- Provides recent research findings (within the last month)
- Suggests relevant follow-up questions
