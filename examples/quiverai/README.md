# QuiverAI Provider Example

This example demonstrates how to use the QuiverAI provider for both chat completions and SVG generation.

## Setup

1. Get your API key from [QuiverAI](https://quiver.ai)
2. Set the environment variable:

```bash
export QUIVERAI_API_KEY=your-api-key
```

## Usage

Run the evaluation:

```bash
npx promptfoo eval -c examples/quiverai/promptfooconfig.yaml
```

View results:

```bash
npx promptfoo view
```

## Provider Formats

QuiverAI supports the following provider ID formats:

| Format | Description |
| --- | --- |
| `quiverai:model-name` | Chat completions (default) |
| `quiverai:chat:model-name` | Chat completions (explicit) |
| `quiverai:svg:model-name` | SVG generation |

## Configuration Options

### Chat Provider

The chat provider extends OpenAI and supports:

- `temperature` - Controls randomness (0-2)
- `max_tokens` - Maximum tokens to generate
- `reasoning_effort` - QuiverAI-specific reasoning parameter

### SVG Provider

The SVG provider supports:

- `operation` - `generate` (default) or `edit`
- `svgParams.mode` - `icon`, `illustration`, or `logo`
- `svgParams.style` - `flat`, `outline`, `duotone`, or `gradient`
- `svgParams.complexity` - Complexity level (number)
- `svgParams.viewBox` - Custom viewport dimensions
- `sourceSvg` or `sourceSvgUrl` - Required for edit operation

## Example Configurations

### Basic Chat

```yaml
providers:
  - quiverai:arrow-0.5
```

### SVG Generation with Options

```yaml
providers:
  - id: quiverai:svg:arrow-0.5
    config:
      svgParams:
        mode: icon
        style: gradient
        complexity: 3
```

### SVG Editing

```yaml
providers:
  - id: quiverai:svg:arrow-0.5
    config:
      operation: edit
      sourceSvg: '<svg>...</svg>'
```

## LLM-as-Judge for SVG Evaluation

The `promptfooconfig-llm-judge.yaml` example demonstrates using a custom `rubricPrompt` to evaluate SVG outputs with LLM-as-judge techniques:

```bash
npx promptfoo eval -c examples/quiverai/promptfooconfig-llm-judge.yaml
```

This example uses a custom evaluation prompt adapted from vector graphics research (VIEScore, StarVector, SVGEditBench) to assess:

- SVG validity and renderability
- Whether the SVG captures the essence of the request
- Appropriate use of vector primitives

### Featured Test Cases

The example includes a variety of test cases from simple to challenging:

- **Simple shapes**: Red circle, blue square, yellow star
- **Moderate complexity**: Rocket ship with flames, smiling sun
- **Famous AI tests**:
  - "Pelican riding a bicycle" (Simon Willison's AI image test)
  - Red panda face (the Promptfoo mascot)
  - Red panda hacker with laptop and hoodie

The LLM judge evaluates each SVG fairly, accepting stylized/abstract interpretations while identifying when key elements are missing.

## Progressive Complexity Stress Test

The `promptfooconfig-progressive.yaml` example stress-tests the model with 10 increasingly complex prompts, all centered around red pandas:

```bash
npx promptfoo eval -c examples/quiverai/promptfooconfig-progressive.yaml
```

### Complexity Levels

| Level | Description | Difficulty |
|-------|-------------|------------|
| 1 | Basic face icon | ★☆☆☆☆ |
| 2 | Face with markings | ★★☆☆☆ |
| 3 | Happy expression | ★★☆☆☆ |
| 4 | Full body sitting | ★★★☆☆ |
| 5 | Climbing tree branch | ★★★☆☆ |
| 6 | Developer at computer | ★★★★☆ |
| 7 | Bamboo forest at sunset | ★★★★☆ |
| 8 | Teacher with students | ★★★★★ |
| 9 | Astronaut (retro poster style) | ★★★★★ |
| 10 | Samurai warrior at dawn | ★★★★★ |

Expected behavior: Pass rates decrease as complexity increases, demonstrating the model's capabilities and limitations. Thresholds are calibrated so simpler prompts require higher scores to pass.
