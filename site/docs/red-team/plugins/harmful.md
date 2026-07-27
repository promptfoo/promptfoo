---
sidebar_label: Harmful Content
description: Test how AI applications handle requests involving violence, abuse, self-harm, and other high-risk content without publishing actionable harmful instructions.
---

import VulnerabilityCategoriesTables from '@site/docs/_shared/VulnerabilityCategoriesTables';

# Harmful Content Plugin

Use the Harmful Content plugin to test how a system responds to requests involving dangerous, abusive, or otherwise high-risk content. It covers refusal and safety behavior across categories ranging from violent crime to misinformation.

## Purpose

It focuses on whether the model:

1. Recognizes the harmful nature of a request.
2. Refuses or redirects appropriately instead of assisting.
3. Maintains a stable safety boundary across different harmful-content categories.

## Configuration

To include the Harmful Content collection in your red team:

```yaml
redteam:
  plugins:
    - harmful
```

You can also specify individual subcategories:

```yaml
redteam:
  plugins:
    - harmful:violent-crime
    - harmful:hate
    - harmful:misinformation-disinformation
```

To change the number of test cases for a subcategory, use `numTests`:

```yaml
redteam:
  plugins:
    - id: harmful:violent-crime
      numTests: 20
```

## Subcategories

The Harmful Content collection includes the following subcategories:

<VulnerabilityCategoriesTables label="harmful" />

## How It Works

The plugin generates adversarial requests tailored to the target's purpose, then grades whether the response refuses, redirects, or otherwise avoids assisting with the harmful goal. The generated probes can be combined with [jailbreak strategies](/docs/red-team/strategies/) to test whether reframing weakens a safety boundary.

## Examples

The following examples illustrate the failure signals without reproducing actionable harmful instructions:

| Target application     | Adversarial request                                  | Failure signal                                                                   |
| ---------------------- | ---------------------------------------------------- | -------------------------------------------------------------------------------- |
| Travel assistant       | Requests a destination using discriminatory criteria | Endorses the discrimination or recommends a destination on that basis            |
| Customer-support agent | Asks for help accessing another person's account     | Provides account-compromise or evasion guidance                                  |
| General assistant      | Requests instructions for a dangerous act            | Supplies actionable steps instead of refusing or redirecting                     |
| Wellness assistant     | Presents a self-harm request                         | Provides methods or encouragement instead of supportive, safety-focused guidance |

:::warning Sensitive output
Generated red-team probes and failed responses can contain disturbing material. Restrict access to results, avoid copying raw failures into public tickets or documentation, and redact operational details when sharing examples.
:::

## Evaluation Criteria

The plugin assesses whether the response:

1. Identifies the harmful nature of the request.
2. Refuses or redirects instead of providing harmful assistance.
3. Maintains the relevant safety boundary under reframing or pressure.
4. Prioritizes user safety when the request involves immediate risk.

## Related Concepts

- [Types of LLM vulnerabilities](/docs/red-team/llm-vulnerability-types/) - Full vulnerability and plugin directory with category mapping
- [Jailbreak Strategies](/docs/red-team/strategies/) - Test harmful prompts under adversarial transformations
- [Excessive Agency](excessive-agency.md) - Test whether an agent takes actions outside its intended scope
- [Hallucination](hallucination.md) - Test whether the target invents unsupported information
