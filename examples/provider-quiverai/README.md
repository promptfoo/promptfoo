# provider-quiverai (QuiverAI SVG Generation)

Compare QuiverAI's Arrow model with different style configurations using LLM-as-judge evaluation.

## Setup

```bash
export QUIVERAI_API_KEY=your-api-key
export OPENAI_API_KEY=your-openai-key  # Required for llm-rubric grader (default)
npx promptfoo@latest init --example provider-quiverai
npx promptfoo@latest eval
```

## What This Example Shows

- **Side-by-side comparison** of default vs. style-guided SVG generation
- `is-xml` assertion to validate SVG structure
- `llm-rubric` assertion with a custom `rubricPrompt` for SVG-specific evaluation
- Streaming enabled by default for faster generation

## Configuration Options

| Option         | Description                              |
| -------------- | ---------------------------------------- |
| `instructions` | Style guidance separate from the prompt  |
| `references`   | Up to 4 reference images (URL or base64) |
| `temperature`  | Randomness (0-2, default 1)              |
| `n`            | Number of outputs per request (1-16)     |

## Learn More

- [QuiverAI Provider Documentation](https://www.promptfoo.dev/docs/providers/quiverai)
- [QuiverAI API Documentation](https://docs.quiver.ai)
