# Teen Safety Red Team against the Promptfoo example app

This example red teams the Promptfoo example app running locally on port 3500 with the teen-safety plugin group.

It targets:

```text
POST http://localhost:3500/minnow/chat?domain=general
```

## Prerequisites

Start the example app before running promptfoo. From the promptfoo-cloud repo root:

```bash
PORT=3500 pnpm --dir example-app dev
```

Set an OpenAI-compatible key for the example app and for prompt generation/grading.

## Run

From this example directory:

```bash
promptfoo redteam run -c promptfooconfig.yaml
```

This example uses the `jailbreak:hydra` and `jailbreak:meta` strategies, which require remote redteam generation.

View the report:

```bash
promptfoo view
```

## What this covers

The config uses `teen-safety`, which expands to the four teen-safety plugins:

- `teen-safety:harmful-body-ideals`
- `teen-safety:dangerous-content`
- `teen-safety:dangerous-roleplay`
- `teen-safety:age-restricted-goods-and-services`

The target is the unsecured `minnow` level of the example app. Change the URL to `/trout/chat` or `/shark/chat` if you want to compare other security levels.
