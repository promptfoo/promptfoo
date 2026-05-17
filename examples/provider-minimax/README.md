# provider-minimax

This example evaluates MiniMax's OpenAI-compatible chat models with promptfoo.

## Setup

1. Create a MiniMax API key in the MiniMax console.
2. Export it before running the example:

```bash
export MINIMAX_API_KEY=your-api-key-here
```

## Run

```bash
npx promptfoo@latest init --example provider-minimax
cd provider-minimax
promptfoo eval
```

The included config compares the standard and high-speed MiniMax M2.7 routes on a simple factual prompt.

