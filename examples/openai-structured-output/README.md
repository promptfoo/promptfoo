# OpenAI Structured Output Example

This example demonstrates how to use OpenAI's new Structured Outputs feature with JSON schemas to ensure model outputs adhere to a specific structure.

## Key Features

- Utilizes the `gpt-4o` model supporting Structured Outputs
- Implements a JSON schema for analyzing customer support queries
- Demonstrates the `response_format` parameter with a `json_schema`

## How it Works

1. The prompt asks the model to analyze a customer support query.
2. The response is structured according to a predefined JSON schema, including fields like query summary, category, sentiment, urgency, and suggested actions.

## Running the Example

To run:

```bash
promptfoo eval
```

This executes tests defined in `promptfooconfig.yaml`, covering various customer support scenarios and validating the model's output.

## Note

For more details, refer to the [OpenAI announcement](https://openai.com/index/introducing-structured-outputs-in-the-api/).
