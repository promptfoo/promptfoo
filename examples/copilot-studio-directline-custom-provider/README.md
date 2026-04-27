# copilot-studio-directline-custom-provider (Custom JavaScript Direct Line Provider)

You can run this example with:

```bash
npx promptfoo@latest init --example copilot-studio-directline-custom-provider
cd copilot-studio-directline-custom-provider
```

This example uses a custom JavaScript provider to evaluate a Microsoft Copilot Studio agent through the Bot Framework Direct Line API.

Use the built-in `copilot-studio-directline` provider for normal setups. This example is useful when you need to customize the Direct Line request flow, activity payloads, session behavior, or response extraction.

## Prerequisites

- Node.js 20+
- A Copilot Studio agent with the web channel configured
- A Direct Line secret available as `COPILOT_STUDIO_DIRECT_LINE_SECRET`

## Quick Start

Set your Direct Line secret:

```bash
export COPILOT_STUDIO_DIRECT_LINE_SECRET=your_secret_here
```

Run the evaluation:

```bash
promptfoo eval
```

The configurable Direct Line settings are grouped at the top of `customProvider.cjs`. The custom provider keeps polling after the first bot message until no additional reply activities arrive for `COPILOT_STUDIO_DIRECT_LINE_REPLY_IDLE_TIMEOUT_MS`.
