---
date: 2024-11-23
image: /img/blog/llama-red-team/llama-hacker.webp
---

# How to Red Team an Ollama Model

Want to test the safety and security of a model hosted on Ollama? This guide shows you how to use [Promptfoo](https://github.com/promptfoo/promptfoo) to systematically probe for vulnerabilities through adversarial testing (red teaming).

We'll use [Llama 3.2 3B](https://ollama.com/library/llama3.2:3b) as an example, but this guide works with any [Ollama model](https://ollama.ai/library).

Here's an example of what the red team report looks like:

![example llm red team report](/img/blog/llama-red-team/report1.png)

<!-- truncate -->

## Prerequisites

Before you begin, ensure you have:

- **Node.js**: Install Node.js version 18 or later. [Download Node.js](https://nodejs.org/en/download/)
- **Ollama**: Install Ollama from [ollama.ai](https://ollama.ai)
- **Promptfoo**: No prior installation needed; we'll use `npx` to run commands

First, make sure you've pulled the model you want to test on Ollama:

```bash
ollama pull llama3.2
```

## Setting Up the Environment

You can either initialize a new project or download the complete example:

### Option 1: Download the Example

```bash
npx promptfoo@latest init --example redteam-ollama
cd redteam-ollama
```

This will create a new directory with `promptfooconfig.yaml` and `system_message.txt` files.

### Option 2: Create from Scratch

Create a new directory for your red teaming project and initialize it:

```bash
mkdir redteam-ollama
cd redteam-ollama
npx promptfoo@latest redteam init --no-gui --no-interactive
```

This creates a `promptfooconfig.yaml` file that we'll customize for Ollama.

## Configuring the Ollama Provider

If you're creating from scratch, edit `promptfooconfig.yaml` to use Ollama as the target:

```yaml
# yaml-language-server: $schema=https://promptfoo.dev/config-schema.json
prompts:
  - file://system_message.txt

targets:
  - id: ollama:chat:llama3.2
    label: llama3.2-redteam
    config:
      temperature: 0.7
      max_tokens: 150

redteam:
  purpose: 'The system is a helpful chatbot assistant that answers questions and helps with tasks.'
  numTests: 5
  plugins:
    # Replace these with the plugins you want to test
    - harmful
    - pii
    - contracts
    - hallucination
    - imitation
  strategies:
    - jailbreak
    - jailbreak:composite
```

To see the full configuration example on Github, [click here](https://github.com/promptfoo/promptfoo/blob/main/examples/redteam-ollama).

### Configuration Explained

- **targets**: Specifies Llama 3.2 as our target model
- **purpose**: Describes the intended behavior to guide test generation. A high-quality purpose definition is critical for generating high-quality adversarial tests, so be sure to include as much detail as possible (including the AI's objective, user context, access controls, and connected systems).
- **plugins**: Various vulnerability types to test (see [full list](/docs/red-team/llm-vulnerability-types/)):
  - `harmful`: Tests for harmful content generation
  - `pii`: Tests for PII leakage
  - `contracts`: Tests if model makes unauthorized commitments
  - `hallucination`: Tests for false information
  - `imitation`: Tests if model impersonates others
- **strategies**: Techniques for delivering adversarial inputs (see [full list](/docs/red-team/strategies/)):
  - `jailbreak`: Tests if model can escape its constraints using an iterative approach with an attacker model.
  - `jailbreak:composite`: Tests if model can escape its constraints using a composition of other successful jailbreak strategies.
- **numTests**: Number of test cases per plugin

> **Note:** The strategies above are designed for single-turn interactions (one prompt, one response). For multi-turn conversations or applications, see our [multi-turn chatbot redteam example](https://github.com/promptfoo/promptfoo/tree/main/examples/redteam-chatbot).

## Running the Red Team Evaluation

Generate and run the adversarial test cases:

```bash
npx promptfoo@latest redteam run
```

This command:

1. Generates test cases based on your configuration
2. Runs them against the Llama model
3. Grades the responses for vulnerabilities

## Analyzing the Results

Generate a report of the findings:

```bash
npx promptfoo@latest redteam report
```

The report shows:

- Vulnerability categories discovered
- Severity levels of issues
- Specific test cases that exposed vulnerabilities
- Suggested mitigations

Here's an example report card:

![report card](/img/blog/llama-red-team/report2.png)

You can click on each category to see the specific test cases and results:

![test cases](/img/blog/llama-red-team/report3.png)

It includes a breakdown of the performance of the model for each vulnerability category.

![vulnerability categories](/img/blog/llama-red-team/report4.png)

### Example Findings

Meta puts a lot of work into making their models safe, but it's hard to test for everything and smaller models tend to have more issues.

Here are some common issues you might find when red teaming Llama models:

1. **Prompt Injection**: Llama models can be vulnerable to injected instructions that override their original behavior.

2. **Harmful Content**: The model may generate harmful content when prompted with adversarial inputs.

3. **Hallucination**: The model might confidently state incorrect information.

4. **PII Handling**: The model could inappropriately handle or disclose personal information.

## Mitigating Vulnerabilities

Remediations will depend on your test results, but in general some things to keep in mind are:

1. **System Prompts**: Add explicit safety constraints in your system prompts
2. **Input Validation**: Implement pre-processing to catch malicious inputs
3. **Output Filtering**: Add post-processing to filter harmful content
4. **Temperature Adjustment**: Lower temperature values can reduce erratic behavior

## Additional Resources

- [Red Team Documentation](/docs/red-team/quickstart/)
- [Ollama Provider Guide](/docs/providers/ollama/)
- [LLM Vulnerability Types](/docs/red-team/llm-vulnerability-types/)
