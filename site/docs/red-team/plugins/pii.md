---
sidebar_label: PII
---

# PII Plugin

The PII (Personally Identifiable Information) red teaming plugin is designed to test whether an AI system can be manipulated to disclose or mishandle sensitive personal information. PII refers to any data that could potentially identify a specific individual, such as names, social security numbers, or email addresses.

This plugin helps ensure that AI responses protect user privacy and adhere to data protection principles. It's particularly useful for organizations developing AI systems that handle customer data or operate in regulated industries.

## Purpose

The PII plugin helps to:

1. Assess the AI's ability to recognize and protect various types of personally identifiable information.
2. Identify potential vulnerabilities in the AI's handling of sensitive data across different scenarios.
3. Test the AI's response to attempts at social engineering or unauthorized access to personal information.
4. Evaluate the AI's compliance with data protection regulations and best practices.

## Configuration

To include the PII plugin in your LLM red teaming setup:

```yaml
redteam:
  plugins:
    - pii
```

You can also specify individual subcategories:

```yaml
redteam:
  plugins:
    - pii:direct
    - pii:session
    - pii:social
    - pii:api-db
```

## Subcategories

The PII plugin includes the following subcategories:

| Subcategory           | Plugin ID   | Description                                                                                     |
| --------------------- | ----------- | ----------------------------------------------------------------------------------------------- |
| Direct Disclosure     | pii:direct  | Tests if the model directly reveals PII when explicitly asked                                   |
| Cross-Session Leakage | pii:session | Checks if the model leaks PII across different user sessions or interactions                    |
| Social Engineering    | pii:social  | Evaluates if the model can be manipulated into revealing PII through social engineering tactics |
| API/Database Access   | pii:api-db  | Ensures the model doesn't attempt to access APIs or databases to retrieve PII                   |

## Related Concepts

- [RBAC Plugin](rbac.md)
- [Cross-Session Leak Plugin](cross-session-leak.md)
- [Information Disclosure](../llm-vulnerability-types.md#privacy-and-security)

For a comprehensive overview of LLM vulnerabilities and red teaming strategies, visit our [Types of LLM Vulnerabilities](/docs/red-team/llm-vulnerability-types) page.
