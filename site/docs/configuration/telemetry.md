---
sidebar_position: 200
---

# Telemetry

`promptfoo` collects basic anonymous telemetry by default. This telemetry helps us decide how to spend time on development.

An event is recorded when:

- A command is run (e.g. `init`, `eval`, `view`)
- An assertion is used (along with the type of assertion, e.g. `is-json`, `similar`, `llm-rubric`)

No additional information is collected. The above list is exhaustive.

To disable telemetry, set the following environment variable:

```sh
PROMPTFOO_DISABLE_TELEMETRY=1
```

## Updates

The CLI checks NPM's package registry for updates. If there is a newer version available, it will display a banner to the user.

To disable, set:

```sh
PROMPTFOO_DISABLE_UPDATE=1
```
