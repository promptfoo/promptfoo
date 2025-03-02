# Claude Vision Example

This example demonstrates how to evaluate Claude 3's vision capabilities using promptfoo. You can test Claude's visual understanding through either:

- Anthropic's API directly
- AWS Bedrock integration

## Quick Start

```bash
npx promptfoo@latest init --example claude-vision
```

## Configuration

Set up authentication for your preferred provider:

### Option 1: Anthropic Direct Access

```bash
export ANTHROPIC_API_KEY=your-key-here
```

### Option 2: AWS Bedrock

```bash
export AWS_ACCESS_KEY_ID=your-access-key
export AWS_SECRET_ACCESS_KEY=your-secret-key
```

Alternatively, configure credentials using the AWS CLI: `aws configure`

## Usage

Run the evaluation:

```bash
promptfoo eval
```

View the results in an interactive interface:

```bash
promptfoo view
```

## What's Being Tested

This example evaluates Claude's ability to:

- Analyze image content and composition
- Extract text from images
- Answer questions about visual details
- Compare multiple images
- Generate detailed image descriptions

## Additional Resources

- [Claude Vision Guide](https://promptfoo.dev/docs/providers/claude#vision)
- [Image Testing Documentation](https://promptfoo.dev/docs/configuration/image-testing)
- [AWS Bedrock Setup](https://promptfoo.dev/docs/providers/bedrock)
