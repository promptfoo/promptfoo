# openai-chat-history (OpenAI Conversation History)

This example sends a conversation history and three follow-up questions to GPT-6 Luna through the Responses API. `prompt.json` combines the system message, earlier user and assistant messages, and the current question.

```bash
npx promptfoo@latest init --example openai-chat-history
cd openai-chat-history
export OPENAI_API_KEY=your-key-here
npx promptfoo@latest eval --no-cache
```

Edit `previous_messages` in `promptfooconfig.yaml` to test a different conversation. The example has no assertions; compare the responses with:

```bash
npx promptfoo@latest view
```
