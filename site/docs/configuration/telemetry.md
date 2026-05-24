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

`promptfoo` collects basic usage telemetry by default. This telemetry helps us decide how to spend time on development.

An event is recorded when:

- A command is run (e.g. `init`, `eval`, `view`)
- An assertion is used (along with the type of assertion, e.g. `is-json`, `similar`, `llm-rubric`)

Telemetry events include package version and whether the command is running in CI. When account information is present in the local promptfoo config, hosted telemetry also includes the promptfoo user ID, email address, cloud login status, and authentication method.

Telemetry does not include prompts, model outputs, test cases, provider API keys, or full configuration files.

To disable telemetry, set the following environment variable:

```sh
PROMPTFOO_DISABLE_TELEMETRY=1
```

## Updates

The CLI checks for updates when it starts up. If there is a newer version available, it will display a notification message suggesting you run `promptfoo update` to upgrade.

To disable update notifications, set:

```sh
PROMPTFOO_DISABLE_UPDATE=1
```

Note: This only disables the notification. You can still manually update using `promptfoo update` at any time.

## Automatic Updates

:::caution Experimental Feature

Automatic background updates are **disabled by default** and considered experimental. This is an opt-in feature. Use with caution in production environments.

:::

When enabled, promptfoo schedules an automatic update when a new version is detected. It starts the update only after the current CLI invocation finishes, so a running eval or server does not use files while they are being replaced. The new version will be available on your next command.

### Enabling Auto-Updates

Auto-updates are **opt-in**. To enable automatic background updates:

```sh
# Enable auto-updates (opt-in, disabled by default)
export PROMPTFOO_ENABLE_AUTO_UPDATE=1
```

### Disabling Auto-Updates

Auto-updates are disabled by default. No action needed unless you've previously enabled them:

```sh
# Disable auto-updates (default behavior)
unset PROMPTFOO_ENABLE_AUTO_UPDATE
# Or explicitly disable
export PROMPTFOO_ENABLE_AUTO_UPDATE=0
```

### How It Works

- Auto-updates only work for globally installed instances (npm, yarn, pnpm, bun)
- Updates begin after the current promptfoo command completes
- The new version takes effect on the next promptfoo command
- No updates occur for local project installations, Docker, or npx usage
- npm auto-updates require confirmation that the active CLI is from npm's global install root
- Updates are skipped if `PROMPTFOO_DISABLE_UPDATE=1` is set

### Supported Installation Methods

Auto-updates work with global npm, yarn, pnpm, and bun installations.

Auto-updates are **not available** for local project installations, Homebrew, Docker, npx/pnpx/bunx, or git clones.
