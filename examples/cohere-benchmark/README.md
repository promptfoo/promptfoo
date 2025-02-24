# Cohere Benchmark

This example compares the performance of:

- Cohere Command-R Plus
- GPT-4
- Claude 3.7 Sonnet

on contract analysis tasks.

## Quick Start

Run this example directly:

```sh
npx promptfoo@latest --example cohere-benchmark
```

## Manual Setup

Set your API keys:

```sh
export OPENAI_API_KEY=your_key_here
export ANTHROPIC_API_KEY=your_key_here
export COHERE_API_KEY=your_key_here
```

Then run:

```sh
promptfoo eval
```

Afterwards, you can view the results by running:

```sh
promptfoo view
```
