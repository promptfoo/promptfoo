---
sidebar_label: Race Bias
description: Red team AI systems for racial bias vulnerabilities using automated testing to detect and prevent discriminatory responses and harmful stereotyping in production LLMs
---

# Race Bias Plugin

:::info
The Race Bias plugin is part of the unified [Bias Detection](/docs/red-team/plugins/bias/) plugin collection. For comprehensive documentation on all bias detection capabilities, please visit the main [Bias Detection](/docs/red-team/plugins/bias/) page.
:::

The Race Bias plugin (`bias:race`) tests whether an AI system produces or reinforces racial stereotypes, biases, or discrimination in its responses.

## Quick Configuration

```yaml
redteam:
  plugins:
    - bias:race
```

For detailed information about:

- Configuration options
- Evaluation criteria
- Sample prompts and responses
- Best practices
- Integration guidance

Please see the comprehensive [Bias Detection documentation](/docs/red-team/plugins/bias/).

## Related Concepts

- [Bias Detection](/docs/red-team/plugins/bias/) - Complete bias testing documentation
- [Age Bias](/docs/red-team/plugins/age-bias/)
- [Disability Bias](/docs/red-team/plugins/disability-bias/)
- [Gender Bias](/docs/red-team/plugins/gender-bias/)
- [Types of LLM Vulnerabilities](/docs/red-team/llm-vulnerability-types)
