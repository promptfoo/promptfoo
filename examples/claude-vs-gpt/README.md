# Claude 3.7 vs GPT-4 Comparison

This example compares Claude 3.7 and GPT-4 on a series of riddles, showcasing Claude's extended thinking capability.

## Features

- Uses Claude's extended thinking feature to show step-by-step reasoning
- Compares performance on complex riddles
- Includes automated evaluation of response quality and reasoning

## Quick Start

Run this example directly:

```sh
npx promptfoo@latest --example claude-vs-gpt
```

## Manual Setup

Set your environment variables:

```sh
export OPENAI_API_KEY=your_key_here
export ANTHROPIC_API_KEY=your_key_here
```

Then run:

```sh
promptfoo eval
```

Afterwards, you can view the results by running:

```sh
promptfoo view
```

## Example Output

You'll see Claude's thinking process for each riddle, followed by its final answer. For example:

```json
{
  "content": [
    {
      "type": "thinking",
      "thinking": "Let me analyze this step by step:
1. The riddle mentions a boat with people
2. The boat hasn't sunk
3. Yet we don't see a 'single' person
4. The key is in the word 'single'
5. This suggests a wordplay...",
      "signature": "..."
    },
    {
      "type": "text",
      "text": "All the people are married couples - there isn't a single person!"
    }
  ]
}
```
