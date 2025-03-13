# Adaline Gateway Examples

This directory contains examples demonstrating how to use the Adaline Gateway with promptfoo. The Adaline Gateway provides a unified interface for interacting with various AI providers.

## Installation

To run these examples, you'll need to install the Adaline Gateway and its peer dependencies:

```bash
npm install @adaline/anthropic@latest @adaline/azure@latest @adaline/gateway@latest @adaline/google@latest @adaline/groq@latest @adaline/open-router@latest @adaline/openai@latest @adaline/provider@latest @adaline/together-ai@latest @adaline/types@latest @adaline/vertex@latest
```

## Examples

Each subdirectory contains a specific example showcasing different features of the Adaline Gateway:

- `adaline-chat-history/`: Example demonstrating chat history handling
- `adaline-embedding-similarity/`: Example showing embedding and similarity features
- `adaline-eval-factuality/`: Example for evaluating factuality
- `adaline-multi-provider/`: Example using multiple providers
- `adaline-openai-format/`: Example with OpenAI format compatibility
- `adaline-structured-output/`: Example for structured output generation
- `adaline-tool-call/`: Example demonstrating tool calling capabilities
- `adaline-vision/`: Example for vision-related tasks
- `adaline-vision-base64/`: Example using base64-encoded images

Each example directory contains its own configuration file (`promptfooconfig.yaml`) and relevant prompts.
