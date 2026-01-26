---
title: Using the Web Viewer
sidebar_position: 30
sidebar_label: Web viewer
description: Compare LLM outputs side-by-side, rate responses for training data, share evaluations, and analyze results with Promptfoo's interactive web viewer.
---

# Using the web viewer

After [running an eval](/docs/getting-started), view results in your browser:

```sh
npx promptfoo@latest view
```

See [`promptfoo view`](/docs/usage/command-line#promptfoo-view) for CLI options.

![promptfoo web viewer](/img/docs/web-ui-viewer.png)

## Keyboard Shortcuts

| Shortcut           | Action                  |
| ------------------ | ----------------------- |
| `Ctrl+K` / `Cmd+K` | Open eval selector      |
| `Esc`              | Clear search            |
| `Shift` (hold)     | Show extra cell actions |

## Toolbar

- **Eval selector** - Switch between evals
- **Zoom** - Scale columns (50%-200%)
- **Display mode** - Filter: All, Failures, Passes, Errors, Different, Highlights
- **Search** - Text or regex
- **Filters** - By metrics, metadata, pass/fail. Operators: `=`, `contains`, `>`, `<`
- **Bulk Rate** - Apply pass/fail rating to multiple results at once (respects current filters)

![Display mode dropdown](/img/docs/web-ui-display-mode.png)

## Table Settings

![Table Settings dialog](/img/docs/web-ui-table-settings.png)

- **Columns** - Toggle variable and prompt visibility
- **Truncation** - Max text length, word wrap
- **Rendering** - Markdown, JSON prettification
- **Inference details** - Tokens, latency, cost, tokens/sec
- **Media** - Image size limits; double-click for lightbox

## Cell Actions

Hover to reveal actions. Hold `Shift` for more:

|     | Action    | Description                                     |
| --- | --------- | ----------------------------------------------- |
| 🔍  | Details   | Full output, prompt, variables, grading results |
| 👍  | Pass      | Mark as passed (score = 1.0)                    |
| 👎  | Fail      | Mark as failed (score = 0.0)                    |
| 🔢  | Score     | Set custom score (0-1)                          |
| ✏️  | Comment   | Add notes                                       |
| ⭐  | Highlight | Mark for review (`Shift`)                       |
| 📋  | Copy      | Copy to clipboard (`Shift`)                     |
| 🔗  | Share     | Link to this output (`Shift`)                   |

Ratings and comments persist and are included in exports—use them to build training datasets.

## Bulk Rating

Rate multiple results at once using the **Bulk Rate** button in the toolbar.

1. Filter results using display mode, search, or advanced filters
2. Click **Bulk Rate**
3. Select **Pass** or **Fail**
4. Enter a reason (applied to all matching results)
5. Confirm the operation

The dialog previews how many results will be affected. Operations on 50+ results require explicit confirmation.

:::note
Bulk rating uses the same filter criteria as your current view. Filter first to target specific subsets of results.
:::

## Eval Actions

![Eval actions menu](/img/docs/web-ui-eval-actions.png)

- **Edit name** - Rename eval
- **Edit and re-run** - Open in eval creator
- **Compare** - Diff against another eval (green = added, red = removed)
- **View YAML** - Show config
- **Download** - Opens export dialog:

| Export            | Use case                         |
| ----------------- | -------------------------------- |
| YAML config       | Re-run the eval                  |
| Failed tests only | Debug failures                   |
| CSV / JSON        | Analysis, reporting              |
| DPO JSON          | Preference training data         |
| Human Eval YAML   | Human labeling workflows         |
| Burp payloads     | Security testing (red team only) |

- **Copy** - Duplicate eval
- **Share** - Generate URL (see [Sharing](#sharing))
- **Delete**

## Results Charts

Toggle with **Show Charts**.

![Results charts](/img/docs/web-ui-results-charts.png)

### Pass Rate

Percentage of tests where all [assertions](/docs/configuration/expected-outputs) passed.

### Score Distribution

Histogram of scores per prompt. Each test score = mean of its assertion scores. See [weighted assertions](/docs/configuration/expected-outputs#weighted-assertions).

### Scatter Plot

Compare two prompts head-to-head. Click to select prompts.

- **Green** = Prompt 2 scored higher
- **Red** = Prompt 1 scored higher
- **Gray** = Same score

## Sharing

**Eval actions → Share** generates a URL.

### Cloud

Free at [promptfoo.app](https://promptfoo.app/welcome). Links are private to your organization.

```sh
promptfoo auth login -k YOUR_API_KEY
promptfoo share
```

### Self-hosted

For [self-hosted deployments](/docs/usage/self-hosting):

```yaml title="promptfooconfig.yaml"
sharing:
  apiBaseUrl: http://your-server:3000
  appBaseUrl: http://your-server:3000
```

Or set via **API Settings** in the top-right menu. See [sharing docs](/docs/usage/sharing) for auth and CI/CD.

## URL Parameters

Viewer state syncs to the URL—bookmark or share filtered views:

| Parameter    | Values                                                           |
| ------------ | ---------------------------------------------------------------- |
| `filterMode` | `all`, `failures`, `passes`, `errors`, `different`, `highlights` |
| `search`     | Any text                                                         |

```text
/eval/abc123?filterMode=failures&search=timeout
```
