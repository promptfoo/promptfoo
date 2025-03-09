---
description: "Demonstrates Claude's thinking capability for complex problem solving"
---

# Claude's Step-by-Step Thinking Demonstration

This example demonstrates Claude's "thinking" capability, which allows you to see the model's step-by-step reasoning process before it provides a final answer. The example compares thinking outputs from both the Anthropic API directly and Claude on AWS Bedrock.

You can run this example with:

```bash
npx promptfoo@latest init --example claude-thinking
```

## What This Example Demonstrates

- Using Claude's thinking feature to reveal step-by-step reasoning
- Comparing thinking output quality between different Claude providers
- Configuring the thinking token budget
- Using LLM-based evaluation rubrics to assess reasoning quality

## Environment Variables

This example requires at least one of the following sets of credentials:

### For Anthropic API (Recommended)

- `ANTHROPIC_API_KEY` - Your Anthropic API key from [console.anthropic.com](https://console.anthropic.com/)

### For AWS Bedrock

- `AWS_ACCESS_KEY_ID` - Your AWS access key
- `AWS_SECRET_ACCESS_KEY` - Your AWS secret key
- Or configure credentials via the AWS CLI: `aws configure`

## Prerequisites

For AWS Bedrock, you must:

1. Enable Claude model access in your AWS account
   - Go to the AWS Bedrock console
   - Navigate to "Model access" in the left sidebar
   - Find "Anthropic - Claude" and click "Edit"
   - Enable the model and save changes
2. Ensure you have permissions to use the Claude model
3. Set the correct AWS region in the config (default: us-west-2)

## Running the Example

After setting up environment variables:

```bash
# From the example directory
promptfoo eval
promptfoo view
```

## Test Cases

This example includes several test cases of increasing complexity:

1. **8 Balls Problem** - A classic logic puzzle requiring careful reasoning
2. **Train Meeting Problem** - A traditional algebra word problem

These test cases are specifically designed to showcase Claude's ability to break down complex problems and show detailed thinking steps.

## How Claude Thinking Works

The thinking feature is enabled by setting special parameters in the provider configuration:

```yaml
thinking:
  type: 'enabled'
  budget_tokens: 4096 # Controls how many tokens are allocated for thinking
max_tokens: 8192 # Must be greater than budget_tokens
```

When enabled, Claude's response will include a "Thinking:" section that shows its reasoning process before the final answer:

```
Thinking: Let me solve this step by step...
1. First, I'll divide the 8 balls into three groups...
2. In the first weighing, I'll compare groups A and B...
3. Based on the result, I can determine...

Final answer: We need exactly 2 weighings to find the heavier ball.
```

## Additional Resources

- [Claude Thinking Documentation](https://docs.anthropic.com/claude/docs/extended-thinking)
- [AWS Bedrock Claude Guide](https://docs.aws.amazon.com/bedrock/latest/userguide/model-parameters-claude.html)
- [AWS Bedrock Model Access Setup](https://docs.aws.amazon.com/bedrock/latest/userguide/model-access.html)
- [Promptfoo Documentation on Claude Providers](https://promptfoo.dev/docs/providers/anthropic)
