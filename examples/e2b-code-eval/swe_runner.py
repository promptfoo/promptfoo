# swe_runner.py (e2b-only skeleton)
import os
import shutil
import subprocess
import tempfile
import time
from textwrap import dedent

from e2b_code_interpreter import Sandbox

# Optional: use OpenAI if available for real patch generation
try:
    from openai import OpenAI  # pip install openai
except Exception:
    OpenAI = None


def model_call_patch(fail_log: str, relevant_files: dict) -> str:
    """
    Minimal working example:
    - If OPENAI_API_KEY is set and the OpenAI SDK is available, ask the model for a unified diff.
    - Otherwise, return a tiny, valid unified diff against the first relevant file (demo fallback).
    """

    # 1) Try LLM-backed patch generation (only if configured)
    if OpenAI and os.getenv("OPENAI_API_KEY"):
        client = OpenAI()
        model = os.getenv("PATCH_MODEL", "gpt-4o-mini")

        sys_msg = (
            "You are a code repair assistant. Output ONLY a unified diff patch that "
            "can be applied with `git apply -p0`. Do NOT include any explanations."
        )
        files_blob = "\n\n".join(
            f"{path}:\n{content}" for path, content in relevant_files.items()
        )
        user_msg = (
            "Given the failing test log and the repository files, produce a minimal fix:\n\n"
            f"Failing test log:\n{fail_log}\n\n"
            f"Relevant files (path => content):\n{files_blob}\n"
        )

        resp = client.chat.completions.create(
            model=model,
            temperature=0,
            messages=[
                {"role": "system", "content": sys_msg},
                {"role": "user", "content": user_msg},
            ],
        )
        patch = resp.choices[0].message.content.strip()
        return patch

    # 2) Fallback: return a harmless, valid unified diff so the example runs without any API keys
    if not relevant_files:
        demo_path = "README.md"
        old = ""
        new = "# patched-by-demo\n"
    else:
        demo_path = next(iter(relevant_files.keys()))
        old = relevant_files[demo_path]
        new = (
            (old or "")
            + ("\n" if old and not old.endswith("\n") else "")
            + "# patched-by-demo\n"
        )

    # Minimal unified diff; uses -p0 friendly paths (a/ and b/)
    fallback_patch = dedent(f"""\
    --- a/{demo_path}
    +++ b/{demo_path}
    @@
    {old or ""}
    +# patched-by-demo
    """)
    return fallback_patch


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
