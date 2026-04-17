# Conversation Relevance Example

This example demonstrates how to use the `conversation-relevance` assertion to evaluate whether chatbot responses remain relevant throughout a conversation.

## What is Conversation Relevance?

The conversation relevance metric evaluates whether each response in a conversation is relevant to the context and previous messages. It uses a sliding window approach to analyze conversation segments.

## Running the Example

1. Install dependencies:

   ```bash
   npm install -g promptfoo
   ```

2. Set your OpenAI API key:

   ```bash
   export OPENAI_API_KEY=your-api-key
   ```

3. Run the evaluation:
   ```bash
   promptfoo eval
   ```

## Example Test Cases

### 1. Single-turn Evaluation

Tests basic relevance for a single query-response pair about travel to Paris.

### 2. Multi-turn Travel Conversation

Evaluates a complete conversation about travel planning where all responses should be relevant.

### 3. Conversation with Irrelevant Response

Demonstrates detection of an off-topic response (stock market comment) in the middle of a conversation about wedding planning.

### 4. Technical Support Conversation

Shows a high-quality technical support conversation with a high relevance threshold (0.95).

## Configuration Options

- `threshold`: Minimum score required to pass (0-1)
- `config.windowSize`: Number of messages in each sliding window (default: 5)
- `provider`: Override the default grading model

## Interpreting Results

- **Score**: Proportion of conversation windows deemed relevant
- **Pass/Fail**: Based on whether the score meets the threshold
- **Reason**: Explanation when responses are found irrelevant

## Tips

1. Use lower thresholds (0.7-0.8) for general conversations
2. Use higher thresholds (0.9-0.95) for specialized domains like technical support
3. Adjust window size based on conversation complexity
4. Consider using more capable models (GPT-4) for grading complex conversations

## How Scoring Works

The metric evaluates each message position using a sliding window approach. For example, with a 5-message conversation and window size of 3:

- Window 1: Message 1 only (evaluates if Response 1 is relevant)
- Window 2: Messages 1-2 (evaluates if Response 2 is relevant given context)
- Window 3: Messages 1-3 (evaluates if Response 3 is relevant given context)
- Window 4: Messages 2-4 (evaluates if Response 4 is relevant given context)
- Window 5: Messages 3-5 (evaluates if Response 5 is relevant given context)

Each window evaluates whether the LAST assistant response in that window is relevant. The final score is:

```
Score = Number of Relevant Windows / Total Number of Windows
```
