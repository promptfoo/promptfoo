---
title: Getting Started
description: Learn how to set up your first promptfoo config file, create prompts, configure providers, and run your first LLM evaluation.
keywords: [getting started, setup, configuration, prompts, providers, evaluation, llm testing]
sidebar_position: 5
---

import CodeBlock from '@theme/CodeBlock';
import Tabs from '@theme/Tabs';
import TabItem from '@theme/TabItem';

# Getting started

After [installing](/docs/installation) promptfoo, you can set up your first config file in two ways:

## Running the example

Set up your first config file with a pre-built example by running this command with [npx](https://nodejs.org/en/download), [npm](https://nodejs.org/en/download), or [brew](https://brew.sh/):

  <Tabs groupId="promptfoo-command">
    <TabItem value="npx" label="npx" default>
      <CodeBlock language="bash">
        npx promptfoo@latest init --example getting-started
      </CodeBlock>
    </TabItem>
    <TabItem value="npm" label="npm">
      <CodeBlock language="bash">
        {`npm install -g promptfoo
  promptfoo init --example getting-started`}
      </CodeBlock>
    </TabItem>
    <TabItem value="brew" label="brew">
      <CodeBlock language="bash">
        {`brew install promptfoo
  promptfoo init --example getting-started`}
      </CodeBlock>
    </TabItem>
  </Tabs>

This will create a new directory with a basic example that tests translation prompts across different models. The example includes:

- A configuration file `promptfooconfig.yaml` with sample prompts, providers, and test cases.
- A `README.md` file explaining how the example works.

## Starting from scratch

If you prefer to start from scratch instead of using the example, simply run `promptfoo init` without the `--example` flag:

<Tabs groupId="promptfoo-command">
  <TabItem value="npx" label="npx" default>
    <CodeBlock language="bash">
      npx promptfoo@latest init
    </CodeBlock>
  </TabItem>
  <TabItem value="npm" label="npm">
    <CodeBlock language="bash">
      promptfoo init
    </CodeBlock>
  </TabItem>
  <TabItem value="brew" label="brew">
    <CodeBlock language="bash">
      promptfoo init
    </CodeBlock>
  </TabItem>
</Tabs>

The command will guide you through an interactive setup process to create your custom configuration.

## Configuration

To configure your evaluation:

1. **Set up your prompts**: Open `promptfooconfig.yaml` and add prompts that you want to test. Use double curly braces for variable placeholders: `{{variable_name}}`. For example:

   ```yaml
   prompts:
     - 'Convert this English to {{language}}: {{input}}'
     - 'Translate to {{language}}: {{input}}'
   ```

   [&raquo; More information on setting up prompts](/docs/configuration/parameters)

2. Add `providers` to specify AI models you want to test. Promptfoo supports 50+ providers including OpenAI, Anthropic, Google, and many others:

   ```yaml
   providers:
     - openai:gpt-4.1
     - openai:o4-mini
     - anthropic:messages:claude-sonnet-4-20250514
     - vertex:gemini-2.5-pro
     # Or use your own custom provider
     - file://path/to/custom/provider.py
   ```

   Each provider is specified using a simple format: `provider_name:model_name`. For example:
   - `openai:gpt-4.1` for GPT-4.1
   - `openai:o4-mini` for OpenAI's o4-mini
   - `anthropic:messages:claude-sonnet-4-20250514` for Anthropic's Claude
   - `bedrock:us.meta.llama3-3-70b-instruct-v1:0` for Meta's Llama 3.3 70B via AWS Bedrock

   Most providers need authentication. For OpenAI:

   ```sh
   export OPENAI_API_KEY=sk-abc123
   ```

   You can use:
   - **Cloud APIs**: [OpenAI](/docs/providers/openai), [Anthropic](/docs/providers/anthropic), [Google](/docs/providers/google), [Mistral](/docs/providers/mistral), and [many more](/docs/providers)
   - **Local Models**: [Ollama](/docs/providers/ollama), [llama.cpp](/docs/providers/llama.cpp), [LocalAI](/docs/providers/localai)
   - **Custom Code**: [Python](/docs/providers/python), [JavaScript](/docs/providers/custom-api), or any [executable](/docs/providers/custom-script)

   [&raquo; See our full providers documentation](/docs/providers) for detailed setup instructions for each provider.

3. **Add test inputs**: Add some example inputs for your prompts. Optionally, add [assertions](/docs/configuration/expected-outputs) to set output requirements that are checked automatically.

   For example:

   ```yaml
   tests:
     - vars:
         language: French
         input: Hello world
     - vars:
         language: Spanish
         input: Where is the library?
   ```

   When writing test cases, think of core use cases and potential failures that you want to make sure your prompts handle correctly.

   [&raquo; More information on setting up tests](/docs/configuration/guide)

4. **Run the evaluation**: Make sure you're in the directory containing `promptfooconfig.yaml`, then run:

   <Tabs groupId="promptfoo-command">
     <TabItem value="npx" label="npx" default>
       <CodeBlock language="bash">
         npx promptfoo@latest eval
       </CodeBlock>
     </TabItem>
     <TabItem value="npm" label="npm">
       <CodeBlock language="bash">
         promptfoo eval
       </CodeBlock>
     </TabItem>
     <TabItem value="brew" label="brew">
       <CodeBlock language="bash">
         promptfoo eval
       </CodeBlock>
     </TabItem>
   </Tabs>

   This tests every prompt, model, and test case.

5. After the evaluation is complete, open the web viewer to review the outputs:

   <Tabs groupId="promptfoo-command">
     <TabItem value="npx" label="npx" default>
       <CodeBlock language="bash">
         npx promptfoo@latest view
       </CodeBlock>
     </TabItem>
     <TabItem value="npm" label="npm">
       <CodeBlock language="bash">
         promptfoo view
       </CodeBlock>
     </TabItem>
     <TabItem value="brew" label="brew">
       <CodeBlock language="bash">
         promptfoo view
       </CodeBlock>
     </TabItem>
   </Tabs>

![Promptfoo Web UI showing evaluation results](/img/getting-started-web-ui.png)

### Configuration

The YAML configuration format runs each prompt through a series of example inputs (aka "test case") and checks if they meet requirements (aka "assert").

Asserts are _optional_. Many people get value out of reviewing outputs manually, and the web UI helps facilitate this.

:::tip
See the [Configuration docs](/docs/configuration/guide) for a detailed guide.
:::

<details>
<summary>Show example YAML</summary>

```yaml title="promptfooconfig.yaml"
# yaml-language-server: $schema=https://promptfoo.dev/config-schema.json
description: Automatic response evaluation using LLM rubric scoring

# Load prompts
prompts:
  - file://prompts.txt
providers:
  - openai:gpt-4.1
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

## Examples

### Prompt quality

In [this example](https://github.com/promptfoo/promptfoo/tree/main/examples/self-grading), we evaluate whether adding adjectives to the personality of an assistant bot affects the responses.

You can quickly set up this example by running:

<Tabs groupId="promptfoo-command">
  <TabItem value="npx" label="npx" default>
    <CodeBlock language="bash">
      npx promptfoo@latest init --example self-grading
    </CodeBlock>
  </TabItem>
  <TabItem value="npm" label="npm">
    <CodeBlock language="bash">
      promptfoo init --example self-grading
    </CodeBlock>
  </TabItem>
  <TabItem value="brew" label="brew">
    <CodeBlock language="bash">
      promptfoo init --example self-grading
    </CodeBlock>
  </TabItem>
</Tabs>

Here is the configuration:

```yaml title="promptfooconfig.yaml"
# yaml-language-server: $schema=https://promptfoo.dev/config-schema.json
# Load prompts
prompts:
  - file://prompts.txt

# Set an LLM
providers:
  - openai:gpt-4.1

# These test properties are applied to every test
defaultTest:
  assert:
    # Ensure the assistant doesn't mention being an AI
    - type: llm-rubric
      value: Do not mention that you are an AI or chat assistant

    # Prefer shorter outputs using a scoring function
    - type: javascript
      value: Math.max(0, Math.min(1, 1 - (output.length - 100) / 900));

# Set up individual test cases
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

A simple `npx promptfoo@latest eval` will run this example from the command line:

![promptfoo command line](https://user-images.githubusercontent.com/310310/244891726-480e1114-d049-40b9-bd5f-f81c15060284.gif)

This command will evaluate the prompts, substituting variable values, and output the results in your terminal.

Have a look at the setup and full output [here](https://github.com/promptfoo/promptfoo/tree/main/examples/self-grading).

You can also output a nice [spreadsheet](https://docs.google.com/spreadsheets/d/1nanoj3_TniWrDl1Sj-qYqIMD6jwm5FBy15xPFdUTsmI/edit?usp=sharing), [JSON](https://github.com/promptfoo/promptfoo/blob/main/examples/simple-cli/output.json), YAML, or an HTML file:

<Tabs groupId="promptfoo-command">
  <TabItem value="npx" label="npx" default>
    <CodeBlock language="bash">
      npx promptfoo@latest eval -o output.html
    </CodeBlock>
  </TabItem>
  <TabItem value="npm" label="npm">
    <CodeBlock language="bash">
      promptfoo eval -o output.html
    </CodeBlock>
  </TabItem>
  <TabItem value="brew" label="brew">
    <CodeBlock language="bash">
      promptfoo eval -o output.html
    </CodeBlock>
  </TabItem>
</Tabs>

![Table output](https://user-images.githubusercontent.com/310310/235483444-4ddb832d-e103-4b9c-a862-b0d6cc11cdc0.png)

### Model quality

In [this next example](https://github.com/promptfoo/promptfoo/tree/main/examples/gpt-4o-vs-4o-mini), we evaluate the difference between GPT-4.1 and o4-mini outputs for a given prompt:

You can quickly set up this example by running:

<Tabs groupId="promptfoo-command">
  <TabItem value="npx" label="npx" default>
    <CodeBlock language="bash">
      npx promptfoo@latest init --example gpt-4o-vs-4o-mini
    </CodeBlock>
  </TabItem>
  <TabItem value="npm" label="npm">
    <CodeBlock language="bash">
      promptfoo init --example gpt-4o-vs-4o-mini
    </CodeBlock>
  </TabItem>
  <TabItem value="brew" label="brew">
    <CodeBlock language="bash">
      promptfoo init --example gpt-4o-vs-4o-mini
    </CodeBlock>
  </TabItem>
</Tabs>

```yaml title="promptfooconfig.yaml"
prompts:
  - file://prompt1.txt
  - file://prompt2.txt

# Set the LLMs we want to test
providers:
  - openai:o4-mini
  - openai:gpt-4.1
```

A simple `npx promptfoo@latest eval` will run the example. Also note that you can override parameters directly from the command line. For example, this command:

<Tabs groupId="promptfoo-command">
  <TabItem value="npx" label="npx" default>
    <CodeBlock language="bash">
      npx promptfoo@latest eval -p prompts.txt -r openai:o4-mini openai:gpt-4.1 -o output.html
    </CodeBlock>
  </TabItem>
  <TabItem value="npm" label="npm">
    <CodeBlock language="bash">
      promptfoo eval -p prompts.txt -r openai:o4-mini openai:gpt-4.1 -o output.html
    </CodeBlock>
  </TabItem>
  <TabItem value="brew" label="brew">
    <CodeBlock language="bash">
      promptfoo eval -p prompts.txt -r openai:o4-mini openai:gpt-4.1 -o output.html
    </CodeBlock>
  </TabItem>
</Tabs>

Produces this HTML table:

![Side-by-side evaluation of LLM model quality, gpt-4.1 vs o4-mini, html output](https://user-images.githubusercontent.com/310310/235490527-e0c31f40-00a0-493a-8afc-8ed6322bb5ca.png)

Full setup and output [here](https://github.com/promptfoo/promptfoo/tree/main/examples/gpt-4o-vs-4o-mini).

A similar approach can be used to run other model comparisons. For example, you can:

- Compare same models with different temperatures (see [GPT temperature comparison](https://github.com/promptfoo/promptfoo/tree/main/examples/gpt-4o-temperature-comparison))
- Compare Llama vs. GPT (see [Llama vs GPT benchmark](/docs/guides/compare-llama2-vs-gpt))
- Compare Retrieval-Augmented Generation (RAG) with LangChain vs. regular GPT-4 (see [LangChain example](/docs/configuration/testing-llm-chains))

## Additional Resources

- [&raquo; Configuration guide](/docs/configuration/guide) for detailed setup instructions
- [&raquo; Providers documentation](/docs/providers) for all supported AI models and services
- [&raquo; Assertions & Metrics](/docs/configuration/expected-outputs) for automatically assessing outputs

## More Examples

- There are many examples available in the [`examples/`](https://github.com/promptfoo/promptfoo/tree/main/examples) directory of our Github repository.

## Automatically assess outputs

The above [examples](https://github.com/promptfoo/promptfoo/tree/main/examples) create a table of outputs that can be manually reviewed. By setting up assertions, you can automatically grade outputs on a pass/fail basis.

For more information on automatically assessing outputs, see [Assertions & Metrics](/docs/configuration/expected-outputs).
