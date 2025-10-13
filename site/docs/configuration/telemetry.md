---
sidebar_position: 42
sidebar_label: Telemetry
title: Telemetry Configuration - Usage Analytics and Monitoring
description: Configure telemetry and analytics for promptfoo usage monitoring. Learn data collection settings, privacy controls, and usage tracking options.
keywords:
  [
    telemetry configuration,
    usage analytics,
    monitoring,
    data collection,
    privacy settings,
    usage tracking,
    analytics setup,
  ]
pagination_prev: configuration/caching
pagination_next: null
---

# Telemetry

`promptfoo` collects basic telemetry by default to help us improve the product.

## What We Collect

Telemetry events are recorded when:

- A command is run (e.g. `init`, `eval`, `view`)
- An assertion is used (along with the type of assertion, e.g. `is-json`, `similar`, `llm-rubric`)
- A randomly generated anonymous user ID
- Your email address (if you are logged into Promptfoo Cloud)

## What We Don't Collect

- Prompts, test cases, or evaluation content
- API keys or credentials
- LLM inputs or outputs
- Source code

For more details, see our [Privacy Policy](https://www.promptfoo.dev/privacy/).

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
