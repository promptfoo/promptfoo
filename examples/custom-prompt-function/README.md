# Prompt Functions and Format Examples

This example demonstrates the full range of prompt formats supported by promptfoo, with special focus on prompt functions that can return both content and configuration.

## Quick Start

```bash
# Copy this example to your project
npx promptfoo@latest init --example custom-prompt-function

# Set required API keys
export OPENAI_API_KEY=your_openai_key
export ANTHROPIC_API_KEY=your_anthropic_key

# Run the evaluation
npx promptfoo@latest eval

# View results
npx promptfoo@latest view
```

## What This Example Shows

### Supported Prompt Formats

- Raw text prompts
- File-based prompts (txt, yaml, json, jsonl, md, j2)
- Glob patterns for multiple files
- JSON chat formats
- Markdown formatted prompts
- Jinja2 template files

### Prompt Functions

- JavaScript prompt functions (CommonJS and ESM)
- TypeScript prompt functions
- Python prompt functions and class methods
- Multiple functions in a single file
- **Dynamic configuration** - returning `{ prompt, config }` objects that override provider settings

## Example Structure

- `prompt.txt`, `prompt.yaml`, etc. - Various prompt file formats
- `prompt.j2` - Jinja2 template format
- `prompt_chat.js/ts` - Chat format examples
- `prompt_multiple.js` - Multiple functions in one file
- `prompt_esm.mjs` - ESM module format
- `prompt_python.py` - Python examples
- `prompt_config.js/py` - Functions returning dynamic configuration
- `subfolder/` - Demonstrates nested file structures
- `promptfooconfig.yaml` - Complete configuration showing all prompt types

## Configuration Features

- Dynamic adjustment of model parameters (temperature, tokens) based on content
- Content-aware JSON schema formatting
- Configuration merging (function values override provider defaults)
- Provider-specific prompt configurations
- Multiple provider comparisons (OpenAI and Anthropic)

## Customization

To adapt this example:

1. Explore different prompt formats to find what works best for your use case
2. Use dynamic configurations to optimize model behavior based on input context
3. Compare how different providers respond to the same prompts
4. Create your own prompt functions for advanced use cases

## Documentation

Learn more about:

- [Prompt Formats](https://www.promptfoo.dev/docs/configuration/parameters/#prompts)
- [Prompt Functions](https://www.promptfoo.dev/docs/configuration/parameters/#prompt-functions)
- [Provider Configuration](https://www.promptfoo.dev/docs/providers/)
- [JSON Schema Response Formats](https://www.promptfoo.dev/docs/providers/openai/#json-mode-structured-outputs)
