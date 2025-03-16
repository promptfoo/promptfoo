# tool-use (Function and Tool Calling)

This example demonstrates how to evaluate LLM function/tool calling capabilities using promptfoo.

You can run this example with:

```bash
npx promptfoo@latest init --example tool-use
```

## Overview

This example shows how to configure and test function/tool calling capabilities across multiple LLM providers:

- OpenAI (with native function calling)
- Anthropic (with Claude's tool use)
- AWS Bedrock models
- Groq (with function calling)

Each provider has slightly different syntax and requirements for implementing function/tool calling.

## Environment Variables

This example requires the following environment variables:

- `OPENAI_API_KEY` - Your OpenAI API key
- `ANTHROPIC_API_KEY` - Your Anthropic API key
- `AWS_ACCESS_KEY_ID` and `AWS_SECRET_ACCESS_KEY` - For AWS Bedrock (if using the Bedrock example)
- `GROQ_API_KEY` - If using Groq's LLaMA models

You can set these in a `.env` file or directly in your environment.

## Provider Documentation

Each provider implements tool use with different syntax:

- [OpenAI Function Calling Guide](https://platform.openai.com/docs/guides/function-calling)
- [Anthropic Tool Use Guide](https://docs.anthropic.com/en/docs/tool-use)
- [AWS Bedrock Claude Tool Use](https://docs.aws.amazon.com/bedrock/latest/userguide/tool-use.html)
- [Groq Function Calling](https://console.groq.com/docs/tools)

## Running the Example

The configuration for this example is in:

- `promptfooconfig.yaml` - Main example with OpenAI, Anthropic, and Groq
- `promptfooconfig.bedrock.yaml` - Example specifically for AWS Bedrock models

To run the main example:

```bash
promptfoo eval
```

To run the Bedrock example:

```bash
promptfoo eval -c promptfooconfig.bedrock.yaml
```

After running the evaluation, view the results with:

```bash
promptfoo view
```

## Example Tool: Weather Function

This example uses a simple weather lookup function that takes a location and optionally a temperature unit. The example illustrates how different providers handle the same function definition with different syntaxes.

External tools can also be loaded from separate files, as demonstrated with `external_tools.yaml`.
