"""Agent Behavior Review — promptfoo custom grader.

Maps Disney's 12 animation principles to agent behavior presentation-quality
checks. Input: agent session trace (JSON text) passed via `vars.session`.
Output: promptfoo GradingResult with 12 componentResults + overall score
(pass >= 0.7).

Design notes:
- Deterministic rules (stdlib only, no external dependencies).
- Missing or non-boolean `ok` annotations are fail-closed: rule 3 fails,
  `data_quality=low` is set, and low quality hard-fails the overall grade.
- Rules 11 (repeated-term cap) and 12 (closing signature) are documented
  heuristics.
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
            parsed = json.loads(raw)
        except (ValueError, TypeError):
            return []
        if isinstance(parsed, dict):
            steps = parsed.get("steps")
        elif isinstance(parsed, list):
            steps = parsed
        else:
            return []
    if not isinstance(steps, list) or not all(isinstance(s, dict) for s in steps):
        return []
    return steps


def _count(text: str, kws) -> int:
    """count total occurrences of all keywords"""
    low = text.lower()
    return sum(low.count(k) for k in kws)


def _components(steps: list[dict[str, Any]]) -> dict[str, Any]:
    if not steps:
        return {"comps": [], "quality": "low"}

    actions = [s for s in steps if s.get("kind") == "action"]
    tool_actions = [s for s in actions if s.get("tool")]
    topics = [s.get("topic") for s in steps if s.get("topic")]
    kinds = [s.get("kind") for s in steps]
    text = " ".join(str(s.get("text", "")) for s in steps)
    action_idx = [i for i, k in enumerate(kinds) if k == "action"]

    # data quality: actions with missing or non-boolean ok -> low (fail-closed)
    unannotated = [s for s in actions if not isinstance(s.get("ok"), bool)]
    quality = "low" if unannotated else "ok"

    T = THRESHOLDS
    out: list[dict[str, Any]] = []

    # 1 Anticipation: a plan/intent step appears before the first tool action
    first_act = next(
        (i for i, s in enumerate(steps) if s.get("kind") == "action" and s.get("tool")),
        None,
    )
    if first_act is None:
        ante = {"pass": True, "score": 1.0, "reason": "no tool actions to anticipate"}
    else:
        declared = any(steps[j].get("kind") in _PLAN_KINDS for j in range(first_act))
        ante = {
            "pass": declared,
            "score": 1.0 if declared else 0.0,
            "reason": "intent declared before first action"
            if declared
            else "no intent declaration before first action",
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

    # 3 Squash & Stretch: consecutive same-error retries converge (fail-closed on bad data)
    if quality == "low":
        squash = {
            "pass": False,
            "score": 0.0,
            "reason": "data_quality low: actions missing boolean ok annotation; retry loop undeterminable",
        }
    else:
        err_streak: dict[str, int] = {}
        worst = 0
        for s in tool_actions:
            key = (
                str(s.get("tool")) + "|" + str(s.get("text", ""))
            )  # full error identity
            if s.get("ok") is False:
                err_streak[key] = err_streak.get(key, 0) + 1
                worst = max(worst, err_streak[key])
            else:
                err_streak[key] = 0  # a success resets this error's streak
        ok_ = worst <= T["max_retries"]
        squash = {
            "pass": ok_,
            "score": 1.0 if ok_ else 0.0,
            "reason": f"max same-error retries={worst} <= {T['max_retries']}"
            if ok_
            else f"retry loop x{worst}",
        }
    out.append(squash)

    # 4 PoseToPose: checkpoint between the first and last action (preflight does not count)
    mid_verify = bool(action_idx) and any(
        action_idx[0] < i < action_idx[-1] and kinds[i] in _VERIFY_KINDS
        for i in range(len(steps))
    )
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

    # 9 Timing: feedback after work begins and before the session ends
    mid_msgs = bool(action_idx) and any(
        i > action_idx[0]
        and i < len(steps) - 1
        and (kinds[i] in _VERIFY_KINDS or kinds[i] == "message")
        for i in range(len(steps))
    )
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

    # 11 SolidDrawing: heuristic (documented) — cap on repeated English terms
    import re

    terms = re.findall(r"[A-Za-z][A-Za-z0-9_-]{3,}", text)
    freq: dict[str, int] = {}
    for t in terms:
        lt = t.lower()  # case-insensitive counting: File/file/FILE are one term
        freq[lt] = freq.get(lt, 0) + 1
    repeated = [t for t, c in freq.items() if c >= 3]
    ok_ = len(repeated) <= T["max_repeated_terms"]
    out.append(
        {
            "pass": ok_,
            "score": 1.0 if ok_ else 0.0,
            "reason": f"repeated terms={len(repeated)} (heuristic)"
            if ok_
            else f"repeated-term cap exceeded: {len(repeated)} > {T['max_repeated_terms']} (heuristic)",
        }
    )

    # 12 Appeal: closing signature in the final step
    closers = ("done", "完成", "summary", "总结", "next steps", "下一步")
    final_text = str(steps[-1].get("text", "")).lower()
    appeal = any(c in final_text for c in closers)
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
    # fail-closed: low data quality hard-fails the grade even above the score gate
    passed = score >= THRESHOLDS["pass_score"] and res["quality"] != "low"
    return {
        "pass": passed,
        "score": score,
        "reason": ("passed" if passed else "failing: " + "; ".join(fails[:4]))
        + data_note,
        "componentResults": comps,
        "namedScores": named,
    }
