# Redteam: Target Application Purpose Auto-Discovery Example

This example demonstrates how to automatically discover and generate a [Redteam Purpose](https://www.promptfoo.dev/docs/red-team/configuration/#purpose) for your target application.

## Quick Start

```sh
promptfoo redteam discover \
    -c examples/redteam-purpose-generation/promptfooconfig.yaml \
    --preview \
    --turns 5
```

## With Test Case Generation

```sh
# Generate and persist the purpose:
promptfoo redteam discover \
    -c examples/redteam-purpose-generation/promptfooconfig.yaml \
    -o examples/redteam-purpose-generation/redteam.yaml \
    --turns 5

# Use the generated purpose for test case generation.
# Note that the same output as the previous step is re-used in order to provide
# access to the purpose:
promptfoo redteam generate \
    -c examples/redteam-purpose-generation/promptfooconfig.yaml \
    -o examples/redteam-purpose-generation/redteam.yaml
```

## Full Redteam Scan

Run discover within the context of a full Redteam scan:

```sh
promptfoo redteam run -c examples/redteam-purpose-generation/promptfooconfig.yaml
```
