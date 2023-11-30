---
sidebar_position: 5
---

import CodeBlock from '@theme/CodeBlock';
import Tabs from '@theme/Tabs';
import TabItem from '@theme/TabItem';

# Getting started

To get started, run this command:

<Tabs>
  <TabItem value="npx" label="npx" default>
    <CodeBlock language="bash">
      npx promptfoo@latest init
    </CodeBlock>
  </TabItem>
  <TabItem value="npm" label="npm" default>
    <CodeBlock language="bash">
      {`npm install -g promptfoo
promptfoo init`}
    </CodeBlock>
  </TabItem>
</Tabs>

This will create a `promptfooconfig.yaml` file in your current directory.

1. **Set up your prompts**: Open `promptfooconfig.yaml` and add 2 prompts that you want to compare. Use double curly braces as placeholders for variables: `{{variable_name}}`. For example:

   ```yaml
   prompts:
     - 'Convert this English to {{language}}: {{input}}'
     - 'Translate to {{language}}: {{input}}'
   ```

   [&raquo; More information on setting up prompts](/docs/configuration/parameters)

1. **Add test inputs**: Add some example inputs for your prompts. Optionally, add [assertions](/docs/configuration/expected-outputs) to automatically ensure that outputs meet your requirements.

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

1. Edit the `providers` field to specify the models (["providers"](/docs/providers)) you wish to test:

   ```yaml
   providers:
     - openai:gpt-3.5-turbo
     - openai:gpt-4
   ```

   Your preferred model may have configuration requirements.
   For example, if testing GPT with OpenAI's chat endpoint,
   you'll need to set the `OPENAI_API_KEY` environment variable
   (see [OpenAI provider docs](/docs/providers/openai) for more info):

   ```bash
   export OPENAI_API_KEY=sk-abc123
   ```

1. **Run the evaluation**: This tests every prompt for each test case:

   ```
   npx promptfoo@latest eval
   ```

1. After the evaluation is complete, open the web viewer to review the outputs:

   ```
   npx promptfoo@latest view
   ```

   [&raquo; More information on using the web viewer](/docs/usage/web-ui)

### Configuration

The YAML configuration format runs each prompt through a series of example inputs (aka "test case") and checks if they meet requirements (aka "assert").

Asserts are _optional_. Many people get value out of reviewing outputs manually, and the web UI helps facilitate this.

:::tip
See the [Configuration docs](/docs/configuration/guide) for a detailed guide.
:::

<details>
<summary>Show example YAML</summary>

```yaml
prompts: [prompts.txt]
providers: [openai:gpt-3.5-turbo]
tests:
  - description: First test case - automatic review
    vars:
      var1: first variable's value
      var2: another value
      var3: some other value
    assert:
      - type: equals
        value: expected LLM output goes here
      - type: function
        value: output.includes('some text')

  - description: Second test case - manual review
    # Test cases don't need assertions if you prefer to review the output yourself
    vars:
      var1: new value
      var2: another value
      var3: third value

  - description: Third test case - other types of automatic review
    vars:
      var1: yet another value
      var2: and another
      var3: dear llm, please output your response in json format
    assert:
      - type: contains-json
      - type: similar
        value: ensures that output is semantically similar to this text
      - type: model-graded-closedqa
        value: must contain a reference to X
```

</details>

## Examples

### Prompt quality

In [this example](https://github.com/promptfoo/promptfoo/tree/main/examples/self-grading), we evaluate whether adding adjectives to the personality of an assistant bot affects the responses.

Here is the configuration:

```yaml title=promptfooconfig.yaml
# Load prompts
prompts: [prompt1.txt, prompt2.txt]

# Set an LLM
providers: [openai:gpt-4-0613]

# These test properties are applied to every test
defaultTest:
  assert:
    # Verify that the output doesn't contain "AI language model"
    - type: not-contains
      value: AI language model

    # Verify that the output doesn't apologize, using model-graded eval
    - type: model-graded-closedqa
      value: must not contain an apology

    # Prefer shorter outputs using a scoring function
    - type: javascript
      value: Math.max(0, Math.min(1, 1 - (output.length - 100) / 900));

# Set up individual test cases
tests:
  - vars:
      name: Bob
      question: Can you help me find a specific product on your website?
    assert:
      - type: contains
        value: search
  - vars:
      name: Jane
      question: Do you have any promotions or discounts currently available?
    assert:
      - type: starts-with
        value: Yes
  - vars:
      name: Ben
      question: Can you check the availability of a product at a specific store location?
  # ...
```

A simple `npx promptfoo@latest eval` will run this example from the command line:

![promptfoo command line](https://user-images.githubusercontent.com/310310/244891726-480e1114-d049-40b9-bd5f-f81c15060284.gif)

<!--
<img width="1362" alt="Side-by-side evaluation of LLM prompt quality, terminal output" src="https://user-images.githubusercontent.com/310310/235329207-e8c22459-5f51-4fee-9714-1b602ac3d7ca.png">

![Side-by-side evaluation of LLM prompt quality, html output](https://user-images.githubusercontent.com/310310/235483444-4ddb832d-e103-4b9c-a862-b0d6cc11cdc0.png)
-->

This command will evaluate the prompts in `prompts.txt`, substituing variable values, and output the results in your terminal.

Have a look at the setup and full output [here](https://github.com/promptfoo/promptfoo/tree/main/examples/self-grading).

You can also output a nice [spreadsheet](https://docs.google.com/spreadsheets/d/1nanoj3_TniWrDl1Sj-qYqIMD6jwm5FBy15xPFdUTsmI/edit?usp=sharing), [JSON](https://github.com/typpo/promptfoo/blob/main/examples/simple-cli/output.json), YAML, or an HTML file:

```bash
npx promptfoo@latest eval -o output.html
```

![Table output](https://user-images.githubusercontent.com/310310/235483444-4ddb832d-e103-4b9c-a862-b0d6cc11cdc0.png)

### Model quality

In [this next example](https://github.com/typpo/promptfoo/tree/main/examples/gpt-3.5-vs-4), we evaluate the difference between GPT 3 and GPT 4 outputs for a given prompt:

```yaml title=promptfooconfig.yaml
prompts: [prompt1.txt, prompt2.txt]

# Set the LLMs we want to test
providers:
  - openai:gpt-3.5-turbo
  - openai:gpt-4
```

A simple `npx promptfoo@latest eval` will run the example. Also note that you can override parameters directly from the command line. For example, this command:

```bash
npx promptfoo@latest eval -p prompts.txt -r openai:gpt-3.5-turbo openai:gpt-4 -o output.html
```

Produces this HTML table:

![Side-by-side evaluation of LLM model quality, gpt3 vs gpt4, html output](https://user-images.githubusercontent.com/310310/235490527-e0c31f40-00a0-493a-8afc-8ed6322bb5ca.png)

Full setup and output [here](https://github.com/typpo/promptfoo/tree/main/examples/gpt-3.5-vs-4).

A similar approach can be used to run other model comparisons. For example, you can:

- Compare same models with different temperatures (see [GPT 3.5 temperature comparison](https://github.com/promptfoo/promptfoo/tree/main/examples/gpt-3.5-temperature-comparison))
- Compare Llama vs. GPT (see [Llama vs GPT benchmark](/docs/guides/compare-llama2-vs-gpt))
- Compare Retrieval-Augmented Generation (RAG) with LangChain vs. regular GPT-4 (see [LangChain example](https://promptfoo.dev/docs/configuration/testing-llm-chains))

## Other examples

There are many examples available in the [`examples/` directory](https://github.com/promptfoo/promptfoo/tree/main/examples) of our Github repository.

## Automatically assess outputs

The above examples create a table of outputs that can be manually reviewed. By setting up "Expected Outputs", you can automatically grade outputs on a pass/fail basis.

For more information on automatically assessing outputs, see [Expected Outputs](/docs/configuration/expected-outputs).
