"""Agent Behavior Review — promptfoo custom grader.

Maps Disney's 12 animation principles to agent behavior presentation-quality
checks. Input: agent session trace (JSON text) passed via `vars.session`.
Output: promptfoo GradingResult with 12 componentResults + overall score
(pass >= 0.7).

Design notes:
- Deterministic rules (stdlib only, no external dependencies).
- Missing `ok` annotations are fail-closed: actions without `ok` mark
  `data_quality=low` and rule 3 fails, so unannotated retry loops cannot pass.
- Rules 11 (vocabulary) and 12 (closing signature) are documented heuristics.
- Thresholds are centralized in THRESHOLDS; values are initial estimates
  pending calibration (see README).
"""

from __future__ import annotations

from typing import Any

# --- centralized thresholds (pending calibration, see README) ---
THRESHOLDS = {
    "pass_score": 0.7,  # overall pass
    "max_retries": 2,  # rule 3 same-error retries
    "max_topic_runs": 2,  # rule 7 arcs
    "max_aux": 3,  # rule 8 secondary-action markers
    "max_emphasis": 3,  # rule 10 exaggeration markers
    "long_session": 6,  # rule 4/9 long-session cutoff
    "very_long_session": 8,  # rule 9 timing feedback cutoff
    "max_repeated_terms": 5,  # rule 11 heuristic
}

_PLAN_KINDS = {"plan", "intent"}
_VERIFY_KINDS = {"verify", "report"}


def _load_session(context: dict[str, Any]) -> list[dict[str, Any]]:
    import json

    raw = (context.get("vars") or {}).get("session")
    if not raw:
        return []
    if isinstance(raw, (list, dict)):
        steps = raw.get("steps") if isinstance(raw, dict) else raw
    else:
        try:
            steps = json.loads(raw).get("steps")
        except (ValueError, TypeError, KeyError):
            return []
    return steps if isinstance(steps, list) else []


def _count(text: str, kws) -> int:
    """count total occurrences of all keywords"""
    low = text.lower()
    return sum(low.count(k) for k in kws)


def _components(steps: list[dict[str, Any]]) -> dict[str, Any]:
    if not steps:
        return {
            "comps": [{"pass": False, "score": 0.0, "reason": "empty session trace"}],
            "quality": "low",
        }

    actions = [s for s in steps if s.get("kind") == "action"]
    tool_actions = [s for s in actions if s.get("tool")]
    fails = [s for s in tool_actions if s.get("ok") is False]
    topics = [s.get("topic") for s in steps if s.get("topic")]
    kinds = [s.get("kind") for s in steps]
    text = " ".join(str(s.get("text", "")) for s in steps)

    # data quality: actions lacking ok annotation -> low (fail-closed on missing data)
    unannotated = [s for s in actions if s.get("ok") is None]
    quality = "low" if unannotated else "ok"

    T = THRESHOLDS
    out: list[dict[str, Any]] = []

    # 1 Anticipation: first tool action preceded by plan/intent
    first_act = next(
        (i for i, s in enumerate(steps) if s.get("kind") == "action" and s.get("tool")),
        None,
    )
    if first_act is None:
        ante = {"pass": True, "score": 1.0, "reason": "no tool actions to anticipate"}
    elif first_act == 0:
        ante = {
            "pass": False,
            "score": 0.0,
            "reason": "first action without prior intent declaration",
        }
    else:
        prev = steps[first_act - 1]
        ok_ = prev.get("kind") in _PLAN_KINDS
        ante = {
            "pass": ok_,
            "score": 1.0 if ok_ else 0.0,
            "reason": "intent declared before first action"
            if ok_
            else "first action not preceded by intent",
        }
    out.append(ante)

    # 2 Staging: session opens with plan/intent
    opens_ok = bool(kinds) and kinds[0] in _PLAN_KINDS
    out.append(
        {
            "pass": opens_ok,
            "score": 1.0 if opens_ok else 0.0,
            "reason": "opens with intent/plan"
            if opens_ok
            else "opens with raw action, intent buried",
        }
    )

    # 3 Squash & Stretch: same-error retries converge (unannotated actions fail closed)
    if quality == "low":
        squash = {
            "pass": False,
            "score": 0.0,
            "reason": "data_quality low: actions missing ok annotation; retry loop undeterminable",
        }
    else:
        err_retries: dict[str, int] = {}
        for s in fails:
            key = (
                str(s.get("tool")) + "|" + str(s.get("text", ""))[:60]
            )  # (tool, text) error identity
            err_retries[key] = err_retries.get(key, 0) + 1
        worst = max(err_retries.values()) if err_retries else 0
        ok_ = worst <= T["max_retries"]
        squash = {
            "pass": ok_,
            "score": 1.0 if ok_ else 0.0,
            "reason": f"max same-error retries={worst} <= {T['max_retries']}"
            if ok_
            else f"retry loop x{worst}",
        }
    out.append(squash)

    # 4 PoseToPose: true mid-session checkpoint (verify must not be the final step)
    mid_verify = any(k in _VERIFY_KINDS for k in kinds[1:-1])
    p2p = (not (len(steps) > T["long_session"])) or mid_verify
    out.append(
        {
            "pass": p2p,
            "score": 1.0 if p2p else 0.0,
            "reason": "mid-session checkpoint present"
            if p2p
            else "long run without intermediate verification",
        }
    )

    # 5 FollowThrough: session ends with verify/report
    ft = bool(kinds) and kinds[-1] in _VERIFY_KINDS
    out.append(
        {
            "pass": ft,
            "score": 1.0 if ft else 0.0,
            "reason": "ends with verification/report"
            if ft
            else "ends abruptly without report",
        }
    )

    # 6 SlowInOut: plan-in AND verify-out
    sio = bool(kinds) and kinds[0] in _PLAN_KINDS and kinds[-1] in _VERIFY_KINDS
    out.append(
        {
            "pass": sio,
            "score": 1.0 if sio else 0.0,
            "reason": "plan-in verify-out pacing"
            if sio
            else "missing slow-in or slow-out",
        }
    )

    # 7 Arcs: topic runs <= max_topic_runs (explicit condition)
    if len(topics) < 2:
        arcs = {"pass": True, "score": 1.0, "reason": "insufficient topics to evaluate"}
    else:
        runs = 1
        for i in range(1, len(topics)):
            if topics[i] != topics[i - 1]:
                runs += 1
        ok_ = runs <= T["max_topic_runs"]
        arcs = {
            "pass": ok_,
            "score": 1.0 if ok_ else 0.0,
            "reason": f"topic runs={runs} <= {T['max_topic_runs']}"
            if ok_
            else f"topic zig-zag (runs={runs})",
        }
    out.append(arcs)

    # 8 SecondaryAct: total aux-marker occurrences <= max_aux (count occurrences, not kinds)
    aux = _count(text, ("confidence", "warning", "note:", "备选"))
    ok_ = aux <= T["max_aux"]
    out.append(
        {
            "pass": ok_,
            "score": 1.0 if ok_ else 0.0,
            "reason": f"aux occurrences={aux} <= {T['max_aux']}"
            if ok_
            else f"aux noise too high ({aux})",
        }
    )

    # 9 Timing: long sessions emit intermediate feedback
    mid_msgs = any(k in _VERIFY_KINDS or k == "message" for k in kinds[1:-1])
    timing = (not (len(steps) > T["very_long_session"])) or mid_msgs
    out.append(
        {
            "pass": timing,
            "score": 1.0 if timing else 0.0,
            "reason": "intermediate feedback present"
            if timing
            else "long run silent until end",
        }
    )

    # 10 Exaggeration: emphasis occurrences <= max_emphasis (count occurrences, not kinds)
    emp = _count(text, ("**", "!!!", "强调", "critical", "warning:"))
    ok_ = emp <= T["max_emphasis"]
    out.append(
        {
            "pass": ok_,
            "score": 1.0 if ok_ else 0.0,
            "reason": f"emphasis={emp} <= {T['max_emphasis']}"
            if ok_
            else f"over-emphasis ({emp})",
        }
    )

    # 11 SolidDrawing: heuristic (documented) — vocabulary stability
    import re

    terms = re.findall(r"[A-Za-z][A-Za-z0-9_-]{3,}", text)
    freq: dict[str, int] = {}
    for t in terms:
        freq[t] = freq.get(t, 0) + 1
    repeated = [t for t, c in freq.items() if c >= 3]
    ok_ = len(repeated) <= T["max_repeated_terms"]
    out.append(
        {
            "pass": ok_,
            "score": 1.0 if ok_ else 0.0,
            "reason": f"repeated terms={len(repeated)} (heuristic)"
            if ok_
            else "vocabulary drift suspected (heuristic)",
        }
    )

    # 12 Appeal: consistent closing signature
    closers = ("done", "完成", "summary", "总结", "next steps", "下一步")
    appeal = any(c in text.lower() for c in closers)
    out.append(
        {
            "pass": appeal,
            "score": 1.0 if appeal else 0.0,
            "reason": "structured closing present"
            if appeal
            else "no consistent closing signature",
        }
    )

    return {"comps": out, "quality": quality}


def get_assert(output: str, context: dict[str, Any]) -> bool | float | dict[str, Any]:
    steps = _load_session(context)
    res = _components(steps)
    comps = res["comps"]
    if not comps:
        return {
            "pass": False,
            "score": 0.0,
            "reason": "no session trace in vars.session",
            "componentResults": [],
        }
    score = sum(c["score"] for c in comps) / len(comps)
    named = {("p" + str(i + 1)): c["score"] for i, c in enumerate(comps)}
    fails = [c["reason"] for c in comps if not c["pass"]]
    data_note = " [data_quality=low]" if res["quality"] == "low" else ""
    return {
        "pass": score >= THRESHOLDS["pass_score"],
        "score": score,
        "reason": (
            "passed"
            if score >= THRESHOLDS["pass_score"]
            else "failing: " + "; ".join(fails[:4])
        )
        + data_note,
        "componentResults": comps,
        "namedScores": named,
    }
