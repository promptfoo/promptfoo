# integration-docker/code-generation-sandbox (Docker Code Generation Sandbox)

On Windows, run all commands in WSL 2 with Docker Desktop’s WSL integration enabled. Install Node.js and Python inside WSL; native Windows Python is not supported by Epicbox.

You can run this example with:

```bash
npx promptfoo@latest init --example integration-docker/code-generation-sandbox
cd integration-docker/code-generation-sandbox
```

## Usage

Use Python 3.10 or later and a running Docker daemon for Linux containers:

```bash
python3 -m venv .venv
source .venv/bin/activate
python -m pip install -r requirements.txt
docker pull python:3.9-alpine
```

If your local Docker daemon uses a non-default Unix socket (for example, Colima),
set `DOCKER_HOST` to that socket before running the example or tests. Epicbox does
not automatically read Docker CLI contexts.

The requirements use the official Epicbox 1.1.1 GitHub release with a SHA-256 hash.
This release fixes compatibility with urllib3 2; PyPI still serves Epicbox 1.1.0.
The transport dependencies retain security minimums for existing environments.

See https://promptfoo.dev/docs/guides/sandboxed-code-evals for configuration and usage.

Run the sandbox integration tests with Docker available:

```bash
python -m unittest discover -p 'test_*.py' -v
```

Repository contributors can run these tests plus the three original CLI cases,
using deterministic model fixtures and real containers, through the shared
[example CI runner](../../../.github/EXAMPLES.md).
