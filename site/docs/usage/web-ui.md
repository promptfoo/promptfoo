---
sidebar_position: 30
sidebar_label: Web viewer
description: Compare and analyze LLM outputs side-by-side with promptfoo's web viewer. Share results, rate responses, and track evaluations in real-time for AI testing workflows.
---

# Using the web viewer

View and compare eval results in your browser.

```sh
npx promptfoo@latest view
```

After you [run an eval](/docs/getting-started), the viewer displays results side-by-side:

![promptfoo web viewer](https://user-images.githubusercontent.com/310310/244891219-2b79e8f8-9b79-49e7-bffb-24cba18352f2.png)

## Features

- **Compare prompts** - See outputs across models and prompts in one view
- **Rate outputs** - Mark good and bad responses to identify top performers
- **Filter** - Narrow results by metrics, metadata, or pass/fail status
- **Keyboard shortcuts** - Navigate quickly without the mouse
- **Bulk operations** - Export or delete multiple evals at once
- **Live updates** - Results refresh automatically after each eval

For terminal, HTML, CSV, or JSON output, see [output formats](/docs/configuration/outputs).

## Sharing

Click the **Share** button to send results to teammates.

### Cloud (free forever)

Sharing to [promptfoo.app](https://promptfoo.app/welcome) is free and creates private links visible only to your organization.

```sh
# One-time setup
promptfoo auth login -k YOUR_API_KEY

# Share any eval
promptfoo share
```

### Self-hosted

Share to your own server by setting these in your config:

```yaml title="promptfooconfig.yaml"
sharing:
  apiBaseUrl: http://your-server:3000
  appBaseUrl: http://your-server:3000
```

Or configure via **API Settings** in the viewer's top-right menu.

See [sharing documentation](/docs/usage/sharing) for authentication, enterprise options, and CI/CD setup.

## Column Visibility

The web viewer lets you hide columns to focus on what matters. Your preferences persist across evals with matching column names.

### Quick Actions

In the column selector dialog:

- **Show All** - Display all columns
- **Variables** - Toggle all variable columns at once
- **Reset** - Clear saved preferences

### How Preferences Work

Column visibility is resolved in priority order:

1. **Config defaults** - Set in `promptfooconfig.yaml`
2. **Saved preferences** - Stored locally in your browser
3. **Global defaults** - All columns visible

When you hide a column like "context", it stays hidden across all evals that have a "context" variable.

### Config-Based Defaults

Set default column visibility in your config:

```yaml title="promptfooconfig.yaml"
defaultColumnVisibility:
  # Hide all variables by default
  variables: hidden

  # Or selectively hide specific columns
  hideColumns:
    - context
    - system_prompt

  # Or show only specific columns (overrides hideColumns)
  showColumns:
    - question
    - expected
```

| Property      | Type                    | Description                                          |
| ------------- | ----------------------- | ---------------------------------------------------- |
| `variables`   | `'visible' \| 'hidden'` | Default visibility for all variable columns          |
| `prompts`     | `'visible' \| 'hidden'` | Default visibility for all prompt columns            |
| `hideColumns` | `string[]`              | List of column names to hide by default              |
| `showColumns` | `string[]`              | List of column names to show (overrides hideColumns) |

Config defaults apply to all users viewing this eval, while browser preferences are personal.
