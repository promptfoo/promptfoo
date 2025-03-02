# Assistant CLI Example

This example demonstrates how to use promptfoo's command-line interface for evaluating prompts and comparing model outputs. It shows both configuration-based and direct command-line approaches.

## Quick Start

```bash
npx promptfoo@latest init --example assistant-cli
```

## Usage

### Using Configuration File

Run the evaluation using the pre-configured settings in `promptfooconfig.yaml`:

```bash
promptfoo eval
```

### Direct Command Line

Alternatively, you can run the same evaluation using command-line arguments:

```bash
promptfoo eval \
  --prompts prompts.txt \
  --tests tests.csv \
  --providers openai:gpt-4 \
  --output output.json
```

## Configuration

The example includes:

- `promptfooconfig.yaml`: Main configuration file
- `prompts.txt`: Test prompts
- `tests.csv`: Test cases
- `output.json`: Results output file

## Additional Resources

- [CLI Documentation](https://promptfoo.dev/docs/usage/cli)
- [Configuration Guide](https://promptfoo.dev/docs/configuration)
- [Output Formats](https://promptfoo.dev/docs/configuration/output)
