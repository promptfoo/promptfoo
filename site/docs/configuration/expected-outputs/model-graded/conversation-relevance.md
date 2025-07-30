---
sidebar_position: 25
---

# Conversation Relevance

The `conversation-relevance` assertion evaluates whether responses in a conversation remain relevant throughout the dialogue. This is particularly useful for chatbot applications where maintaining conversational coherence is critical.

## How it works

The conversation relevance metric uses a sliding window approach to evaluate conversations:

1. **Single-turn evaluation**: For simple query-response pairs, it checks if the response is relevant to the input
2. **Multi-turn evaluation**: For conversations, it creates sliding windows of messages and evaluates if each assistant response is relevant within its conversational context
3. **Scoring**: The final score is the proportion of windows where the response was deemed relevant

## Basic usage

```yaml
assert:
  - type: conversation-relevance
    threshold: 0.8
```

## Using with conversations

The assertion works with the special `_conversation` variable that contains an array of input/output pairs:

```yaml
tests:
  - vars:
      _conversation:
        - input: 'What is the capital of France?'
          output: 'The capital of France is Paris.'
        - input: 'What is its population?'
          output: 'Paris has a population of about 2.2 million people.'
        - input: 'Tell me about famous landmarks there.'
          output: 'Paris is famous for the Eiffel Tower, Louvre Museum, and Notre-Dame Cathedral.'
    assert:
      - type: conversation-relevance
        threshold: 0.8
```

## Configuration options

### Window size

Control how many conversation turns are considered in each sliding window:

```yaml
assert:
  - type: conversation-relevance
    threshold: 0.8
    config:
      windowSize: 3 # Default is 5
```

### Custom grading rubric

Override the default relevance evaluation prompt:

```yaml
assert:
  - type: conversation-relevance
    threshold: 0.8
    rubricPrompt: |
      Evaluate if the assistant's response is relevant to the user's query.
      Consider the conversation context when making your judgment.
      Output JSON with 'verdict' (yes/no) and 'reason' fields.
```

## Examples

### Basic single-turn evaluation

When evaluating a single turn, the assertion uses the prompt and output from the test case:

```yaml
prompts:
  - 'Explain {{topic}}'

providers:
  - openai:gpt-4

tests:
  - vars:
      topic: 'machine learning'
    assert:
      - type: conversation-relevance
        threshold: 0.8
```

### Multi-turn conversation with context

```yaml
tests:
  - vars:
      _conversation:
        - input: "I'm planning a trip to Japan."
          output: 'That sounds exciting! When are you planning to visit?'
        - input: 'Next spring. What should I see?'
          output: 'Spring is perfect for cherry blossoms! Visit Tokyo, Kyoto, and Mount Fuji.'
        - input: 'What about food recommendations?'
          output: 'Try sushi, ramen, tempura, and wagyu beef. Street food markets are amazing too!'
    assert:
      - type: conversation-relevance
        threshold: 0.9
        config:
          windowSize: 3
```

### Detecting off-topic responses

This example shows how the metric catches irrelevant responses:

```yaml
tests:
  - vars:
      _conversation:
        - input: 'What is 2+2?'
          output: '2+2 equals 4.'
        - input: 'What about 3+3?'
          output: 'The capital of France is Paris.' # Irrelevant response
        - input: 'Can you solve 5+5?'
          output: '5+5 equals 10.'
    assert:
      - type: conversation-relevance
        threshold: 0.8
        config:
          windowSize: 2
```

## Special considerations

### Vague inputs

The metric is designed to handle vague inputs appropriately. Vague responses to vague inputs (like greetings) are considered acceptable:

```yaml
tests:
  - vars:
      _conversation:
        - input: 'Hi there!'
          output: 'Hello! How can I help you today?'
        - input: 'How are you?'
          output: "I'm doing well, thank you! How are you?"
    assert:
      - type: conversation-relevance
        threshold: 0.8
```

### Short conversations

If the conversation has fewer messages than the window size, the entire conversation is evaluated as a single window.

## Provider configuration

Like other model-graded assertions, you can override the default grading provider:

```yaml
assert:
  - type: conversation-relevance
    threshold: 0.8
    provider: openai:gpt-4o-mini
```

Or set it globally:

```yaml
defaultTest:
  options:
    provider: anthropic:claude-3-7-sonnet-latest
```

## See also

- [Context relevance](/docs/configuration/expected-outputs/model-graded/context-relevance) - For evaluating if context is relevant to a query
- [Answer relevance](/docs/configuration/expected-outputs/model-graded/answer-relevance) - For evaluating if an answer is relevant to a question
- [Model-graded metrics](/docs/configuration/expected-outputs/model-graded) - Overview of all model-graded assertions

## Citation

This implementation is adapted from [DeepEval's Conversation Relevancy metric](https://docs.confident-ai.com/docs/metrics-conversation-relevancy).
