---
sidebar_label: Portkey AI
---

# Portkey AI integration

Portkey is an AI observability suite that includes prompt management capabilities.

To reference prompts in Portkey:

1. Set the `PORTKEY_API_KEY` environment variable.

2. Use the `portkey://` prefix for your prompts, followed by the Portkey prompt ID. For example:

   ```yaml
   prompts:
     - 'portkey://pp-test-promp-669f48'

   providers:
     - openai:gpt-3.5-turbo-0613

   tests:
     - vars:
         topic: ...
   ```

Variables from your promptfoo test cases will be automatically plugged into the Portkey prompt as variables. The resulting prompt will be rendered and returned to promptfoo, and used as the prompt for the test case.

Note that promptfoo does not follow the temperature, model, and other parameters set in Portkey. You must set them in the `providers` configuration yourself.

## Using Portkey gateway

The Portkey AI gateway is directly supported by promptfoo.  See also [portkey's documentation on integrating promptfoo](https://portkey.ai/docs/welcome/integration-guides/promptfoo).

Example:

```yaml
providers:
  id: portkey:gpt-4o
  config:
    portkeyProvider: openai
```

More complex portkey configurations are also supported.

```yaml
providers:
  id: portkey:gpt-3.5-turbo-0613
  # Can alternative set environment variables, e.g. PORTKEY_API_KEY
  portkeyApiKey: xxx
  portkeyVirtualKey: xxx
  portkeyMetadata:
    team: xxx
  portkeyConfig: xxx
  portkeyProvider: xxx
  portkeyApiBaseUrl: xxx
```
