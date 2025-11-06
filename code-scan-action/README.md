# Promptfoo Code Scan GitHub Action

Scan pull requests for LLM security vulnerabilities using AI-powered analysis.

## Usage

```yaml
name: Promptfoo Code Scan

on:
  pull_request:
    types: [opened]

permissions:
  id-token: write
  contents: read
  pull-requests: write

jobs:
  scan:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0

      - uses: promptfoo/code-scan-action@v0
        with:
          min-severity: medium
```

## Inputs

| Input              | Description                                                     | Default                     |
| ------------------ | --------------------------------------------------------------- | --------------------------- |
| `min-severity`     | Minimum severity to report: `low`, `medium`, `high`, `critical` | `high`                      |
| `minimum-severity` | Alias for `min-severity`                                        | `high`                      |
| `api-host`         | Promptfoo API host URL                                           | `https://api.promptfoo.dev` |

**Note:** Both `min-severity` and `minimum-severity` are supported. Use whichever you prefer.

## License

MIT
