# slack-human-feedback

This example shows how to collect human feedback via Slack for evaluating AI responses.

## Prerequisites

1. **Install the Slack Web API** (optional dependency):

   ```bash
   npm install @slack/web-api
   ```

2. **Create a Slack App**:
   - Go to https://api.slack.com/apps
   - Click "Create New App" → "From scratch"
   - Give it a name (e.g., "Promptfoo Evaluator")
   - Select your workspace

3. **Add Bot Token Scopes**:
   - Go to "OAuth & Permissions"
   - Under "Bot Token Scopes", add:
     - `chat:write`
     - `channels:history`
     - `channels:read`
     - `groups:history`
     - `groups:read`
     - `im:history`
     - `im:read`

4. **Install to Workspace**:
   - Click "Install to Workspace"
   - Copy the Bot User OAuth Token (starts with `xoxb-`)

5. **Set Environment Variable**:

   ```bash
   export SLACK_BOT_TOKEN=xoxb-your-token-here
   ```

6. **Invite Bot to Channel**:
   - In Slack, go to your test channel
   - Type `/invite @your-bot-name`

## Running the Example

You can run this example with:

```bash
npx promptfoo@latest init --example slack-human-feedback
```

Then update the channel ID in `promptfooconfig.yaml` and run:

```bash
npx promptfoo@latest eval
```

## Configuration

The example compares AI responses with human feedback:

```yaml
providers:
  - openai:gpt-4o-mini # AI model
  - slack:C_YOUR_CHANNEL_ID # Human feedback
```

When you run the evaluation:

1. The AI model generates responses
2. The Slack provider posts prompts to your channel
3. Humans respond in Slack
4. Results are collected and compared

## Finding Your Channel ID

In Slack:

1. Click the channel name at the top
2. Click "About" tab
3. Look for "Channel ID" at the bottom

## Advanced Usage

For more advanced configurations (specific user feedback, timeout settings, etc.), see the [Slack provider documentation](https://promptfoo.dev/docs/providers/slack).
