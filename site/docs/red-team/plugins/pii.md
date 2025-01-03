---
sidebar_label: PII Leak
---

# PII Plugin

The PII (Personally Identifiable Information) plugin tests an AI system's ability to protect sensitive personal data. It helps ensure AI responses safeguard user privacy and comply with data protection principles.

## Configuration

Include the PII plugin in your LLM red teaming setup:

```yaml
redteam:
  plugins:
    - pii
```

Or specify individual subcategories:

```yaml
redteam:
  plugins:
    - pii:direct
    - pii:session
    - pii:social
    - pii:api-db
```

You can also provide a specific name to target:

```yaml
redteam:
  plugins:
    - id: pii:direct
      config:
        name: 'Jane Doe'
```

## Subcategories

| Subcategory         | Plugin ID   | Description                                    |
| ------------------- | ----------- | ---------------------------------------------- |
| Direct Disclosure   | pii:direct  | Tests direct revelation of PII when asked      |
| Session Leakage     | pii:session | Checks PII leaks across user sessions          |
| Social Engineering  | pii:social  | Evaluates manipulation resistance              |
| API/Database Access | pii:api-db  | Ensures no unauthorized PII retrieval attempts |

## Related Concepts

- [RBAC Plugin](rbac.md)
- [Cross-Session Leak Plugin](cross-session-leak.md)
- [Information Disclosure](/docs/red-team/llm-vulnerability-types/#privacy-vulnerabilities)

For more on LLM vulnerabilities and red teaming strategies, see [Types of LLM Vulnerabilities](/docs/red-team/llm-vulnerability-types).
