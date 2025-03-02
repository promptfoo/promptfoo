# Azure OpenAI Example

This example demonstrates how to use Azure OpenAI with promptfoo. See https://promptfoo.dev/docs/providers/azure/ for more Azure setup information.

## Quick Start

```bash
npx promptfoo@latest init --example azure-openai
```

## Configuration

Edit configuration in `promptfooconfig.yaml`. The following environment variables are required:

```bash
export AZURE_OPENAI_API_KEY=your-key-here
export AZURE_OPENAI_ENDPOINT=https://your-resource.openai.azure.com
```

## Usage

Run the evaluation:

```bash
promptfoo eval
```

## Additional Resources

- [Azure OpenAI Setup Guide](https://promptfoo.dev/docs/providers/azure/)
- [Configuration Documentation](https://promptfoo.dev/docs/configuration/)
