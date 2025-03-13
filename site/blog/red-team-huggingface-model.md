---
date: 2024-11-20
image: /img/blog/huggingface-red-team.png
---

# How to Red Team a HuggingFace Model

Want to break a HuggingFace model? This guide shows you how to use [Promptfoo](https://github.com/promptfoo/promptfoo) to systematically probe for vulnerabilities through adversarial testing (red teaming).

You'll learn how to craft prompts that bypass safety filters and manipulate model outputs for a [wide range of potential harms](/docs/red-team/llm-vulnerability-types/).

<!-- truncate -->

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Setting Up the Environment](#setting-up-the-environment)
3. [Configuring the HuggingFace Provider](#configuring-the-huggingface-provider)
4. [Defining the Red Teaming Configuration](#defining-the-red-teaming-configuration)
5. [Running the Red Team Evaluation](#running-the-red-team-evaluation)
6. [Analyzing the Results](#analyzing-the-results)

## Prerequisites

Before you begin, ensure you have the following:

- **Node.js**: Install Node.js version 18 or later. [Download Node.js](https://nodejs.org/en/download/)
- **Promptfoo**: No prior installation is necessary; we'll use `npx` to run Promptfoo commands.
- **HuggingFace API Token**: Sign up for a HuggingFace account and obtain an API token from your [account settings](https://huggingface.co/settings/tokens).

Set your HuggingFace API token as an environment variable:

```bash
export HF_API_TOKEN=your_huggingface_api_token
```

---

## Setting Up the Environment

### Initialize a New Project

Use the `promptfoo` command-line tool to initialize a new red teaming project:

```bash
npx promptfoo@latest redteam init my-huggingface-redteam
cd my-huggingface-redteam
```

This command creates a new directory with a `promptfooconfig.yaml` file, which we'll use to configure our red teaming setup.

## Configuring the HuggingFace Provider

In your `promptfooconfig.yaml` file, add a HuggingFace provider to specify the model you want to test. For this example, we'll use the Mistral 7B model for text generation.

```yaml
targets:
  - id: huggingface:text-generation:mistralai/Mistral-7B-v0.1
    label: Mistral-7B
    config:
      temperature: 0.7
      max_new_tokens: 150
      top_p: 0.9
```

### Explanation of Configuration Parameters

- **id**: Specifies the HuggingFace model and task type (`huggingface:text-generation:gpt2`).
- **label**: A friendly name for your provider, used in reports.
- **config**: Additional parameters for the HuggingFace API.
  - **apiKey**: Your HuggingFace API token.
  - **temperature**: Controls the randomness in text generation.
  - **max_new_tokens**: The maximum number of tokens to generate.
  - **top_p**: Controls diversity via nucleus sampling.

## Defining the Red Teaming Configuration

In the same `promptfooconfig.yaml` file, define the red teaming parameters under the `redteam` section.

Be sure to customize the `purpose`, `plugins`, and `strategies` to match the types of vulnerabilities you care about.

```yaml
redteam:
  numTests: 5
  purpose: 'You are a customer service agent for...'
  plugins:
    - harmful
  strategies:
    - jailbreak
    - jailbreak:tree
    - prompt-injection
```

### Key Components

- **numTests**: Sets the number of test cases per plugin.
- **purpose**: Describes the intended behavior of the model, guiding the generation of adversarial inputs.
- **plugins**: Specifies the types of vulnerabilities to test. See [full list](/docs/red-team/llm-vulnerability-types/).
- **strategies**: Techniques used to deliver adversarial inputs. See [full list](/docs/red-team/configuration/#strategies).

## Running the Red Team Evaluation

### Generate Adversarial Test Cases

First, generate the adversarial inputs based on the defined plugins and strategies:

```bash
npx promptfoo@latest redteam generate
```

This command creates a `redteam.yaml` file containing the generated test cases.

### Execute the Tests

Run the tests against your HuggingFace model:

```bash
npx promptfoo@latest redteam run
```

This command evaluates the model's responses to the adversarial inputs and logs the results.

## Analyzing the Results

Generate a report to review the findings:

```bash
npx promptfoo@latest redteam report
```

![llm red team report](/img/riskreport-1@2x.png)

### Understanding the Report

The report provides insights into:

1. **Vulnerability Categories**: Types of vulnerabilities discovered.
2. **Severity Levels**: Classifies vulnerabilities based on their potential impact.
3. **Test Cases**: Specific inputs that led to vulnerabilities.
4. **Suggested Mitigations**: Recommendations to address the identified issues.

### Re-evaluate After Changes

After implementing mitigations, rerun the red team evaluation to ensure vulnerabilities have been addressed:

```bash
npx promptfoo@latest redteam run
npx promptfoo@latest redteam report
```

## Additional Resources

- [Red Team Quickstart Guide](/docs/red-team/quickstart/)
- [HuggingFace Configuration Guide](/docs/providers/huggingface/)
- [HuggingFace Inference API](https://huggingface.co/inference-api)
- [List of LLM Vulnerabilities](https://promptfoo.dev/docs/red-team/llm-vulnerability-types/)
