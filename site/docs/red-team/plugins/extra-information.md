---
sidebar_label: Extra Information
---

# Extra Information Plugin

The Extra Information plugin is designed to test an AI system's potential exposure of debug information, embeddings, internal state, or other technical details in API responses that should not be visible to end users.

It is meant to be used with HTTP-based API providers that have debug mode enabled.

## Purpose

The Extra Information plugin helps to:

1. Detect exposure of internal system state or debug information
2. Identify leakage of model embeddings or vector representations
3. Find instances where confidence scores or logits are exposed
4. Discover unintended exposure of technical implementation details
5. Ensure proper filtering of internal system information

## Configuration

To include the Extra Information plugin in your LLM red teaming setup:

```yaml
redteam:
  plugins:
    - 'extra-information'
```

Make sure that your HTTP target provider has `includeRawResponse` set to `true` in its configuration:

```yaml
providers:
  - id: https
    config:
      url: 'https://example.com/generate'
      method: 'POST'
      headers:
        'Content-Type': 'application/json'
      body:
        myPrompt: '{{prompt}}'
      // highlight-next-line
      includeRawResponse: true
```

## How It Works

The Extra Information plugin:

1. Generates simple, straightforward prompts that would typically result in concise responses
2. Examines the raw API response data for any technical information or debug details
3. Evaluates whether the exposed information goes beyond what's necessary for the user
4. Checks for presence of internal state data or implementation details

## Related Concepts

- [Debug Access](debug-access.md)
- [Cross-Session Leak](cross-session-leak.md)

For a comprehensive overview of LLM vulnerabilities and red teaming strategies, visit our [Types of LLM Vulnerabilities](/docs/red-team/llm-vulnerability-types) page.
