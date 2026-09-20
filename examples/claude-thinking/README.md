# claude-thinking (Claude Thinking)

This example demonstrates Claude's "thinking" capability, which allows you to see the model's step-by-step reasoning process before it provides a final answer. It compares adaptive thinking on Claude Opus 5 and Claude Sonnet 5 (Anthropic API) against budget-based thinking on Claude Haiku 4.5 (AWS Bedrock).

You can run this example with:

```bash
npx promptfoo@latest init --example claude-thinking
cd claude-thinking
```

## What This Example Demonstrates

- Using Claude's thinking feature to reveal step-by-step reasoning
- Comparing thinking output quality between different Claude models
- Comparing Anthropic API vs AWS Bedrock providers
- Configuring the thinking token budget
- Using LLM-based evaluation rubrics to assess reasoning quality

## Environment Variables

This example requires:

### For Anthropic API

- `ANTHROPIC_API_KEY` - Your Anthropic API key from [console.anthropic.com](https://console.anthropic.com/)

### For AWS Bedrock

- `AWS_ACCESS_KEY_ID` - Your AWS access key
- `AWS_SECRET_ACCESS_KEY` - Your AWS secret key
- Or configure credentials via the AWS CLI: `aws configure`

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
  type: adaptive # Claude decides how much to think
  display: summarized # Default is 'omitted', which returns empty thinking text
effort: high # Depth control on Claude 4.7+ — replaces budget_tokens
max_tokens: 8192 # Thinking shares this budget with the answer
```

When enabled, Claude's response will include a "Thinking:" section that shows its reasoning process before the final answer:

```text
Thinking: Let me solve this step by step...
1. First, I'll divide the 8 balls into three groups...
2. In the first weighing, I'll compare groups A and B...
3. Based on the result, I can determine...

Final answer: We need exactly 2 weighings to find the heavier ball.
```

## Additional Resources

- [Claude Thinking Documentation](https://platform.claude.com/docs/en/docs/build-with-claude/extended-thinking)
- [AWS Bedrock Claude Guide](https://docs.aws.amazon.com/bedrock/latest/userguide/model-parameters-claude.html)
- [Promptfoo Documentation on Claude Providers](https://promptfoo.dev/docs/providers/anthropic)
