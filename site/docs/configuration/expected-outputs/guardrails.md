---
sidebar_position: 101
sidebar_label: Guardrails
description: Validate LLM outputs against provider-specific safety guardrails including AWS Bedrock and Azure OpenAI content filters
---

# Guardrails

Use the `guardrails` assert type to ensure that LLM outputs pass safety checks based on the provider's built-in guardrails.

This assertion checks both input and output content against provider guardrails. Input guardrails typically detect prompt injections and jailbreak attempts, while output guardrails check for harmful content categories like hate speech, violence, or inappropriate material based on your guardrails configuration. The assertion verifies that neither the input nor output have been flagged for safety concerns.

## Provider Support

The guardrails assertion is currently supported on:

- AWS Bedrock with [Amazon Guardrails](https://docs.aws.amazon.com/bedrock/latest/userguide/guardrails-create.html) enabled
- Azure OpenAI with [Content Filters](https://learn.microsoft.com/en-us/azure/ai-services/openai/concepts/content-filter?tabs=warning%2Cuser-prompt%2Cpython-new) enabled

Other providers do not currently support this assertion type. The assertion will pass with a score of 0 for unsupported providers.

::::note
If you are using Promptfoo's built-in Azure OpenAI (with Content Filters) or AWS Bedrock (with Amazon Guardrails) providers, Promptfoo automatically maps provider responses to the top-level `guardrails` object. You do not need to implement a response transform for these built-in integrations. The mapping guidance below is only necessary for custom HTTP targets or other non-built-in providers.
::::

## Basic Usage

Here's a basic example of using the guardrail assertion:

```yaml
tests:
  - vars:
      prompt: 'Your test prompt'
    assert:
      - type: guardrails
```

You can also set it as a default test assertion:

```yaml
defaultTest:
  assert:
    - type: guardrails
```

:::note

Pass/fail logic of the assertion:

- If the provider's guardrails blocks the content, the assertion fails (indicating content was blocked)
- If the guardrails passes the content, the assertion passes (indicating content was not blocked)

:::

:::note
For Azure, if the prompt fails the input content safety filter, the response status is 400 with code `content_filter`. In this case, the guardrails assertion passes.
:::

## Inverse Assertion (not-guardrails)

Use `not-guardrails` to verify dangerous prompts get caught - the test passes when content is blocked, fails when it slips through:

```yaml
assert:
  - type: not-guardrails
```

With `not-guardrails`:

- If the provider's guardrails blocks the content, the test **passes** (the attack was blocked)
- If the content passes through, the test **fails** (the guardrail didn't catch it)

## Red Team Configuration

For red team testing, use the `purpose: redteam` config option:

```yaml
assert:
  - type: guardrails
    config:
      purpose: redteam
```

This has the same pass/fail behavior as `not-guardrails`, but additionally tracks failed content safety checks in Promptfoo's red team reporting.

## How it works

The guardrails assertion checks for:

- Input safety
- Output safety

The assertion will:

- Pass (score: 1) if the content passes all safety checks
- Fail (score: 0) if either the input or output is flagged
- Pass with score 0 if no guardrails was applied

When content is flagged, the assertion provides specific feedback about whether it was the input or output that failed the safety checks.

## Mapping provider responses to `guardrails`

You only need this when you're not using Promptfoo's built-in Azure OpenAI or AWS Bedrock providers. For custom HTTP targets or other non-built-in providers, normalize your provider response into the `guardrails` shape described below.

In order for this assertion to work, your target's response object must include a top-level `guardrails` field. The assertion reads only the following fields:

- `flagged` (boolean)
- `flaggedInput` (boolean)
- `flaggedOutput` (boolean)
- `reason` (string)

Many HTTP or custom targets need a response transform to normalize provider-specific responses into this shape. You can do this by returning an object from your transform with both `output` and `guardrails`.

### Example: HTTP provider transform (Azure content filters)

The following example shows how to map an Azure OpenAI Content Filter error into the required `guardrails` object. It uses an HTTP provider with a file-based `transformResponse` that inspects the JSON body and HTTP status to populate `guardrails` correctly.

```yaml
providers:
  - id: https
    label: azure-gpt
    config:
      url: https://your-azure-openai-endpoint/openai/deployments/<model>/chat/completions?api-version=2024-02-15-preview
      method: POST
      headers:
        api-key: '{{ env.AZURE_OPENAI_API_KEY }}'
        content-type: application/json
      body: |
        {
          "messages": [{"role": "user", "content": "{{prompt}}"}],
          "temperature": 0
        }
      transformResponse: file://./transform-azure-guardrails.js
```

`transform-azure-guardrails.js`:

```javascript
module.exports = (json, text, context) => {
  // Default successful shape
  const successOutput = json?.choices?.[0]?.message?.content ?? '';

  // Azure input content filter case: 400 with code "content_filter"
  const status = context?.response?.status;
  const errCode = json?.error?.code;
  const errMessage = json?.error?.message;

  // Build guardrails object when provider indicates filtering
  if (status === 400 && errCode === 'content_filter') {
    return {
      output: errMessage || 'Content filtered by Azure',
      guardrails: {
        flagged: true,
        flaggedInput: true,
        flaggedOutput: false,
        reason: errMessage || 'Azure content filter detected policy violation',
      },
    };
  }

  // Example: map provider header to output filtering signal, if available
  const wasFiltered = context?.response?.headers?.['x-content-filtered'] === 'true';
  if (wasFiltered) {
    return {
      output: successOutput,
      guardrails: {
        flagged: true,
        flaggedInput: false,
        flaggedOutput: true,
        reason: 'Provider flagged completion by content filter',
      },
    };
  }

  // Default: pass-through when no guardrails signal present
  return {
    output: successOutput,
    // Omit guardrails or return { flagged: false } to indicate no issues
    guardrails: { flagged: false },
  };
};
```

Alternatively, you can use an inline JavaScript transform:

```yaml
providers:
  - id: https
    label: azure-gpt
    config:
      url: https://your-azure-openai-endpoint/openai/deployments/<model>/chat/completions?api-version=2024-02-15-preview
      method: POST
      headers:
        api-key: '{{ env.AZURE_OPENAI_API_KEY }}'
        content-type: application/json
      body: |
        {
          "messages": [{"role": "user", "content": "{{prompt}}"}],
          "temperature": 0
        }
      transformResponse: |
        (json, text, context) => {
          // Default successful shape
          const successOutput = json?.choices?.[0]?.message?.content ?? '';

          // Azure input content filter case: 400 with code "content_filter"
          const status = context?.response?.status;
          const errCode = json?.error?.code;
          const errMessage = json?.error?.message;

          // Build guardrails object when provider indicates filtering
          if (status === 400 && errCode === 'content_filter') {
            return {
              output: errMessage || 'Content filtered by Azure',
              guardrails: {
                flagged: true,
                flaggedInput: true,
                flaggedOutput: false,
                reason: errMessage || 'Azure content filter detected policy violation',
              },
            };
          }

          // Example: map provider header to output filtering signal, if available
          const wasFiltered = context?.response?.headers?.['x-content-filtered'] === 'true';
          if (wasFiltered) {
            return {
              output: successOutput,
              guardrails: {
                flagged: true,
                flaggedInput: false,
                flaggedOutput: true,
                reason: 'Provider flagged completion by content filter',
              },
            };
          }

          // Default: pass-through when no guardrails signal present
          return {
            output: successOutput,
            guardrails: { flagged: false },
          };
        }
```

Notes:

- The transform must return an object with `output` and `guardrails` at the top level.
- The `guardrails` object should reflect whether the input or output was flagged (`flaggedInput`, `flaggedOutput`) and include a human-readable `reason`.
- For Azure, failed input content safety checks typically return HTTP 400 with code `content_filter`. In this case, set `flagged: true` and `flaggedInput: true` and populate `reason` from the error.
- You can also derive guardrail flags from response headers or other metadata available in `context.response`.

See also:

- [HTTP provider transforms and guardrails](/docs/providers/http#guardrails-support)
- [Reference for the `guardrails` shape](/docs/configuration/reference#guardrails)
