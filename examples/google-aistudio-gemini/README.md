# google-aistudio-gemini (Google AI Studio (Gemini and Gemma) Example)

You can run this example with:

```bash
npx promptfoo@latest init --example google-aistudio-gemini
cd google-aistudio-gemini
```

This example demonstrates using Google's Gemini and Gemma models with promptfoo to evaluate math puzzle-solving capabilities.

## Prerequisites

- promptfoo CLI installed (`npm install -g promptfoo` or `brew install promptfoo`)
- Google AI Studio API key set as `GOOGLE_API_KEY`

## Available Models

The example tests across multiple Gemini and Gemma models:

- **Gemma 4 31B IT** - Open model with strong reasoning, coding, and agentic capabilities
- **Gemma 4 26B A4B IT** - Smaller open Gemma 4 model for lower-latency reasoning and coding evals
- **Gemini 3.5 Flash** - Newest, fastest frontier Flash model with high-effort thinking
- **Gemini 3.1 Pro** - Frontier model with improved reasoning and multimodal understanding
- **Gemini 3 Flash** - Frontier Flash model with strong reasoning at lower latency
- **Gemini 3.1 Flash-Lite** - Low-latency, cost-efficient model for high-volume tasks
- **Gemini 2.5 Pro** - Stable model with strong reasoning, coding, and multimodal understanding; also used with structured JSON output and function calling
- **Gemini 2.5 Flash** - Stable Flash model with enhanced reasoning and thinking capabilities
- **Gemini 2.5 Flash-Lite** - Cost-efficient and fast 2.5 model, optimized for high-volume, latency-sensitive tasks
- **gemini-embedding-001** - Embedding model used for similarity-based assertions

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
# Basic math puzzle evaluation across multiple Gemini and Gemma models
promptfoo eval

# Image understanding and comparison evaluation
promptfoo eval -c promptfooconfig.image.yaml
```

3. View the results:

```sh
promptfoo view
```
