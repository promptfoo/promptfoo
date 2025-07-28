# Slack Human Feedback Example

This example demonstrates how to use the Slack provider to collect human feedback alongside AI model outputs. It's useful for:

- Comparing human and AI responses
- Building golden datasets from expert feedback
- Evaluating AI performance with human judgment
- Creating human-in-the-loop evaluation workflows

## Prerequisites

1. **Slack Bot Setup**
   - Create a Slack app at [api.slack.com/apps](https://api.slack.com/apps)
   - Add the required bot token scopes (see main documentation)
   - Install the app to your workspace
   - Copy the Bot User OAuth Token

2. **Environment Setup**
   ```bash
   export SLACK_BOT_TOKEN="xoxb-your-bot-token"
   export OPENAI_API_KEY="your-openai-key"      # Optional
   export ANTHROPIC_API_KEY="your-anthropic-key" # Optional
   ```

3. **Update Configuration**
   - Replace `C0123ABCDEF` with your actual Slack channel ID
   - Optionally update user ID for expert review mode

## Bot Testing Use Case

This Slack provider is also excellent for testing other Slack bots! See `bot-testing.yaml` for a comprehensive example that shows how to:

- **Automated Bot Testing**: Test your Slack bot's responses automatically
- **Regression Testing**: Ensure bot behavior doesn't degrade over updates  
- **A/B Testing**: Compare different bot versions or implementations
- **Load Testing**: Test bot performance under various loads
- **Edge Case Testing**: Verify bot handles errors and edge cases properly

### Quick Bot Testing Setup

1. **Find your bot's user ID**:
```bash
# Create a helper script
cat > find-bot-id.js << 'EOF'
const { WebClient } = require('@slack/web-api');
const client = new WebClient(process.env.SLACK_BOT_TOKEN);

async function findBots() {
  const result = await client.users.list();
  const bots = result.members.filter(u => u.is_bot && !u.deleted);
  bots.forEach(bot => {
    console.log(`${bot.name}: ${bot.id}`);
  });
}
findBots();
EOF

node find-bot-id.js
```

2. **Create a test configuration**:
```yaml
providers:
  - id: slack
    config:
      channel: C_YOUR_TEST_CHANNEL
      responseStrategy: user
      userId: U_BOT_TO_TEST  # From step 1
      messageFormatter: "<@{{userId}}> {{prompt}}"

prompts:
  - "Hello bot!"
  - "What can you do?"
  - "Help me with my order"
```

3. **Run the test**:
```bash
SLACK_TARGET_BOT_ID=U_BOT_TO_TEST promptfoo eval -c bot-test.yaml
```

### Bot Testing Best Practices

1. **Use dedicated test channels** - Don't test in production channels
2. **Test at different times** - Bot performance may vary with load
3. **Include edge cases** - Empty messages, special characters, very long inputs
4. **Monitor rate limits** - Both your test bot and target bot have limits
5. **Test conversation flows** - Not just single messages
6. **Compare with baselines** - Human responses or previous bot versions

## Running the Example

```bash
# Install dependencies
npm install

# Run the evaluation (sequential execution recommended for Slack)
npx promptfoo eval -j 1

# View results
npx promptfoo view
```

## Configuration Overview

This example includes three scenarios:

1. **Customer Support** - Evaluates empathetic and solution-oriented responses
2. **Technical Explanation** - Tests ability to explain complex topics simply
3. **Creative Writing** - Assesses storytelling and creativity

Each scenario is evaluated by:
- OpenAI GPT-4 (AI baseline)
- Anthropic Claude (AI comparison)
- Human via Slack (ground truth)

## Response Collection Strategies

### 1. First Response (Default)
```yaml
responseStrategy: "first"
```
Captures the first non-bot message in the channel.

### 2. Specific User
```yaml
responseStrategy: "user"
waitForUser: "U9876543210"
```
Waits for a response from a specific expert.

### 3. Timeout Collection
```yaml
responseStrategy: "timeout"
timeout: 600000  # 10 minutes
```
Collects all responses within the timeout period.

## Customization

### Adding New Scenarios

1. Create a new prompt file in `prompts/`
2. Add it to the `prompts` array in `promptfooconfig.yaml`
3. Add corresponding test cases with appropriate assertions

### Custom Message Formatting

You can customize how prompts appear in Slack by converting to JavaScript config:

```javascript
// promptfooconfig.js
module.exports = {
  providers: [{
    id: 'slack:C0123ABCDEF',
    config: {
      formatMessage: (prompt) => {
        return `🤖 *Evaluation Request*\n\n${prompt}\n\n_Please provide your response_`;
      }
    }
  }]
};
```

### Adjusting Timeouts

- Quick feedback: 60-120 seconds
- Detailed review: 5-10 minutes
- Async collection: 30+ minutes

## Best Practices

1. **Dedicated Channel**: Use a specific channel for evaluations
2. **Clear Instructions**: Include context in your prompts
3. **Sequential Execution**: Always use `-j 1` with Slack provider
4. **Appropriate Timeouts**: Set based on expected response time
5. **Cache Results**: Enable caching to avoid re-running evaluations

## Troubleshooting

### Bot Not Responding
- Ensure bot is invited to the channel (`/invite @YourBot`)
- Verify token has required permissions
- Check channel ID is correct

### Timeout Errors
- Increase timeout value
- Ensure evaluators are aware of time constraints
- Consider async collection strategy

### Rate Limits
- Add delays between evaluations if needed
- Use `PROMPTFOO_DELAY_MS` environment variable

## Example Output

After running the evaluation, you'll see results comparing:
- How different AI models handle each scenario
- Human responses as ground truth
- Assertion results showing quality metrics

The web viewer provides a comprehensive comparison table and detailed analysis.

## Next Steps

- Customize prompts for your use case
- Add domain-specific evaluation criteria
- Integrate with your existing workflow
- Export results for further analysis 