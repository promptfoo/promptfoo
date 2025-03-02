# Custom Provider Example

This example demonstrates how to create and use custom providers in promptfoo, allowing you to integrate any AI model or service into your evaluation pipeline.

## Quick Start

```bash
npx promptfoo@latest init --example custom-provider
```

## Overview

This example shows how to:

- Create a custom provider in JavaScript
- Handle API calls and responses
- Process CSV test cases
- Integrate with the promptfoo evaluation system

## Configuration

1. Review the example files:

   - `customProvider.js`: Implementation of the custom provider
   - `promptfooconfig.yaml`: Configuration using the custom provider
   - `tests.csv`: Test cases in CSV format

2. Customize the provider:
   - Modify the provider implementation in `customProvider.js`
   - Update API endpoints and authentication
   - Adjust response handling and formatting

## Usage

Run the evaluation:

```bash
promptfoo eval
```

View detailed results:

```bash
promptfoo view
```

## Example Structure

The example includes:

- Custom provider implementation
- Configuration file setup
- Test case management
- Response processing logic

## Implementation Details

The custom provider demonstrates:

- Provider class structure
- API integration patterns
- Error handling
- Response formatting
- Test case processing

## Additional Resources

- [Custom Provider Guide](https://promptfoo.dev/docs/providers/custom)
- [API Integration Guide](https://promptfoo.dev/docs/providers/http)
- [Configuration Reference](https://promptfoo.dev/docs/configuration/)
