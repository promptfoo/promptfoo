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

The CLI checks for a newer Promptfoo release when it starts and prints update instructions. To disable those requests and notifications, set:

```sh
export PROMPTFOO_DISABLE_UPDATE=1
```

`promptfoo update --force` explicitly overrides this setting and reinstalls the latest package. `promptfoo update --check` never installs a package and continues to respect the setting.

## Automatic Updates

Automatic installation is disabled by default. To opt in, set this variable in the shell or parent process that launches Promptfoo:

```sh
export PROMPTFOO_ENABLE_AUTO_UPDATE=1
```

Only verified global npm installations on macOS and Linux support installation through the CLI. Other installation methods receive manual instructions. A project `.env`, `--env-file`, or configuration override cannot enable automatic installation. A launch-time `PROMPTFOO_DISABLE_UPDATE=1` remains a veto even if later configuration clears it; later configuration can also disable updates.

An automatic update starts after a successful, uninterrupted command releases its resources. It uses launch-time package-manager settings, a filtered executable search path, and a private working directory. The CLI waits up to 60 seconds. If installation is still running, it reports that result and leaves npm running in the background. Wait for installation to finish before running Promptfoo again. A background install may leave its empty temporary working directory behind when the CLI exits.

To stop automatic installation, unset `PROMPTFOO_ENABLE_AUTO_UPDATE` or set it to `0`. To check for updates without installing, run `promptfoo update --check`.
