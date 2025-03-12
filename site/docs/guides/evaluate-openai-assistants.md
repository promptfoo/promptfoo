---
sidebar_label: Evaluating OpenAI Assistants
---

# How to evaluate OpenAI Assistants

OpenAI recently released an [Assistants API](https://platform.openai.com/docs/assistants/overview) that offers simplified handling for message state and tool usage. It also enables code interpreter and knowledge retrieval features, abstracting away some of the dirty work for implementing RAG architecture.

[Test-driven development](/docs/intro#workflow-and-philosophy) allows you to compare prompts, models, and tools while measuring improvement and avoiding unexplained regressions. It's an example of [systematic iteration vs. trial and error](https://ianww.com/blog/2023/05/21/prompt-engineering-framework).

This guide walks you through using promptfoo to select the best prompt, model, and tools using OpenAI's Assistants API. It assumes that you've already [set up](/docs/getting-started) promptfoo.

## Step 1: Create an assistant

Use the [OpenAI playground](https://platform.openai.com/playground) to an assistant. The eval will use this assistant with different instructions and models.

Add your desired functions and enable the code interpreter and retrieval as desired.

After you create an assistant, record its ID. It will look similar to `asst_fEhNN3MClMamLfKLkIaoIpgB`.

## Step 2: Set up the eval

An eval config has a few key components:

- `prompts`: The user chat messages you want to test
- `providers`: The assistant(s) and/or LLM APIs you want to test
- `tests`: Individual test cases to try

Let's set up a basic `promptfooconfig.yaml`:

```yaml
prompts:
  - 'Help me out with this: {{message}}'
providers:
  - openai:assistant:asst_fEhNN3MClMamLfKLkIaoIpgB
tests:
  - vars:
      message: write a tweet about bananas
  - vars:
      message: what is the sum of 38.293 and the square root of 30300300
  - vars:
      message: reverse the string "all dogs go to heaven"
```

## Step 3: Run the eval

Now that we've set up the config, run the eval on your command line:

```
npx promptfoo@latest eval
```

This will produce a simple view of assistant outputs. Note that it records the conversation, as well as code interpreter, function, and retrieval inputs and outputs:

![assistant eval](https://user-images.githubusercontent.com/310310/284090445-d6c52841-af6f-4ddd-b88f-4d58bf0d4ca2.png)

This is a basic view, but now we're ready to actually get serious with our eval. In the next sections, we'll learn how to compare different assistants or different versions of the same assistant.

## Comparing multiple assistants

To compare different assistants, reference them in the `providers` section of your `promptfooconfig.yaml`. For example:

```yaml
providers:
  - openai:assistant:asst_fEhNN3MClMamLfKLkIaoIpgB
  - openai:assistant:asst_another_assistant_id_123
```

This will run the same tests on both assistants and allow you to compare their performance.

## Comparing different versions of the same assistant

If you want to override the configuration of an assistant for a specific test, you can do so in the `options` section of a test. For example:

```yaml
providers:
  - id: openai:assistant:asst_fEhNN3MClMamLfKLkIaoIpgB
    config:
      model: gpt-4o
      instructions: 'Enter a replacement for system-level instructions here'
      tools:
        - type: code_interpreter
        - type: retrieval
      thread:
        messages:
          - role: user
            content: 'These messages are included in every test case before the prompt.'
          - role: assistant
            content: 'Okay'
```

In this example, the Assistant API is called with the above parameters.

Here's an example that compares the saved Assistant settings against new potential settings:

```yaml
providers:
  # Original
  - id: openai:assistant:asst_fEhNN3MClMamLfKLkIaoIpgB

  # Modified
  - id: openai:assistant:asst_fEhNN3MClMamLfKLkIaoIpgB
    config:
      model: gpt-4o
      instructions: 'Always talk like a pirate'
```

This eval will test _both_ versions of the Assistant and display the results side-by-side.

## Adding metrics and assertions

Metrics and assertions allow you to automatically evaluate the performance of your assistants. You can add them in the `assert` section of a test. For example:

```yaml
tests:
  - vars:
      message: write a tweet about bananas
    assert:
      - type: contains
        value: 'banana'
      - type: similar
        value: 'I love bananas!'
        threshold: 0.6
```

In this example, the `contains` assertion checks if the assistant's response contains the word 'banana'. The `similar` assertion checks if the assistant's response is semantically similar to 'I love bananas!' with a cosine similarity threshold of 0.6.

There are many different [assertions](https://promptfoo.dev/docs/configuration/expected-outputs/) to consider, ranging from simple metrics (such as string matching) to complex metrics (such as model-graded evaluations). I strongly encourage you to set up assertions that are tailored to your use case.

Based on these assertions, promptfoo will automatically score the different versions of your assistants, so that you can pick the top performing one.

## Next steps

Now that you've got a basic eval set up, you may also be interested in specific techniques for [evaluating retrieval agents](/docs/guides/evaluate-rag).
