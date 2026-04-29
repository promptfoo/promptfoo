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
- The eval verifies `skill-used` and scores both issue recall and precision via a JavaScript assertion. Precision is what penalizes a skill that ignores the user's requested scope and reports unrelated findings.

## Run

From this directory:

```bash
ANTHROPIC_API_KEY=… promptfoo eval --no-cache
```

`defaultTest.options.disableVarExpansion: true` keeps each `expectedIssues` array intact instead of [fanning it into one test case per element](https://www.promptfoo.dev/docs/configuration/test-cases#passing-arrays-to-assertions). Without it the example would run 6 cases instead of 4.

The two skill versions are intentionally asymmetric: v1 caps reviews at one issue and only knows password hashing, while v2 also flags timing-unsafe token comparison and is told to respect the user's requested scope. The expected outcome is v1 passing only the narrower password-handling test (it lacks the timing-unsafe rule needed for the broad test) and v2 passing both tests because its scope rule keeps it accurate on the narrower one too.
