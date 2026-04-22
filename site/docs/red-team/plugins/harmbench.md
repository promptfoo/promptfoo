---
sidebar_label: HarmBench
description: Red team LLM safety using HarmBench's 400 harmful behavior tests, with filters for specific semantic and functional categories
---

# HarmBench Plugin

The HarmBench plugin uses the [HarmBench dataset](https://github.com/centerforaisafety/HarmBench/tree/main/data/behavior_datasets) published by the [Center for AI Safety](https://www.safe.ai/) to test LLM responses to harmful prompts. The dataset evaluates models across 400 key harmful behaviors including:

- Chemical and biological threats (e.g., dangerous substances, weapons)
- Illegal activities (e.g., theft, fraud, trafficking)
- Misinformation and conspiracy theories
- Harassment and hate speech
- General harmful requests
- Cybercrime (e.g., malware, system exploitation)
- Copyright violations

Unlike many of our other plugins, the HarmBench plugin uses a statically generated dataset vs dynamically generating cases such as those for [Harmful behavior detection](harmful.md) (which was partially based on HarmBench's classifications for harmful behavior), [excessive agency](excessive-agency.md), [hallucination](hallucination.md) and others. It is still however a great tool but not something that can be used in lieu of a constantly evolving, dynamically generated set of test cases.

## Configuration

To include the HarmBench plugin in your LLM red teaming setup:

```yaml
redteam:
  plugins:
    - harmbench
```

You can control the number of test cases using the `numTests` parameter:

```yaml
redteam:
  plugins:
    - id: harmbench
      numTests: 25 # The default is 5, but you can define the limit here.
```

### Filtering by Category

You can run a subset of HarmBench by filtering the dataset's semantic categories:

```yaml
redteam:
  plugins:
    - id: harmbench
      numTests: 20
      config:
        categories:
          - cybercrime_intrusion
          - misinformation_disinformation
```

The available semantic categories are:

- `chemical_biological`
- `copyright`
- `cybercrime_intrusion`
- `harassment_bullying`
- `harmful`
- `illegal`
- `misinformation_disinformation`

Common aliases such as `cybercrime`, `misinformation`, and `chemical and biological` are also accepted and normalized to the canonical values above.

### Filtering by Functional Category

HarmBench also distinguishes between `standard`, `contextual`, and `copyright` behaviors. You can filter by those functional slices as well:

```yaml
redteam:
  plugins:
    - id: harmbench
      numTests: 20
      config:
        categories:
          - misinformation
        functionalCategories:
          - contextual
```

When you set both semantic and functional filters, Promptfoo generates tests from the matching intersection.

The available functional categories are:

- `standard`
- `contextual`
- `copyright`

## References

- [HarmBench Paper](https://arxiv.org/abs/2402.04249)
- [HarmBench Dataset](https://github.com/centerforaisafety/HarmBench/tree/main/data/behavior_datasets)
- [Center for AI Safety](https://www.safe.ai/)

## Related Concepts

- [Types of LLM Vulnerabilities](../llm-vulnerability-types.md)
- [Evaluating LLM safety with HarmBench](/docs/guides/evaling-with-harmbench)
- [Harmful Content Plugin](harmful.md)
- [BeaverTails Plugin](beavertails.md)
- [CyberSecEval Plugin](cyberseceval.md)
- [Pliny Plugin](pliny.md)

For a comprehensive overview of LLM vulnerabilities and red teaming strategies, visit our [Types of LLM Vulnerabilities](/docs/red-team/llm-vulnerability-types) page.
