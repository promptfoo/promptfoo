# openai-codex-sdk/skill-comparison (Codex Skill Comparison)

You can run this example with:

```bash
npx promptfoo@latest init --example openai-codex-sdk/skill-comparison
cd openai-codex-sdk/skill-comparison
```

## Overview

This example compares two versions of the same Codex skill against identical review tasks.

- `fixtures/v1` contains a narrower `review-standards` skill that only calls out weak password hashing.
- `fixtures/v2` contains a stronger version that also checks timing-safe secret comparison.
- Both providers share an `output_schema` (declared once via a YAML anchor) so each response is guaranteed to match the review JSON shape.
- The eval verifies `skill-used`, scores issue recall and precision, and uses `max-score` to select the best output for each test case.

Run it from this directory with:

```bash
promptfoo eval --no-cache
```

If you run it from another directory, set these environment variables first:

```bash
export CODEX_SKILL_COMPARE_V1_DIR=/absolute/path/to/fixtures/v1
export CODEX_SKILL_COMPARE_V2_DIR=/absolute/path/to/fixtures/v2
```

The checked-in `sample-codex-home` directory is intentionally empty of auth state. Use an API key, or set `CODEX_HOME_OVERRIDE="$HOME/.codex"` to reuse a local Codex login.

Because this example uses `max-score`, the weaker candidate is expected to fail when Promptfoo marks the stronger output as the winner for a test case.
