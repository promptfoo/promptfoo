# thread-hook-example (ThreadId Generation with Hooks)

This example demonstrates how to use extension hooks in promptfoo to generate and manage unique threadIds for each test case. This pattern is useful for maintaining conversation context or tracking stateful interactions across LLM calls.

## What this example shows

1. Using the `beforeEach` extension hook to automatically generate a unique threadId for each test
2. Passing the threadId to prompts using variable substitution
3. Using a transform function to process outputs with awareness of the threadId
4. Logging and debugging with extension hooks

You can run this example with:

```bash
npx promptfoo@latest eval -c test-thread-hook.yaml
```

## Key Files

- `test-thread-hook.yaml`: Configuration file that sets up the evaluation with hooks
- `thread-hook.js`: Extension hook that generates threadIds
- `thread-transform.js`: Transform function that processes outputs with threadId context

## How It Works

1. The extension hook in `thread-hook.js` is triggered before each test runs
2. It generates a random threadId and adds it to the test's variables
3. The prompt template uses this threadId via `{{threadId}}` syntax
4. The transform function can then use the threadId for additional processing

## Real-World Applications

This pattern is especially useful for:

- Testing stateful chatbots that need to maintain conversation history
- Working with APIs that require session or thread identifiers
- Simulating multi-turn conversations with LLMs
- Creating isolated test environments for each test case

## Extending to the Redteam Chatbot

To use this technique with the full redteam chatbot:

1. Add the extension hook to promptfooconfig.yaml
2. Modify the chatbot code to accept and use threadIds
3. Track conversation history per threadId

This approach helps maintain isolation between test cases and enables more complex, multi-turn interaction testing.
