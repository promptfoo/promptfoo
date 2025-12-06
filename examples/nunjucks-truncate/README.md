# Nunjucks truncate filter with the echo provider

This example trims long inputs at template time using a custom Nunjucks filter so the provider never sees the overflow.

```bash
promptfoo eval -c examples/nunjucks-truncate/promptfooconfig.yaml
```

- `truncate.js` exports `truncateChars(str, maxLen)` which slices the input and appends `...[truncated]`.
- The prompt applies `{{ doc | truncateChars(80) }}` so any overly long `doc` var is clipped before the echo provider returns it.
