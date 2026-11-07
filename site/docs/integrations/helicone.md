---
sidebar_label: Helicone
description: Monitor and optimize LLM testing with Helicone integration in Promptfoo. Track usage, costs, and latency while managing prompts through an open-source observability platform.
---

# Helicone integration

[Helicone](https://helicone.ai/) is an open source observability platform that proxies your LLM requests and provides key insights into your usage, spend, latency and more.

The `helicone://` prefix uses Helicone's [legacy Compile Prompt API](https://docs.helicone.ai/rest/prompt/post-v1prompt-compile) to render an existing prompt with variables from each test case.

1. Generate an [API key](https://us.helicone.ai/settings/api-keys) in the Helicone organization that owns the prompt.

2. Set `HELICONE_API_KEY` in your shell, in a file passed with `--env-file`, or in your config's top-level `env` block.

3. Use the prompt's user-defined ID after `helicone://`. Append `:major.minor` to select a specific version.

   ```yaml
   prompts:
     - 'helicone://my-cool-prompt:5.2'

   providers:
     - openai:gpt-5-mini

   tests:
     - vars:
         # ...
   ```
