# Claude Thinking Example

This example demonstrates how to use Claude's "thinking out loud" capabilities with promptfoo, showcasing how to evaluate and test Claude's step-by-step reasoning process.

## Quick Start

```bash
npx promptfoo@latest init --example claude-thinking
```

## Configuration

You can use either Anthropic's API directly or AWS Bedrock:

### Option 1: Anthropic Direct Access

```bash
export ANTHROPIC_API_KEY=your_key_here
```

### Option 2: AWS Bedrock

```bash
export AWS_ACCESS_KEY_ID=your_access_key
export AWS_SECRET_ACCESS_KEY=your_secret_key
export AWS_REGION=your_region
```

## Usage

Run the evaluation:

```bash
promptfoo eval
```

View detailed results:

```bash
promptfoo view
```

## What's Being Tested

This example evaluates:

- Step-by-step reasoning capabilities
- Chain-of-thought prompting effectiveness
- Problem-solving strategies
- Explanation clarity and completeness

## Example Structure

The example includes:

- `promptfooconfig.yaml`: Configuration for testing Claude's thinking process
- Custom prompts designed to elicit detailed reasoning
- Test cases with complex problems requiring step-by-step solutions
- Evaluation metrics for reasoning quality

## Additional Resources

- [Claude Documentation](https://docs.anthropic.com/claude/docs)
- [Chain-of-Thought Guide](https://promptfoo.dev/docs/guides/chain-of-thought)
- [AWS Bedrock Integration](https://promptfoo.dev/docs/providers/bedrock)
