# integration-docker/code-generation-sandbox (Docker Code Generation Sandbox)

In Windows PowerShell, use `npx.cmd` in place of `npx` in the commands below.

You can run this example with:

```bash
npx promptfoo@latest init --example integration-docker/code-generation-sandbox
cd integration-docker/code-generation-sandbox
```

## Usage

Use Python 3.10 or later and a running Docker daemon:

On macOS or Linux:

```bash
python -m venv .venv
source .venv/bin/activate
python -m pip install -r requirements.txt
docker pull python:3.9-alpine
```

On Windows PowerShell, call the virtual environment's Python directly:

```powershell
py -3 -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
$env:PROMPTFOO_PYTHON = (Resolve-Path .\.venv\Scripts\python.exe).Path
docker pull python:3.9-alpine
```

Keep `PROMPTFOO_PYTHON` set in the same PowerShell session when running
`npx.cmd promptfoo@latest eval --no-cache` after configuring your model credentials.
No activation script or execution-policy change is needed.

The requirements use the official Epicbox 1.1.1 GitHub release with a SHA-256 hash.
This release fixes compatibility with urllib3 2; PyPI still serves Epicbox 1.1.0.
The transport dependencies retain security minimums for existing environments.

See https://promptfoo.dev/docs/guides/sandboxed-code-evals for configuration and usage.

Run the sandbox integration tests with Docker available:

```bash
python -m unittest discover -p 'test_*.py' -v
```

In Windows PowerShell:

```powershell
.\.venv\Scripts\python.exe -m unittest discover -p 'test_*.py' -v
```
