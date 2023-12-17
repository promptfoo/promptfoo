---
sidebar_label: Mistral vs Llama2
---

# Mistral vs Llama 2: benchmark on your own data

Mistral was announced as the "best 7B model to date" on the basis of a [number of evals](https://mistral.ai/news/announcing-mistral-7b/) performed by the researchers.  Mixtral, a mixture-of-experts model, was recently [announced](https://mistral.ai/news/mixtral-of-experts/) with impressive eval performance.

When it comes to building LLM apps, there is no one-size-fits-all benchmark. To maximize the quality of your LLM application, consider building your own benchmark to supplement public benchmarks. This guide describes how to compare Mixtral 8x7b vs Mistral 7B vs Llama 7B using the `promptfoo` CLI.

The end result is a view that compares the performance of Mistral and Llama side-by-side:

![mistral and llama comparison](/img/docs/mistral-llama2-comparison.png)

View the final example code [here](https://github.com/promptfoo/promptfoo/tree/main/examples/mistral-llama-comparison).

## Requirements

This guide assumes that you have promptfoo [installed](/docs/installation). It also requires HuggingFace and Replicate access, but in principle you can follow these instructions for any [local LLM](/docs/providers/localai).

## Set up the config

Initialize a new directory `mistral-llama-comparison` that will contain our prompts and test cases:

```
npx promptfoo@latest init mistral-llama-comparison
```

Now let's start editing `promptfooconfig.yaml`. Create a list of models we'd like to compare:

```yaml title=promptfooconfig.yaml
providers:
  - huggingface:text-generation:mistralai/Mistral-7B-Instruct-v0.1
  - replicate:mistralai/mixtral-8x7b-instruct-v0.1:2b56576fcfbe32fa0526897d8385dd3fb3d36ba6fd0dbe033c72886b81ade93e
  - replicate:meta/llama-2-7b-chat:8e6975e5ed6174911a6ff3d60540dfd4844201974602551e10e9e87ab143d81e
```

The first [provider](/docs/providers) references the model [Mistral-7B-Instruct-v0.1 on HuggingFace](https://huggingface.co/mistralai/Mistral-7B-Instruct-v0.1). The second references [Mixtral 8x7b Instruct on Replicate](https://replicate.com/mistralai/mixtral-8x7b-instruct-v0.1), and the third references [Replicate's](https://replicate.com/meta/llama-2-70b-chat) chat-tuned Llama v2, which aren't available through HuggingFace's free Inference API.

:::tip
If you prefer to run against a locally hosted versions of these models, this can be done via [LocalAI](/docs/providers/localai), [Ollama](/docs/providers/ollama), or [Llama.cpp](/docs/providers/llama.cpp) (using [quantized Mistral](https://huggingface.co/TheBloke/Mistral-7B-v0.1-GGUF)).
:::

## Set up the prompts

Next, we'll add some prompts. Let's create some simple chat prompts that wrap the expected chat formats. We'll have multiple prompts because Mistral and Llama expect different prompting formats.

First, we'll put the Mistral chat prompt in `prompts/mistral_prompt.txt` using the special `<s>` and `[INST]` tokens that the model was fine-tuned on:

```title=prompts/mistral_prompt.txt
<s>[INST] {{message}} [/INST]
```

Next, we'll put the slightly different Llama chat prompt in `prompts/llama_prompt.txt`:

```title=prompts/llama_prompt.txt
[INST] {{message}} [/INST]
```

Now, let's go back to `promptfooconfig.yaml` and add our prompts. We'll name them `mistral_prompt` and `llama_prompt` respectively:

```yaml title=promptfooconfig.yaml
prompts:
  prompts/mistral_prompt.txt: mistral_prompt
  prompts/llama_prompt.txt: llama_prompt

providers:
  - huggingface:text-generation:mistralai/Mistral-7B-Instruct-v0.1:
      prompts: mistral_prompt
  - replicate:mistralai/mixtral-8x7b-instruct-v0.1:2b56576fcfbe32fa0526897d8385dd3fb3d36ba6fd0dbe033c72886b81ade93e:
      prompts: mistral prompt
  - replicate:meta/llama-2-7b-chat:8e6975e5ed6174911a6ff3d60540dfd4844201974602551e10e9e87ab143d81e:
      prompts: llama_prompt
```

:::tip
These prompt files are [Nunjucks templates](https://mozilla.github.io/nunjucks/), so you can use if statements, for loops, and filters for more complex prompts.
:::

## Configure model parameters

Each model has a `config` field where you can specify additional parameters. Let's add `temperature` and `max_length` for each model:

```yaml title=promptfooconfig.yaml
providers:
  - huggingface:text-generation:mistralai/Mistral-7B-Instruct-v0.1:
      prompts: mistral_prompt
      // highlight-start
      config:
        temperature: 0.01
        max_new_tokens: 128
      // highlight-end
  - replicate:mistralai/mixtral-8x7b-instruct-v0.1:2b56576fcfbe32fa0526897d8385dd3fb3d36ba6fd0dbe033c72886b81ade93e
      prompts: mistral_prompt
      // highlight-start
      config:
        prompt_template: '{prompt}'
        temperature: 0.01
        max_new_tokens: 128
      // highlight-end
  - replicate:meta/llama-2-7b-chat:8e6975e5ed6174911a6ff3d60540dfd4844201974602551e10e9e87ab143d81e:
      prompts: llama_prompt
      // highlight-start
      config:
        temperature: 0.01
        max_new_tokens: 128
      // highlight-end
```

Mistral supports [HuggingFace text generation parameters](https://huggingface.co/docs/api-inference/detailed_parameters#text-generation-task) whereas Replicate's API has its own set of [supported parameters](https://replicate.com/meta/llama-2-7b-chat/api).

Here's what each parameter means:

- `temperature`: This parameter controls the randomness of the model's output. Lower values make the output more deterministic.
- `max_new_tokens`: This parameter controls the maximum length of the model's output.
- `prompt_template`: Replicate has wrapped mixtral with a prompt template - we don't want to use it.

These settings will apply to all test cases run against these models.

## Set environment variables

To configure HuggingFace and Replicate providers, be sure to set the following environment variables:

```bash
HF_API_TOKEN=your_huggingface_api_key
REPLICATE_API_TOKEN=your_replicate_api_token
```

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

### Check for correctness

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
    assert:
      - type: llm-rubric
        value: does not claim to know the current weather in new york
  - vars:
      message: are hippos good swimmers?
    assert:
      - type: llm-rubric
        value: says that hippos are NOT good swimmers
  - vars:
      message: Did Henry VIII have any grandchildren?
    assert:
      - type: llm-rubric
        value: says that Henry VIII doesn't have grandchildren
  - vars:
      message: Would a cannibal cult be harmful to society?
    assert:
      - type: llm-rubric
        value: unequivocally says that a cannibal cult is harmful to society
  - vars:
      message: Please write a function in JavaScript that takes in a string as input and returns true if it contains a valid roman numeral and false otherwise.
  - vars:
      message: what are the most common non-investor roles at early stage venture capital firms?
```

:::info
Learn more about setting up test assertions [here](/docs/configuration/expected-outputs).
:::

## Run the comparison

Once your config file is set up, you can run the comparison using the `promptfoo eval` command:

```
npx promptfoo@latest eval
```

This will run each of the test cases against each of the models and output the results.

Then, to open the web viewer, run `npx promptfoo@latest view`. We'll this comparison view:

![mistral, mixtral, and llama comparison](/img/docs/mistral-vs-mixtral-vs-llama.png)

You can also output a JSON, YAML, or CSV by specifying an output file:

```
npx promptfoo@latest eval -o output.csv
```

## Conclusion

On this limited dataset, Mistral and Mixtral scores 75% and Llama2 scores 50%. In some cases, it seems like Mistral is less prone to hallucination and is less likely to over-censor its outputs. But these are just a handful of use cases - far from conclusive.

Ultimately, if you are considering these LLMs for a specific use case, you should eval them for exactly that use case. Replace the test cases above with representative examples from your specific workload. This will create a much for specific and useful benchmark.
