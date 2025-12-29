# column-visibility (Column Visibility Defaults)

Demonstrates how to configure default column visibility in the web viewer.

## Quick Start

```bash
npx promptfoo@latest init --example column-visibility
npx promptfoo@latest eval
npx promptfoo@latest view
```

## What This Example Shows

When evaluating RAG systems or complex prompts, you often have variables like `context` and `system_prompt` that contain a lot of text. These can make the results table hard to read.

This example shows how to hide verbose columns by default:

```yaml
defaultColumnVisibility:
  variables: visible
  hideColumns:
    - context
    - system_prompt
```

When you run `promptfoo view`, the `context` and `system_prompt` columns will be hidden by default. You can still reveal them using the Columns button in the toolbar.

## Configuration Options

| Property      | Type                    | Description                                 |
| ------------- | ----------------------- | ------------------------------------------- |
| `variables`   | `'visible' \| 'hidden'` | Default visibility for all variable columns |
| `prompts`     | `'visible' \| 'hidden'` | Default visibility for all prompt columns   |
| `hideColumns` | `string[]`              | Column names to hide by default             |
| `showColumns` | `string[]`              | Column names to always show                 |

## User Preferences

Users can override config defaults with their own preferences:

1. Open the Columns dialog in the web viewer
2. Toggle columns on/off
3. Preferences are saved to localStorage
4. Preferences persist across evals with matching column names

## Required Environment Variables

- `OPENAI_API_KEY` - Your OpenAI API key
