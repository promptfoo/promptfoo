# openai-chatkit (OpenAI ChatKit Workflow Evaluation)

Evaluate ChatKit workflows built with OpenAI's Agent Builder using browser automation.

## Quick Start

```bash
npx promptfoo@latest init --example openai-chatkit
```

## Prerequisites

1. Install Playwright browser:

```bash
npx playwright install chromium
```

2. Get your workflow ID from Agent Builder:
   - Open [platform.openai.com](https://platform.openai.com) > Agent Builder
   - Click **Publish** on your workflow
   - Copy the workflow ID (e.g., `wf_68ffb83dbfc88190a38103c2bb9f421003f913035dbdb131`)

3. Update `promptfooconfig.yaml` with your workflow ID

## Environment Variables

- `OPENAI_API_KEY` - Your OpenAI API key

## Run the Eval

```bash
npx promptfoo@latest eval --max-concurrency 4
```

View results:

```bash
npx promptfoo@latest view
```

## Multi-Turn Conversations

For workflows that ask follow-up questions, enable stateful mode:

```yaml
providers:
  - id: openai:chatkit:wf_YOUR_WORKFLOW_ID
    config:
      stateful: true

tests:
  - vars:
      message: 'I want to plan a party'
  - vars:
      message: 'For 20 people with a $500 budget'
```

Run with `--max-concurrency 1` for stateful mode.

## Using with Simulated User

Test multi-turn conversations automatically:

```yaml
providers:
  - id: openai:chatkit:wf_YOUR_WORKFLOW_ID
    config:
      stateful: true

defaultTest:
  provider:
    id: 'promptfoo:simulated-user'
    config:
      maxTurns: 5

tests:
  - vars:
      instructions: |
        You are planning a birthday party.
        Answer questions naturally and provide details when asked.
```

## Learn More

- [ChatKit Provider Documentation](https://www.promptfoo.dev/docs/providers/openai-chatkit/)
- [Simulated User Provider](https://www.promptfoo.dev/docs/providers/simulated-user/)
- [OpenAI Agent Builder](https://platform.openai.com/docs/guides/chatkit)
