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

## Optional Error Reporting

In addition to basic telemetry, `promptfoo` can optionally use [Sentry](https://sentry.io/) for error tracking and monitoring. Sentry helps us identify and fix bugs more efficiently by providing detailed error reports.

To enable error reporting with Sentry, you need to explicitly opt-in by setting the following environment variable:

```sh
PROMPTFOO_ENABLE_ERROR_REPORTING=1
```

We recommend enabling Sentry if you encounter any issues, as it provides us with valuable information to resolve problems quickly. Note that you should NOT enable error reporting if your prompts include any secrets or personally identifiable information, as this may expose those secrets to the Sentry service.

## Updates

The CLI checks NPM's package registry for updates. If there is a newer version available, it will display a banner to the user.

To disable update checks, set:

```sh
PROMPTFOO_DISABLE_UPDATE=1
```
