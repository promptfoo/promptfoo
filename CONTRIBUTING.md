# Contributing to promptfoo

Please refer to the guidelines on our website at [promptfoo.dev/docs/contributing](https://www.promptfoo.dev/docs/contributing). To make changes, see [docs/contributing.md](https://github.com/promptfoo/promptfoo/blob/main/site/docs/contributing.md).

## Dependency updates

- Renovate manages dependency bumps for this repo.
- New npm releases are delayed before PRs open (runtime deps: 5 days, dev deps: 2 days) to absorb supply-chain incidents and unpublish windows.
- Please avoid manual bumps unless urgent (e.g., critical security fixes).

## Pre-commit hooks (optional)

A pre-commit hook that runs Biome and Prettier on staged files is automatically installed when you run `npm install`. To enable it, add to your `.env` file:

```bash
echo "ENABLE_PRECOMMIT_LINT=1" >> .env
```

The hook only runs when `ENABLE_PRECOMMIT_LINT` is set, so it won't affect other developers.
