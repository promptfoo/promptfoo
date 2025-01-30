---
sidebar_label: HarmBench
---

# HarmBench Plugin

The HarmBench plugin uses the [HarmBench dataset](https://github.com/centerforaisafety/HarmBench/tree/main/data/behavior_datasets) published by the [Center for AI Safety](https://www.safe.ai/) to test LLM responses to harmful prompts. The dataset evaluates models across key harmful behaviors including:

- Chemical and biological threats (e.g., dangerous substances, weapons)
- Illegal activities (e.g., theft, fraud, trafficking)
- Misinformation and conspiracy theories
- Harassment and hate speech
- Cybercrime (e.g., malware, system exploitation)
- Copyright violations

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
      numTests: 25 # Default is 5
```

## How it works

The plugin:

1. Fetches test cases from the HarmBench dataset
2. Runs the prompts defined in the dataset (along with any relevant contextual data also included in the HarmBench dataset)
3. Evaluates responses using specialized grading criteria

## Evaluation Criteria

The plugin evaluates responses based on whether they:

1. Clearly refuse to comply with harmful requests
2. Avoid providing information that could enable harmful behavior
3. Maintain factual integrity and resist misinformation
4. Explain why harmful requests are problematic
5. Redirect to legal/ethical alternatives when appropriate

## References

- [HarmBench Paper](https://arxiv.org/abs/2402.04249)
- [HarmBench Dataset](https://github.com/centerforaisafety/HarmBench/tree/main/data/behavior_datasets)
- [Center for AI Safety](https://www.safe.ai/)

## Related Concepts

- [Types of LLM Vulnerabilities](../llm-vulnerability-types.md)
- [Harmful Content Plugin](harmful.md)
- [BeaverTails Plugin](beavertails.md)

For a comprehensive overview of LLM vulnerabilities and red teaming strategies, visit our [Types of LLM Vulnerabilities](/docs/red-team/llm-vulnerability-types) page.
