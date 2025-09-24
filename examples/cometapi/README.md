# CometAPI

This example shows how to use CometAPI to access various language models through a unified OpenAI-compatible interface.

You can run this example with:

```bash
npx promptfoo@latest init --example cometapi
```

## Setup

1. Get your API key from [CometAPI](https://api.cometapi.com/console/token)

2. Set your API key:

   ```bash
   export COMETAPI_KEY=your_api_key_here
   ```

3. Run the evaluation:
   ```bash
   npx promptfoo@latest eval
   ```

## What this example does

This example demonstrates:

- Basic usage of CometAPI provider with chat models
- Geography questions evaluation
- How to configure CometAPI in your promptfoo setup

The example uses the `gpt-5-mini` model to answer geography questions about different countries' capitals.
