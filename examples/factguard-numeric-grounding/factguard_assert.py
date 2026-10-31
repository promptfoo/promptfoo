"""Promptfoo Python assertion that checks numbers in an output against source JSON.

Each numeric claim in the output is matched to the JSON the output was written
from. A claim is grounded when the data contains the value or the text signals
one step of arithmetic over related fields. The score is the share of grounded
claims. It is 1.0 when the output contains no numbers.

Source data, first match wins:
  1. config.source: an inline object or a JSON string.
  2. config.source_file: a path to a JSON file.
  3. vars[config.source_var], default vars["source"]: an object or a JSON string.

Optional config:
  fail_under: minimum score to pass. Defaults to 1.0, so any flagged number fails.
  strict_rows: treat a value found only on another record as a contradiction.
  derived: accept one-step arithmetic such as a sum or a percentage change.
  aliases: {field: [words the text uses for that field]}.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from factguard import Checker


def _parse(value: Any) -> Any:
    if isinstance(value, (dict, list)):
        return value
    if isinstance(value, str):
        return json.loads(value)
    raise ValueError(
        f"expected a JSON object, array or string, got {type(value).__name__}"
    )


def _load_source(config: dict[str, Any], test_vars: dict[str, Any]) -> Any:
    if config.get("source") is not None:
        return _parse(config["source"])
    if config.get("source_file"):
        return json.loads(Path(config["source_file"]).read_text(encoding="utf-8"))
    var_name = config.get("source_var", "source")
    if test_vars.get(var_name) is not None:
        return _parse(test_vars[var_name])
    raise ValueError(f"set config.source, config.source_file or vars.{var_name}")


def _as_bool(value: Any) -> bool:
    if isinstance(value, bool):
        return value
    return str(value).strip().lower() in ("1", "true", "yes")


def get_assert(output: Any, context: dict[str, Any]) -> dict[str, Any]:
    """Returns a GradingResult for the numeric claims in the output."""
    config = context.get("config") or {}
    try:
        data = _load_source(config, context.get("vars") or {})
    except (OSError, ValueError) as error:
        return {
            "pass": False,
            "score": 0.0,
            "reason": f"factguard: no usable source data ({error})",
        }

    fail_under = float(config.get("fail_under", 1.0))
    checker = Checker(
        data,
        aliases=config.get("aliases"),
        derived=_as_bool(config.get("derived", True)),
        strict_rows=_as_bool(config.get("strict_rows", False)),
    )
    text = output if isinstance(output, str) else json.dumps(output)
    report = checker.check(text)

    grounded = len(report.verdicts) - len(report.flagged)
    details = []
    for verdict in report.flagged:
        if verdict.status == "contradicted":
            details.append(f"{verdict.claim}: data says {verdict.hint}")
        else:
            details.append(f"{verdict.claim}: not in data")
    reason = f"factguard: {grounded}/{len(report.verdicts)} numeric claims grounded"
    if details:
        reason += "; " + "; ".join(details)

    score = round(report.score, 4)
    return {
        "pass": report.score >= fail_under,
        "score": score,
        "reason": reason,
        "namedScores": {"numeric_grounding": score},
    }
