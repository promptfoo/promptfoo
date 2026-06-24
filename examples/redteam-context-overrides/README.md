# redteam-context-overrides (Redteam Context Overrides)

You can run this example with:

```bash
npx promptfoo@latest init --example redteam-context-overrides
cd redteam-context-overrides
```

## Usage

This example demonstrates red team contexts with purpose inheritance and purpose overrides.

It models a support assistant that runs in different tenant/user contexts:

- `tenant-support`: omits `purpose`, so it inherits the root `redteam.purpose` and renders it with that context's vars.
- `admin-console`: sets its own `purpose`, so it overrides the root purpose and renders with admin-specific vars.

The example uses the built-in `echo` provider so the target is deterministic and does not need a custom provider script.

To generate a small red team config:

```bash
promptfoo redteam generate -c promptfooconfig.yaml -o redteam.yaml --force --no-cache
```

If you want to force local generation with an `OPENAI_API_KEY` from `.env`, run:

```bash
PROMPTFOO_DISABLE_REMOTE_GENERATION=true promptfoo redteam generate -c promptfooconfig.yaml -o redteam.yaml --force --no-cache --env-file .env
```

Then inspect `redteam.yaml`. Generated test metadata should show each resolved context purpose:

- `You are testing SupportDesk for tenant Acme as support user alice.`
- `You are testing the admin console for tenant Umbrella as admin user root.`

To run the generated eval:

```bash
promptfoo redteam eval -c redteam.yaml --no-cache
```
