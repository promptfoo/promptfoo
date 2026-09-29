# column-visibility (Column Visibility Defaults)

Hide long context variables when an eval opens in the web viewer. This example uses the echo provider and needs no API keys.

```bash
npx promptfoo@latest init --example column-visibility
npx promptfoo@latest eval
npx promptfoo@latest view
```

The config hides `context` and `system_prompt` while leaving the question and provider output visible:

```yaml
defaultColumnVisibility:
  hideColumns:
    - var:context
    - var:system_prompt
```

Use `var:<name>` for variables, including names such as `description` or `Prompt 1`. Standard columns use their display IDs: `description`, `Prompt 1`, `Prompt 2`, and so on. `showColumns` overrides `hideColumns`; omitted group defaults remain visible.

Saved browser choices take priority over config defaults. Variable choices are shared across evals with the same variable names; prompt and description choices are saved per eval. Use **Columns** to change them.
