---
title: Lint your prompts with LintLang
description: Use LintLang as a custom Python assertion in promptfoo to structurally lint every prompt under test — vague instructions, missing output contracts, ambiguous tool descriptions, and role confusion — with pass/fail verdicts and scores.
keywords:
  [
    lintlang,
    prompt linting,
    prompt quality,
    custom assertion,
    python assertion,
    structural linter,
  ]
sidebar_label: Linting Prompts with LintLang
---

[LintLang](https://github.com/hermes-labs-ai/lintlang) is an open-source structural linter for AI agent prompts. It flags patterns like vague qualitative instructions (H5), missing output-format contracts (H6), ambiguous tool descriptions (H1), and role confusion (H7) — the structural smells that make prompts brittle across models.

You can run it as a [Python assertion](/docs/configuration/expected-outputs/python) so every prompt in your eval suite is linted automatically. The assertion checks the prompt under test (not the model output) and returns `pass`, `score`, and `reason`.

## Install

```bash
pip install lintlang
```

## The assertion script

Save this as `lintlang_assert.py` next to your `promptfooconfig.yaml`:

```python
"""Promptfoo `python` assertion that lints the prompt under test with LintLang.

Wire it in `promptfooconfig.yaml`:

    defaultTest:
      assert:
        - type: python
          value: file://lintlang_assert.py:get_assert

The assertion lints the raw prompt sent to the LLM (`context['prompt']`),
falling back to the test case's string `vars` when no rendered prompt is
available. It returns a dict so promptfoo records pass, score, and reason.

Environment:

    LINTLANG_MIN_SEVERITY  minimum finding severity that fails the
                           assertion: critical|high|medium|low|info
                           (default: low)
    LINTLANG_BIN           path to the lintlang executable
                           (default: `lintlang` on PATH)
"""

import json
import os
import shutil
import subprocess

SEVERITY_ORDER = ["info", "low", "medium", "high", "critical"]
SEVERITY_WEIGHT = {
    "info": 0.05,
    "low": 0.15,
    "medium": 0.35,
    "high": 0.6,
    "critical": 1.0,
}


def _prompt_under_test(context):
    """Extract the prompt text from the promptfoo assertion context."""
    prompt = context.get("prompt")
    if isinstance(prompt, str) and prompt.strip():
        return prompt
    parts = [
        str(v) for v in (context.get("vars") or {}).values() if isinstance(v, str)
    ]
    return "\n\n".join(p for p in parts if p.strip())


def get_assert(output, context):
    prompt = _prompt_under_test(context or {})
    if not prompt:
        return {
            "pass": False,
            "score": 0.0,
            "reason": "lintlang: no prompt text found in context['prompt'] or context['vars']",
        }

    lintlang = os.environ.get("LINTLANG_BIN") or shutil.which("lintlang")
    if not lintlang:
        return {
            "pass": False,
            "score": 0.0,
            "reason": "lintlang: `lintlang` CLI not found on PATH. Install it with `pip install lintlang`.",
        }

    min_severity = os.environ.get("LINTLANG_MIN_SEVERITY", "low").lower()
    if min_severity not in SEVERITY_ORDER:
        min_severity = "low"

    try:
        proc = subprocess.run(
            [
                lintlang,
                "scan",
                "--stdin-filename",
                "prompt.md",
                "--format",
                "json",
                "--min-severity",
                min_severity,
                "-",
            ],
            input=prompt.encode("utf-8"),
            capture_output=True,
            timeout=120,
        )
    except subprocess.TimeoutExpired:
        return {
            "pass": False,
            "score": 0.0,
            "reason": "lintlang: scan timed out after 120s",
        }
    except OSError as exc:
        return {
            "pass": False,
            "score": 0.0,
            "reason": f"lintlang: failed to run the CLI: {exc}",
        }

    try:
        results = json.loads(proc.stdout.decode("utf-8") or "[]")
    except json.JSONDecodeError:
        return {
            "pass": False,
            "score": 0.0,
            "reason": "lintlang: could not parse CLI JSON output: "
            + proc.stderr.decode("utf-8", "replace")[:200],
        }

    findings = []
    for file_result in results if isinstance(results, list) else []:
        findings.extend(file_result.get("structural_findings") or [])

    if not findings:
        return {
            "pass": True,
            "score": 1.0,
            "reason": "lintlang: no findings at or above "
            f"'{min_severity}' severity",
        }

    deduction = sum(
        SEVERITY_WEIGHT.get(str(f.get("severity", "")).lower(), 0.15)
        for f in findings
    )
    score = max(0.0, round(1.0 - deduction, 3))
    summary = "; ".join(
        f"[{str(f.get('severity', '')).upper()} {f.get('code', '?')}] "
        f"{f.get('description', '')}".strip()[:120]
        for f in findings[:5]
    )
    if len(findings) > 5:
        summary += f"; ... and {len(findings) - 5} more"

    return {
        "pass": False,
        "score": score,
        "reason": f"lintlang: {len(findings)} finding(s) >= '{min_severity}': {summary}",
    }
```

## Wire it into your config

Reference the script from `defaultTest.assert` so it runs against every test case:

```yaml
# promptfooconfig.yaml
prompts:
  - file://prompts/support-agent.txt

providers:
  - openai:gpt-4o-mini

defaultTest:
  assert:
    - type: python
      value: file://lintlang_assert.py:get_assert

tests:
  - vars:
      account_summary: "Plan: Pro. Balance due: $42.00."
```

Because the assertion reads `context['prompt']`, it lints the fully rendered prompt for each test case — including the `vars` above. If your setup doesn't expose a rendered prompt, it falls back to linting the test case's string `vars`.

## Tuning the threshold

`LINTLANG_MIN_SEVERITY` controls which findings fail the assertion. The default, `low`, is deliberately strict: in an eval suite, even low-severity structural smells (a vague "be helpful", a missing output-format contract) are worth surfacing. Raise it to `medium` if you only want to gate on higher-confidence findings.

```bash
LINTLANG_MIN_SEVERITY=medium npx promptfoo eval
```

## What a run looks like

A prompt with vague instructions and no output contract fails the assertion with a deducted score:

```json
{
  "pass": false,
  "score": 0.7,
  "reason": "lintlang: 2 finding(s) >= 'low': [LOW H5] Vague qualitative instruction: 'Be helpful'; [LOW H6] System prompt has no explicit output format specification or example."
}
```

A prompt with an explicit role, constraints, and output-format contract passes cleanly:

```json
{
  "pass": true,
  "score": 1.0,
  "reason": "lintlang: no findings at or above 'low' severity"
}
```
