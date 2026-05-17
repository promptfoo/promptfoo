# Provider Setup Patterns

Use these as starting points; keep secrets in env vars.

## Live HTTP JSON endpoint

```yaml
# yaml-language-server: $schema=https://promptfoo.dev/config-schema.json
description: HTTP endpoint smoke test

prompts:
  - '{{message}}'

providers:
  - id: https
    label: live-chat-api
    config:
      url: '{{env.CHAT_API_URL}}'
      method: POST
      stateful: false
      headers:
        Content-Type: application/json
        Authorization: 'Bearer {{env.CHAT_API_TOKEN}}'
      body:
        message: '{{prompt}}'
      transformResponse: json.output

tests:
  - description: endpoint returns text
    vars:
      message: Say exactly PONG.
    assert:
      - type: contains
        value: PONG
```

Smoke with `promptfoo eval -c promptfooconfig.yaml -o output.json --no-cache
--no-share`. Use `stateful: false` for stateless targets. If the app maintains
conversation state, omit it and map `{{sessionId}}` into the request or configure
`sessionParser`.

## Live HTTP GET endpoint

Use `queryParams` instead of hand-building query strings when the target accepts GET parameters.

```yaml
providers:
  - id: https
    label: search-api
    config:
      url: '{{env.SEARCH_API_URL}}'
      method: GET
      stateful: false
      headers:
        Authorization: 'Bearer {{env.SEARCH_API_TOKEN}}'
      queryParams:
        q: '{{prompt}}'
        user_id: '{{user_id}}'
      transformResponse: json.answer
```

## OpenAI-compatible chat endpoint

Use an HTTP provider when the endpoint is OpenAI-shaped but not one of Promptfoo's native providers.

```yaml
providers:
  - id: https
    label: openai-compatible-chat
    config:
      url: '{{env.CHAT_COMPLETIONS_URL}}'
      method: POST
      stateful: false
      headers:
        Content-Type: application/json
        Authorization: 'Bearer {{env.CHAT_COMPLETIONS_TOKEN}}'
      body:
        model: '{{env.CHAT_COMPLETIONS_MODEL}}'
        messages:
          - role: system
            content: Return concise answers.
          - role: user
            content: '{{prompt}}'
      transformResponse: json.choices[0].message.content
```

## Text response endpoint

Use `text` in `transformResponse` when the target returns plain text.

```yaml
providers:
  - id: https
    label: text-chat-api
    config:
      url: '{{env.TEXT_CHAT_API_URL}}'
      method: POST
      stateful: false
      headers:
        Content-Type: text/plain
      body: '{{prompt}}'
      transformResponse: text.replace(/^Assistant:\s*/, '')
```

## OpenAPI operation to HTTP provider

Map one operation at a time: base URL to an env var, path parameters into the URL with `urlencode`, request/header/query fields into `body`/`headers`/`queryParams`, and the first successful response schema into `transformResponse` (prefer `200`, otherwise the lowest explicit `2xx` status).

The bundled `scripts/openapi-operation-to-config.mjs` helper supports local OpenAPI `$ref`s plus `allOf` and first-variant `oneOf`/`anyOf` schemas. It lets operation parameters override path parameters, URL-encodes path/form values, skips readOnly request and writeOnly response fields even through `$ref`/composed schemas, keeps wire names intact, creates safe vars, preserves headers, and maps prompt fields (`message`, `question`, `input`, `text`, `q`, `query`) to `{{prompt}}`. With `--token-env`, it infers Bearer/OAuth2/OpenID/header/query/cookie API-key auth, uses parameter/media examples (including example-only bodies), +json media, text request bodies, form-url-encoded request bodies, structured multipart request bodies with generated file parts, typed/format schema samples from const/defaults/enums, root JSON array request bodies, schema/example-derived response transforms, health/status `message` vars, and `--auth-header X-API-Key --auth-prefix none`.

```yaml
providers:
  - id: https
    config:
      url: '{{env.INVOICE_API_BASE_URL}}/v1/invoices/{{invoice_id}}/chat'
      method: POST
      headers:
        Authorization: 'Bearer {{env.INVOICE_API_TOKEN}}'
      body: { user_id: '{{user_id}}', message: '{{prompt}}' }
      transformResponse: json.output
```

## Static-code-derived local wrappers

Use this for direct local code or custom setup. Pick JavaScript for Node apps and Python for Python app modules.

```yaml
# yaml-language-server: $schema=https://promptfoo.dev/config-schema.json
description: Local agent provider smoke test
prompts:
  - '{{message}}'
providers:
  - id: file://provider.py:call_api # use file://provider.js for Node wrappers
    config:
      workers: 1
      timeout: 30000
tests:
  - description: local provider returns text
    vars:
      message: Say exactly PONG.
    assert:
      - type: contains
        value: PONG
```

```javascript
export default class LocalAgentProvider {
  constructor(options = {}) {
    this.config = options.config || {};
  }

  id() {
    return 'local-agent';
  }

  async callApi(prompt, context = {}) {
    const vars = context.vars || {};
    const result = await callAgent({
      message: prompt,
      userId: vars.user_id || this.config.defaultUserId || 'validate-user',
    });

    return typeof result?.output === 'string'
      ? { output: result.output }
      : { error: 'Agent returned no string output' };
  }
}
```

```python
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
from app.invoice_agent import call_agent  # noqa: E402
def call_api(prompt: str, options: dict, context: dict) -> dict:
    config = options.get("config", {}) if isinstance(options, dict) else {}
    vars = context.get("vars", {}) if isinstance(context, dict) else {}
    user_id = vars.get("user_id") or config.get("defaultUserId") or "validate-user"
    result = call_agent(message=prompt, user_id=user_id)
    if not isinstance(result.get("output"), str):
        return {"error": "Agent returned no string output"}
    return {"output": result["output"]}
```

Python providers implement `call_api(prompt, options, context)` unless the id
uses a custom `file://provider.py:function_name` suffix. Anchor `sys.path` to
the provider directory before nearby app imports. Use `PROMPTFOO_PYTHON` or
`config.pythonExecutable` for a venv, `PROMPTFOO_PYTHON_WORKERS` or
`config.workers` for concurrency, and `config.timeout` for slow SDK calls.
`validate target` may call providers without vars, so wrappers need harmless defaults.

## Redteam target with named inputs

Use `targets` and preserve the app's real input fields. This gives redteam
plugins access to the actual authorization and injection surface.

```yaml
# yaml-language-server: $schema=https://promptfoo.dev/config-schema.json
description: Multi-input redteam target

targets:
  - id: https
    label: invoice-agent
    config:
      url: '{{env.INVOICE_AGENT_URL}}'
      method: POST
      stateful: false
      headers:
        Content-Type: application/json
        Authorization: 'Bearer {{env.INVOICE_AGENT_TOKEN}}'
      body:
        vendor_id: '{{vendor_id}}'
        invoice_id: '{{invoice_id}}'
        message: '{{message}}'
      transformResponse: json.output
    inputs:
      vendor_id: Vendor identifier for the signed-in user.
      invoice_id: Invoice identifier being discussed.
      message: User message to the assistant.

redteam:
  purpose: >-
    Invoice support assistant that answers invoice questions only for the
    authenticated vendor and must not reveal or modify other vendors' invoices.
  numTests: 3
  plugins:
    - bola
    - rbac
    - indirect-prompt-injection
  strategies:
    - basic
```

Do not set `redteam.injectVar` for multi-input mode. Define `inputs` on the
target; Promptfoo automatically creates the internal combined `__prompt` value
for generation and grading.

## Hybrid discovery notes

Use this when static code and a live endpoint are both available. Record the contract before writing YAML:

- Static source: route/handler/client file and line range.
- Expected request: method, path, headers, body/query fields, and auth env var.
- Safe live probe: exact non-mutating payload and observed response field.
- Promptfoo mapping: vars to request fields and `transformResponse`.
- Open questions: mutations, session behavior, rate limits, or missing auth.

Prefer a local wrapper when the static path exposes app logic directly; prefer
`id: https` when the live endpoint contract is simple and safely probeable.

## Static discovery checklist

```bash
rg -n "app\\.(get|post|put|patch)|router\\.(get|post|put|patch)|fetch\\(|axios\\." .
rg -n "openapi|swagger|routes|controller|handler|chat|completion|agent" .
rg -n "Authorization|Bearer|apiKey|x-api-key|transformResponse|callApi" .
```
