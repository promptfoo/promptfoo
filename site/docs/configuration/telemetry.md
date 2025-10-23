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

## Update Notifications

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

When enabled, promptfoo will attempt to automatically update itself in the background when a new version is detected. The update runs silently without interrupting your workflow, and the new version will be available on your next command.

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
- Updates run in the background without blocking your commands
- The new version takes effect on the next promptfoo command
- No updates occur for local project installations, Docker, or npx usage
- Updates are skipped if `PROMPTFOO_DISABLE_UPDATE=1` is set

### Supported Installation Methods

Auto-updates work with:

- ✅ Global npm (`npm install -g promptfoo`)
- ✅ Global yarn (`yarn global add promptfoo`)
- ✅ Global pnpm (`pnpm add -g promptfoo`)
- ✅ Global bun (`bun add -g promptfoo`)

Auto-updates are **not available** for:

- ❌ Local project installations (update via `package.json`)
- ❌ Homebrew (use `brew upgrade promptfoo`)
- ❌ Docker (use `docker pull promptfoo/promptfoo:latest`)
- ❌ npx/pnpx/bunx (always runs latest by default)
- ❌ Git clones (use `git pull`)
