---
sidebar_position: 66
title: Test Agent Skills
description: Compare Claude and Codex skill versions with Promptfoo evals that measure invocation, task quality, cost, latency, and trace evidence to choose a winner.
---

# Test Agent Skills

Skills are local instructions that teach an agent when and how to use a capability. When you have two versions of the same skill, you usually want to know two things:

1. Does the agent use the skill when the task calls for it?
2. Does that skill version lead to better work?

Promptfoo can answer both questions by running the same tasks against each version side by side. Keep the model, task files, and permissions the same, swap only the `SKILL.md`, and compare the results.

## Start With One Comparison

In this example, we're comparing two versions of a `review-standards` skill. Each version gets its own fixture directory with the same source file and a different copy of the skill:

```text
skill-eval/
├── promptfooconfig.yaml
└── fixtures/
    ├── v1/
    │   ├── .claude/skills/review-standards/SKILL.md
    │   └── src/auth.ts
    └── v2/
        ├── .claude/skills/review-standards/SKILL.md
        └── src/auth.ts
```

For Codex, use `.agents/skills/review-standards/SKILL.md` instead of `.claude/skills/...`. The rest of the comparison can stay the same.

## Compare Two Claude Skill Versions

We'll start with the [Claude Agent SDK provider](/docs/providers/claude-agent-sdk). The prompt asks for a short JSON review so the outputs are easy to score, and the two providers differ only in `working_dir`:

```yaml title="promptfooconfig.yaml"
description: Compare Claude skill versions

prompts:
  - '{{request}}'

# YAML anchor for the schema both providers enforce. The Claude Agent SDK's
# `output_format` is the equivalent of Codex's `output_schema` — it returns
# valid JSON without you having to ask for "JSON only" in the prompt or
# strip Markdown fences from the model's reply.
x-review-schema: &reviewSchema
  type: json_schema
  schema:
    type: object
    required: [summary, issues]
    additionalProperties: false
    properties:
      summary: { type: string }
      issues:
        type: array
        items:
          type: object
          required: [id, severity]
          additionalProperties: false
          properties:
            id: { type: string }
            severity: { type: string, enum: [high, medium, low] }

providers:
  - id: anthropic:claude-agent-sdk
    label: review-standards-v1
    config:
      model: claude-sonnet-4-6
      working_dir: ./fixtures/v1
      setting_sources: ['project']
      skills: ['review-standards']
      append_allowed_tools: ['Read', 'Grep', 'Glob']
      output_format: *reviewSchema

  - id: anthropic:claude-agent-sdk
    label: review-standards-v2
    config:
      model: claude-sonnet-4-6
      working_dir: ./fixtures/v2
      setting_sources: ['project']
      skills: ['review-standards']
      append_allowed_tools: ['Read', 'Grep', 'Glob']
      output_format: *reviewSchema
```

`setting_sources: ['project']` discovers `SKILL.md` files under `.claude/skills/`. The `skills:` filter (added in `@anthropic-ai/claude-agent-sdk` 0.2.120) narrows the session to a single skill and auto-allows the `Skill` tool, so it no longer needs to appear in `append_allowed_tools`. Pass `skills: 'all'` if you want every discovered skill enabled. On older SDK versions, drop `skills:` and add `'Skill'` back to `append_allowed_tools`.

Without `output_format`, Claude usually wraps short JSON answers in Markdown fences or a leading sentence, which makes downstream `JSON.parse()` brittle. Setting it on both providers — once via the `&reviewSchema` anchor — gives you reliable structured output without prompt gymnastics.

Because everything else is held constant, any meaningful difference in the results should come from the skill text itself.

Next, add a few tasks that represent how the skill will really be used:

```yaml
defaultTest:
  # By default, Promptfoo fans each YAML-list var into one test case per
  # element (matrix expansion), which would split each comparison test in
  # two. Disable that here so `expectedIssues` reaches the assertion intact.
  options:
    disableVarExpansion: true

tests:
  - description: Finds both auth issues
    vars:
      request: Review src/auth.ts for password handling and token comparison issues.
      expectedIssues:
        - weak-password-hash
        - timing-unsafe-compare

  - description: Focuses on password handling only
    vars:
      request: Review src/auth.ts only for password handling issues.
      expectedIssues:
        - weak-password-hash
```

The first case asks for a broad review covering both topics. The second is narrower, which helps catch a skill that finds the right problems but ignores the user's requested scope. Pairing the two together is what lets the eval reward a skill version that both knows the full set of issues _and_ respects the user's scope when asked.

See [Passing Arrays to Assertions](/docs/configuration/test-cases#passing-arrays-to-assertions) for the matrix-expansion behavior `disableVarExpansion` opts out of.

## Add Assertions

Assertions tell Promptfoo what "better" means for this comparison. It helps to add them one layer at a time.

### Check That the Skill Was Used

Start by verifying that Claude actually invoked the skill:

```yaml
defaultTest:
  assert:
    - type: skill-used
      value: review-standards
```

Claude exposes `Skill` tool calls directly, and Promptfoo normalizes them into the [`skill-used`](/docs/configuration/expected-outputs/deterministic/#skill-used) assertion. This distinguishes a good answer that happened without the skill from one that was produced through the workflow you intended to test.

### Score the Output

Then score whether the review found the expected issues:

```yaml
defaultTest:
  assert:
    - type: javascript
      threshold: 0.7
      value: |
        // `output_format` hands us a parsed object; on Codex `output_schema`
        // returns a string, so wrap with `JSON.parse(output)` there.
        const expected = context.vars.expectedIssues;
        const found = (output.issues || []).map((issue) => issue.id);
        const hits = expected.filter((id) => found.includes(id));
        const recall = hits.length / expected.length;

        return {
          pass: recall >= 0.75,
          score: recall,
          reason: `matched ${hits.length}/${expected.length} expected issues`,
        };
```

The JavaScript assertion gives each response a score based on issue recall. In your own eval, replace this with the signal that matters for the skill: tests passed, required edits were made, policy checks were followed, or a rubric was satisfied.

### Add Secondary Signals

Once correctness is working, you can add supporting signals:

```yaml
defaultTest:
  assert:
    - type: cost
      threshold: 0.50
    - type: latency
      threshold: 120000
```

These checks are useful when two skill versions are both correct but one is much more expensive or slower.

If you want Promptfoo to mark the strongest output for each test case, add [`max-score`](/docs/configuration/expected-outputs/model-graded/max-score):

```yaml
defaultTest:
  assert:
    - type: max-score
      value:
        method: average
        threshold: 0.7
        weights:
          javascript: 4
          skill-used: 2
          cost: 0.5
          latency: 0.5
```

That weighting makes task quality the main signal, while still rewarding the version that routes correctly and stays within practical limits.

## Use the Same Eval With Codex

To run the same comparison with [OpenAI Codex SDK](/docs/providers/openai-codex-sdk), keep the tests and scoring logic, then use Codex's bare `output_schema` shape with the provider block:

```yaml
x-review-schema: &reviewSchema
  type: object
  required: [summary, issues]
  additionalProperties: false
  properties:
    summary: { type: string }
    issues:
      type: array
      items:
        type: object
        required: [id, severity]
        additionalProperties: false
        properties:
          id: { type: string }
          severity: { type: string, enum: [high, medium, low] }

providers:
  - id: openai:codex-sdk
    label: review-standards-v1
    config:
      model: gpt-5.5
      working_dir: ./fixtures/v1
      skip_git_repo_check: true
      sandbox_mode: read-only
      enable_streaming: true
      output_schema: *reviewSchema
      cli_env:
        CODEX_HOME: ./codex-home

  - id: openai:codex-sdk
    label: review-standards-v2
    config:
      model: gpt-5.5
      working_dir: ./fixtures/v2
      skip_git_repo_check: true
      sandbox_mode: read-only
      enable_streaming: true
      output_schema: *reviewSchema
      cli_env:
        CODEX_HOME: ./codex-home
```

Codex discovers project skills from `.agents/skills/` under each `working_dir`. Its `skill-used` signal is inferred from successful reads of the matching `SKILL.md`, so keep `enable_streaming: true` while developing the eval if you want Promptfoo to collect that evidence. The earlier JavaScript assertion should use `JSON.parse(output)` with Codex because `output_schema` keeps `output` as a JSON string rather than a parsed object.

The runnable [`skill-comparison` example](https://github.com/promptfoo/promptfoo/tree/main/examples/openai-codex-sdk/skill-comparison) uses the same approach, with a YAML anchor to share the schema between v1 and v2.

There is a [matching Claude example](https://github.com/promptfoo/promptfoo/tree/main/examples/claude-agent-sdk/skill-comparison) that uses `output_format` and the `skills:` filter so you can run the same comparison against either provider.

## Add Trace Evidence When Needed

For Claude Agent SDK, `skill-used` is usually enough to prove invocation because it is based on first-class `Skill` tool calls. If you need the raw call details, inspect the recorded tool calls directly:

```yaml
assert:
  - type: javascript
    value: |
      const calls = context.providerResponse?.metadata?.toolCalls || [];
      return calls.some((call) => call.name === 'Skill');
```

For Codex SDK, trace evidence can be useful when you want to see the workflow behind the final answer. Enable tracing and assert that Codex read the skill file:

```yaml
providers:
  - id: openai:codex-sdk
    config:
      model: gpt-5.5
      working_dir: ./fixtures/v2
      skip_git_repo_check: true
      sandbox_mode: read-only
      enable_streaming: true
      deep_tracing: true

tracing:
  enabled: true

tests:
  - assert:
      - type: trajectory:step-count
        value:
          type: command
          pattern: '*review-standards/SKILL.md*'
          min: 1
```

Use [Codex app-server](/docs/providers/openai-codex-app-server) when you need to test app-server-specific behavior such as explicit skill input items, approvals, or plugin metadata rather than just the skill outcome.

## Run the Eval

Run the config the same way you would any other Promptfoo eval:

```bash
npx promptfoo@latest eval -c promptfooconfig.yaml
```

From there, add only the options that help answer your current question:

- Add `--repeat 3` when you want a better sample of nondeterministic agent behavior.
- Add `--no-cache` while iterating on the skill text and you want fresh runs.
- Add `-o results.json` when you want to inspect or compare results outside the terminal.
- Run `npx promptfoo@latest view` when the side-by-side web view is more useful than the CLI table.

In the web view, the comparison is easy to inspect side by side:

![Promptfoo web UI comparing two Codex skill versions](/img/docs/codex-skill-comparison.png)

## Decide Which Skill Wins

Start with the comparison that matters most for the skill. For a review skill, that might be "which version finds the right issues with the least noise?" For a code-writing skill, it might be "which version passes the tests most often?"

Then use supporting checks where they add value:

```yaml
# Did the agent use the intended skill?
- type: skill-used
  value: review-standards

# Did the output stay within a reasonable budget?
- type: cost
  threshold: 0.50

# Was the answer fast enough for the workflow?
- type: latency
  threshold: 120000
```

If two versions are close, rerun the eval with repeats and inspect the failures before choosing one. The better skill is the one that holds up across the tasks you care about, not the one that wins a single lucky run.
