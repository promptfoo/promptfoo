# google-aistudio-gemini (Google AI Studio (Gemini) Example)

You can run this example with:

```bash
npx promptfoo@latest init --example google-aistudio-gemini
```

This example demonstrates using Google's Gemini models with promptfoo to evaluate math puzzle solving capabilities.

## Prerequisites

- promptfoo CLI installed (`npm install -g promptfoo` or `brew install promptfoo`)
- Google AI Studio API key set as `GOOGLE_API_KEY`

## Available Models

The example tests across multiple Gemini models:

- **Gemini 2.5 Pro** - Latest stable model with enhanced reasoning, coding, and multimodal understanding
- **Gemini 2.5 Flash** - Latest stable Flash model with enhanced reasoning and thinking capabilities
- **Gemini 2.5 Flash-Lite** - Most cost-efficient and fastest 2.5 model, optimized for high-volume, latency-sensitive tasks
- Gemini 2.0 Flash
- Gemini 2.0 Flash Thinking
- Gemini 1.5 Flash
- Gemini 1.5 Pro - Standard model for complex reasoning, used with both structured JSON output and function calling capabilities

## System Instructions from File

This example also demonstrates how to load system instructions from an external file using the `file://` prefix:

```yaml
providers:
  - id: google:gemini-2.5-pro
    label: gemini-with-system-instruction-file
    config:
      systemInstruction: file://system-instruction.txt
```

The `system-instruction.txt` file contains reusable instructions that can be:

- Shared across multiple configurations
- Version controlled separately
- Used to manage complex or lengthy system prompts

## Image Understanding Example

This example also includes an image understanding configuration (`promptfooconfig.image.yaml`) that demonstrates:

- **Multimodal capabilities**: Using Gemini models to analyze and compare images
- **Image file handling**: Loading images using the `file://` prefix
- **Visual comparison**: Testing the model's ability to identify and compare different images

Images should be placed on separate lines in the prompt. The `file://` prefix automatically handles loading and encoding the images for the Gemini API.

## Running the Eval

1. Get a local copy of the configuration:

```sh
promptfoo init --example google-aistudio-gemini
```

2. Run the examples:

```sh
# Basic math puzzle evaluation across multiple Gemini models
promptfoo eval

# Image understanding and comparison evaluation
promptfoo eval -c promptfooconfig.image.yaml
```

3. View the results:

```sh
promptfoo view
```
