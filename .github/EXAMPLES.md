# Example CI

`workflows/examples.yml` runs credential-free example regressions, with one isolated
job per registered example/runtime and one aggregate `Examples` status check. It
replaces the Docker-only and Python-provider-only workflows. Core Python wrapper
tests stay in `main.yml`.

PRs run the affected registered examples. Changes to `src/`, build scripts/config,
database migrations, workflows, the runner, or root dependency/toolchain manifests
run the full registered matrix. Pushes to
`main` and manual runs also run the full matrix. Selection errors, missing or fully
skipped suites, and failed or cancelled selected jobs fail the aggregate check; an unrelated PR
gets an explicit successful empty selection. The workflow is not path-filtered,
so `Examples` can be configured as a stable required check in repository settings.

## Run locally

From a repository checkout, use the same entrypoint as CI:

```bash
python3.14 .github/scripts/examples.py plan
python3.10 .github/scripts/examples.py run python-provider-upgrade
python3.14 .github/scripts/examples.py run python-provider-minimums
```

For Docker, first start a Docker daemon for Linux containers and build the local CLI:

```bash
source ~/.nvm/nvm.sh && nvm use
npm ci
npx tsdown && npm run postbuild
python3.10 .github/scripts/examples.py run docker-sandbox
python3.14 .github/scripts/examples.py run docker-sandbox
```

The runner creates and cleans up a temporary virtual environment, installs the
example requirements, and runs the registered test suites. Fresh environments
must also pass `pip check`.
Docker tests use real containers and the example's original three CLI cases with
deterministic generated-code fixtures. Incorrect generated code must also fail the
real assertions. No model credentials are needed. Use WSL 2 rather than native
Windows Python for the Docker example.

The Python-provider profiles preserve both upgrade-from-old-dependencies testing
on Python 3.10 and a fresh install at declared minimum versions on Python 3.14.
The upgrade profile intentionally retains the existing legacy fixture: OpenAI 3
uses `httpcore2`, but upgrading leaves unused `httpcore==1.0.7` installed with an
incompatible `h11` requirement. This profile checks runtime compatibility, not
`pip check`; the clean minimum-version profile checks dependency consistency.

## Register another example

Add an `Example` entry in `scripts/examples.py`, choosing its supported runtimes,
test directories/patterns, and any Node or Docker requirements. Keep assertions
beside the example and use local model fixtures, not paid API calls. Each profile
gets a fresh environment; do not combine unrelated SDK requirements. Add selection
coverage in `scripts/test_examples.py`, then run:

```bash
python3.14 -m unittest discover -s .github/scripts -p 'test_examples.py' -v
```

The NUL-delimited merge-base selector follows the approach in PR #11173. That PR's
broader manifest-installation checks are separate from these behavior tests; an
installation pass does not demonstrate that an example runs correctly. As other
example PRs land, register their tests here instead of adding another workflow.
