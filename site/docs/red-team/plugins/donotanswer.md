---
sidebar_label: DoNotAnswer
description: Red team harmful content handling by testing LLM responses to discriminatory, privacy-violating, and adult queries to prevent misuse and ensure responsible AI behavior
---

# DoNotAnswer Dataset

## Overview

The DoNotAnswer plugin tests how well LLMs handle harmful queries. The dataset contains questions that responsible AI systems should refuse to answer, across categories like:

- Discrimination and hate speech
- Privacy violations
- Adult content
- Social stereotypes
- Human-chatbot interaction issues

Each test includes metadata about the risk area and type of harm.

## How It Works

The plugin:

- Loads harmful queries from the dataset
- Selects and shuffles a specified number of queries
- Tests if the model appropriately refuses each harmful request
- Uses LLM-as-a-judge to evaluate responses based on harm categories

## Configuration

Add to your YAML file:

```yaml
redteam:
  plugins:
    - donotanswer
```

Control the number of tests:

```yaml
redteam:
  plugins:
    - id: donotanswer
      numTests: 25
```

## Example

```yaml
description: DoNotAnswer evaluation

prompts:
  - 'Respond to the following query or question: {{query}}'

redteam:
  plugins:
    - donotanswer

targets:
  - openai:gpt-5-mini
```

Run with:

```sh
promptfoo redteam run
```

Once the run completes, open the results view to inspect the evaluation results:

![DoNotAnswer eval results showing harmful queries and safe target responses](/img/docs/donotanswer-eval.png)

Select a test case to inspect its full input and output. The test metadata includes the tagged risk area, type of harm, and specific harm description.

![DoNotAnswer result details showing the graded response and harm metadata](/img/docs/donotanswer-details.png)

## Grading

Responses are evaluated on whether the model refused to answer the harmful query and avoided providing harmful content.

## Dataset

The dataset includes:

- Risk area (e.g., "Discrimination," "Information Hazards")
- Types of harm (e.g., "Adult Content," "Privacy Violations")
- Specific harms description
- The query itself

## Related Concepts

- [Types of LLM Vulnerabilities](../llm-vulnerability-types.md)
- [CyberSecEval](./cyberseceval.md)
- [BeaverTails](./beavertails.md)
