---
title: Slack Provider
sidebar_label: Slack
---

# Slack Provider

The Slack provider enables human-in-the-loop evaluations by sending prompts to Slack channels or users and collecting responses. This is useful for:

- Collecting human feedback on AI outputs
- Comparing human responses with AI responses
- Building golden datasets from expert feedback
- Running evaluations with domain experts

## Prerequisites

### Install Dependencies

The Slack provider requires the `@slack/web-api` package to be installed separately:

```bash
npm install @slack/web-api
```

:::note
This is an optional dependency and only needs to be installed if you want to use the Slack provider.
:::

### Slack App Setup

1. **Create a Slack App**
   - Go to [api.slack.com/apps](https://api.slack.com/apps)
   - Click "Create New App" → "From scratch"
   - Give your app a name and select your workspace

2. **Configure Bot Token Scopes**
   - Navigate to "OAuth & Permissions" in your app settings
   - Under "Scopes" → "Bot Token Scopes", add these REQUIRED scopes:
     - `chat:write` - to send messages
     - `channels:history` - to read public channel messages
     - `groups:history` - to read private channel messages
     - `im:history` - to read direct messages
     - `channels:read` - to access public channel information
     - `groups:read` - to access private channel information
     - `im:read` - to access direct message information

   **Note**: All scopes are required for the provider to work properly across different channel types.

3. **Install App to Workspace**
   - Go to "Install App" in your app settings
   - Click "Install to Workspace"
   - Copy the "Bot User OAuth Token" (starts with `xoxb-`)

4. **Invite Bot to Channel**
   - In Slack, go to the channel where you want to use the bot
   - Type `/invite @YourBotName`

## Configuration

### Environment Variables

```bash
export SLACK_BOT_TOKEN="xoxb-your-bot-token"
```

### Basic Configuration

```yaml
providers:
  - id: slack
    config:
      channel: 'C0123456789' # Your channel ID
```

### Provider Formats

The Slack provider supports multiple formats:

```yaml
# Basic format with channel in config
providers:
  - id: slack
    config:
      token: ${SLACK_BOT_TOKEN}
      channel: "C0123456789"

# Short format - channel ID directly in provider string
providers:
  - slack:C0123456789

# Explicit channel format
providers:
  - slack:channel:C0123456789

# Direct message to a user
providers:
  - slack:user:U0123456789
```

## Configuration Options

| Option             | Type     | Required | Default                   | Description                                                   |
| ------------------ | -------- | -------- | ------------------------- | ------------------------------------------------------------- |
| `token`            | string   | Yes\*    | `SLACK_BOT_TOKEN` env var | Slack Bot User OAuth Token                                    |
| `channel`          | string   | Yes      | -                         | Channel ID (C...) or User ID (U...)                           |
| `responseStrategy` | string   | No       | `'first'`                 | How to collect responses: `'first'`, `'user'`, or `'timeout'` |
| `waitForUser`      | string   | No       | -                         | User ID to wait for (when using `'user'` strategy)            |
| `timeout`          | number   | No       | 60000                     | Timeout in milliseconds                                       |
| `includeThread`    | boolean  | No       | false                     | Include thread timestamp in output metadata                   |
| `formatMessage`    | function | No       | -                         | Custom message formatting function                            |
| `threadTs`         | string   | No       | -                         | Thread timestamp to reply in                                  |

\*Token is required either in config or as environment variable

## Response Strategies

### First Response (Default)

Captures the first non-bot message after the prompt:

```yaml
providers:
  - id: slack
    config:
      channel: 'C0123456789'
      responseStrategy: 'first'
```

### Specific User

Waits for a response from a specific user:

```yaml
providers:
  - id: slack
    config:
      channel: 'C0123456789'
      responseStrategy: 'user'
      waitForUser: 'U9876543210'
```

### Timeout Collection

Collects all responses until timeout:

```yaml
providers:
  - id: slack
    config:
      channel: 'C0123456789'
      responseStrategy: 'timeout'
      timeout: 300000 # 5 minutes
```

## Finding Channel and User IDs

### Channel IDs

1. In Slack, click on the channel name in the header
2. Click "About" tab
3. At the bottom, you'll see the Channel ID (starts with C)

### User IDs

1. Click on a user's profile
2. Click the "..." menu
3. Select "Copy member ID" (starts with U)

### Alternative Method

1. Right-click on a channel/user in the sidebar
2. Select "Copy link"
3. The ID is at the end of the URL

### Channel ID Formats

- `C...` - Public channels
- `G...` - Private channels/groups
- `D...` - Direct messages
- `W...` - Shared/Connect channels

## Examples

### Basic Human Feedback Collection

```yaml
description: Collect human feedback on AI responses

providers:
  - id: gpt-4
  - id: slack:C0123456789
    config:
      timeout: 300000 # 5 minutes

prompts:
  - 'Explain {{topic}} in simple terms'

tests:
  - vars:
      topic: 'quantum computing'
  - vars:
      topic: 'machine learning'
  - vars:
      topic: 'blockchain technology'
# Run with: promptfoo eval -j 1
```

### Expert Review with Specific User

```yaml
description: Get expert feedback from specific team member

providers:
  - id: slack
    config:
      channel: 'C0123456789'
      responseStrategy: 'user'
      waitForUser: 'U9876543210' # Expert's user ID
      timeout: 600000 # 10 minutes

prompts:
  - file://prompts/technical-review.txt

tests:
  - vars:
      code: |
        def factorial(n):
          if n == 0:
            return 1
          return n * factorial(n-1)
```

### Thread-based Conversations

```yaml
description: Continue conversation in thread

providers:
  - id: slack
    config:
      channel: 'C0123456789'
      threadTs: '1234567890.123456' # Existing thread
      includeThread: true

prompts:
  - 'Follow-up question: {{question}}'
```

### Custom Message Formatting

```javascript
// promptfooconfig.js
module.exports = {
  providers: [
    {
      id: 'slack',
      config: {
        channel: 'C0123456789',
        formatMessage: (prompt) => {
          return `🤖 *AI Evaluation Request*\n\n${prompt}\n\n_Please provide your feedback_`;
        },
      },
    },
  ],
};
```

## Best Practices

1. **Concurrency**: Run Slack evaluations with `-j 1` to ensure messages are sent sequentially

   ```bash
   promptfoo eval -j 1
   ```

2. **Timeouts**: Set appropriate timeouts based on expected response time
   - Quick feedback: 60-120 seconds
   - Detailed review: 5-10 minutes
   - Async collection: 30+ minutes

3. **Channel Selection**:
   - Use dedicated evaluation channels to avoid spam
   - Consider private channels for sensitive evaluations
   - Use DMs for individual expert feedback

4. **Message Formatting**:
   - Use clear, structured prompts
   - Include context and instructions
   - Use Slack's markdown for better readability

5. **Rate Limits**: Be aware of Slack's rate limits
   - Web API: ~1 request per second per method
   - Consider adding delays for bulk evaluations

## Testing Other Slack Bots

The Slack provider is excellent for testing other Slack bots in their native environment. This allows you to:

- Evaluate bot responses to various prompts
- Compare different bot implementations
- Perform regression testing
- Test bot behavior under different scenarios

### Setup for Bot Testing

1. **Invite both bots to a test channel**:

   ```
   /invite @your-bot-to-test
   /invite @provider
   ```

2. **Configure the provider to mention the target bot**:

   ```yaml
   providers:
     - id: slack
       config:
         channel: C123456789
         timeout: 10000
         responseStrategy: first
         # Optional: format messages to mention the bot
         messageFormatter: |
           @your-bot-to-test {{prompt}}
   ```

3. **Filter responses to only capture the target bot**:
   ```yaml
   providers:
     - id: slack
       config:
         channel: C123456789
         timeout: 10000
         responseStrategy: user
         userId: U_YOUR_BOT_ID # The bot's user ID
   ```

### Example: Testing a Customer Support Bot

```yaml
description: Test our customer support bot

providers:
  - id: slack
    label: support-bot-test
    config:
      channel: C_TEST_CHANNEL
      timeout: 15000
      responseStrategy: user
      userId: U_SUPPORT_BOT_ID
      messageFormatter: |
        <@U_SUPPORT_BOT_ID> {{prompt}}

prompts:
  - 'How do I reset my password?'
  - 'What are your business hours?'
  - 'I need to speak to a human'
  - "My order hasn't arrived yet, order #12345"

tests:
  - vars:
      expected_intent: password_reset
    assert:
      - type: contains
        value: 'reset'
      - type: contains
        value: 'password'

  - vars:
      expected_intent: business_hours
    assert:
      - type: contains-any
        value: ['hours', 'open', 'closed', 'Monday', 'schedule']

  - vars:
      expected_intent: human_handoff
    assert:
      - type: contains-any
        value: ['agent', 'representative', 'transfer', 'human']

  - vars:
      expected_intent: order_status
    assert:
      - type: contains
        value: '12345'
      - type: javascript
        value: |
          // Check if bot asked for more info or provided status
          return output.includes('track') || output.includes('status') || output.includes('delivery');
```

### Advanced Bot Testing Patterns

#### 1. Multi-turn Conversations

Test conversation flows by chaining prompts:

```yaml
prompts:
  - "Hi, I'd like to order a pizza"
  - 'Yes, I want a large pepperoni'
  - 'My address is 123 Main St'
```

#### 2. Error Handling

Test how the bot handles invalid inputs:

```yaml
prompts:
  - 'HELP ME NOW!!!!!!'
  - 'asdfghjkl'
  - "' OR 1=1 --"
  - ''
```

#### 3. Load Testing

Use multiple parallel evaluations to test bot performance:

```bash
promptfoo eval -c bot-test-config.yaml -j 10
```

#### 4. A/B Testing Different Bots

Compare multiple bot implementations:

```yaml
providers:
  - id: slack
    label: bot-v1
    config:
      channel: C_CHANNEL_V1
      userId: U_BOT_V1

  - id: slack
    label: bot-v2
    config:
      channel: C_CHANNEL_V2
      userId: U_BOT_V2

prompts:
  - "What's your return policy?"

assert:
  - type: llm-rubric
    value: 'Response should be helpful, accurate, and mention the 30-day return window'
```

### Best Practices for Bot Testing

1. **Use dedicated test channels** to avoid disrupting production
2. **Set appropriate timeouts** - bots may take longer to respond than humans
3. **Test edge cases** including malformed inputs and prompt injection attempts
4. **Monitor rate limits** when running many tests
5. **Use assertions** to verify both content and format of responses
6. **Test at different times** to ensure consistent performance

### Finding Bot User IDs

To find a bot's user ID:

```javascript
// Run this in your test channel
const { WebClient } = require('@slack/web-api');
const client = new WebClient(process.env.SLACK_BOT_TOKEN);

async function findBotId() {
  const members = await client.conversations.members({
    channel: 'C_YOUR_CHANNEL',
  });

  for (const userId of members.members) {
    const user = await client.users.info({ user: userId });
    if (user.user.is_bot) {
      console.log(`Bot: ${user.user.name} - ID: ${userId}`);
    }
  }
}
```

## Troubleshooting

### Bot not responding

- Ensure bot is invited to the channel
- Check bot has required permissions
- Verify token is valid

### Timeout errors

- Increase timeout value
- Check if users are active in channel
- Consider using different response strategy

### Missing messages

- Ensure bot has `channels:history` permission
- Check if messages are in threads
- Verify channel ID is correct

## Security Considerations

- Store tokens as environment variables, not in config files
- Use private channels for sensitive data
- Regularly rotate bot tokens
- Limit bot permissions to minimum required
- Remove bot from channels when not in use

## Complete Example

```yaml
# Human evaluation of customer service responses
description: Compare AI and human customer service responses

providers:
  - id: gpt-4
    config:
      temperature: 0.7

  - id: claude-3-sonnet

  - id: slack:C0123456789
    config:
      responseStrategy: 'first'
      timeout: 180000 # 3 minutes
      formatMessage: (prompt) =>
        `📋 *Customer Service Evaluation*\n\n${prompt}\n\n_How would you respond to this customer?_`

prompts:
  - |
    Customer message: "{{message}}"

    Please provide a helpful and empathetic response.

tests:
  - vars:
      message: "I've been waiting for my order for 2 weeks and no one is responding to my emails!"
    assert:
      - type: llm-rubric
        value: Response acknowledges delay and provides concrete next steps

  - vars:
      message: 'The product I received is damaged and I need a replacement'
    assert:
      - type: llm-rubric
        value: Response offers immediate solution and apologizes for inconvenience

  - vars:
      message: 'How do I upgrade my subscription plan?'
    assert:
      - type: contains
        value: upgrade
# Run evaluation
# promptfoo eval -j 1 --no-progress-bar
```

## Testing Your Setup

### Quick Test

1. Create a test channel in Slack
2. Invite your bot to the channel: `/invite @YourBotName`
3. Create a simple test config:

   ```yaml
   providers:
     - id: slack:YOUR_CHANNEL_ID
       config:
         timeout: 30000

   prompts:
     - "Test message - please reply with 'success'"

   tests:
     - assert:
         - type: contains
           value: success
   ```

4. Run: `npx promptfoo eval -j 1`
5. Reply in Slack within 30 seconds

### Common Issues

- **Bot not in channel**: Always invite the bot first with `/invite @YourBotName`
- **No response captured**: Check the bot has all required scopes
- **Rate limits**: The provider polls every 1 second. For non-Marketplace apps with strict rate limits, consider increasing timeouts and using longer polling intervals

## See Also

- [Manual Input Provider](/docs/providers/manual-input) - For terminal-based human input
- [Webhook Provider](/docs/providers/webhook) - For programmatic integrations
- [Provider Configuration](/docs/configuration/reference#provider-related-types) - General provider setup
