---
sidebar_label: Llama 2 vs GPT benchmark
---

# Benchmark Llama 2 vs GPT on your own data

This guide describes how to compare three models - Llama v2 70B, GPT 3.5, and GPT 4 - using the `promptfoo` CLI.

LLM use cases vary widely and there is no one-size-fits-all benchmark. We'll use some dummy test cases from the [Hacker News thread on Llama 2](https://news.ycombinator.com/item?id=36774627), but you can substitute your own.

The end result is a view that compares the performance of Llama, GPT 3.5, and GPT 4 side-by-side:

![llama2 and gpt comparison](/img/docs/llama-gpt-comparison.png)

View the final example code [here](https://github.com/promptfoo/promptfoo/tree/main/examples/llama-gpt-comparison).

## Requirements

This guide assumes that you have promptfoo [installed](/docs/installation). It also requires OpenAI and Replicate access, but in principle you can follow these instructions for any local LLM.

## Set up the config

Initialize a new directory `llama-gpt-comparison` that will contain our prompts and test cases:

```
npx promptfoo@latest init llama-gpt-comparison
```

Now let's start editing `promptfooconfig.yaml`. First, we'll add the list of models we'd like to compare:

```yaml title=promptfooconfig.yaml
providers:
  - openai:gpt-3.5-turbo-0613
  - openai:gpt-4-turbo-0613
  - replicate:replicate/llama70b-v2-chat:e951f18578850b652510200860fc4ea62b3b16fac280f83ff32282f87bbd2e48
```

The first two [providers](/docs/providers) reference built-in OpenAI models. The third provider references the hosted [Replicate](https://replicate.com/replicate/llama70b-v2-chat) version of chat-tuned Llama v2 with 70 billion parameters.

If you prefer to run against a locally hosted version of Llama, this can be done via [LocalAI](/docs/providers/localai) or [Ollama](/docs/providers/ollama).

## Set up the prompts

Next, we'll add some prompts. Let's create some simple chat prompts that wrap the expected chat formats. We'll have multiple prompts because GPT and Llama expect different prompting formats.

First, we'll put the OpenAI chat prompts in `prompts/chat_prompt.json`:

```json title=prompts/chat_prompt.json
[
  {
    "role": "user",
    "content": "{{message}}"
  }
]
```

Next, we'll put the Llama chat prompt in `prompts/completion_prompt.txt`:

```title=prompts/completion_prompt.txt
User: {{message}}
Assistant:
```

Now, let's go back to `promptfooconfig.yaml` and add our prompts. We'll name them `chat_prompt` and `completion_prompt` respectively:

```yaml title=promptfooconfig.yaml
// highlight-start
prompts:
  prompts/chat_prompt.json: chat_prompt
  prompts/completion_prompt.txt: completion_prompt
// highlight-end

providers:
  - openai:gpt-3.5-turbo-0613
  - openai:gpt-4-turbo-0613
  - replicate:replicate/llama70b-v2-chat:e951f18578850b652510200860fc4ea62b3b16fac280f83ff32282f87bbd2e48
```

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
  - openai:gpt-3.5-turbo-0613:
      prompts: chat_prompt
      // highlight-start
      config:
        temperature: 0
        max_tokens: 128
      // highlight-end
  - openai:gpt-4-0613:
      prompts: chat_prompt
      // highlight-start
      config:
        temperature: 0
        max_tokens: 128
      // highlight-end
  - replicate:replicate/llama70b-v2-chat:e951f18578850b652510200860fc4ea62b3b16fac280f83ff32282f87bbd2e48:
      prompts: completion_prompt
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

```bash
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

![llama2 and gpt comparison](/img/docs/llama-gpt-comparison.png)

You can also output a CSV:

```
npx promptfoo@latest eval -o output.csv
```

Which produces a simple spreadsheet containing the eval results (view on [Google Sheets](https://docs.google.com/spreadsheets/d/1JLZ4e_1-CF6T7F7ROGLsSIirVuxYlPaCErYLs8T0at4/edit?usp=sharing)).

## Conclusion

In this example we've constructed, GPT-4 scores 87.50%, GPT-3.5 scores 75.00%, and Llama scores 62.50%.

But the key here is that your results may vary based on your LLM needs, so I encourage you to try it out for yourself and choose the model that is best for you.
