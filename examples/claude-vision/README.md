# claude-vision (Claude Vision)

You can run this example with:

```bash
npx promptfoo@latest init --example claude-vision
cd claude-vision
```

## Usage

Getting started with Claude vision via Anthropic and/or AWS Bedrock. The config runs Claude Haiku 4.5 and Claude Sonnet 5 side by side.

To get started, set your environment variables:

- `ANTHROPIC_API_KEY` to call anthropic
- `AWS_ACCESS_KEY_ID` and `AWS_SECRET_ACCESS_KEY` to call aws bedrock. Alternatively, you can use the AWS CLI to configure your credentials.

Then run:

```bash
promptfoo eval
```

Afterwards, you can view the results by running:

```sh
promptfoo view
```
