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
