# provider-openclaw (OpenClaw Agent Testing)

This example demonstrates how to use promptfoo with OpenClaw, a personal AI assistant framework.

## Prerequisites

1. Install OpenClaw: `npm install -g openclaw@latest`
2. Run the onboarding wizard: `openclaw onboard`
3. Enable the HTTP API in `~/.openclaw/openclaw.json` if you want Chat or Responses.
   These HTTP endpoints are disabled by default upstream:
   ```json
   {
     "gateway": {
       "http": {
         "endpoints": {
           "chatCompletions": {
             "enabled": true
           },
           "responses": {
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
npx promptfoo@latest init --example provider-openclaw
cd provider-openclaw
```

## Usage

```bash
npx promptfoo@latest eval
```

The provider auto-detects the gateway URL and bearer auth secret from the active OpenClaw config
(`OPENCLAW_CONFIG_PATH` when set, otherwise `~/.openclaw/openclaw.json`). This includes local
bind/port, `OPENCLAW_GATEWAY_PORT` local port overrides, `gateway.tls.enabled`, and
`gateway.mode=remote` with `gateway.remote.url`.

## Configuration

You can override auto-detection with explicit config:

```yaml
providers:
  - id: openclaw:main
    config:
      gateway_url: http://127.0.0.1:18789
      auth_token: your-token-here
      # Use auth_password instead when gateway.auth.mode=password
      # Optional backend model override, sent as x-openclaw-model:
      backend_model: openai/gpt-5.4
```

Or use environment variables:

```bash
export OPENCLAW_CONFIG_PATH=~/.openclaw/openclaw.json  # optional
export OPENCLAW_GATEWAY_URL=http://127.0.0.1:18789
# Or override only the local auto-detected port:
# export OPENCLAW_GATEWAY_PORT=18789
export OPENCLAW_GATEWAY_TOKEN=your-token-here
# Or, if your gateway uses password auth:
# export OPENCLAW_GATEWAY_PASSWORD=your-password-here
```

For `openclaw:agent:*`, promptfoo generates an isolated session key per call by default so evals do
not reuse your persistent OpenClaw `main` session. Set `session_key` explicitly if you want session
continuity. The WS provider signs OpenClaw's `connect.challenge`, persists issued device tokens,
and retries once with a cached device token when the gateway recommends it.

Use `openclaw:embedding:main` or `openclaw:embeddings:<agent-id>` for `/v1/embeddings`. Set
`backend_model` when you want a specific embedding model such as `openai/text-embedding-3-small`.

For password-mode gateways, use `auth_password` or `OPENCLAW_GATEWAY_PASSWORD`.
