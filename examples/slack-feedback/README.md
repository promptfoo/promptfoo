# slack-feedback (Human Feedback Collection via Slack)

This example demonstrates how to use the Slack provider to collect human feedback alongside AI model outputs, enabling human-in-the-loop evaluations and comparative studies between human and AI responses.

## Prerequisites

- A Slack workspace where you have permissions to create an app
- A Slack app with the following permissions:
  - `chat:write`
  - `channels:read`, `groups:read`, `im:read`, `mpim:read`
  - `channels:history`, `groups:history`, `im:history`, `mpim:history`
- Bot User OAuth Token from your Slack app
- OpenAI and Anthropic API keys (for comparison with AI models)

## Environment Variables

This example requires the following environment variables:

- `SLACK_BOT_TOKEN` - Your Slack Bot User OAuth Token
- `OPENAI_API_KEY` - Your OpenAI API key
- `ANTHROPIC_API_KEY` - Your Anthropic API key

You can set these in a `.env` file or directly in your environment.

## How It Works

1. The example sends prompts about different topics to both AI models and a Slack channel
2. The Slack provider posts the message to the specified channel and waits for a response
3. The first non-bot message in the channel after the prompt is captured as the response
4. Results are collected and can be compared between human and AI responses
5. Advanced validation techniques analyze the human responses for various qualities

## Advanced Validation Techniques

This example demonstrates several validation techniques for human feedback:

- **Basic Validation** - Checking for non-empty responses or minimum content length
- **Keyword Analysis** - Verifying responses contain relevant topic keywords
- **Personal Perspective Detection** - Identifying if responses include personal insights or experiences
- **LLM-Based Rubric Evaluation** - Using AI to evaluate human responses on dimensions like:
  - Insightfulness
  - Sentiment
  - Topical relevance
  - Expertise/knowledge depth
- **Semantic Similarity** - Comparing responses against reference statements

These validation approaches can be customized for your specific evaluation needs.

## Running the Example

You can run this example with:

```bash
npx promptfoo@latest init --example slack-feedback
```

Then update the configuration in `promptfoo.yaml` with your Slack channel ID and environment variables.

Run the evaluation:

```bash
npx promptfoo@latest eval
```

## Customization

- Modify the prompts in the `prompts/` directory to ask different questions
- Adjust the `timeout` value in the configuration to allow more or less time for responses
- Add more topics or custom validation criteria
- Create custom scoring or evaluation mechanisms for human feedback

## Security Best Practices

- Store your Slack Bot Token as an environment variable, not in configuration files
- Create a dedicated Slack app for evaluation purposes rather than using existing apps
- Limit the channels where your bot is invited to minimize exposure
- Consider using private channels for sensitive evaluations
- Regularly rotate your API tokens
- Remove unnecessary metadata from stored responses

## Use Cases

- Collecting human feedback on AI outputs
- Comparing human and AI responses to the same prompts
- Creating benchmarks with human responses
- Human-in-the-loop evaluations for specialized domains
- Sentiment analysis of human responses to AI-generated content
- Evaluating AI explanations against human explanations
