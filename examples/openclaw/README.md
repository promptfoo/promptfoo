# openclaw (OpenClaw Agent Testing)

This example demonstrates how to use promptfoo with OpenClaw, a personal AI assistant framework.

## Prerequisites

1. Install OpenClaw: `npm install -g openclaw@latest`
2. Run the onboarding wizard: `openclaw onboard`
3. Enable the HTTP API by adding to `~/.openclaw/openclaw.json`:
   ```json
   {
     "gateway": {
       "http": {
         "endpoints": {
           "chatCompletions": {
             "enabled": true
           }
         }
       }
     }
   }
   ```
4. Start the gateway: `openclaw gateway` (or restart if already running: `openclaw gateway restart`)

## Setup

```bash
npx promptfoo@latest init --example openclaw
```

## Usage

```bash
npx promptfoo@latest eval
```

The provider auto-detects the gateway URL and auth token from `~/.openclaw/openclaw.json`.

## Configuration

You can override auto-detection with explicit config:

```yaml
providers:
  - id: openclaw:main
    config:
      gateway_url: http://127.0.0.1:18789
      auth_token: your-token-here
```

Or use environment variables:

```bash
export OPENCLAW_GATEWAY_URL=http://127.0.0.1:18789
export OPENCLAW_GATEWAY_TOKEN=your-token-here
```
