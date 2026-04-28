"""Generate Promptfoo test cases for Inspect's osworld_small dataset."""

from __future__ import annotations

from typing import Any, Dict, List, Optional, Set

Sample = Dict[str, str]
TestCase = Dict[str, Any]


OSWORLD_SMALL_SAMPLES: List[Sample] = [
    {
        "app": "gimp",
        "sample_id": "7a4deb26-d57d-4ea9-9a73-630f66a7b568",
        "task": "lower image brightness",
    },
    {
        "app": "gimp",
        "sample_id": "554785e9-4523-4e7a-b8e1-8016f565f56a",
        "task": "enhance color vibrancy",
    },
    {
        "app": "libreoffice_calc",
        "sample_id": "357ef137-7eeb-4c80-a3bb-0951f26a8aff",
        "task": "calculate earned amount",
    },
    {
        "app": "libreoffice_calc",
        "sample_id": "42e0a640-4f19-4b28-973d-729602b5a4a7",
        "task": "revenue and expenses sums",
    },
    {
        "app": "libreoffice_calc",
        "sample_id": "abed40dc-063f-4598-8ba5-9fe749c0615d",
        "task": "unique duplicate names",
    },
    {
        "app": "libreoffice_impress",
        "sample_id": "5d901039-a89c-4bfb-967b-bf66f4df075e",
        "task": "cover slide crop",
    },
    {
        "app": "libreoffice_impress",
        "sample_id": "550ce7e7-747b-495f-b122-acdc4d0b8e54",
        "task": "soccer club checklist",
    },
    {
        "app": "libreoffice_writer",
        "sample_id": "0810415c-bde4-4443-9047-d5f70165a697",
        "task": "double line spacing",
    },
    {
        "app": "libreoffice_writer",
        "sample_id": "0a0faba3-5580-44df-965d-f562a99b291c",
        "task": "align first three words",
    },
    {
        "app": "multi_apps",
        "sample_id": "510f64c8-9bcc-4be1-8d30-638705850618",
        "task": "start VS Code from terminal",
    },
    {
        "app": "multi_apps",
        "sample_id": "b5062e3e-641c-4e3a-907b-ac864d2e7652",
        "task": "extract author info to sheet",
    },
    {
        "app": "multi_apps",
        "sample_id": "eb303e01-261e-4972-8c07-c9b4e7a4922a",
        "task": "slides and speaker notes",
    },
    {
        "app": "multi_apps",
        "sample_id": "8e116af7-7db7-4e35-a68b-b0939c066c78",
        "task": "bookkeeping from receipts",
    },
    {
        "app": "multi_apps",
        "sample_id": "716a6079-22da-47f1-ba73-c9d58f986a38",
        "task": "locate secret document",
    },
    {
        "app": "multi_apps",
        "sample_id": "2373b66a-092d-44cb-bfd7-82e86e7a3b4d",
        "task": "monitor Ubuntu resources",
    },
    {
        "app": "os",
        "sample_id": "5ea617a3-0e86-4ba6-aab2-dac9aa2e8d57",
        "task": "recover deleted poster",
    },
    {
        "app": "os",
        "sample_id": "5812b315-e7bd-4265-b51f-863c02174c28",
        "task": "create SSH user",
    },
    {
        "app": "vlc",
        "sample_id": "8f080098-ddb1-424c-b438-4e96e5e4786e",
        "task": "convert music video to MP3",
    },
    {
        "app": "vscode",
        "sample_id": "0ed39f63-6049-43d4-ba4d-5fa2fe04a951",
        "task": "replace text with test",
    },
    {
        "app": "vscode",
        "sample_id": "53ad5833-3455-407b-bbc6-45b4c79ab8fb",
        "task": "open project folder",
    },
    {
        "app": "vscode",
        "sample_id": "276cc624-87ea-4f08-ab93-f770e3790175",
        "task": "set wrap length",
    },
]


def generate_tests(config: Optional[Dict[str, Any]] = None) -> List[TestCase]:
    """Return one Promptfoo test case per pinned osworld_small sample."""

    config = config or {}
    include_apps = _as_set(config.get("include_apps"))
    include_sample_ids = _as_set(config.get("sample_ids"))
    tests = [
        _test_case(sample)
        for sample in OSWORLD_SMALL_SAMPLES
        if _included(sample, include_apps, include_sample_ids)
    ]

    limit = config.get("limit")
    if limit is not None:
        return tests[: int(limit)]
    return tests


def _included(
    sample: Sample,
    include_apps: Set[str],
    include_sample_ids: Set[str],
) -> bool:
    if include_apps and sample["app"] not in include_apps:
        return False
    if include_sample_ids and sample["sample_id"] not in include_sample_ids:
        return False
    return True


def _test_case(sample: Sample) -> TestCase:
    app = sample["app"]
    sample_id = sample["sample_id"]
    short_id = sample_id.split("-", 1)[0]
    test_case_id = f"osworld-{app.replace('_', '-')}-{short_id}"
    return {
        "description": f"{app} - {sample['task']}",
        "vars": {
            "prompt": f"Run OSWorld sample {sample_id}",
            "app": app,
            "sample_id": sample_id,
        },
        "metadata": {
            "app": app,
            "sample_id": sample_id,
            "testCaseId": test_case_id,
        },
    }


def _as_set(value: Any) -> Set[str]:
    if not value:
        return set()
    if isinstance(value, str):
        return {part.strip() for part in value.split(",") if part.strip()}
    return {str(part) for part in value}
