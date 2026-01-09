# quiverai (QuiverAI SVG Generation)

Evaluate QuiverAI's SVG generation capabilities using LLM-as-judge assertions.

## Setup

```bash
export QUIVERAI_API_KEY=your-api-key
npx promptfoo@latest init --example quiverai
npx promptfoo@latest eval
```

## What's Demonstrated

- QuiverAI chat provider for SVG generation
- Basic assertions (`contains`) to validate SVG structure
- LLM-as-judge (`llm-rubric`) to evaluate visual output quality
- Custom `rubricPrompt` for SVG-specific evaluation

## Provider Formats

| Format                | Description                 |
| --------------------- | --------------------------- |
| `quiverai:model`      | Chat completions (default)  |
| `quiverai:chat:model` | Chat completions (explicit) |
| `quiverai:svg:model`  | Native SVG API              |

## Learn More

- [QuiverAI Provider Documentation](/docs/providers/quiverai)
