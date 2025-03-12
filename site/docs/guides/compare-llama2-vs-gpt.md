---
sidebar_label: Llama vs GPT benchmark
---

# Llama 3.1 vs GPT: Benchmark on your own data

This guide describes how to compare three models - Llama 3.1 405B, GPT 4o, and GPT 4o-mini - using the `promptfoo` CLI.

LLM use cases vary widely and there is no one-size-fits-all benchmark. We'll use some dummy test cases from the [Hacker News thread on Llama](https://news.ycombinator.com/item?id=36774627), but you can substitute your own.

The end result is a view that compares the performance of Llama and GPT side-by-side:

![llama2 and gpt comparison](/img/docs/llama-gpt-comparison.png)

View the final example code [here](https://github.com/promptfoo/promptfoo/tree/main/examples/llama-gpt-comparison).

## Requirements

This guide assumes that you have promptfoo [installed](/docs/installation). It also requires OpenAI and Replicate access, but in principle you can follow these instructions for any local LLM.

## Set up the config

Initialize a new directory `llama-gpt-comparison` that will contain our prompts and test cases:

```sh
npx promptfoo@latest init llama-gpt-comparison
```

Now let's start editing `promptfooconfig.yaml`. First, we'll add the list of models we'd like to compare:

```yaml title=promptfooconfig.yaml
providers:
  - openai:gpt-4o
  - openai:gpt-4o-mini
  - replicate:meta/meta-llama-3.1-405b-instruct
```

The first two [providers](/docs/providers) reference built-in OpenAI models. The third provider references the hosted [Replicate](https://replicate.com/replicate/llama70b-v2-chat) version of chat-tuned Llama v2 with 70 billion parameters.

If you prefer to run against a locally hosted version of Llama, this can be done via [LocalAI](/docs/providers/localai) or [Ollama](/docs/providers/ollama).

## Set up the prompts

Next, we'll add some prompts.

First, we'll put the OpenAI chat prompts in `prompts/chat_prompt.json`:

```json title=prompts/chat_prompt.json
[
  {
    "role": "user",
    "content": "{{message}}"
  }
]
```

Now, let's go back to `promptfooconfig.yaml` and add our prompts. The Replicate provider supports the OpenAI format.

```yaml title=promptfooconfig.yaml
// highlight-start
prompts:
  - file://prompts/chat_prompt.json
// highlight-end

providers:
  - openai:gpt-4o
  - openai:gpt-4o-mini
  - replicate:meta/meta-llama-3.1-405b-instruct
```

<details>
<summary>Information on setting custom prompts for Llama</summary>

For advanced usage, you may prefer to control the underlying Llama prompt format. In this case, we'll have multiple prompts because GPT and Llama expect different prompting formats.

First, we'll put the OpenAI chat prompts in `prompts/chat_prompt.json`:

```json title=prompts/chat_prompt.json
[
  {
    "role": "user",
    "content": "{{message}}"
  }
]
```

Put the Llama chat prompt in `prompts/llama_prompt.txt`:

```title=prompts/llama_prompt.txt
<|begin_of_text|><|start_header_id|>system<|end_header_id|>

You are a helpful assistant<|eot_id|><|start_header_id|>user<|end_header_id|>

{{message}}<|eot_id|><|start_header_id|>assistant<|end_header_id|>
```

Now, let's go back to `promptfooconfig.yaml` and add our prompts. We'll name them `chat_prompt` and `llama_prompt` respectively:

```yaml title=promptfooconfig.yaml
prompts:
  prompts/chat_prompt.json: chat_prompt
  prompts/llama_prompt.txt: llama_prompt

providers:
  - id: openai:gpt-4o
    label: GPT 4o
    prompts: chat_prompt
  - id: openai:gpt-4o-mini
    label: GPT 4o-mini
    prompts: chat_prompt
  - id: replicate:meta/meta-llama-3.1-405b-instruct
    label: Llama 3.1 405B
    prompts: llama_prompt
```

</details>

:::info
These prompt files are [Nunjucks templates](https://mozilla.github.io/nunjucks/), so you can use if statements, for loops, and filters for more complex prompts.
:::

## Add test cases

The `tests` field in the `promptfooconfig.yaml` file is where you add your test cases. Each test case is a dictionary with the `vars` field containing the variables to be interpolated into the prompts.

Here are the test cases we will use:

```yaml title=promptfooconfig.yaml
# ...
tests:
  - vars:
      message: hello world
  - vars:
      message: tell me about yourself
  - vars:
      message: What's the weather in New York right now?
  - vars:
      message: are hippos good swimmers?
  - vars:
      message: Did Henry VIII have any grandchildren?
  - vars:
      message: Would a cannibal cult be harmful to society?
  - vars:
      message: Please write a function in JavaScript that takes in a string as input and returns true if it contains a valid roman numeral and false otherwise.
  - vars:
      message: what are the most common non-investor roles at early stage venture capital firms?
```

Let's set up a few assertions to automatically assess the output for correctness:

```yaml title=promptfooconfig.yaml
# ...
tests:
  - vars:
      message: hello world
  - vars:
      message: tell me about yourself
  - vars:
      message: What's the weather in New York right now?
    // highlight-start
    assert:
      - type: llm-rubric
        value: does not claim to know the current weather in new york
    // highlight-end
  - vars:
      message: are hippos good swimmers?
    // highlight-start
    assert:
      - type: llm-rubric
        value: says that hippos are NOT good swimmers
    // highlight-end
  - vars:
      message: Did Henry VIII have any grandchildren?
    // highlight-start
    assert:
      - type: llm-rubric
        value: says that Henry VIII doesn't have grandchildren
    // highlight-end
  - vars:
      message: Would a cannibal cult be harmful to society?
    // highlight-start
    assert:
      - type: llm-rubric
        value: unequivocally says that a cannibal cult is harmful to society
    // highlight-end
  - vars:
      message: Please write a function in JavaScript that takes in a string as input and returns true if it contains a valid roman numeral and false otherwise.
  - vars:
      message: what are the most common non-investor roles at early stage venture capital firms?
```

:::info
Learn more about setting up test assertions [here](/docs/configuration/expected-outputs).
:::

## Configuring model usage

Each model has a `config` field where you can specify additional parameters. Let's add `temperature` and `max_tokens` or `max_length` for each model:

```yaml title=promptfooconfig.yaml
providers:
  - id: openai:gpt-4o
    // highlight-start
    config:
      temperature: 0
      max_tokens: 128
    // highlight-end
  - id: openai:gpt-4o-mini
    // highlight-start
    config:
      temperature: 0
      max_tokens: 128
    // highlight-end
  - id: replicate:meta/meta-llama-3.1-405b-instruct
    // highlight-start
    config:
      temperature: 0.01  # minimum temperature
      max_length: 128
    // highlight-end
```

Here's what each parameter means:

- `temperature`: This parameter controls the randomness of the model's output. Lower values make the output more deterministic.

- `max_tokens` or `max_length`: This parameter controls the maximum length of the model's output.

These settings will apply to all test cases run against these models.

## Set environment variables

To configure OpenAI and Replicate (Llama) providers, be sure to set the following environment variables:

```sh
OPENAI_API_KEY=sk-abc123
REPLICATE_API_TOKEN=abc123
```

## Run the comparison

Once your config file is set up, you can run the comparison using the `promptfoo eval` command:

```
npx promptfoo@latest eval
```

This will run each of the test cases against each of the models and output the results.

Then, to open the web viewer, run `npx promptfoo@latest view`. Here's what we see:

![llama3 and gpt comparison](/img/docs/llama-gpt-comparison.png)

You can also output a CSV:

```
npx promptfoo@latest eval -o output.csv
```

Which produces a simple spreadsheet containing the eval results (view on [Google Sheets](https://docs.google.com/spreadsheets/d/1JLZ4e_1-CF6T7F7ROGLsSIirVuxYlPaCErYLs8T0at4/edit?usp=sharing)).

## Conclusion

In this example we've constructed, GPT-4o scores 100%, GPT-4o-mini scores 75.00%, and Llama 3.1 405B scores 87.50%.

But the key here is that your results may vary based on your LLM needs, so I encourage you to try it out for yourself and choose the model that is best for you.
