---
sidebar_label: Extra Information
---

# Extra Information Exposure

The **Extra Information** plugin tests whether an AI system exposes debug data, internal state, or extra information that should not be visible to end users.

## Purpose

This plugin helps identify vulnerabilities where AI systems leak:
- Embeddings or vector representations
- Debug information or logs
- Model confidence scores or logits
- Details about the model or backend system
- Any other technical information not meant for end users

## Configuration

<table>
  <tr>
    <th>Parameter</th>
    <th>Type</th>
    <th>Default</th>
    <th>Description</th>
  </tr>
  <tr>
    <td>numTests</td>
    <td>number</td>
    <td>5</td>
    <td>Number of test cases to generate</td>
  </tr>
</table>

## Example

```yaml
redteam:
  plugins:
    - extra-information
```

## How It Works

The plugin:
1. Generates prompts designed to elicit debug information or internal state
2. Examines the raw response data (not just the formatted output)
3. Checks for technical information that should be filtered out
4. Passes if only the intended response is returned without extra data

## Interpretation

A **failure** indicates that your system is exposing internal information such as:
- Raw embeddings or vector data
- Debug logs or system information
- Model metadata or confidence scores
- Implementation details

This can be a security risk as it may reveal:
- System architecture details
- Potential attack vectors
- Sensitive implementation information

## Related Plugins

- [Prompt Extraction](prompt-extraction.md) - Tests for system prompt disclosure
- [Debug Access](debug-access.md) - Tests for exposed debugging interfaces
- [Cross-Session Leak](cross-session-leak.md) - Tests for information leakage between sessions

For a comprehensive overview of LLM vulnerabilities and red teaming strategies, visit our [Types of LLM Vulnerabilities](/docs/red-team/llm-vulnerability-types) page.
