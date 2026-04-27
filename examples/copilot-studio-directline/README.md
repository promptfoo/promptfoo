# copilot-studio-directline (Microsoft Copilot Studio Direct Line)

You can run this example with:

```bash
npx promptfoo@latest init --example copilot-studio-directline
cd copilot-studio-directline
```

This example evaluates a Microsoft Copilot Studio agent through the Bot Framework Direct Line API.

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

View results:

```bash
promptfoo view
```
