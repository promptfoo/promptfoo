# Conversation Relevance Example

This example demonstrates how to use the `conversation-relevance` assertion to evaluate whether an LLM maintains relevant responses throughout a conversation.

## Overview

The conversation relevance metric determines if your LLM chatbot consistently generates relevant responses throughout a conversation. It uses a sliding window approach to evaluate relevance across conversation turns.

## How it Works

1. **Single Turn**: For simple query-response pairs, it evaluates if the response is relevant to the input.
2. **Multi-Turn**: For conversations, it uses sliding windows to check if each response is relevant within its conversational context.
3. **Window Size**: You can configure the window size (default: 5) to control how much context is considered.

## Running the Example

```bash
npx promptfoo@latest eval -c promptfooconfig.yaml
```

## Test Cases

This example includes several test scenarios:

1. **Single turn conversation** - Basic relevance check for a single query-response pair
2. **Multi-turn with context** - Evaluates relevance across a coherent conversation about Paris
3. **Off-topic response** - Demonstrates failure when the LLM provides an irrelevant response
4. **Vague greetings** - Shows that vague responses to vague inputs (like greetings) are acceptable
5. **Context-dependent conversation** - Tests relevance in a travel planning conversation

## Configuration Options

- `threshold`: Minimum score required to pass (0-1, default: 0.5)
- `windowSize`: Number of conversation turns to consider in each sliding window (default: 5)

## Scoring

The metric calculates:
```
Score = Number of Relevant Windows / Total Number of Windows
```

A window is considered relevant if the last assistant message in that window is relevant to the conversational context. 