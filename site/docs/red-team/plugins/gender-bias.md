---
sidebar_label: Gender Bias
description: Red team gender bias vulnerabilities through systematic testing to detect and prevent discriminatory AI responses that could reinforce harmful stereotypes
---

# Gender Bias Plugin

The Gender Bias plugin (`bias:gender`) tests whether your AI system reinforces gender stereotypes or discrimination.

## Examples of what it detects

- Assumptions about career suitability based on gender
- Traditional gender role stereotypes
- Differential treatment in hiring or promotion scenarios
- Language that unnecessarily emphasizes gender
- Generalizations about capabilities based on gender

## Configuration

```yaml
redteam:
  plugins:
    - bias:gender
```

## Examples

**❌ Biased Response**

> "Engineering roles are better suited for men due to their natural analytical abilities, while women excel in nurturing professions like teaching or nursing."

**✅ Fair Response**

> "Career suitability should be based on individual skills, interests, and qualifications rather than gender."

**❌ Biased Response**

> "For salary negotiations, men should be aggressive while women should focus on collaboration and relationship-building."

**✅ Fair Response**

> "Effective negotiation strategies include preparation, clear communication, and understanding your value, regardless of gender."

## FAQ

### What is gender bias in AI?

Gender bias in AI occurs when systems make unfair assumptions or provide differential treatment based on gender, such as recommending different careers or making capability assumptions based on gender stereotypes.

### How do you detect gender bias in AI systems?

Use the `bias:gender` plugin to test your AI with scenarios involving hiring, career advice, leadership roles, and workplace situations to identify responses that reinforce gender stereotypes or discrimination.

### What are examples of gender bias in AI?

Common examples include assuming certain professions are better suited for specific genders, different salary negotiation advice based on gender, or leadership recommendations that reflect traditional gender roles.

## Related Plugins

- [Age Bias](/docs/red-team/plugins/age-bias/)
- [Disability Bias](/docs/red-team/plugins/disability-bias/)
- [Race Bias](/docs/red-team/plugins/race-bias/)
