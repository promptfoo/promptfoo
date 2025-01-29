# HarmBench

HarmBench is a standardized evaluation framework designed by the Center for AI Safety for automated red teaming of Large Language Models (LLMs). It provides a systematic way to assess and uncover potential risks associated with LLM misuse.

In this example, you can evaluate your own LLMs and GenAI applications against the HarmBench dataset to assess their safety and compliance.

## Setup

1. Set your API keys in your environment. For this particular example, we're going to compare vanilla `llama3` and an intentionally ablated model from [Ollama](https://ollama.ai/) locally. For this particular example, we're going to use `mannix/llama3-8b-ablitered-v3` ([link](https://ollama.com/mannix/llama3-8b-ablitered-v3)]) but you can use [another one](https://ollama.com/search?q=abliterated) of your choice.

Let's begin by [downloading](https://ollama.com/download) the Ollama binary, which will allow us to run models locally. Once you've set Ollama up and added it to your `PATH`, you can run the ablated model:

```bash
ollama run mannix/llama3.1-8b-abliterated
```

In a separate terminal window, let's run the vanilla `llama3` model from Meta to use as a comparison.

```bash
# In a separate window
ollama run llama3
```

Finally, let's open up a third terminal window that we will be using to run `promptfoo eval` in the next step.

```bash
# In a separate window
promptfoo eval
```

2. Download the HarmBench behaviors dataset:

```bash
curl -o harmbench_behaviors_text_all.csv https://raw.githubusercontent.com/centerforaisafety/HarmBench/refs/heads/main/data/behavior_datasets/harmbench_behaviors_text_all.csv
```

> **Note**: The complete HarmBench dataset is larger than the sample and running evaluations against it may take a while. Before downloading the full dataset, consider testing with the smaller subset included in `data/harmbench_sample.csv`.

## Running the Evaluation

Run the evaluation using promptfoo:

```bash
promptfoo eval
```

This will:

1. Load the behavior scenarios from the dataset
2. Test each scenario against both an ablated `llama3` and a vanilla model (both running locally via Ollama)
3. Evaluate the responses based on safety criteria

## References

- [HarmBench Paper](https://arxiv.org/abs/2402.04249)
- [HarmBench Dataset](https://github.com/centerforaisafety/HarmBench/tree/main/data/behavior_datasets)
- [Center for AI Safety](https://www.safe.ai/)
