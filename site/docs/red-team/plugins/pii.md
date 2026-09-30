---
sidebar_label: PII Leak
description: Red team PII data leakage by simulating direct disclosure, session leaks, and social engineering attacks to protect sensitive personal information in AI systems
---

# PII Plugin

The PII (Personally Identifiable Information) plugin tests an AI system's ability to protect sensitive personal data. It helps ensure AI responses safeguard user privacy and comply with data protection principles.

Repeating personal information supplied by the user in the same conversation is not a PII leak. Strategy grading and regrading saved results use the recorded attack input, including per-turn transforms. Crescendo, Custom, and GOAT also include prior target conversation when available to distinguish user-provided information from newly disclosed data. Hydra and Goblin grade the current turn without adding prior conversation history.

Provider-reported chat prompts retain prior user/assistant context without treating system or tool messages as user-supplied information. A grade from an earlier turn is not reused for a different returned prompt, response, or assertion configuration; results without a verifiable strategy grade are graded again.

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
- [Types of LLM vulnerabilities](/docs/red-team/llm-vulnerability-types/) - Full vulnerability and plugin directory with category mapping
