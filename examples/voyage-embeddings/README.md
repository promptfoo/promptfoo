# Voyage AI Embeddings Example

This example demonstrates using Voyage AI embeddings for semantic similarity testing with Claude 3.7 Sonnet as the text generation model.

## Quick Start

Run this example directly:

```sh
npx promptfoo@latest --example voyage-embeddings
```

## Manual Setup

Set your API keys:

```sh
export ANTHROPIC_API_KEY=your_key_here
export VOYAGE_API_KEY=your_key_here
```

Then run:

```sh
promptfoo eval
```

Afterwards, you can view the results by running:

```sh
promptfoo view
```

## What This Example Shows

- Using Claude 3.7 Sonnet for text generation
- Using Voyage-2 embeddings for semantic similarity testing
- Testing color descriptions against expected outputs
