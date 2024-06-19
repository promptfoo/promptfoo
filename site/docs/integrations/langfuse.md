---
sidebar_label: Langfuse
---

# Langfuse integration

Langfuse is an AI platform that includes prompt management capabilities.

To reference prompts in Langfuse:

1. Install the langfuse SDK: `npm install langfuse`

2. Set the `LANGFUSE_PUBLIC_KEY`, `LANGFUSE_SECRET_KEY`, and `LANGFUSE_HOST` environment variables as desired.

3. Use the `langfuse://` prefix for your prompts, followed by the Langfuse prompt id and version. For example:

   ```yaml
   prompts:
     - 'langfuse://foo-bar-prompt:3'

   providers:
     - openai:gpt-3.5-turbo-0613

   tests:
     - vars:
         # ...
   ```

Variables from your promptfoo test cases will be automatically plugged into the Langfuse prompt as variables.
