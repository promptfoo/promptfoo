# Azure OpenAI Assistant Example

This example demonstrates how to use promptfoo with Azure OpenAI's Assistant API for evaluating and testing AI assistants deployed on Azure.

## Quick Start

```bash
npx promptfoo@latest init --example azure-openai-assistant
```

## Configuration

1. Set up your Azure OpenAI credentials:

```bash
export AZURE_OPENAI_API_KEY=your_key_here
export AZURE_OPENAI_ENDPOINT=https://your-resource.openai.azure.com
```

2. Configure your assistant:
   - Review and edit `promptfooconfig.yaml`
   - Set up assistant parameters and tools
   - Define test cases and assertions

## Usage

Run the evaluation:

```bash
promptfoo eval
```

View results in the web interface:

```bash
promptfoo view
```

## What's Being Tested

This example evaluates:

- Assistant responses and behavior
- Tool usage and function calling
- Response quality and consistency
- Error handling and edge cases

## Additional Resources

- [Azure OpenAI Assistant Documentation](https://learn.microsoft.com/azure/ai-services/openai/how-to/assistant)
- [Azure Provider Guide](https://promptfoo.dev/docs/providers/azure)
- [Assistant Testing Guide](https://promptfoo.dev/docs/guides/assistant-testing)
