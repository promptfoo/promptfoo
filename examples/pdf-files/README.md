# pdf-files (PDF Document Analysis)

This example demonstrates how to analyze PDF documents using vision-capable LLMs from multiple providers.

You can run this example with:

```bash
npx promptfoo@latest init --example pdf-files
```

## Setup

Set your API keys for the providers you want to use:

- **Google Gemini**: Set `GOOGLE_API_KEY` or `GEMINI_API_KEY`
- **Anthropic Claude**: Set `ANTHROPIC_API_KEY`
- **OpenAI GPT**: Set `OPENAI_API_KEY`

## Usage

This example is pre-configured in `promptfooconfig.yaml`. Run:

```bash
promptfoo eval
```

View results:

```bash
promptfoo view
```

## How It Works

The `prompt.py` file handles provider-specific PDF formatting:

- **Anthropic**: Uses the `document` content type with base64 data
- **OpenAI**: Uses `input_file` with data URI format
- **Google Gemini**: Uses `inline_data` within message parts

Each provider has different requirements for sending PDF documents, which is why a Python prompt function is used to dynamically format the request.
