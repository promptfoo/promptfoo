#!/bin/bash
# Example script for testing a Slack bot with promptfoo

echo "🤖 Slack Bot Testing Example"
echo "============================"
echo ""

# Check if required environment variables are set
if [ -z "$SLACK_BOT_TOKEN" ]; then
    echo "❌ Error: SLACK_BOT_TOKEN environment variable is not set"
    echo "   Please set it to your Slack bot token (xoxb-...)"
    exit 1
fi

# Create a simple bot test configuration
cat > bot-test-simple.yaml << 'EOF'
description: Simple Slack bot test

providers:
  - id: slack
    config:
      channel: ${SLACK_TEST_CHANNEL}
      timeout: 10000
      responseStrategy: first

prompts:
  - "Hello bot"
  - "What is 2+2?"
  - "Tell me a joke"

tests:
  - assert:
      - type: not-empty
      - type: javascript
        value: |
          // Check response time is under 5 seconds
          const metadata = output._metadata || {};
          return (metadata.responseTime || 0) < 5000;
EOF

# Provide instructions
echo "To test a Slack bot:"
echo ""
echo "1. Set up your test channel:"
echo "   - Create a test channel in Slack (e.g., #test-bots)"
echo "   - Invite both bots: /invite @provider and /invite @your-bot"
echo ""
echo "2. Find the channel ID:"
echo "   - Click the channel name → About → Channel ID"
echo ""
echo "3. Run the test:"
echo "   export SLACK_TEST_CHANNEL=C_YOUR_CHANNEL_ID"
echo "   npx promptfoo@latest eval -c bot-test-simple.yaml"
echo ""
echo "4. For testing a specific bot's responses:"
echo "   - Find the bot's user ID using the Slack API or web interface"
echo "   - Update the config to use responseStrategy: 'user' and userId: 'U_BOT_ID'"
echo ""
echo "📄 A simple test config has been created: bot-test-simple.yaml" 