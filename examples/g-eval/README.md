# G-Eval Example

This example demonstrates the G-Eval assertion for evaluating LLM outputs using chain-of-thought reasoning, with full support for multi-modal (vision) evaluation.

You can run this example with:
```bash
npx promptfoo@latest init --example g-eval
```

## Features

- **Standard G-Eval**: Text-based evaluation with chain-of-thought
- **Vision G-Eval**: Image-based evaluation with provider-specific formatting
- **Multi-provider support**: Works with OpenAI, Anthropic, Gemini, and Nova

## Structure

```
g-eval/
├── vision-rubrics/              # Provider-specific vision formatters
│   ├── openai.js               # OpenAI GPT-4V format
│   ├── anthropic.js            # Claude 3 vision format
│   ├── gemini.js               # Gemini 1.5 format
│   └── bedrock-nova.js         # Nova vision format
├── test-image.png              # Geometric shapes test image
├── test-chart.png              # Bar chart test image
├── promptfooconfig.yaml        # Standard text G-Eval
├── promptfooconfig-image.yaml  # Basic vision G-Eval
└── promptfooconfig-vision.yaml # Advanced multi-provider vision
```

## Running the Examples

### Standard Text G-Eval
```bash
npx promptfoo eval
```

### Basic Vision G-Eval
```bash
npx promptfoo eval -c promptfooconfig-image.yaml
```

### Multi-Provider Vision G-Eval
```bash
npx promptfoo eval -c promptfooconfig-vision.yaml
```

## How Vision G-Eval Works

1. **Input with Images**: The model receives prompts with embedded images
2. **Visual Processing**: The model generates descriptions based on visual content
3. **Vision-Based Grading**: The grading model sees the same images and evaluates accuracy
4. **Provider Formatting**: Each provider's rubric formatter ensures correct image format

## Provider-Specific Rubric Prompts

The `vision-rubrics/` directory contains JavaScript functions that format evaluation prompts for each provider:

- **openai.js**: Formats for GPT-4V with `image_url` type
- **anthropic.js**: Formats for Claude with `image` type and base64 source
- **gemini.js**: Uses `parts` array with `inline_data`
- **bedrock-nova.js**: Uses `content` array with `image` objects

## Example Configuration

```yaml
tests:
  - vars:
      image: file://test-image.png
    assert:
      - type: g-eval
        value: "Visual accuracy criteria..."
        provider: openai:gpt-4o-mini
        rubricPrompt: file://vision-rubrics/openai.js
```

## Using Your Own Images

Replace the test images with your own:

1. Add your image files to the `examples/g-eval/` directory
2. Update the `vars` section in the configuration:

```yaml
tests:
  - vars:
      image: file://your-image.png
    assert:
      - type: g-eval
        value: "Your evaluation criteria here"
        rubricPrompt: file://vision-rubrics/openai.js  # Choose appropriate provider
```

## Requirements

- OpenAI API key for GPT-4V models
- AWS credentials for Bedrock (Claude, Nova)
- GCP credentials for Vertex AI (Gemini)
- Vision-capable model access

## Token Usage

Vision evaluation uses significantly more tokens (~40-50K) due to image processing.