"""Unit tests for behavior_review — unittest style (promptfoo contribution guide).

Run: python -m unittest test_behavior_review
Covers each of the 12 dimensions with boundary cases plus the fail-closed
missing-data path.
"""

import json
import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import behavior_review as br


def act(text="t", tool="t", ok=True, topic="a"):
    return {"kind": "action", "text": text, "tool": tool, "ok": ok, "topic": topic}


def run(session):
    return br.get_assert("", {"vars": {"session": json.dumps(session)}})


def dim(result, index):
    return result["componentResults"][index]


class TestAnticipation(unittest.TestCase):
    def test_no_tool_actions_passes(self):
        self.assertTrue(
            dim(
                run(
                    {
                        "steps": [
                            {"kind": "message", "text": "hi"},
                            {"kind": "verify", "text": "checked"},
                        ]
                    }
                ),
                0,
            )["pass"]
        )

    def test_first_action_without_intent_fails(self):
        self.assertFalse(dim(run({"steps": [act()]}), 0)["pass"])

    def test_plan_before_first_action_passes(self):
        self.assertTrue(
            dim(run({"steps": [{"kind": "plan", "text": "p"}, act()]}), 0)["pass"]
        )

    def test_plan_with_interleaved_message_still_passes(self):
        s = {
            "steps": [
                {"kind": "plan", "text": "p"},
                {"kind": "message", "text": "explaining context"},
                act(),
            ]
        }
        self.assertTrue(dim(run(s), 0)["pass"])


class TestStaging(unittest.TestCase):
    def test_opens_with_action_fails(self):
        self.assertFalse(dim(run({"steps": [act()]}), 1)["pass"])

    def test_opens_with_plan_passes(self):
        self.assertTrue(
            dim(run({"steps": [{"kind": "plan", "text": "p"}, act()]}), 1)["pass"]
        )


class TestSquashStretch(unittest.TestCase):
    def test_retry_loop_fails(self):
        s = {
            "steps": [
                {"kind": "plan", "text": "p"},
                act(ok=False),
                act(ok=False),
                act(ok=False),
                {"kind": "report", "text": "done"},
            ]
        }
        self.assertFalse(dim(run(s), 2)["pass"])

    def test_single_error_recovers_passes(self):
        s = {
            "steps": [
                {"kind": "plan", "text": "p"},
                act(ok=False),
                act(ok=True),
                {"kind": "report", "text": "done"},
            ]
        }
        self.assertTrue(dim(run(s), 2)["pass"])

    def test_missing_ok_fails_closed(self):
        s = {"steps": [act(ok=None), act(ok=None), act(ok=None)]}
        r = run(s)
        self.assertFalse(dim(r, 2)["pass"])
        self.assertIn("data_quality", r["reason"])

    def test_distinct_errors_not_merged_into_retry(self):
        s = {
            "steps": [
                {"kind": "plan", "text": "p"},
                act(text="error: file a.txt not found", ok=False),
                act(text="error: file b.txt not found", ok=False),
                act(text="error: file c.txt not found", ok=False),
                {"kind": "report", "text": "done"},
            ]
        }
        self.assertTrue(dim(run(s), 2)["pass"])


class TestPoseToPose(unittest.TestCase):
    def test_long_without_mid_verify_fails(self):
        s = {
            "steps": [{"kind": "plan", "text": "p"}]
            + [act(text=str(i)) for i in range(7)]
        }
        self.assertFalse(dim(run(s), 3)["pass"])

    def test_long_with_mid_verify_passes(self):
        s = {
            "steps": [{"kind": "plan", "text": "p"}]
            + [act(text=str(i)) for i in range(4)]
            + [{"kind": "verify", "text": "v"}]
            + [act(text=str(i)) for i in range(3)]
            + [{"kind": "report", "text": "done"}]
        }
        self.assertTrue(dim(run(s), 3)["pass"])


class TestFollowThrough(unittest.TestCase):
    def test_ends_with_report_passes(self):
        self.assertTrue(
            dim(
                run(
                    {
                        "steps": [
                            {"kind": "plan", "text": "p"},
                            act(),
                            {"kind": "report", "text": "d"},
                        ]
                    }
                ),
                4,
            )["pass"]
        )

    def test_ends_abruptly_fails(self):
        self.assertFalse(
            dim(run({"steps": [{"kind": "plan", "text": "p"}, act()]}), 4)["pass"]
        )


class TestSlowInOut(unittest.TestCase):
    def test_plan_in_verify_out_passes(self):
        self.assertTrue(
            dim(
                run(
                    {
                        "steps": [
                            {"kind": "plan", "text": "p"},
                            act(),
                            {"kind": "verify", "text": "v"},
                        ]
                    }
                ),
                5,
            )["pass"]
        )

    def test_no_plan_in_fails(self):
        self.assertFalse(
            dim(run({"steps": [act(), {"kind": "report", "text": "d"}]}), 5)["pass"]
        )


class TestArcs(unittest.TestCase):
    def test_topic_zigzag_fails(self):
        s = {
            "steps": [
                {"kind": "plan", "text": "p", "topic": "a"},
                act(topic="a"),
                act(topic="b"),
                act(topic="c"),
                {"kind": "report", "text": "d", "topic": "c"},
            ]
        }
        self.assertFalse(dim(run(s), 6)["pass"])

    def test_two_topics_passes(self):
        s = {
            "steps": [
                {"kind": "plan", "text": "p", "topic": "a"},
                act(topic="a"),
                act(topic="b"),
                {"kind": "report", "text": "d", "topic": "b"},
            ]
        }
        self.assertTrue(dim(run(s), 6)["pass"])


class TestSecondaryAction(unittest.TestCase):
    def test_many_warnings_fail(self):
        s = {
            "steps": [
                {"kind": "plan", "text": "p"},
                act(text="warning: " * 100),
                {"kind": "report", "text": "d"},
            ]
        }
        self.assertFalse(dim(run(s), 7)["pass"])

    def test_no_aux_passes(self):
        self.assertTrue(
            dim(
                run(
                    {
                        "steps": [
                            {"kind": "plan", "text": "p"},
                            act(),
                            {"kind": "report", "text": "d"},
                        ]
                    }
                ),
                7,
            )["pass"]
        )


class TestTiming(unittest.TestCase):
    def test_long_silent_fails(self):
        s = {
            "steps": [{"kind": "plan", "text": "p"}]
            + [act(text=str(i)) for i in range(9)]
        }
        self.assertFalse(dim(run(s), 8)["pass"])


class TestExaggeration(unittest.TestCase):
    def test_over_emphasis_fails(self):
        s = {
            "steps": [
                {"kind": "plan", "text": "**" * 50},
                act(),
                {"kind": "report", "text": "d"},
            ]
        }
        self.assertFalse(dim(run(s), 9)["pass"])

    def test_light_emphasis_passes(self):
        s = {
            "steps": [
                {"kind": "plan", "text": "**a**"},
                act(),
                {"kind": "report", "text": "d"},
            ]
        }
        self.assertTrue(dim(run(s), 9)["pass"])


class TestAppeal(unittest.TestCase):
    def test_closing_present_passes(self):
        self.assertTrue(
            dim(
                run(
                    {
                        "steps": [
                            {"kind": "plan", "text": "p"},
                            act(),
                            {"kind": "report", "text": "summary done"},
                        ]
                    }
                ),
                11,
            )["pass"]
        )

    def test_no_closing_fails(self):
        self.assertFalse(
            dim(
                run(
                    {
                        "steps": [
                            {"kind": "plan", "text": "p"},
                            act(),
                            {"kind": "message", "text": "whatever"},
                        ]
                    }
                ),
                11,
            )["pass"]
        )

    def test_mid_trace_closer_does_not_rescue(self):
        s = {
            "steps": [
                {"kind": "plan", "text": "p"},
                act(),
                {"kind": "message", "text": "done for now"},
                {"kind": "message", "text": "continuing regardless"},
            ]
        }
        self.assertFalse(dim(run(s), 11)["pass"])


class TestReviewHardening(unittest.TestCase):
    def test_nonboolean_ok_fails_closed(self):
        s = {"steps": [act(ok="false"), act(ok="false"), act(ok="false")]}
        r = run(s)
        self.assertFalse(dim(r, 2)["pass"])
        self.assertIn("data_quality", r["reason"])

    def test_low_quality_hard_fails_overall(self):
        # otherwise well-presented trace, but the action outcome is unverifiable
        s = {
            "steps": [
                {"kind": "plan", "text": "p"},
                act(ok=None),
                {"kind": "verify", "text": "v"},
                {"kind": "report", "text": "done"},
            ]
        }
        r = run(s)
        self.assertGreaterEqual(r["score"], 0.7)
        self.assertFalse(r["pass"])
        self.assertIn("data_quality=low", r["reason"])

    def test_non_object_step_rejected(self):
        r = run({"steps": [None]})
        self.assertFalse(r["pass"])
        self.assertEqual(r["componentResults"], [])

    def test_retry_streak_resets_after_success(self):
        # every failure converges on the next attempt: not a retry loop
        s = {
            "steps": [{"kind": "plan", "text": "p"}]
            + [a for _ in range(3) for a in (act(ok=False), act(ok=True))]
            + [{"kind": "report", "text": "done"}]
        }
        self.assertTrue(dim(run(s), 2)["pass"])

    def test_preflight_verify_not_mid_checkpoint(self):
        s = {
            "steps": [{"kind": "plan", "text": "p"}, {"kind": "verify", "text": "v"}]
            + [act(text=str(i)) for i in range(7)]
            + [{"kind": "report", "text": "done"}]
        }
        self.assertFalse(dim(run(s), 3)["pass"])

    def test_early_message_not_feedback(self):
        s = {
            "steps": [{"kind": "plan", "text": "p"}, {"kind": "message", "text": "m"}]
            + [act(text=str(i)) for i in range(9)]
            + [{"kind": "report", "text": "done"}]
        }
        self.assertFalse(dim(run(s), 8)["pass"])

    def test_case_variants_count_as_one_term(self):
        words = ["alpha", "bravo", "charlie", "delta", "echoes", "foxtro"]
        blob = " ".join(w + " " + w.upper() + " " + w.capitalize() for w in words)
        s = {
            "steps": [
                {"kind": "plan", "text": "p"},
                {"kind": "message", "text": blob},
                {"kind": "report", "text": "done"},
            ]
        }
        self.assertFalse(dim(run(s), 10)["pass"])

    def test_action_without_tool_still_analyzed(self):
        # exporters may omit the tool field; identical failures must still count
        s = {
            "steps": [{"kind": "plan", "text": "p"}]
            + [{"kind": "action", "text": "boom", "ok": False} for _ in range(3)]
            + [{"kind": "report", "text": "done"}]
        }
        self.assertFalse(dim(run(s), 2)["pass"])

    def test_numeric_topic_zero_preserved(self):
        s = {
            "steps": [
                {"kind": "plan", "text": "p", "topic": 0},
                {"kind": "action", "text": "a", "tool": "t", "ok": True, "topic": 1},
                {"kind": "action", "text": "b", "tool": "t", "ok": True, "topic": 0},
                {"kind": "report", "text": "done", "topic": 1},
            ]
        }
        self.assertFalse(dim(run(s), 6)["pass"])  # 0 -> 1 -> 0 zig-zags

    def test_non_string_kind_rejected(self):
        r = run({"steps": [{"kind": ["plan"], "text": "x"}]})
        self.assertFalse(r["pass"])
        self.assertEqual(r["componentResults"], [])

    def test_unknown_kind_fails_closed(self):
        # a misspelled "aciton" must not make the whole trace look action-free
        s = {
            "steps": [
                {"kind": "plan", "text": "p"},
                {"kind": "aciton", "text": "boom", "ok": False},
                {"kind": "aciton", "text": "boom", "ok": False},
                {"kind": "aciton", "text": "boom", "ok": False},
                {"kind": "report", "text": "done"},
            ]
        }
        r = run(s)
        self.assertFalse(r["pass"])
        self.assertEqual(r["componentResults"], [])

    def test_tool_less_action_requires_anticipation(self):
        s = {
            "steps": [
                {"kind": "action", "text": "a", "ok": True},
                {"kind": "plan", "text": "p"},
                act(),
                {"kind": "report", "text": "done"},
            ]
        }
        self.assertFalse(dim(run(s), 0)["pass"])

    def test_blank_plan_not_credited(self):
        s = {
            "steps": [
                {"kind": "plan", "text": "   "},
                act(),
                {"kind": "report", "text": "done"},
            ]
        }
        r = run(s)
        self.assertFalse(dim(r, 0)["pass"])  # anticipation
        self.assertFalse(dim(r, 1)["pass"])  # staging
        self.assertFalse(dim(r, 5)["pass"])  # slow-in/out

    def test_short_session_reason_is_honest(self):
        s = {
            "steps": [
                {"kind": "plan", "text": "p"},
                act(),
                {"kind": "report", "text": "done"},
            ]
        }
        r = run(s)
        self.assertIn("not required", dim(r, 3)["reason"])
        self.assertIn("not required", dim(r, 8)["reason"])

    def test_plan_only_trace_rejected(self):
        r = run({"steps": [{"kind": "plan", "text": "done"}]})
        self.assertFalse(r["pass"])
        self.assertEqual(r["componentResults"], [])
        self.assertIn("no evidence of work", r["reason"])

    def test_nonstring_text_plan_not_credited(self):
        s = {
            "steps": [
                {"kind": "plan", "text": None},
                act(),
                {"kind": "report", "text": "done"},
            ]
        }
        r = run(s)
        self.assertFalse(dim(r, 0)["pass"])
        self.assertFalse(dim(r, 1)["pass"])
        self.assertFalse(dim(r, 5)["pass"])

    def test_blank_report_not_credited(self):
        s = {
            "steps": [
                {"kind": "plan", "text": "p"},
                act(),
                {"kind": "report", "text": "   "},
            ]
        }
        r = run(s)
        self.assertFalse(dim(r, 4)["pass"])
        self.assertFalse(dim(r, 5)["pass"])

    def test_whitespace_verify_not_checkpoint(self):
        s = {
            "steps": [{"kind": "plan", "text": "p"}]
            + [act(text=str(i)) for i in range(3)]
            + [{"kind": "verify", "text": "   "}]
            + [act(text=str(i)) for i in range(3, 6)]
            + [{"kind": "report", "text": "done"}]
        }
        self.assertFalse(dim(run(s), 3)["pass"])


class TestOverall(unittest.TestCase):
    def test_improved_session_passes(self):
        s = {
            "steps": [
                {
                    "kind": "plan",
                    "text": "I will read the file then verify",
                    "topic": "a",
                },
                {
                    "kind": "action",
                    "text": "read file",
                    "tool": "read",
                    "ok": True,
                    "topic": "a",
                },
                {
                    "kind": "action",
                    "text": "read file retry once",
                    "tool": "read",
                    "ok": True,
                    "topic": "a",
                },
                {"kind": "verify", "text": "checking result integrity", "topic": "a"},
                {
                    "kind": "report",
                    "text": "summary: file read ok. next steps: none.",
                    "topic": "a",
                },
            ]
        }
        r = run(s)
        self.assertTrue(r["pass"])
        self.assertEqual(r["score"], 1.0)

    def test_stiff_session_score_locked(self):
        """Locks the README-documented score (0.58) to prevent silent regression."""
        s = {
            "steps": [
                {
                    "kind": "action",
                    "text": "wrote file",
                    "tool": "write",
                    "ok": True,
                    "topic": "a",
                },
                {
                    "kind": "action",
                    "text": "read file",
                    "tool": "read",
                    "ok": False,
                    "topic": "a",
                },
                {
                    "kind": "action",
                    "text": "read file",
                    "tool": "read",
                    "ok": False,
                    "topic": "a",
                },
                {
                    "kind": "action",
                    "text": "read file",
                    "tool": "read",
                    "ok": False,
                    "topic": "a",
                },
                {
                    "kind": "action",
                    "text": "read file",
                    "tool": "read",
                    "ok": False,
                    "topic": "a",
                },
                {"kind": "message", "text": "done", "topic": "a"},
            ]
        }
        r = run(s)
        self.assertFalse(r["pass"])
        self.assertAlmostEqual(r["score"], 0.58, places=2)
        fails = [c for c in r["componentResults"] if not c["pass"]]
        self.assertEqual(
            len(fails), 5
        )  # anticipation, staging, retry, follow-through, slow-in/out

    def test_empty_session_fails(self):
        self.assertFalse(run({"steps": []})["pass"])

    def test_serialized_list_session_is_graded(self):
        steps = [
            {"kind": "plan", "text": "p"},
            act(),
            {"kind": "report", "text": "done"},
        ]
        r = br.get_assert("", {"vars": {"session": json.dumps(steps)}})
        self.assertEqual(len(r["componentResults"]), 12)

    def test_missing_session_reports_no_trace(self):
        r = br.get_assert("", {"vars": {}})
        self.assertFalse(r["pass"])
        self.assertEqual(r["componentResults"], [])
        self.assertIn("no session trace", r["reason"])


if __name__ == "__main__":
    unittest.main()
