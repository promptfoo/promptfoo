# File Transformation Example

This example demonstrates how to use promptfoo to transform files using AI models, enabling automated file processing, content generation, and format conversion.

## Quick Start

```bash
npx promptfoo@latest init --example transform-file
```

## Configuration

1. Set up your environment:

```bash
export OPENAI_API_KEY=your_key_here  # Or your preferred model's API key
```

2. Review the example files:
   - `promptfooconfig.yaml`: Configuration for file transformations
   - `input/`: Directory containing files to transform
   - `expected/`: Directory containing expected outputs
   - Custom transformation prompts and rules

## Usage

Run the transformation evaluation:

```bash
promptfoo eval
```

View detailed results:

```bash
promptfoo view
```

## What's Being Tested

This example evaluates:

- File content transformation accuracy
- Format conversion capabilities
- Content generation consistency
- Transformation rules compliance
- Output validation against expected results

## Example Structure

The example includes:

- `promptfooconfig.yaml`: Main configuration file
- Input files for transformation
- Expected output templates
- Transformation rules and prompts
- Validation criteria

## Implementation Details

The example demonstrates:

- How to set up file transformation pipelines
- Defining transformation rules and templates
- Handling different file formats
- Validating transformation outputs
- Best practices for file processing

## Additional Resources

- [File Processing Guide](https://promptfoo.dev/docs/guides/file-processing)
- [Transformation Examples](https://promptfoo.dev/docs/examples/transformations)
- [Configuration Reference](https://promptfoo.dev/docs/configuration/)
- [Validation Guide](https://promptfoo.dev/docs/guides/validation)
