---
sidebar_label: Simulated User
description: 'Simulate realistic user interactions and behaviors for comprehensive testing of conversational AI systems and chatbots'
---

# Simulated User

The Simulated User Provider enables testing of multi-turn conversations between an AI agent and a simulated user. This is particularly useful for testing chatbots, virtual assistants, and other conversational AI applications in realistic scenarios.

It works with both simple text-based agents and advanced function-calling agents, making it ideal for testing modern AI systems that use structured APIs.

It is inspired by [Tau-bench](https://github.com/sierra-research/tau-bench), a benchmark for evaluating tool-assisted agents.

## Configuration

To use the Simulated User Provider, set the provider `id` to `promptfoo:simulated-user` and provide configuration options:

```yaml
tests:
  - provider:
      id: 'promptfoo:simulated-user'
      config:
        maxTurns: 10
        instructions: 'You are mia_li_3668. You want to fly from New York to Seattle on May 20 (one way). You do not want to fly before 11am EST. You want to fly in economy. You prefer direct flights but one stopover is also fine. If there are multiple options, you prefer the one with the lowest price. You have 3 bags. You do not want insurance. You want to use your two certificates to pay. If only one certificate can be used, you prefer using the larger one, and pay the rest with your 7447 card. You are reactive to the agent and will not say anything that is not asked. Your birthday is in your user profile so you do not prefer to provide it.'
```

You may also find it easiest to set the provider on `defaultTest`, which turns every test into a simulated user conversation using the `instructions` variable:

```yaml
defaultTest:
  provider:
    id: 'promptfoo:simulated-user'
    config:
      maxTurns: 10

tests:
  - vars:
      instructions: 'You are mia_li_3668...'
```

## How it works

The Simulated User Provider facilitates a back-and-forth conversation between:

1. A simulated user (controlled by promptfoo)
2. Your AI agent (the provider being tested)

For each turn:

1. The simulated user's message is sent to the agent
2. The agent's response is sent back to the simulated user
3. The simulated user generates the next message based on their instructions
4. This continues until either:
   - The maximum number of turns is reached
   - The agent determines that the conversation has reached a natural conclusion

## Configuration Options

| Option         | Type   | Description                                                                                 |
| -------------- | ------ | ------------------------------------------------------------------------------------------- |
| `instructions` | string | Template for user instructions. Supports Nunjucks templating with access to test variables. |
| `maxTurns`     | number | Maximum number of conversation turns. Defaults to 10.                                       |

## Example

Here's a simple example testing a customer service agent:

```yaml title="promptfooconfig.yaml"
prompts:
  - You are a helpful customer service agent. Answer questions politely and try to resolve issues.

providers:
  - openai:gpt-4o-mini

defaultTest:
  provider:
    id: 'promptfoo:simulated-user'
    config:
      maxTurns: 5

tests:
  - vars:
      instructions: You are a frustrated customer whose package was delivered to the wrong address. You want a refund but are willing to accept store credit if offered.
```

### Advanced Function Calling

For complex scenarios with function calling, you can define structured APIs with mock implementations:

```yaml
providers:
  - id: openai:gpt-4.1-mini
    config:
      tools:
        - file://functions/search_flights.json
      functionToolCallbacks:
        search_flights: file://callbacks/airline-functions.js:searchFlights
```

Where `functions/search_flights.json` defines the function schema and `callbacks/airline-functions.js` contains the mock implementation that returns realistic data.

The output will show the full conversation history with each turn separated by "---":

```
User: I need help booking a flight from New York to Seattle on May 20th
Assistant: I'd be happy to help! Could you provide your user ID so I can access your profile?

---

User: It's mia_li_3668
Assistant: [makes function call to search flights]
Let me search for flights from New York to Seattle on May 20th...

---

User: I prefer direct flights but one stop is okay if it's cheaper ###STOP###
```

### Evaluation and Assertions

You can add assertions to automatically evaluate conversation quality:

```yaml
tests:
  - vars:
      instructions: You are a budget-conscious traveler wanting economy flights under $350
    assert:
      - type: llm-rubric
        value: |
          Did the budget traveler get what they wanted?
          Pass if: Got economy flight under $350 and used certificates for payment
          Fail if: Failed to book economy or got expensive flight over $400
```

This enables automatic evaluation of whether your agent successfully handles different customer types and scenarios.

For a complete working example with 31 customer personas and comprehensive assertions, see the [Simulated User example](https://github.com/promptfoo/promptfoo/tree/main/examples/tau-simulated-user).

### Using with Custom Providers

The Simulated User Provider works seamlessly with custom providers (Python, JavaScript, etc.). All test-level `vars` are automatically passed to your custom provider's context, allowing you to access dynamic values like user IDs, session data, or routing information during conversations.

```yaml
providers:
  - id: file://my_custom_agent.py
    config:
      base_url: https://api.example.com

defaultTest:
  provider:
    id: 'promptfoo:simulated-user'
    config:
      maxTurns: 5

tests:
  - vars:
      workflow_id: 'wf-123'
      session_id: 'sess-456'
      instructions: |
        You are booking a flight. Ask for the workflow ID to track your request.
```

In your custom provider, you can access these vars:

```python
def call_api(prompt, options, context):
    # Access vars from the simulated conversation
    workflow_id = context['vars']['workflow_id']  # "wf-123"
    session_id = context['vars']['session_id']    # "sess-456"

    # Use them in your logic
    response = f"I'll track this as workflow {workflow_id}..."
    return {"output": response}
```

This enables sophisticated testing scenarios where your custom provider can:

- Route requests based on context variables
- Maintain conversation state using session IDs
- Access user-specific data for personalized responses
- Implement complex business logic while testing multi-turn conversations

## Using as a Library

When using promptfoo as a Node library, provide the equivalent configuration:

```js
{
  providers: [
    {
      id: 'promptfoo:simulated-user',
      config: {
        instructions: 'You are a customer with the following problem: {{problem}}',
        maxTurns: 5,
      },
    },
  ];
}
```

## Stop Conditions

The conversation will automatically stop when:

- The `maxTurns` limit is reached
- The agent includes `###STOP###` anywhere in its response
- An error occurs during the conversation

The `###STOP###` marker is useful for agents that can determine when a conversation has reached a natural conclusion (e.g., task completed, user satisfied).

## Limitations

The simulated user provider assumes that the target endpoint accepts messages in OpenAI chat format:

```ts
type Messages = {
  role: 'user' | 'assistant' | 'system';
  content: string;
}[];
```

The original prompt is sent as a system message to initialize the agent's behavior. For function-calling agents, include your function definitions in the provider configuration.

## Debugging

Set the environment variable `LOG_LEVEL=debug` to see detailed logs of the conversation flow, including each message sent between the agent and simulated user.

```bash
LOG_LEVEL=debug promptfoo eval
```
