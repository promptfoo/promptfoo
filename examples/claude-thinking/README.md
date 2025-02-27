# Claude Thinking Example

This example demonstrates Claude's thinking capability, which allows you to see the model's step-by-step reasoning process before it provides a final answer. The example compares outputs from both the Anthropic API and AWS Bedrock.

## Setup

1. Set your credentials:

```sh
# For Anthropic API
export ANTHROPIC_API_KEY=your_api_key_here

# For AWS Bedrock
export AWS_ACCESS_KEY_ID=your_access_key_here
export AWS_SECRET_ACCESS_KEY=your_secret_key_here
# Or use: aws configure
```

2. For AWS Bedrock, ensure you have:
   - Enabled model access in your AWS account
   - Granted permissions to use the Claude model
   - Set up the correct AWS region

To enable Claude in AWS Bedrock:

1. Go to the AWS Bedrock console
2. Click "Model access" in the left navigation
3. Find "Anthropic - Claude" and click "Edit"
4. Enable the model and save changes

## Running the Example

```sh
promptfoo eval
promptfoo view
```

## How It Works

The example enables Claude's thinking feature by setting the following configuration:

```yaml
thinking:
  type: 'enabled'
  budget_tokens: 4096
max_tokens: 8192 # Must be greater than budget_tokens
```

When enabled, Claude will show its reasoning process in a "Thinking:" block before providing the final answer. For example:

```
Thinking: Let me solve this step by step...
1. First, let's divide the 8 balls into three groups...
2. By weighing groups A and B...
3. Then in the second weighing...

Final answer: We need 2 weighings to find the heavier ball.
```

## Additional Resources

- [Claude Thinking Documentation](https://docs.anthropic.com/claude/docs/extended-thinking)
- [AWS Bedrock Claude Guide](https://docs.aws.amazon.com/bedrock/latest/userguide/model-parameters-claude.html)
- [AWS Bedrock Model Access Setup](https://docs.aws.amazon.com/bedrock/latest/userguide/model-access.html)
