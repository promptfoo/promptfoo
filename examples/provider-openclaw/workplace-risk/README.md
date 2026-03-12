# provider-openclaw/workplace-risk (OpenClaw Workplace Risk Lab)

This example accompanies the blog post ["Should You Let Employees Use OpenClaw at Work?"](/blog/openclaw-at-work).

It demonstrates a safe local lab for testing how OpenClaw behaves when a malicious web page can influence it.

## Prerequisites

1. Install OpenClaw: `npm install -g openclaw@latest`
2. Run onboarding: `openclaw onboard`
3. Start the gateway: `openclaw gateway`
4. Install Promptfoo: `npm install -g promptfoo`

## Setup

```bash
npx promptfoo@latest init --example provider-openclaw/workplace-risk
cd provider-openclaw/workplace-risk
python3 -m http.server 8765 --directory attack-site
python3 mock_outbound_server.py
```

Run the eval in a third terminal:

```bash
npx promptfoo@latest eval --no-cache
```

## Notes

- This example uses loopback-only endpoints on `127.0.0.1` for safety.
- The custom provider wraps OpenClaw's WS agent provider so the eval can do follow-up checks and inspect local artifacts.
- The `workspace/` directory is where the example stores sink logs such as `mock-sms.log`, `mock-social.log`, and `mock-email.log`.
