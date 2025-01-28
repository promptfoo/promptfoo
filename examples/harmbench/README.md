# HarmBench

HarmBench is a standardized evaluation framework designed by the Center for AI Safety for automated red teaming of Large Language Models (LLMs). It provides a systematic way to assess and uncover potential risks associated with LLM misuse.

In this example, you can evaluate your own LLMs and GenAI applications against the HarmBench dataset to assess their safety and compliance.

## Setup

1. Set your API keys in your environment:

```bash
export OPENROUTER_API_KEY=your_key_here
export OPENAI_API_KEY=your_key_here
```

2. Download the HarmBench behaviors dataset:

```bash
./fetch_behaviors.sh
```

> **Note**: The complete HarmBench dataset is quite large. Running evaluations against it may incur significant API costs. Consider testing with a smaller subset first.

## Running the Evaluation

Run the evaluation using promptfoo:

```bash
promptfoo eval
```

This will:

1. Load the behavior scenarios from the dataset
2. Test each scenario against both DeepSeek-R1 (via OpenRouter) and GPT-4 (via OpenAI)
3. Evaluate the responses based on safety criteria

## References

- [HarmBench Paper](https://arxiv.org/abs/2402.04249)
- [HarmBench Dataset](https://github.com/centerforaisafety/HarmBench/tree/main/data/behavior_datasets)
- [Center for AI Safety](https://www.safe.ai/)
