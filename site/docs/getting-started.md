---
title: Getting Started
description: Learn how to set up your first promptfoo config file, create prompts, configure providers, and run your first LLM evaluation.
keywords: [getting started, setup, configuration, prompts, providers, evaluation, llm testing]
sidebar_position: 5
---

import Tabs from '@theme/Tabs';
import TabItem from '@theme/TabItem';

# Getting started

After [installing](/docs/installation) promptfoo, you can set up your first config file in two ways:

## Running an example

Set up your first config file with a pre-built example by running this command with [npx](https://nodejs.org/en/download), [npm](https://nodejs.org/en/download), or [brew](https://brew.sh/):

  <Tabs groupId="promptfoo-command">
    <TabItem value="npx" label="npx" default>
      ```bash
      npx promptfoo@latest init --example getting-started
      ```
    </TabItem>
    <TabItem value="npm" label="npm">
      ```bash
      promptfoo init --example getting-started
      ```
    </TabItem>
    <TabItem value="brew" label="brew">
      ```bash
      promptfoo init --example getting-started
      ```
    </TabItem>
  </Tabs>

This will create a new directory with a [basic example](https://github.com/promptfoo/promptfoo/tree/main/examples/getting-started) that tests translation prompts across different models. The example includes:

- A configuration file `promptfooconfig.yaml` with sample prompts, providers, and test cases.
- A `README.md` file explaining how the example works.

Most providers need authentication. For OpenAI:

```sh
export OPENAI_API_KEY=sk-abc123
```

Then navigate to the example directory, run the eval, and view results:

<Tabs groupId="promptfoo-command">
  <TabItem value="npx" label="npx" default>
    ```bash
    cd getting-started
    npx promptfoo@latest eval
    npx promptfoo@latest view
    ```
  </TabItem>
  <TabItem value="npm" label="npm">
    ```bash
    cd getting-started
    promptfoo eval
    promptfoo view
    ```
  </TabItem>
  <TabItem value="brew" label="brew">
    ```bash
    cd getting-started
    promptfoo eval
    promptfoo view
    ```
  </TabItem>
</Tabs>

## Starting from scratch

If you prefer to start from scratch instead of using the example, simply run `promptfoo init` without the `--example` flag:

<Tabs groupId="promptfoo-command">
  <TabItem value="npx" label="npx" default>
    ```bash
    npx promptfoo@latest init
    ```
  </TabItem>
  <TabItem value="npm" label="npm">
    ```bash
    promptfoo init
    ```
  </TabItem>
  <TabItem value="brew" label="brew">
    ```bash
    promptfoo init
    ```
  </TabItem>
</Tabs>

The command will guide you through an interactive setup process to create your custom configuration.

## Configuration

To configure your evaluation:

1. **Set up your prompts**: Open `promptfooconfig.yaml` and add prompts that you want to test. Use double curly braces for variable placeholders: `{{variable_name}}`. For example:

   ```yaml
   prompts:
     - 'Convert the following English text to {{language}}: {{input}}'
   ```

   [&raquo; More information on setting up prompts](/docs/configuration/prompts)

2. Add `providers` to specify AI models you want to test. Promptfoo supports 60+ providers including OpenAI, Anthropic, Google, and many others:

   ```yaml
   providers:
     - openai:gpt-5.2
     - openai:gpt-5-mini
     - anthropic:messages:claude-opus-4-6
     - google:gemini-3-pro-preview
     # Or use your own custom provider
     - file://path/to/custom/provider.py
   ```

   This includes cloud APIs, local models like [Ollama](/docs/providers/ollama), and custom [Python](/docs/providers/python) or [JavaScript](/docs/providers/custom-api) code.

   [&raquo; See all providers](/docs/providers)

3. **Add test inputs**: Add some example inputs for your prompts. Optionally, add [assertions](/docs/configuration/expected-outputs) to set output requirements that are checked automatically.

   For example:

   ```yaml
   tests:
     - vars:
         language: French
         input: Hello world
       assert:
         - type: contains
           value: 'Bonjour le monde'
     - vars:
         language: Spanish
         input: Where is the library?
       assert:
         - type: icontains
           value: 'Dónde está la biblioteca'
   ```

   When writing test cases, think of core use cases and potential failures that you want to make sure your prompts handle correctly.

   [&raquo; More information on setting up tests](/docs/configuration/guide)

4. **Run the evaluation**: Make sure you're in the directory containing `promptfooconfig.yaml`, then run:

   <Tabs groupId="promptfoo-command">
     <TabItem value="npx" label="npx" default>
       ```bash
       npx promptfoo@latest eval
       ```
     </TabItem>
     <TabItem value="npm" label="npm">
      ```bash
      promptfoo eval
      ```
     </TabItem>
     <TabItem value="brew" label="brew">
      ```bash
      promptfoo eval
      ```
     </TabItem>
   </Tabs>

   This tests every prompt, model, and test case.

5. After the evaluation is complete, open the web viewer to review the outputs:

   <Tabs groupId="promptfoo-command">
     <TabItem value="npx" label="npx" default>
       ```bash
       npx promptfoo@latest view
       ```
     </TabItem>
     <TabItem value="npm" label="npm">
       ```bash
       promptfoo view
       ```
     </TabItem>
     <TabItem value="brew" label="brew">
       ```bash
       promptfoo view
       ```
     </TabItem>
   </Tabs>

![Promptfoo Web UI showing evaluation results](/img/docs/custom-example-view.png)

### Asserts

The YAML configuration format runs each prompt through a series of test cases and checks if they meet the specified [asserts](/docs/configuration/expected-outputs/).

Asserts are _optional_. Many people get value out of reviewing outputs manually, and the web UI helps facilitate this.

:::tip
See the [Configuration docs](/docs/configuration/guide) for a detailed guide.
:::

## Examples

### Prompt quality

In [this example](https://github.com/promptfoo/promptfoo/tree/main/examples/self-grading), we evaluate whether adding adjectives to the personality of an assistant bot affects the responses.

You can quickly set up this example by running:

<Tabs groupId="promptfoo-command">
  <TabItem value="npx" label="npx" default>
    ```bash
    npx promptfoo@latest init --example self-grading
    ```
  </TabItem>
  <TabItem value="npm" label="npm">
    ```bash
    promptfoo init --example self-grading
    ```
  </TabItem>
  <TabItem value="brew" label="brew">
    ```bash
    promptfoo init --example self-grading
    ```
  </TabItem>
</Tabs>

<details>
<summary>Show YAML file for this example</summary>

```yaml
# yaml-language-server: $schema=https://promptfoo.dev/config-schema.json
description: Automatic response evaluation using LLM rubric scoring

# Load prompts
prompts:
  - file://prompts.txt
providers:
  - openai:gpt-5.2
defaultTest:
  assert:
    - type: llm-rubric
      value: Do not mention that you are an AI or chat assistant
    - type: javascript
      # Shorter is better
      value: Math.max(0, Math.min(1, 1 - (output.length - 100) / 900));
tests:
  - vars:
      name: Bob
      question: Can you help me find a specific product on your website?
  - vars:
      name: Jane
      question: Do you have any promotions or discounts currently available?
  - vars:
      name: Ben
      question: Can you check the availability of a product at a specific store location?
  - vars:
      name: Dave
      question: What are your shipping and return policies?
  - vars:
      name: Jim
      question: Can you provide more information about the product specifications or features?
  - vars:
      name: Alice
      question: Can you recommend products that are similar to what I've been looking at?
  - vars:
      name: Sophie
      question: Do you have any recommendations for products that are currently popular or trending?
  - vars:
      name: Jessie
      question: How can I track my order after it has been shipped?
  - vars:
      name: Kim
      question: What payment methods do you accept?
  - vars:
      name: Emily
      question: Can you help me with a problem I'm having with my account or order?
```

</details>

From the newly created directory, run `npx promptfoo@latest eval` to execute this example:

![promptfoo command line](/img/docs/self-grading.gif)

This command will evaluate the prompts, substituting variable values, and output the results in your terminal.

You can also output a [spreadsheet](https://docs.google.com/spreadsheets/d/1nanoj3_TniWrDl1Sj-qYqIMD6jwm5FBy15xPFdUTsmI/edit?usp=sharing), [JSON](https://github.com/promptfoo/promptfoo/blob/main/examples/simple-cli/output.json), YAML or HTML.

### Model quality

In [this next example](https://github.com/promptfoo/promptfoo/tree/main/examples/openai-model-comparison), we evaluate the difference between GPT-5 and GPT-5.2 outputs for a given prompt:

You can quickly set up this example by running:

<Tabs groupId="promptfoo-command">
  <TabItem value="npx" label="npx" default>
    ```bash
    npx promptfoo@latest init --example openai-model-comparison
    ```
  </TabItem>
  <TabItem value="npm" label="npm">
    ```bash
    promptfoo init --example openai-model-comparison
    ```
  </TabItem>
  <TabItem value="brew" label="brew">
    ```bash
    promptfoo init --example openai-model-comparison
    ```
  </TabItem>
</Tabs>

<details>
<summary>Show YAML file for this example</summary>

```yaml
# yaml-language-server: $schema=https://promptfoo.dev/config-schema.json
description: Comparing OpenAI flagship and mini models performance on riddles

prompts:
  - 'Solve this riddle: {{riddle}}'

providers:
  - openai:gpt-5
  - openai:gpt-5-mini

defaultTest:
  assert:
    # Inference should always cost less than this (USD)
    - type: cost
      threshold: 0.002
    # Inference should always be faster than this (milliseconds)
    - type: latency
      threshold: 3000

tests:
  - vars:
      riddle: 'I speak without a mouth and hear without ears. I have no body, but I come alive with wind. What am I?'
    assert:
      # Make sure the LLM output contains this word
      - type: contains
        value: echo
      # Use model-graded assertions to enforce free-form instructions
      - type: llm-rubric
        value: Do not apologize
  - vars:
      riddle: "You see a boat filled with people. It has not sunk, but when you look again you don't see a single person on the boat. Why?"
    assert:
      - type: llm-rubric
        value: explains that there are no single people (they are all married)
  - vars:
      riddle: 'The more of this there is, the less you see. What is it?'
    assert:
      - type: contains
        value: darkness
  - vars:
      riddle: >-
        I have keys but no locks. I have space but no room. You can enter, but
        can't go outside. What am I?
  - vars:
      riddle: >-
        I am not alive, but I grow; I don't have lungs, but I need air; I don't
        have a mouth, but water kills me. What am I?
  - vars:
      riddle: What can travel around the world while staying in a corner?
  - vars:
      riddle: Forward I am heavy, but backward I am not. What am I?
  - vars:
      riddle: >-
        The person who makes it, sells it. The person who buys it, never uses
        it. The person who uses it, doesn't know they're using it. What is it?
  - vars:
      riddle: I can be cracked, made, told, and played. What am I?
  - vars:
      riddle: What has keys but can't open locks?
  - vars:
      riddle: >-
        I'm light as a feather, yet the strongest person can't hold me for much
        more than a minute. What am I?
  - vars:
      riddle: >-
        I can fly without wings, I can cry without eyes. Whenever I go, darkness
        follows me. What am I?
  - vars:
      riddle: >-
        I am taken from a mine, and shut up in a wooden case, from which I am
        never released, and yet I am used by almost every person. What am I?
  - vars:
      riddle: >-
        David's father has three sons: Snap, Crackle, and _____? What is the
        name of the third son?
  - vars:
      riddle: >-
        I am light as a feather, but even the world's strongest man couldn't
        hold me for much longer than a minute. What am I?
```

</details>

Navigate to the newly created directory and run `npx promptfoo@latest eval` or `promptfoo eval`. Also note that you can override parameters directly from the command line.

For example, if you run this command:

<Tabs groupId="promptfoo-command">
  <TabItem value="npx" label="npx" default>
    ```bash
    npx promptfoo@latest eval -r google:gemini-3-pro-preview google:gemini-2.5-pro
    ```
  </TabItem>
  <TabItem value="npm" label="npm">
    ```bash
    promptfoo eval -r google:gemini-3-pro-preview google:gemini-2.5-pro
    ```
  </TabItem>
  <TabItem value="brew" label="brew">
    ```bash
    promptfoo eval -r google:gemini-3-pro-preview google:gemini-2.5-pro
    ```
  </TabItem>
</Tabs>

It produces the following table, with Gemini models replacing the GPT models in the config:

![Side-by-side eval of LLM model quality, gemini-3.0-pro vs gemini-2.5](/img/cl-provider-override.png)

A similar approach can be used to run other model comparisons. For example, you can:

- Compare models with different temperatures (see [GPT temperature comparison](https://github.com/promptfoo/promptfoo/tree/main/examples/gpt-4o-temperature-comparison))
- Compare Llama vs. GPT (see [Llama vs GPT benchmark](/docs/guides/compare-llama2-vs-gpt))
- Compare Retrieval-Augmented Generation (RAG) with LangChain vs. regular GPT-4 (see [LangChain example](/docs/configuration/testing-llm-chains))

## Next steps

- [&raquo; Configuration guide](/docs/configuration/guide) for detailed setup instructions
- [&raquo; Providers documentation](/docs/providers) for all supported AI models and services
- [&raquo; Assertions & Metrics](/docs/configuration/expected-outputs) for automatically grading outputs on a pass/fail basis
- [&raquo; More examples](https://github.com/promptfoo/promptfoo/tree/main/examples) in our GitHub repository
