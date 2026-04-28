# claude-agent-sdk/skill-comparison (Claude Skill Comparison)

You can run this example with:

```bash
npx promptfoo@latest init --example claude-agent-sdk/skill-comparison
cd claude-agent-sdk/skill-comparison
```

## Overview

This example is the Claude Agent SDK companion to [the agent-skill testing guide](https://www.promptfoo.dev/docs/guides/test-agent-skills). It compares two versions of a `review-standards` skill against the same authentication review tasks.

- `fixtures/v1` and `fixtures/v2` each carry their own `.claude/skills/review-standards/SKILL.md` and an identical `src/auth.ts` so any score difference is attributable to the skill text.
- The `skills:` filter (Claude Agent SDK 0.2.120+) scopes the session to a single skill and auto-allows the `Skill` tool.
- A YAML anchor (`&reviewSchema`) feeds the same `output_format` JSON schema into both providers, which is the Claude SDK's equivalent of Codex's `output_schema` and is what stops the model from wrapping JSON in Markdown fences.
- The eval verifies `skill-used` and scores issue recall via a JavaScript assertion.

## Run

From this directory:

```bash
ANTHROPIC_API_KEY=… promptfoo eval --no-cache
```

`expectedIssues` is a comma-separated string rather than a YAML list because Promptfoo expands string-array vars into a matrix of test cases (`src/evaluator.ts:generateVarCombinations`), which would split each test in two. The runnable example holds the comparison to two cases on purpose.

The two skill versions are intentionally asymmetric: v1 caps reviews at one issue and only knows password hashing, while v2 also flags timing-unsafe token comparison. With the supplied tasks you should expect each version to pass exactly the test that matches its scope.
