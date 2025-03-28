---
sidebar_label: Inference Limits
---

# Inference Limits

You may encounter a warning or error message about reaching inference limits when using Promptfoo's red teaming capabilities.

## Understanding Inference Limits

Promptfoo's open source version includes access to cloud-based inference for several key functions:

- Generating test cases and attack vectors
- Running attacks against target systems
- Judging and evaluating test results

These services have usage limits to ensure fair access for all users. When you reach these limits, you'll see a warning message or, in some cases, an error that prevents further cloud-based inference.

## Solutions

### 1. Use Your Own OpenAI API Key

The simplest solution is to set your own OpenAI API key:

```bash
export OPENAI_API_KEY=sk-...
```

When this environment variable is set, Promptfoo will use your OpenAI account instead of the built-in inference service whenever possible.

### 2. Configure Alternative Providers

You can override the default red team providers with your own models:

```yaml
redteam:
  providers:
    - id: some-other-model
      # ...
```

See the [Red Team Configuration documentation](/docs/red-team/configuration/#providers) for detailed setup instructions.

### 3. Use Local Models

For complete control and no inference limits, you can run models locally:

```yaml
redteam:
  providers:
    - id: local-llama
      type: ollama
      model: llama3
```

This requires more computational resources but eliminates cloud inference dependencies.

### 4. Upgrade Your Account

For enterprise users with high-volume needs, contact us to discuss custom inference plans:

- Email: [inquiries@promptfoo.dev](mailto:inquiries@promptfoo.dev)
- Schedule a call: [Calendar](/contact/)

[Enterprise plans](/pricing/) offer additional capabilities for teams:

- Unlimited inference
- Continuous testing and monitoring
- Team collaboration features with access controls
- Compliance reporting and remediation tracking
- Dedicated support with response guarantees
- And more!

## Getting Help

If you're unsure which approach best fits your needs, contact us at [inquiries@promptfoo.dev](mailto:inquiries@promptfoo.dev) for personalized assistance.
