# Simulated User

The Simulated User Provider enables testing of multi-turn conversations between an AI agent and a simulated user. This is useful for testing chatbots, virtual assistants, and other conversational AI applications.

It is inspired by [Tau-bench](https://github.com/sierra-research/tau-bench).

## Configuration

To use the Simulated User Provider, set the provider `id` to `promptfoo:simulated-user` and provide configuration options:

```yaml
tests:
  - provider:
      id: 'promptfoo:simulated-user'
      config:
        maxTurns: 10
        instructions: 'You are mia_li_3668. You want to fly from New York to Seattle on May 20 (one way). You do not want to fly before 11am est. You want to fly in economy. You prefer direct flights but one stopover also fine. If there are multiple options, you prefer the one with the lowest price. You have 3 baggages. You do not want insurance. You want to use your two certificates to pay. If only one certificate can be used, you prefer using the larger one, and pay the rest with your 7447 card. You are reactive to the agent and will not say anything that is not asked. Your birthday is in your user profile so you do not prefer to provide it.'
```

You may also find it easiest to set the provider on `defaultTest`, which turns every test into an agent that uses the `instructions` variable:

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

The Agent Provider facilitates a back-and-forth conversation between:

1. A simulated user (controlled by promptfoo)
2. Your AI agent (the provider being tested)

For each turn:

1. The user's message is sent to the agent
2. The agent's response is sent back to the simulated user
3. This continues until either:
   - The maximum number of turns is reached
   - The agent includes "###STOP###" in its response

## Configuration Options

| Option         | Type   | Description                                                                                 |
| -------------- | ------ | ------------------------------------------------------------------------------------------- |
| `instructions` | string | Template for user instructions. Supports Nunjucks templating with access to test variables. |
| `maxTurns`     | number | Maximum number of conversation turns. Defaults to 10.                                       |

## Example

Here's a complete example testing a customer service conversation:

```yaml
prompts:
  - file://agent_policy.txt

providers:
  - 'openai:gpt-4o-mini'

defaultTest:
  provider:
    id: 'promptfoo:simulated-user'
    config:
      maxTurns: 10

tests:
  - vars:
      instructions: You are mia_li_3668. You want to fly from New York to Seattle on May 20 (one way). You do not want to fly before 11am est. You want to fly in economy. You prefer direct flights but one stopover also fine. If there are multiple options, you prefer the one with the lowest price. You have 3 baggages. You do not want insurance. You want to use your two certificates to pay. If only one certificate can be used, you prefer using the larger one, and pay the rest with your 7447 card. You are reactive to the agent and will not say anything that is not asked. Your birthday is in your user profile so you do not prefer to provide it.
```

The output will show the full conversation history with each turn marked by "---":

```
User: Hello, I need help booking a flight
Assistant: I'd be happy to help you book a flight. Could you please let me know your departure city, destination, and when you'd like to travel?

---

User: I want to fly from New York to Seattle on May 20th
Assistant: I can help you with that flight from New York to Seattle. Do you have any preferences for departure time on May 20th? Also, would you prefer economy, business, or first class?

---

User: I'd like to fly after 11am EST in economy class ###STOP###
```

## Using as a Library

When using promptfoo as a Node library, provide the equivalent configuration:

```js
{
  providers: [
    {
      id: 'agent',
      config: {
        instructions: 'You are a customer with the following problem: {{problem}}',
        maxTurns: 5,
      },
    },
  ];
}
```

## Debugging

Set the environment variable `LOG_LEVEL=debug` to see detailed logs of the conversation flow, including each message sent between the agent and simulated user.
