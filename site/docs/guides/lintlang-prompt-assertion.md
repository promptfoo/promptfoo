---
title: Lint your prompts with LintLang
description: Use LintLang as a custom Python assertion in promptfoo to structurally lint every prompt under test — vague instructions, missing output contracts, ambiguous tool descriptions, and role confusion — with pass/fail verdicts and scores.
keywords:
  [lintlang, prompt linting, prompt quality, custom assertion, python assertion, structural linter]
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

The assertion lints the rendered prompt sent to the provider
(`context['prompt']`) and fails if it is unavailable. It returns a dict so
promptfoo records pass, score, and reason.

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


def get_assert(output, context):
    prompt = (context or {}).get("prompt")
    if not isinstance(prompt, str) or not prompt.strip():
        return {
            "pass": False,
            "score": 0.0,
            "reason": "lintlang: no rendered prompt found in context['prompt']",
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
                "prompt",
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

    if proc.returncode != 0:
        return {
            "pass": False,
            "score": 0.0,
            "reason": f"lintlang: scan exited with code {proc.returncode}: "
            + proc.stderr.decode("utf-8", "replace")[:200],
        }

    try:
        results = json.loads(proc.stdout.decode("utf-8"))
    except (json.JSONDecodeError, UnicodeDecodeError):
        return {
            "pass": False,
            "score": 0.0,
            "reason": "lintlang: could not parse CLI JSON output",
        }

    if not (
        isinstance(results, list)
        and len(results) == 1
        and isinstance(results[0], dict)
    ):
        return {"pass": False, "score": 0.0, "reason": "lintlang: invalid scan result"}

    result = results[0]
    if (
        result.get("input_error") is not None
        or result.get("skipped") is not None
        or result.get("verdict") not in ("PASS", "REVIEW", "FAIL")
    ):
        return {
            "pass": False,
            "score": 0.0,
            "reason": "lintlang: scan did not complete: "
            + str(result.get("input_error") or result.get("skipped") or result.get("verdict")),
        }

    findings = result.get("structural_findings")
    if (
        not {"input_error", "skipped"}.issubset(result)
        or not isinstance(findings, list)
        or any(not isinstance(f, dict) for f in findings)
        or (not findings and result["verdict"] != "PASS")
    ):
        return {"pass": False, "score": 0.0, "reason": "lintlang: invalid scan result"}

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
      account_summary: 'Plan: Pro. Balance due: $42.00.'
```

Because the assertion reads `context['prompt']`, it lints the fully rendered prompt for each test case — including any `vars` referenced by the template. It fails explicitly when that prompt is unavailable; test variables alone cannot reconstruct it.

The extensionless stdin filename lets LintLang detect JSON, YAML, or plain text, preserving message roles and structured fields in rendered chat/object prompts. Tool definitions configured separately on a provider are outside this prompt assertion's coverage. A nonzero CLI exit, input error, skipped scan, or malformed result fails the assertion instead of reporting a clean pass.

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
