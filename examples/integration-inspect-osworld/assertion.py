"""Promptfoo assertion for the OSWorld Inspect wrapper."""

from __future__ import annotations

from typing import Any


def get_assert(output: str, context: dict[str, Any]) -> dict[str, Any]:
    del output
    provider_response = context.get("providerResponse") or {}
    metadata = provider_response.get("metadata") or {}
    status = metadata.get("status")
    score = metadata.get("score")

    passed = status == "pass" or (isinstance(score, (int, float)) and score >= 1.0)
    sample_id = metadata.get("sample_id", "unknown sample")
    log_path = metadata.get("inspect_log_path", "unknown log")
    reason = f"OSWorld sample {sample_id} score={score} status={status}; Inspect log: {log_path}"

    return {
        "pass": passed,
        "score": 1.0 if passed else 0.0,
        "reason": reason,
    }
