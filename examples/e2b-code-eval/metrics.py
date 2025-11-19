# metrics.py
import json
import os
import time


def write_metrics(
    task_id, provider, model, success, runtime_s, memory_mb=None, extra=None
):
    metrics = {
        "task_id": str(task_id),
        "provider": provider,
        "model": model,
        "success": bool(success),
        "runtime_s": float(runtime_s),
        "memory_mb": memory_mb,
        "extra": extra or {},
        "timestamp": int(time.time()),
    }
    out_dir = os.getenv("PROMPTFOO_RESULTS_DIR", ".promptfoo_results")
    os.makedirs(out_dir, exist_ok=True)
    fn = f"{metrics['task_id']}_{provider}_{model}.json".replace("/", "_")
    path = os.path.join(out_dir, fn)
    with open(path, "w") as f:
        # <- this makes ExecutionError, Exception, etc. become strings
        json.dump(metrics, f, indent=2, default=str)
    return path
