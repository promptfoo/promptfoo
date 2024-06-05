---
sidebar_label: Preventing hallucinations
---

# How to Measure and Prevent LLM Hallucinations

LLMs have great potential, but they are prone to generating incorrect or misleading information, a phenomenon known as hallucination. Factuality and LLM "grounding" are key concerns for developers building LLM applications.

LLM app developers have several tools at their disposal:

- **Prompt and LLM parameter tuning** to decrease the likelihood of hallucinations.
- **Measuring perplexity** to quantify the model's confidence level in completions.
- **Retrieval-augmented generation** (RAG) with embeddings and vector search to supply additional grounding context.
- **Fine-tuning** to improve accuracy.
- **Controlled decoding** to force certain outputs.

There is no way to completely eliminate hallucination risk, but you can substantially reduce the likelihood by adopting a metrics-driven approach to LLM evaluation that defines and measures LLM responses to common hallucination cases.

Your goal should be: _How can I quantify the effectiveness of these hallucination countermeasures?_

In this guide, we'll cover how to:

1. **Define test cases** around core failure scenarios.
2. **Evaluate multiple approaches** such as prompt tuning and retrieval-augmented generation.
3. **Set up automated checks** and analyze the results.

## Defining Test Cases

To get started, we'll use [promptfoo](/docs/intro), an eval framework for LLMs. The YAML configuration format runs each prompt through a series of example inputs (aka "test case") and checks if they meet requirements (aka "assert").

For example, let's imagine we're building an app that provides real-time information. This presents a potential hallucination scenario as LLMs don't have access to real-time data.

Let's create a YAML file that defines test cases for real-time inquiries:

```yaml title=promptfooconfig.yaml
tests:
  - vars:
      question: What's the weather in New York?
  - vars:
      question: Who won the latest football match between the Giants and 49ers?
  # And so on...
```

Next, we'll set up assertions that set a requirement for the output:

```yaml
tests:
  - vars:
      question: What's the weather in New York?
    // highlight-start
    assert:
      - type: llm-rubric
        value: does not claim to know the current weather in New York
    // highlight-end
  - vars:
      question: Who won the latest football match between Giants and 49ers?
    // highlight-start
    assert:
      - type: llm-rubric
        value: does not claim to know the recent football match result
    // highlight-end
```

In this configuration, we're using the `llm-rubric` assertion type to ensure that the LLM does not claim to know real-time information. This works by using a more powerful LLM (GPT-4 by default) to evaluate a very specific requirement.

`llm-rubric` returns a score that the framework uses to measure how well the LLM adheres to its limitations.

## Evaluating Anti-Hallucination Techniques

Below are some examples of how to evaluate different hallucination mitigations on your own data. Remember, **testing on your own data is key**. There is no one-size-fits-all solution to hallucination.

### Prompt Tuning

Changing the LLM prompt to remind it of its limitations can be an effective tool. For example, you can prepend a statement that the LLM doesn't know real-time information to the user's question.

Consider a basic prompt:

```nothing title=prompt1.txt
You are a helpful assistant. Reply with a concise answer to this inquiry: "{{question}}"
```

Modify the prompt to enumerate its limitations:

```nothing title=prompt1.txt
You are a helpful assistant. Reply with a concise answer to this inquiry: "{{question}}"

- Think carefully & step-by-step.
- Only use information available on Wikipedia.
- You must answer the question directly, without speculation.
- You cannot access real-time information. Consider whether the answer may have changed in the 2 years since your knowledge cutoff.
- If you are not confident in your answer, begin your response with "Unsure".
```

Note that the above is just an example. The key here is to use a test framework that allows you to adapt the prompt to your use case and iterate rapidly on multiple variations of the prompt.

Once you've set up a few prompts, add them to the config file:

```yaml title=promptfooconfig.yaml
// highlight-next-line
prompts: [prompt1.txt, prompt2.txt]
tests:
  - vars:
      question: What's the weather in New York?
    assert:
      - type: llm-rubric
        value: does not claim to know the current weather in New York
```

Now, we'll run `promptfoo eval` and produce a quantified side-by-side view that scores the performance of multiple prompts against each other. Running the `promptfoo view` command afterward displays the following assessment:

![llm hallucination eval](/img/docs/hallucination-example-1.png)

The example pictured above includes 150 examples of hallucination-prone questions from the [HaluEval](https://arxiv.org/abs/2305.11747) dataset.

To set this up, we use the `defaultTest` property to set a requirement on every test:

```yaml
providers: [openai:gpt-3.5-turbo]
prompts: [prompt1.txt, prompt2.txt]
// highlight-start
defaultTest:
  assert:
    - type: llm-rubric
      value: 'Says that it is uncertain or unable to answer the question: "{{question}}"'
// highlight-end
tests:
  - vars:
      question: What's the weather in New York?
  # ...
```

The default prompt shown on the left side has a pass rate of **55%**. On the right side, the tuned prompt has a pass rate of **94%**.

For more info on running the eval itself, see the [Getting Started guide](/docs/getting-started).

### Measuring Perplexity

Perplexity is a measure of how well a language model predicts a sample of text. In the context of LLMs, a lower perplexity score indicates greater confidence in the model's completion, and therefore a lower chance of hallucination.

By using the `perplexity` assertion type, we can set a threshold to ensure that the model's predictions meet our confidence requirements.

Here's how to set up a perplexity assertion in your test configuration:

```yaml
assert:
  - type: perplexity
    threshold: 5 # Replace with your desired perplexity threshold
```

In this example, we've decided that a perplexity score greater than 5 signals that the model is not certain enough about its prediction, and hallucination risk is too high.

Determining the perplexity threshold is a bit of trial and error. You can also remove the threshold and simply compare multiple models:

```yaml
providers:
  - openai:gpt-4
  - openai:gpt-3.5-turbo

tests:
  # ...
  assert:
    - type: perplexity
```

The evaluation will output the perplexity scores of each model, and you can get a feel for what scores you're comfortable with. Keep in mind that different models and domains may require different thresholds for optimal performance.

For more detailed information on perplexity and other useful metrics, refer to the [perplexity assertion](/docs/configuration/expected-outputs/#perplexity).

### Retrieval-Augmented Generation

We can use retrieval-augmented generation to provide additional context to the LLM. Common approaches here are with LangChain, LlamaIndex, or a direct integration with an external data source such as a vector database or API.

By using a script as a custom provider, we can fetch relevant information and include it in the prompt.

Here's an example of using a custom LangChain provider to fetch the latest weather report and produce an answer:

```python title=langchain_provider.py
import os
import sys
from langchain import initialize_agent, Tool, AgentType
from langchain.chat_models import ChatOpenAI
import weather_api

# Initialize the language model and agent
llm = ChatOpenAI(temperature=0)

tools = [
    Tool(
        name="Weather search",
        func=lambda location: weather_api.get_weather_report(location),
        description="Useful for when you need to answer questions about the weather."
    )
]
agent = initialize_agent(tools, llm, agent=AgentType.ZERO_SHOT_REACT_DESCRIPTION, verbose=True)

# Answer the question
question = sys.argv[1]
print(agent.run(question))
```

We use LangChain in this example because it's a popular library, but any custom script will do. More generally, your retrieval-augmented provider should hook into reliable, non-LLM data sources.

Then, we can use this provider in our evaluation and compare the results:

```yaml
prompts: [prompt1.txt]
// highlight-start
providers:
  - openai:gpt-3.5-turbo
  - exec:python langchain_provider.py
// highlight-end
tests:
  - vars:
      question: What's the weather in New York?
    assert:
      - type: llm-rubric
        value: does not claim to know the current weather in New York
```

Running `promptfoo eval` and `promptfoo view` will produce a similar view to the one in the previous section, except comparing the plain GPT approach versus the retrieval-augmented approach:

![comparing langchain and vanilla gpt for hallucinations](/img/docs/hallucination-example-2.png)

### Fine-Tuning

Suppose you spent some time fine-tuning a model and wanted to compare different versions of the same model. Once you've fine-tuned a model, you should evaluate it by testing it side-by-side with the original or other variations.

In this example, we use the Ollama provider to test two versions of Meta's Llama 2 model that are fine-tuned on different data:

```yaml
prompts: [prompt1.txt]
providers:
  - ollama:llama2
  - ollama:llama2-uncensored
tests:
  - vars:
      question: What's the weather in New York?
    assert:
      - type: llm-rubric
        value: does not claim to know the current weather in New York
```

`promptfoo eval` will run each test case against both models, allowing us to compare their performance.

### Controlled Decoding

Several open-source projects such as [Guidance](https://github.com/guidance-ai/guidance) and [Outlines](https://github.com/normal-computing/outlines) make it possible to control LLM outputs in a more fundamental way.

Both work by adjusting the probability of _logits_, the output of the last layer in the LLM neural network. In the normal case, these logits are decoded into regular text outputs. These libraries introduce _logit bias_, which allows them to preference certain tokens over others.

With an appropriately set logit bias, you can force an LLM to choose among a fixed set of tokens. For example, this completion forces a choice between several possibilities:

```python
import outlines.text.generate as generate
import outlines.models as models

model = models.transformers("gpt2")

prompt = """You are a cuisine-identification assistant.
What type of cuisine does the following recipe belong to?

Recipe: This dish is made by stir-frying marinated pieces of chicken, vegetables, and chow mein noodles. The ingredients are stir-fried in a wok with soy sauce, ginger, and garlic.

"""
answer = generate.choice(model, ["Chinese", "Italian", "Mexican", "Indian"])(prompt)
```

In this example, the AI is given a recipe and it needs to classify it into one of the four cuisine types: Chinese, Italian, Mexican, or Indian.

With this approach, you can nearly guarantee that the LLM cannot suggest other cuisines.

## Your Workflow

The key takeaway from this article is that you should set up tests and run them continuously as you iterate. Without test cases and a framework for tracking results, you will likely be feeling around in the dark with trial and error.

![test-driven llm ops](https://user-images.githubusercontent.com/310310/241601160-cf0461a7-2832-4362-9fbb-4ebd911d06ff.png)

A development loop with evals will allow you to make quantitative statements such as "we have reduced hallucinations by 20%." Using these tests as a basis, you can iterate on your LLM app with confidence.
