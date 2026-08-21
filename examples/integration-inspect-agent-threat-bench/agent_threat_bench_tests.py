"""Generate Promptfoo test cases from Inspect's AgentThreatBench tasks."""

from __future__ import annotations

TASK_LOADERS = {
    "memory_poison": "agent_threat_bench_memory_poison",
    "autonomy_hijack": "agent_threat_bench_autonomy_hijack",
    "data_exfil": "agent_threat_bench_data_exfil",
}


def generate_tests():
    """Return one Promptfoo test case per AgentThreatBench sample."""

    tests = []
    for task_name, task_loader in _task_loaders().items():
        dataset = task_loader().dataset
        tests.extend(
            _test_case(task_name, dataset[index]) for index in range(len(dataset))
        )
    return tests


def _task_loaders():
    try:
        from inspect_evals import agent_threat_bench
    except ImportError as exc:
        raise RuntimeError(
            "Could not import inspect_evals.agent_threat_bench. Install prerequisites "
            "with `pip install inspect-evals` before loading AgentThreatBench tests."
        ) from exc

    return {
        task_name: getattr(agent_threat_bench, loader_name)
        for task_name, loader_name in TASK_LOADERS.items()
    }


def _test_case(task_name, sample):
    metadata = getattr(sample, "metadata", {}) or {}
    sample_id = str(sample.id)
    prompt = str(sample.input)
    return {
        "description": f"{task_name} - {_short_label(prompt)}",
        "vars": {
            "prompt": prompt,
            "task": task_name,
            "sample_id": sample_id,
        },
        "metadata": {
            "task": task_name,
            "sample_id": sample_id,
            "owasp_id": metadata.get("owasp_id", "unknown"),
            "attack_name": metadata.get("attack_name", "unknown"),
            "difficulty": metadata.get("difficulty", "unknown"),
            "testCaseId": f"agent-threat-bench-{task_name.replace('_', '-')}-{sample_id}",
        },
    }


def _short_label(instruction, max_length=80):
    label = " ".join(str(instruction).split())
    if len(label) <= max_length:
        return label
    return f"{label[: max_length - 3].rstrip()}..."
