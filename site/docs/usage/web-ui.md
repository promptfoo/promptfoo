---
title: Using the web viewer
sidebar_position: 30
sidebar_label: Web viewer
description: Compare LLM outputs side-by-side, rate responses for training data, share evaluations, and analyze results with Promptfoo's interactive web viewer.
---

# Using the web viewer

After [running an eval](/docs/getting-started), view results in your browser:

```sh
npx promptfoo@latest view
```

Open a specific stored eval directly:

```sh
npx promptfoo@latest view --id "eval-pmq-2026-08-07T18:45:13"
```

Eval IDs equal to `.` or `..`, or containing a literal `%2F` sequence, cannot be opened with
`view --id` because browsers and routers may normalize or decode them as path separators. Use the
eval selector in the web viewer for those uncommon stored IDs.

Export a stored eval in another supported format without re-running it:

```sh
npx promptfoo@latest export eval "eval-pmq-2026-08-07T18:45:13" \
  --output report.html
```

The output format is inferred from the file extension.

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
- **Display mode** - Filter: All, Failures, Passes, Errors, Different, Highlights
- **Search** - Text or regex
- **Filters** - By metrics, metadata, pass/fail. Operators: `=`, `contains`, `>`, `<`

![Display mode dropdown](/img/docs/web-ui-viewer.png)

## Table Settings

![Table Settings dialog](/img/docs/web-ui-table-settings.png)

- **Columns** - Toggle variable and prompt visibility
- **Zoom** - Scale columns (50%-200%)
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

## Eval Actions

Use the **More** menu next to the eval selector to:

- Rename an eval
- Duplicate an eval
- Delete an eval
- Download as JSON, YAML, CSV, or HTML
- Share to Promptfoo Cloud (if configured)

## Sharing

Click **Share** to create a public or private link. Sharing uploads the eval results to Promptfoo
Cloud. No prompts or outputs leave your machine unless you explicitly share.

See [Sharing eval results](/docs/usage/sharing) for self-hosted and cloud options.
