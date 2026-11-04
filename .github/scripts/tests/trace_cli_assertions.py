"""Check CLI grading against each original assertion, including partial remote traces."""

import unittest

INCOMPLETE_REASON = (
    "Trace collection is incomplete. This assertion requires a complete trace."
)


def assert_remote_trace_result(
    case: unittest.TestCase,
    row: dict,
    configured: list,
    *,
    incomplete: set[int],
    failed: set[int],
) -> None:
    """Only the listed assertions may fail, and only incomplete ones get that reason."""
    components = row["gradingResult"]["componentResults"]
    case.assertEqual([item["assertion"] for item in components], configured)
    case.assertTrue(incomplete.isdisjoint(failed))
    case.assertTrue(incomplete | failed <= set(range(len(configured))))
    case.assertFalse(row["success"], row)
    case.assertFalse(row.get("error"), row)
    case.assertLess(row["score"], 1, row)
    for index, item in enumerate(components):
        case.assertEqual(item["pass"], index not in incomplete | failed, item)
        case.assertEqual(item["reason"] == INCOMPLETE_REASON, index in incomplete, item)
        if index in incomplete | failed:
            case.assertEqual(item["score"], 0, item)
        if (
            index in failed
            and configured[index]["type"] == "trajectory:tool-args-match"
        ):
            case.assertTrue(
                item["reason"].startswith(
                    "The trace is incomplete. Additional spans could satisfy this assertion."
                ),
                item,
            )
