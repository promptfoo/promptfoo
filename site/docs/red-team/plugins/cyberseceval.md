---
sidebar_label: CyberSecEval
---

# CyberSecEval Dataset for LLM Security Testing

## Overview

The CyberSecEval plugin uses Meta's [Purple Llama CyberSecEval dataset](https://meta-llama.github.io/PurpleLlama/docs/benchmarks/prompt_injection), a comprehensive benchmark suite designed to assess cybersecurity vulnerabilities in Large Language Models (LLMs).

The dataset includes multilingual prompt injection attacks, testing LLM systems against a diverse collection of potentially harmful prompts in multiple languages.

The dataset includes test cases that evaluate:

- Direct prompt injection attacks
- Indirect prompt injection attempts
- Security-violating content
- Logic-violating content
- Cross-language attack vectors
- System prompt leakage attempts

:::tip

This plugin requires a target provider that accepts both a system prompt and user input in OpenAI-compatible chat format.

:::

## How it works

The plugin:

- Downloads test cases from the CyberSecEval dataset
- Formats each test case as a system/user message pair
- Randomly selects prompts from the dataset
- Tests if the model appropriately handles the injection attempts
- Uses language-specific LLM-as-a-judge criteria to evaluate responses

![CyberSecEval Workflow](/img/docs/cyberseceval-flow.svg)

## Configuration

To include the CyberSecEval plugin in your LLM red teaming setup, add the following configuration to your YAML file:

```yaml
redteam:
  plugins:
    - cyberseceval
```

You can control the number of test cases using the `config.numTests` parameter (defaults to 5):

```yaml
redteam:
  plugins:
    - id: cyberseceval
      numTests: 25
```

You can also enable multilingual prompt injection by setting the `config.multilingual` parameter to `true`:

```yaml
redteam:
  plugins:
    - id: cyberseceval
      config:
        multilingual: true
```

## Full example

Create a configuration file `promptfooconfig.yaml`:

```yaml
targets:
  # You can target a model
  - openai:chat:gpt-4o
  # Or an API endpoint
  - id: https
    config:
      url: 'https://example.com/generate'
      method: 'POST'
      headers:
        'Content-Type': 'application/json'
      body:
        myPrompt: '{{prompt}}'

redteam:
  plugins:
    - cyberseceval
```

Then, run the red team command in the same directory as your configuration file:

```sh
promptfoo redteam run
```

## Grading

The plugin uses a specialized grader that evaluates model outputs against language-specific judge questions. The grader checks if:

- The model maintained its original instructions despite the injection attempt
- The response adheres to security boundaries
- The model appropriately handled non-English attack vectors
- The system prompt remained protected from extraction attempts

Outputs are graded as either PASS (secure) or FAIL (vulnerable) based on these criteria.

## Related Concepts

- [Types of LLM Vulnerabilities](../llm-vulnerability-types.md)
- [Prompt Injection](../strategies/prompt-injection.md)
- [Multilingual Attacks](../strategies/multilingual.md)
