# Testing the Slack Provider

## Quick Setup Guide

### 1. Create a Slack App

1. Go to [api.slack.com/apps](https://api.slack.com/apps)
2. Click "Create New App" → "From scratch"
3. Name it "Promptfoo Test Bot"
4. Select your workspace

### 2. Configure Permissions

1. Go to "OAuth & Permissions"
2. Add ALL these Bot Token Scopes:
   - `chat:write`
   - `channels:history`
   - `channels:read`
   - `groups:history`
   - `groups:read`
   - `im:history`
   - `im:read`

### 3. Install App

1. Click "Install to Workspace"
2. Copy the Bot User OAuth Token (starts with `xoxb-`)
3. Set environment variable:
   ```bash
   export SLACK_BOT_TOKEN="xoxb-your-token-here"
   ```

### 4. Test in Slack

1. Create a test channel: `#promptfoo-test`
2. Invite your bot: `/invite @Promptfoo Test Bot`
3. Get the channel ID:
   - Click channel name → About → Copy Channel ID
   - Should look like: `C01234ABCDE`

### 5. Run Simple Test

Create `test-slack.yaml`:

```yaml
providers:
  - id: slack:C01234ABCDE # Your channel ID
    config:
      timeout: 30000

prompts:
  - "Test message - please reply with 'success'"

tests:
  - assert:
      - type: contains
        value: success
```

Run:

```bash
npx promptfoo eval -c test-slack.yaml -j 1
```

### 6. What Should Happen

1. Bot posts "Test message - please reply with 'success'" in your channel
2. You have 30 seconds to reply
3. promptfoo captures your response
4. Test passes if your message contains "success"

## Troubleshooting

### Bot doesn't post

- Check token is correct
- Verify bot is in channel
- Check channel ID format

### No response captured

- Reply in the same channel
- Make sure you're not using a bot account
- Check all scopes are added

### Rate limits

- For testing, use public channels (better rate limits)
- Add delays between tests
- Consider using test workspace

## Advanced Testing

### Test Different Response Strategies

```yaml
providers:
  # First response (default)
  - id: slack:C01234ABCDE

  # Wait for specific user
  - id: slack
    config:
      channel: C01234ABCDE
      responseStrategy: user
      waitForUser: U9876543210 # Your user ID

  # Collect all responses for 10 seconds
  - id: slack
    config:
      channel: C01234ABCDE
      responseStrategy: timeout
      timeout: 10000
```

### Test with Threads

```yaml
providers:
  - id: slack
    config:
      channel: C01234ABCDE
      threadTs: '1234567890.123456' # Existing thread
      includeThread: true
```
