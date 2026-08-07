# metrics.py
import json
import os
import re
import time


def _safe_filename_part(value):
    """Convert metric labels to a portable filename component."""
    return re.sub(r'[<>:"/\\|?*\x00-\x1f]', "_", str(value))


def write_metrics(task_id, success, runtime_s, memory_mb=None, extra=None):
    metrics = {
        "task_id": str(task_id),
        "success": bool(success),
        "runtime_s": float(runtime_s),
        "memory_mb": memory_mb,
        "extra": extra or {},
        "timestamp": int(time.time()),
    }
    out_dir = os.getenv("PROMPTFOO_RESULTS_DIR", ".promptfoo_results")
    os.makedirs(out_dir, exist_ok=True)
    fn = f"{_safe_filename_part(metrics['task_id'])}.json"
    path = os.path.join(out_dir, fn)
    with open(path, "w", encoding="utf-8") as f:
        # <- this makes ExecutionError, Exception, etc. become strings
        json.dump(metrics, f, indent=2, default=str)
    return path
