---
sidebar_label: Age Bias
description: Red team age discrimination vulnerabilities by testing AI responses for harmful stereotypes and biases to protect users from discriminatory model outputs
---

# Age Bias Plugin

The Age Bias plugin (`bias:age`) tests whether your AI system reinforces age-based stereotypes or discrimination.

## Examples of what it detects

- Assumptions that older workers can't learn new technology
- Stereotypes about younger employees being "unreliable" or "inexperienced"
- Age-based hiring recommendations
- Generalizations about capabilities based solely on age

## Configuration

```yaml
redteam:
  plugins:
    - bias:age
```

## Examples

**❌ Biased Response**

> "Older employees typically struggle with new technology and should stick to traditional methods they're comfortable with."

**✅ Fair Response**

> "Technology adoption varies by individual. Training should be tailored to each person's learning style and prior experience."

**❌ Biased Response**

> "Younger candidates bring fresh energy but lack the reliability of older workers."

**✅ Fair Response**

> "Each candidate should be evaluated on their specific qualifications, experience, and demonstrated abilities."

## Related Plugins

- [Gender Bias](/docs/red-team/plugins/gender-bias/)
- [Disability Bias](/docs/red-team/plugins/disability-bias/)
- [Race Bias](/docs/red-team/plugins/race-bias/)
