# swe_runner.py (e2b-only skeleton)
import os
import shutil
import subprocess
import tempfile
import time

from e2b_code_interpreter import Sandbox


def model_call_patch(fail_log: str, relevant_files: dict) -> str:
    """
    IMPLEMENT: call your LLM provider / promptfoo to get a patch (unified diff string).
    Example options:
      - call promptfoo to generate a patch prompt and parse model output
      - call OpenAI / other provider directly
    Return: unified diff (git apply-ready)
    """
    raise NotImplementedError("Implement model_call_patch()")


def run_task_local(
    repo_url: str, failing_test_cmd: str, relevant_paths: list, attempts=3
):
    tmp = tempfile.mkdtemp()
    try:
        subprocess.check_call(["git", "clone", repo_url, tmp])
        cwd = os.getcwd()
        os.chdir(tmp)
        # capture failing test
        p = subprocess.run(failing_test_cmd, shell=True, capture_output=True, text=True)
        fail_log = p.stdout + "\n" + p.stderr
        relevant_files = {}
        for path in relevant_paths:
            try:
                with open(os.path.join(tmp, path), "r") as f:
                    relevant_files[path] = f.read()
            except Exception:
                relevant_files[path] = ""
        success = False
        for attempt in range(attempts):
            try:
                patch = model_call_patch(fail_log, relevant_files)
            except Exception as e:
                print("Model call failed:", e)
                break
            # apply patch locally
            proc = subprocess.run(
                ["git", "apply", "-"], input=patch, text=True, capture_output=True
            )
            if proc.returncode != 0:
                print("Patch apply failed:", proc.stderr)
                continue
            # run tests inside e2b sandbox (safe)
            with Sandbox.create() as sbx:
                test_script = f"import subprocess; print(subprocess.run('{failing_test_cmd}', shell=True, capture_output=True).returncode)"
                res = sbx.run_code(
                    code=test_script,
                    language="python",
                    limits={"cputime": 10, "wall_time": 30, "memory": 512},
                    allow_network=False,
                )
            rc = None
            try:
                if getattr(res, "results", None):
                    r0 = res.results[0]
                    val = r0.get("stdout") or r0.get("output") or r0.get("text") or ""
                    if isinstance(val, list):
                        val = "".join(map(str, val))
                    rc = int(str(val).strip())
                elif getattr(res, "text", None):
                    rc = int(str(res.text).strip())
            except Exception:
                rc = None
            if rc == 0:
                success = True
                print("Patch fixed tests on attempt", attempt + 1)
                break
            else:
                print("Patch did not fix tests; rc:", rc)
        os.chdir(cwd)
        return {"success": success}
    finally:
        shutil.rmtree(tmp, ignore_errors=True)
