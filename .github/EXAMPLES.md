# Example CI

`workflows/examples.yml` runs credential-free example regressions, with one isolated
job per registered example/runtime and one aggregate `Examples` status check. It
replaces the Docker-only, Python-provider-only, OpenAI Agents, and Google ADK
workflows. Core Python wrapper
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

After building the local CLI, run the Google ADK profiles with the same entrypoint:

```bash
python3.12 .github/scripts/examples.py run google-adk
python3.14 .github/scripts/examples.py run google-adk
python3.10 .github/scripts/examples.py run google-adk-minimums
python3.12 .github/scripts/examples.py run google-adk-litellm
```

ADK's default profiles keep the minimal Gemini installation; the Python 3.10
profile pins every direct dependency to its declared minimum. The separate
LiteLLM profile adds only the documented optional adapter. Each runs the provider
loader tests and both original configs through the built CLI and real SDKs against
loopback model fixtures. Model errors and wrong tool arguments must fail; the
positive cases retain the original state, artifact, tool, and native trace assertions.
The ADK HTTP fixtures and CLI harness live in `scripts/tests/google_adk/`, outside
the downloadable example. These tests do not measure hosted-model quality.

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
test directories/patterns, and any Node, Docker, or optional package requirements.
Keep example configs simple; put substantial test harnesses under `scripts/tests/`
and use local model fixtures, not paid API calls. Each profile
gets a fresh environment; do not combine unrelated SDK requirements. Add selection
coverage in `scripts/test_examples.py`, then run:

```bash
python3.14 -m unittest discover -s .github/scripts -p 'test_examples.py' -v
```

The NUL-delimited merge-base selector follows the approach in PR #11173. That PR's
broader manifest-installation checks are separate from these behavior tests; an
installation pass does not demonstrate that an example runs correctly. As other
example PRs land, register their tests here instead of adding another workflow.

## LangGraph

Run the Python-only graph and provider tests without a Node build or model credentials:

```bash
python3.10 .github/scripts/examples.py run langgraph
python3.14 .github/scripts/examples.py run langgraph
```

The three tests execute the real graph with deterministic model responses and cover
structured summaries, Responses content blocks, and provider errors. They do not
exercise the Promptfoo CLI or shared Python wrapper.

## OpenAI Agents

After building the local CLI, run the SDK example profiles:

```bash
python3.12 .github/scripts/examples.py run openai-agents
python3.14 .github/scripts/examples.py run openai-agents
python3.10 .github/scripts/examples.py run openai-agents-minimums
python3.12 .github/scripts/examples.py run openai-agents-otel
```

Default profiles install only the example's SDK requirement. The minimum profile
pins the declared SDK floor and its OpenAI 3.0 lower bound. The optional profile
independently pins the SDK and all three documented OpenTelemetry 1.44 floors.
Constructor/session tests run in a separate process from the helper tests, which
stub SDK modules. The larger CLI harness lives in `scripts/tests/openai_agents`.

The real SDK calls a loopback Responses fixture, then runs the actual tools,
handoffs, SQLite conversation history, Unix-local workspace, and allowlisted skill
commands. All six original cases and 65 assertions run unchanged, including the
goal-success judge (also routed locally). HTTP errors, failed/incomplete responses,
SDK refusals, and wrong tool arguments must fail. SDK JSON spans and optional
wrapper protobuf spans are forwarded to the real Promptfoo OTLP receiver.

These checks prove runtime contracts, not hosted-model quality or an OS security
boundary. The Unix-local workflow executes commands on the test host. The harness
uses synthetic files, an allowlisted environment, dummy credentials, local model
and trace endpoints, an isolated copy/database, and bounded child process groups.

## F-Score

Run the offline dataset preparation and local metadata path regressions without a
Node build or model credentials:

```bash
python3.10 .github/scripts/examples.py run f-score
python3.14 .github/scripts/examples.py run f-score
```

Both runtimes install the example requirements, check dependency consistency, and
run the two existing Python tests. The three TypeScript metric regressions in
`test/examples/evalFScore.test.ts` remain part of the normal repository test suite;
they are not run by this Python-only profile.

## Redteam LangChain

The `redteam-langchain` profile runs the example's five provider unit tests on
Python 3.10 and 3.14. It installs the declared requirements in a fresh environment
and checks output parsing, token usage, and error handling with a stubbed chat
model. These tests do not exercise the Node wrapper or hosted-model quality, so
this profile does not require a Node build or model credentials.

```bash
python3.10 .github/scripts/examples.py run redteam-langchain
python3.14 .github/scripts/examples.py run redteam-langchain
```

## Specialized Browser Workflow

`workflows/browser-example-python.yml` retains the Gradio browser example's Python
3.10/3.14 component tests and Python 3.12 end-to-end browser job. That job provisions
Chromium and its operating-system libraries, starts the Gradio server, and runs both
original configurations through the local CLI. The shared runner's Node option
builds the CLI but does not provision browser binaries or system libraries; keeping
this workflow separate preserves the actual browser coverage without expanding
the shared runner's infrastructure API. Shared runtime/toolchain changes select
the specialized workflow as well as the aggregate example matrix.

## RAG PDF

The `rag-pdf` profile runs all PDF, timeout, environment-isolation and tokenizer-cache
regressions on Python 3.10. The `rag-pdf-cli` profile repeats those tests on Python
3.14, then invokes the existing source CLI smoke through unittest discovery. It
persists two document batches in real Chroma, reopens the database, and checks all
nine original evaluation cases against local embedding and chat APIs.

```bash
python3.10 .github/scripts/examples.py run rag-pdf
python3.14 .github/scripts/examples.py run rag-pdf-cli
```

The CLI profile requires the normal local CLI build before the shared runner starts.
The smoke itself continues to use `npm run local`, with bounded process cleanup and
isolated environment/cache preparation. It can also be run directly with
`python examples/eval-rag-full/tests/smoke_cli.py`. These profiles replace the
standalone RAG workflow without changing its Python runtime split or assertions.

## E2B

The `e2b` profile runs the offline SDK tests on Python 3.10 and 3.14 with
`e2b-code-interpreter` 2.10.0. It checks SDK call signatures, sandbox settings,
error handling and cleanup using mocked SDK calls; it creates no cloud sandbox.

```bash
python3.10 .github/scripts/examples.py run e2b
python3.14 .github/scripts/examples.py run e2b
```
