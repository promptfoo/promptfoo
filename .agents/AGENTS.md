# Codex Marketplace Metadata

This directory exposes repo-local Codex plugins to the Codex marketplace UI.

## Rules

- Keep marketplace entries in `.agents/plugins/marketplace.json`.
- Keep `source.path` relative to the repo root, for example `./plugins/promptfoo`.
- Each plugin entry must include `policy.installation`, `policy.authentication`, and `category`.
- Keep marketplace root metadata limited to `name`, optional `interface.displayName`, and `plugins`.
- Do not add product gating unless explicitly requested.

## Validation

When changing marketplace metadata, run:

```bash
npx vitest test/agentSkills/promptfooPlugin.test.ts --run
npm run f
```
