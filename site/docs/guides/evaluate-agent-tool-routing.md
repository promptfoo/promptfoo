---
title: Evaluate Agent Tool Routing
description: Compare agent changes on tool choice, safety, cost, latency, and unresolved requests instead of final-answer quality alone.
---

# Evaluate Agent Tool Routing

Agent changes often look good if you only compare the final answer. In production, regressions usually show up elsewhere first:

- the wrong tool is selected
- too many tools are exposed
- an unsafe tool is attempted
- the unresolved request rate goes up
- cost or latency rises
- context balloons because raw tool output is over-included
- approval or policy decisions change unexpectedly

This guide shows how to evaluate routing changes as **deployment decisions**, not just answer-level prompt changes.

## Metrics that matter

A practical comparison between a current agent and a candidate agent often includes:

- `success`
- `correct_tool`
- `unsafe_action_rate`
- `unresolved_rate`
- `avg_cost`
- `avg_latency`
- `context_tokens`
- `policy_decision_delta`

You usually do **not** get all of these from a single assertion type. Mix answer-level assertions, trace assertions, and exported metrics.

## 1. Keep final-answer assertions, but do not stop there

Start with the usual outcome checks:

```yaml
assert:
  - type: factuality
    value: The answer should be factually correct.
  - type: answer-relevance
```

These tell you whether the user-visible answer is acceptable. They do **not** tell you whether the agent used the right tool path to get there.

## 2. Assert the path when the path matters

If the requirement is "used the right tool", "did not attempt a destructive action", or "requested approval before execution", assert those directly.

Examples:

```yaml
assert:
  - type: trajectory:tool-used
    value: search_docs
  - type: not-trajectory:tool-used
    value: delete_user
  - type: trajectory:step-count
    value:
      max: 12
```

Use trajectory assertions when your provider or tracing setup emits tool-call spans or equivalent metadata.

## 3. Track unresolved and refusal behavior separately

A candidate can improve safety by refusing more often, but that may hide a routing regression.

Add explicit checks for unresolved requests or fallback-heavy behavior:

```yaml
assert:
  - type: javascript
    value: |
      const parsed = typeof output === 'string' ? JSON.parse(output) : output;
      return parsed.status !== 'unresolved';
```

Or capture the same signal in metadata and compare it across runs.

## 4. Compare cost and latency as first-class outputs

Tool-routing changes frequently shift cost and latency before they break correctness.

Use built-in output metrics plus exported summaries:

- `cost`
- `latency`
- named metrics from hooks or assertions

For example, if your custom assertion or hook emits `namedScores.correct_tool`, compare it alongside the default run metrics instead of relying only on pass/fail.

## 5. Keep policy and approval decisions visible

If your agent has approval gates, evaluate whether the same input still triggers the same decision.

Good regression questions:

- Did the candidate require approval where the current version did not?
- Did it stop requiring approval for a risky action?
- Did it expose tools that the current version kept hidden?

This is often easiest to encode with:

- metadata filters
- JavaScript assertions over provider metadata
- trajectory assertions over approval-related spans

## 6. Export and compare the same test set across candidates

A useful workflow is:

1. Run the current agent on a fixed suite.
2. Run the candidate on the exact same suite.
3. Compare both the final outcomes and the routing/safety metrics.

That lets you answer questions like:

- better answer, but wrong tool more often?
- same answer quality, but 2x cost?
- lower latency, but more unresolved turns?
- safer decisions, but too many unnecessary approvals?

## Starter checklist

For each agent change, ask:

- Does the final answer still pass?
- Was the correct tool selected?
- Were unsafe tools avoided?
- Did unresolved requests increase?
- Did cost increase meaningfully?
- Did latency increase meaningfully?
- Did the context size grow unexpectedly?
- Did approval/policy behavior drift?

## Recommended assertion mix

A simple baseline for agent routing changes:

```yaml
assert:
  - type: factuality
  - type: answer-relevance
  - type: trajectory:tool-used
    value: expected_tool_name
  - type: trajectory:tool-not-used
    value: destructive_tool_name
  - type: cost
    threshold: 0.02
  - type: latency
    threshold: 8000
```

Then add custom JavaScript or named-metric assertions for any routing behavior that is specific to your application.

## Related guides

- [Evaluate Coding Agents](/docs/guides/evaluate-coding-agents)
- [LLM as a Judge](/docs/guides/llm-as-a-judge)
- [Tracing](/docs/tracing)
