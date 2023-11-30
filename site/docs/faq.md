---
sidebar_label: FAQ
---

# Frequently asked questions

### Does promptfoo forward calls to an intermediate server?

No, the source code is executed on your machine. Any call to LLM APIs (OpenAI, Anthropic, etc) are sent directly to the LLM provider. The authors of promptfoo do not have access to these requests or responses.

### Does promptfoo store API keys?

No, API keys are set as local environment variables and never transmitted to anywhere besides the LLM API directly (OpenAI, Anthropic, etc).

### Does promptfoo store LLM inputs and outputs?

No, promptfoo runs locally and all data remains on your local machine.

If you _explicitly_ run the [share command](/docs/usage/sharing), then your inputs/outputs are stored in Cloudflare KV for 2 weeks. This only happens when you run `promptfoo share` or click the "Share" button in the web UI.

### Do you collect any PII?

No, we do not collect any PII (personally identifiable information).
