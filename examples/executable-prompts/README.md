# Executable Prompts Example

This example demonstrates how to use executable scripts and binaries as prompt generators in promptfoo.

To run it:

```
promptfoo eval
```

## Overview

Promptfoo now supports using any executable (shell scripts, Python scripts, binaries, etc.) to dynamically generate prompts. This is useful when you need to:

- Generate prompts based on external data sources
- Create context-aware prompts dynamically
- Integrate with existing tools and scripts
- Generate prompts in languages other than JavaScript or Python

## How It Works

1. **Script Input**: Your executable receives a JSON context as its first command-line argument containing:
   - `vars`: Test variables from your configuration
   - `provider`: Information about the current provider
   - `config`: Any additional configuration passed to the prompt

2. **Script Output**: Your script should output the generated prompt to stdout

3. **Error Handling**:
   - Errors should be written to stderr
   - Non-zero exit codes will cause the prompt generation to fail

## Usage Methods

### Method 1: Using `exec:` prefix

```yaml
prompts:
  - exec:./my-script.sh
  - exec:/usr/bin/custom-prompt-generator
```

### Method 2: Direct file reference (auto-detected)

```yaml
prompts:
  - ./my-script.sh # Detected by .sh extension
  - ./generator.py # Detected by .py extension
```

### Method 3: With configuration

```yaml
prompts:
  - label: 'Custom Prompt'
    raw: exec:./generator.sh
    config:
      temperature: 0.7
      style: technical
```
