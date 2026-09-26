# eval-agent-behavior-review (Agent Behavior Presentation Grader)

A deterministic grader with 12 checks for how an agent presents its behavior:
intent declared before actions, conclusions up front, retries converging,
steady pacing, repetition kept in check. The rules map to Disney's 12
animation principles.

You can run this example with:

```bash
npx promptfoo@latest init --example eval-agent-behavior-review
cd eval-agent-behavior-review
```

## Purpose

Promptfoo's built-in assertions cover correctness, similarity, and LLM judges.
This grader covers the orthogonal behavior-presentation dimension: an agent
can complete a task correctly yet behave unreadably (no intent declaration,
silent retry loops, conclusions buried in reasoning, vocabulary drift). The
example ships a rule-based checker you can run in CI.

## Prerequisites

- Python 3.9+ available in your PATH
- No API key needed: the config uses the `echo` provider

## Usage

```bash
promptfoo eval
```

The two demo cases show a stiff session (should FAIL) and an improved session
(should PASS). Input is a session trace JSON passed via `vars.session`:

```json
{
  "steps": [
    { "kind": "plan", "text": "I will read the file then verify", "topic": "a" },
    { "kind": "action", "text": "read file", "tool": "read", "ok": true, "topic": "a" },
    { "kind": "report", "text": "summary: done", "topic": "a" }
  ]
}
```

Step kinds: `plan` / `intent` / `action` / `verify` / `report` / `message`.
Tool calls map to `action` with `ok` (success/failure); `topic` is optional
and accepts any non-null value (numeric ids like `0` included).

## Principle → Rule mapping (12 dimensions)

| #   | Principle        | Programmatic check                                     | Threshold |
| --- | ---------------- | ------------------------------------------------------ | --------- |
| 1   | Anticipation     | plan/intent appears before the first action            | —         |
| 2   | Staging          | session opens with intent/plan                         | —         |
| 3   | Squash & Stretch | consecutive same-(tool,text) failures reset on success | ≤2        |
| 4   | Pose to Pose     | long runs (>6 steps) verify between first/last action  | —         |
| 5   | Follow Through   | ends with a nonblank verify/report                     | —         |
| 6   | Slow In/Out      | nonblank plan-in AND verify-out                        | —         |
| 7   | Arcs             | topic runs (consecutive distinct topics)               | ≤2        |
| 8   | Secondary Action | aux-marker occurrences (confidence/warning/note:/备选) | ≤3        |
| 9   | Timing           | long runs (>8 steps) give feedback after work starts   | —         |
| 10  | Exaggeration     | emphasis occurrences (**,!!!,强调,critical,warning:)   | ≤3        |
| 11  | Solid Drawing    | repeated-term count (heuristic, English-token)         | ≤5        |
| 12  | Appeal           | closing signature in the final step                    | —         |

The grader returns a promptfoo `GradingResult` with 12 `componentResults`,
`namedScores`, and an overall score (pass >= 0.7). Traces with no action,
verify, or report step are rejected before grading. Missing or non-boolean
`ok` annotations are fail-closed: rule 3 fails, the result is marked
`data_quality=low`, and low quality hard-fails the overall grade even when
the other rules pass. Rules 11 and 12 are documented heuristics.

## Validation

Two demo sessions ship with this example: the `stiff` case fails at 0.58 and
the `improved` case passes at 1.00 (see Expected Results). Drop the grader
into a CI gate on any session trace: set thresholds in `behavior_review.py`,
then run `promptfoo eval` on your own labelled traces. Per-dimension
calibration on a larger labelled set is a follow-up.

## Expected Results

- `stiff` demo case: FAIL (score 0.58). First action without intent
  declaration, silent retry loop x4, no closing report.
- `improved` demo case: PASS (score 1.00)

## Learn More

- [Python Assertions Documentation](https://www.promptfoo.dev/docs/configuration/expected-outputs/python/)
- [Assertions and Grading](https://www.promptfoo.dev/docs/configuration/expected-outputs/)
