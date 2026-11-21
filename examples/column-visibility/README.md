# column-visibility (Column Visibility Defaults)

Hide long context variables when an eval opens in the web viewer. This example uses the echo provider and needs no API keys.

## Run the example

```bash
npx promptfoo@latest init --example column-visibility
npx promptfoo@latest eval
npx promptfoo@latest view
```

The config hides `context` and `system_prompt` while leaving the question and provider output visible.

```yaml
defaultColumnVisibility:
  hideColumns:
    - var:context
    - var:system_prompt
```

Saved choices in the **Columns** menu take priority. See the [web viewer guide](https://www.promptfoo.dev/docs/usage/web-ui/#column-visibility) for selector syntax and how the browser saves your choices.
