---
sidebar_label: Helicone
---

# Helicone integration

[Helicone](https://helicone.ai/) is an open source observability platform that proxies your LLM requests and provides key insights into your usage, spend, latency and more.

To reference prompts in Helicone:

1. Log into [Helicone](https://www.helicone.ai) or create an account. Once you have an account, you can generate an [API key](https://helicone.ai/developer).

2. Set the `HELICONE_API_KEY` and environment variables as desired.

3. Use the `helicone://` prefix for your prompts, followed by the Helicone prompt id and version. For example:

   ```yaml
   prompts:
     - 'helicone://my-cool-prompt:5.2'

   providers:
     - openai:gpt-4o-mini

   tests:
     - vars:
         # ...
   ```

Variables from your promptfoo test cases will be automatically plugged into the Helicone prompt as variables.

You can follow [this guide](https://docs.helicone.ai/features/prompts#prompts-and-experiments) to create a Prompt using Helicone
