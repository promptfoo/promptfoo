# Wildcard Prompts Example

This example demonstrates how to use wildcard patterns to automatically load multiple prompt files without explicitly listing each one in the configuration.

## Features

- **Automatic discovery**: Uses glob patterns to find all matching files
- **Function preservation**: Function names are correctly preserved when using wildcards
- **Mixed languages**: Shows both Python and JavaScript prompt files
- **Scalable**: Add new prompt files without updating the configuration

## Directory Structure

```
prompts/
├── marketing/
│   ├── email.py         # Marketing email prompts
│   └── social.py        # Social media prompts
├── technical/
│   └── code_review.py   # Code review prompts
└── ux.js               # UX design prompts
```

## Configuration

The `promptfooconfig.yaml` uses two wildcard patterns:

1. `file://prompts/**/*.py:generate_prompt` - Loads all Python files in subdirectories and calls `generate_prompt`
2. `file://prompts/*.js` - Loads all JavaScript files in the prompts directory

## Running the Example

```bash
# From this directory
npx promptfoo@latest eval

# Or to see the expanded prompts
npx promptfoo@latest eval --verbose
```

## Adding New Prompts

To add a new prompt:

1. Create a new Python file in any subdirectory with a `generate_prompt` function
2. Or create a new JavaScript file in the prompts directory with a default export
3. Run the evaluation - the new prompts will be automatically included!

No configuration changes needed! 