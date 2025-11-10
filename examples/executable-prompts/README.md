# executable-prompts

This example demonstrates how to use executable scripts and binaries as prompt generators in promptfoo.

To initialize and run it:

```bash
npx promptfoo@latest init --example executable-prompts
cd executable-prompts
promptfoo eval
```

## Prerequisites

- bash/zsh (macOS/Linux) or PowerShell (Windows)
- jq (for the shell example): https://stedolan.github.io/jq/
- Ruby 3.x (for the Ruby example)
- Make scripts executable: `chmod +x prompt-generator.sh template-prompt.rb`

## Overview

Promptfoo supports using any executable (shell scripts, Python scripts, binaries, etc.) to dynamically generate prompts. This is useful when you need to:

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
  # Note: Python files (.py) are processed as Python prompt templates by default.
  # To run a Python script as an executable prompt, use the exec: prefix:
  # - exec:./generator.py
```

### Method 3: With configuration

```yaml
prompts:
  - label: 'Custom Prompt'
    raw: exec:./generator.sh
    config:
      temperature: 0.7
      style: technical
      timeout: 30000 # 30 second timeout (default: 60s)
```
