---
name: promptfoo-provider-setup
description: >
  Configure promptfoo providers or redteam targets for hosted models, live HTTP
  APIs, Python/JavaScript local scripts, agent SDKs, or multi-input systems. Use
  when connecting promptfoo to the system under test, mapping vars, auth env
  vars, request bodies, response transforms, or static-code-derived provider
  wrappers. Do not use for choosing eval assertions or red team plugins unless a
  smoke test is needed to verify the connection.
---

# Promptfoo Provider Setup

Connect Promptfoo to the system under test with the smallest reliable provider
or target configuration. Prefer a working smoke test over a clever abstraction.

Read `references/provider-patterns.md` when you need concrete YAML or provider
wrapper examples.
For OpenAPI specs, you can run
`scripts/openapi-operation-to-config.mjs` to draft a one-operation HTTP smoke
config, then inspect and edit the result before probing. With `--token-env`, it
infers Bearer/OAuth2/OpenID and header/query/cookie API-key auth; use
`--auth-header`/`--auth-prefix` to override.

## Inputs

Infer from the repo or user prompt when possible:

- Target surface: hosted model, live HTTP endpoint, local function/script, agent
  harness, MCP/tool agent, or redteam target.
- Invocation shape: method, URL/path, headers, request body, input vars, auth,
  streaming/statefulness, and expected response field.
- Safety boundary: whether it is okay to call the live endpoint and which sample
  payload is safe.
- Output goal: eval provider block, redteam `targets` block, local provider
  wrapper, or a minimal smoke-test suite.

If the contract is unclear, create a conservative TODO-marked starter and state
exactly what must be verified before using it against production.

## Workflow

### 1. Pick discovery mode

Use one of these modes, or combine them:

- **Live HTTP endpoint**: probe an already-running endpoint with safe requests.
- **Static code discovery**: inspect route handlers, OpenAPI specs, tests, SDK
  clients, or existing fetch/axios calls.
- **Hybrid**: compare static contract assumptions with a live probe.
- **Wrapper mode**: write `provider.js` or `provider.py` when built-in providers
  cannot express auth, signing, streaming, multi-step calls, or custom parsing.

Do not send secrets to unknown endpoints. Use `{{env.VAR}}` placeholders in
configs and local environment variables only in shell commands.

### 2. Discover the contract

For live HTTP endpoints:

1. Start with non-mutating checks: docs URL, OpenAPI URL, health endpoint,
   `OPTIONS`, or a safe `GET`.
2. Make at most one safe representative call before writing config.
3. Capture the response shape and status/error behavior.
4. Prefer explicit JSON paths in `transformResponse`, such as `json.output`.
5. Use `queryParams` for query-string fields on any HTTP method, and use the
   `text` variable in `transformResponse` for plain-text responses.
6. Set `stateful: false` for stateless endpoints; otherwise `validate target`
   will run a session-memory check. For stateful apps, include `{{sessionId}}`
   in the request or configure server-side session parsing.

For static code discovery:

1. Search for route definitions, tests, and clients with `rg`.
2. Identify method, path, required headers, request schema, response schema, and
   authentication source.
3. If the app constructs prompts dynamically, wrap the real code instead of
   duplicating business logic in YAML.
4. For agents/tools, identify whether Promptfoo should send one string input or
   a structured object with named fields.

### 3. Choose the provider pattern

- Use `id: https` for straightforward JSON HTTP APIs.
- Use `file://provider.js` or `file://provider.py` for custom auth, request
  signing, streaming, retries, multi-step setup, local code, Python agent SDKs,
  or complex parsing.
- Use native model providers for direct model comparisons.
- Use `targets` with `inputs` for redteam multi-input systems. Do not invent a
  single `prompt` field when the real app accepts named inputs.

### 4. Implement the minimal smoke test

Add or update a config with:

- `# yaml-language-server: $schema=https://promptfoo.dev/config-schema.json`
- A short `description`
- Provider or `targets` config with `{{env.VAR}}` for secrets
- One or two smoke tests that verify the request reaches the target and the
  response transform extracts the right field
- `--no-cache` run commands

When writing a local wrapper, return `{ output }` and include structured errors
when the target response is malformed. JavaScript providers receive config in
constructor `options.config` and expose `callApi(prompt, context)`; read named
inputs from `context.vars`. Python providers use `file://provider.py` or
`file://provider.py:function_name`; the function takes `(prompt, options,
context)` and reads named inputs from `context.get("vars", {})`. Set
`config.workers: 1` for non-thread-safe SDKs, `config.timeout` for slow calls,
and `config.pythonExecutable`/`PROMPTFOO_PYTHON` for venvs. Add harmless
defaults because `validate target` may call providers without test-case vars.

### 5. Validate and run

From the promptfoo repo, use the local build:

```bash
npm run local -- validate config -c path/to/promptfooconfig.yaml
npm run local -- validate target -c path/to/promptfooconfig.yaml
npm run local -- eval -c path/to/promptfooconfig.yaml -o output.json --no-cache --no-share
```

Outside the promptfoo repo, use:

```bash
npx promptfoo@latest validate config -c path/to/promptfooconfig.yaml
npx promptfoo@latest validate target -c path/to/promptfooconfig.yaml
npx promptfoo@latest eval -c path/to/promptfooconfig.yaml -o output.json --no-cache --no-share
```

Inspect the output file for `results.stats`, `response.output`, `score`, and
`error`; do not rely only on the process exit code.

Use `--no-share` by default while probing live or internal systems. Remove it
only when the user explicitly wants a cloud share URL.

## Common Mistakes

```yaml
# WRONG: shell-style env vars are literal strings in YAML
apiKey: $API_KEY

# CORRECT: promptfoo renders Nunjucks env references
apiKey: '{{env.API_KEY}}'
```

```yaml
# WRONG: flattening a multi-input target into prompt loses attack surface
body:
  prompt: '{{prompt}}'

# BETTER: preserve the real app fields
body:
  user_id: '{{user_id}}'
  message: '{{message}}'
```

## Output Contract

When done, state:

- Connection mode used: live, static, hybrid, or wrapper
- Files created or modified
- Required environment variables
- Safe smoke command with `--no-cache --no-share`
- What was actually verified, and what remains a TODO
