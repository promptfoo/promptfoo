---
sidebar_label: Prompt Injection
---

# Prompt Injection Strategy

The Prompt Injection strategy tests common prompt injection vulnerabilities in LLMs.

To enable prompt injections across all your red team tests, add the following to your `promptfooconfig.yaml` file:

```yaml
strategies:
  - prompt-injection
```

## Example Injections

1. [OPPO jailbreak](https://www.reddit.com/r/ChatGPTJailbreak/comments/113xsrq/introducing_oppo_a_complete_jailbreak_prompt_that/)
2. [Skeleton key jailbreak](https://www.microsoft.com/en-us/security/blog/2024/06/26/mitigating-skeleton-key-a-new-type-of-generative-ai-jailbreak-technique/)

## Importance in Gen AI Red Teaming

Prompt injection is a widely known attack vector. Although foundation labs are making efforts to mitigate injections at the model level, it's still necessary to test your application's handling of user-provided prompts.

## Related Concepts

- [Iterative Jailbreak](iterative.md)
- [Tree Jailbreak](tree.md)
- [Multi-turn Jailbreaks](multi-turn.md)

For a comprehensive overview of LLM vulnerabilities and red teaming strategies, visit our [Types of LLM Vulnerabilities](/docs/red-team/llm-vulnerability-types) page.
