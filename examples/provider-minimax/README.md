# provider-minimax (MiniMax Provider)

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

The included config compares M3 with the lower-cost M3.1 Flash on a simple factual prompt. Both models think before answering, and thinking tokens count toward `max_completion_tokens`.
