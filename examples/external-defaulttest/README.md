# external-defaulttest

This example demonstrates how to use the `file://` syntax to load `defaultTest` configuration from an external file.

You can run this example with:

```bash
npx promptfoo@latest init --example external-defaulttest
```

## Overview

Instead of defining `defaultTest` inline in your main configuration file, you can reference an external YAML or JSON file. This is useful for:

- Sharing common test configurations across multiple projects
- Keeping your main config file cleaner and more focused
- Managing complex test configurations separately
- Version controlling shared test configurations independently

## Structure

```
external-defaulttest/
├── promptfooconfig.yaml      # Main configuration file
├── shared/
│   └── defaultTest.yaml      # Shared default test configuration
└── README.md                 # This file
```

## Usage

### Inline defaultTest (traditional approach)

```yaml
# Traditional inline approach
defaultTest:
  assert:
    - type: cost
      threshold: 0.01
    - type: latency
      threshold: 5000
  options:
    provider: openai:o4-mini
```

### External defaultTest (new approach)

```yaml
# New external file approach
defaultTest: file://shared/defaultTest.yaml
```

The external file (`shared/defaultTest.yaml`) contains the same configuration that would normally be inline.

## Benefits

1. **Reusability**: Share the same defaultTest configuration across multiple prompt configurations
2. **Maintainability**: Update test defaults in one place
3. **Organization**: Keep complex test configurations separate from your main config
4. **Collaboration**: Teams can maintain shared test standards in a central location

## Running the Example

```bash
cd examples/external-defaulttest
npx promptfoo@latest eval
```

The external defaultTest configuration will be loaded automatically and applied to all test cases that don't override the defaults.

## Advanced Usage

You can also reference defaultTest files from parent directories or absolute paths:

```yaml
# Reference from parent directory
defaultTest: file://../shared-configs/defaultTest.yaml

# Reference from project root
defaultTest: file://configs/testing/defaultTest.yaml
```
