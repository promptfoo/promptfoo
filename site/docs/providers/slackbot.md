---
title: Slack Provider
---

# Slack Provider

The Slack provider allows you to send prompts to Slack channels or users and receive their responses. This enables human-in-the-loop evaluations, collecting human feedback on AI outputs, and comparing human responses with AI outputs.

## Setup

1. Create a Slack app at https://api.slack.com/apps
2. Add the following permissions to your app:
   - `chat:write`
   - `channels:read`, `groups:read`, `im:read`, `mpim:read`
   - For RTM functionality (needed to listen for responses):
     - `channels:history`, `groups:history`, `im:history`, `mpim:history`
3. Install the app to your workspace
4. Copy the Bot User OAuth Token for use with promptfoo

### Dependencies

The Slack provider requires the following dependencies:

```bash
# Install main packages
npm install @slack/web-api @slack/rtm-api

# For TypeScript projects, also install type definitions
npm install --save-dev @types/slack__web-api @types/slack__rtm-api
```

### Finding Channel and User IDs

- **Channel IDs**: In Slack, click on the channel name in the header → "About" → Copy the Channel ID (starts with "C")
- **User IDs**: Click on a user's profile → "..." menu → Copy member ID (starts with "U")

Alternatively, in a Slack workspace where your app is installed, you can:

1. Right-click on a channel/user in the sidebar
2. Select "Copy Link"
3. The ID will be at the end of the URL (e.g., `C0123ABCDEF` or `U0123ABCDEF`)

## Configuration

The Slackbot provider can be configured in several ways:

### Basic Provider Configuration

```yaml
providers:
  - id: slackbot
    config:
      token: 'xoxb-your-bot-token-here' # Required
      channel: 'C0123ABCDEF' # Required if userId is not provided
      timeout: 60000 # Optional: timeout in milliseconds (default: 60000)
```

### Channel-Specific Configuration

```yaml
providers:
  - id: slack:channel:C0123ABCDEF
    config:
      token: 'xoxb-your-bot-token-here'
```

### User-Specific Configuration

```yaml
providers:
  - id: slack:user:U0123ABCDEF
    config:
      token: 'xoxb-your-bot-token-here'
```

### Environment Variables

It's recommended to use environment variables for sensitive tokens:

```yaml
providers:
  - id: slackbot
    config:
      token: ${SLACK_BOT_TOKEN}
      channel: 'C0123ABCDEF'
```

## Configuration Options

| Option    | Type   | Required | Default | Description                                                          |
| --------- | ------ | -------- | ------- | -------------------------------------------------------------------- |
| `token`   | string | Yes      | -       | Slack Bot User OAuth Token                                           |
| `channel` | string | Yes\*    | -       | Slack channel ID (required if userId not provided)                   |
| `userId`  | string | Yes\*    | -       | Slack user ID for direct messages (required if channel not provided) |
| `timeout` | number | No       | 60000   | Timeout in milliseconds to wait for a response                       |

\*Either `channel` or `userId` must be provided.

## How It Works

1. When a prompt is sent to the provider, it posts the message to the specified Slack channel or user.
2. The provider then listens for the next message in that channel/conversation.
3. The first non-bot message after the prompt is captured as the response.
4. If no response is received within the timeout period, an error is thrown.

## Example Use Cases

- **Human Feedback Collection**: Send AI-generated content to a Slack channel for human review
- **Comparative Evaluation**: Compare human responses to AI responses for the same prompts
- **Human-in-the-loop**: Include human judgment in your evaluation pipeline
- **Expert Review**: Have domain experts review specific outputs through familiar Slack interface

## Example Configuration

Here's a complete example that compares AI responses with human responses:

```yaml
description: Human feedback collection via Slack
prompts:
  - file://prompts/question.txt
providers:
  - id: openai:gpt-4o-mini
    config:
      temperature: 0.7
  - id: slack:channel:C0123ABCDEF
    config:
      token: ${SLACK_BOT_TOKEN}
      timeout: 300000 # 5 minutes
tests:
  - vars:
      topic: 'Climate change'
    assert:
      - type: javascript
        value: |
          // Validate we received a response
          return output && output.length > 0 ? 'pass' : 'fail'
```

## Limitations

- The provider only captures the first message after the prompt is sent
- The RTM API requires a persistent WebSocket connection
- The provider throws an error if no response is received within the timeout period
- Slack API rate limits apply (3 messages per channel per second)
- The RTM API is in maintenance mode by Slack (not actively developed but still supported)

## Concurrency Considerations

The Slackbot provider should be run serially (one at a time) rather than concurrently, similar to the manual input provider. This ensures that:

1. Messages are sent to Slack in a predictable sequence
2. Responses from humans can be clearly matched to the correct prompts
3. Rate limits aren't exceeded
4. Human responders aren't overwhelmed with multiple simultaneous requests

**Note:** The Slackbot provider now implements provider-level concurrency control with an internal locking mechanism. This ensures that Slack requests are always processed serially (one at a time), even when global concurrency is set higher. However, for optimal user experience, we still recommend setting global concurrency to 1 when using this provider.

To run evaluations serially with the Slackbot provider, set the concurrency to 1:

```sh
# Run evaluations serially on the command line
promptfoo eval -j 1 --no-progress-bar
```

Or in your configuration file:

```yaml
evaluateOptions:
  maxConcurrency: 1
```

Other concurrency considerations:

- Be mindful of Slack's rate limits (3 messages per channel per second)
- Consider using different channels or users for high-volume testing
- For large-scale evaluations, increase the timeout value to accommodate delays in human responses
- If experiencing rate limit errors, use the `PROMPTFOO_DELAY_MS` environment variable to add delays between API calls

## Security Best Practices

- Store your Slack Bot Token as an environment variable, not in configuration files
- Create a dedicated Slack app for evaluation purposes rather than using existing production apps
- Limit the channels where your bot is invited to minimize exposure
- Consider using private channels for sensitive evaluations
- Regularly rotate your Slack Bot Tokens

## Troubleshooting

### Common Issues

- **Timeout Errors**: Increase the timeout value if humans need more time to respond
- **Authentication Errors**: Ensure the token has the correct permissions and is valid
- **Bot not receiving messages**: Verify the bot is invited to the channel
- **No response captured**: Make sure users are responding in the same channel/DM where the bot posted the message

### Error Messages

- `Slackbot provider requires a token`: Check that you've provided a valid Slack Bot User OAuth Token
- `Slackbot provider requires either a channel or userId`: Ensure you've specified either a channel ID or user ID
- `Timeout waiting for Slack response`: No response was received within the timeout period
- `No target channel or user specified`: The channel or userId configuration is missing or invalid

## Complete Example

See the [slack-feedback example](https://github.com/promptfoo/promptfoo/tree/main/examples/slack-feedback) for a complete implementation.

## Future Enhancements

Note that Slack is transitioning away from the RTM API to the Events API with Socket Mode. Future versions of this provider may be updated to use the newer API approach.
