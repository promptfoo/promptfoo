---
name: promptfoo-redteam-setup
description: >
  Create or refine promptfoo redteam setup configs: purpose, targets, plugins,
  strategies, frameworks, multi-input target inputs, policy text, grader
  guidance, contexts, and static-code-derived target/threat mapping. Use when
  preparing a red team scan plan from live probes, code evidence, or provider
  configs, or when generating adversarial test cases for QA. Do not use for
  basic provider wiring alone or for running/evaluating an already-generated
  redteam scan.
---

# Promptfoo Redteam Setup

Build a small, explicit redteam config that matches the real app threat model.
Start with a narrow scan that can be generated and inspected, then expand.

Read `references/redteam-setup-patterns.md` when you need concrete YAML
patterns.
For OpenAPI specs, you can run
`scripts/openapi-operation-to-redteam-config.mjs` to draft a one-operation
redteam setup config, then inspect the inferred inputs, policy, and plugins.
With `--token-env`, it infers Bearer/OAuth2/OpenID and header/query/cookie API-key auth; use
`--auth-header`/`--auth-prefix` to override.
For live connectivity QA, add `--smoke-test true` to include one deterministic
`tests` row that can be run with `npm run local -- eval -c ... --no-cache`
before redteam generation.

## Inputs

Infer these from the repo, docs, or user prompt:

- Target shape: HTTP/API, model provider, custom provider, agent, RAG, MCP/tool
  system, or multi-input app.
- Purpose: who uses the system, what it may access or do, and what it must
  refuse or protect.
- Trust boundaries: identities, object IDs, documents, tools, secrets,
  permissions, and external content.
- Discovery evidence: live probe trace, route/controller files, OpenAPI specs,
  existing tests, SDK clients, or provider wrappers.
- First-pass scope: risk categories the user cares about most.

If target wiring is missing, use `promptfoo-provider-setup` first or create a
TODO-marked target block and validate it before generation.

## Workflow

### 1. Derive target facts from live or static evidence

- For live endpoints, use only safe probes and keep the request/response trace
  that proves method, path, auth, body/query fields, and response path.
- For static code, search route handlers, API clients, tests, and auth/object
  checks with `rg`; capture file paths and line numbers for the setup notes.
- Preserve identity, tenant, role, object, document, and tool/action fields as
  target `inputs`; these are the attack surface for authorization plugins.
- Convert evidence into risks: object IDs imply `bola`, role/permission checks
  imply `rbac`/`bfla`, free-form instructions imply prompt-boundary plugins,
  tool URLs or shell/database calls imply SSRF/injection/tool plugins.
- Use a JavaScript or Python local wrapper when static code is easier and safer
  to exercise than the deployed endpoint; otherwise map the live HTTP contract
  directly.

### 2. Write the target and purpose

- Prefer `targets` for redteam configs.
- Add stable `label`; reports and generated files use it for continuity.
- For single-input targets, include a prompt template or set `redteam.injectVar`
  so generation lands in the variable the target actually uses.
- For multi-input targets, define `inputs` on the target. Do not set
  `redteam.injectVar` or invent a synthetic `prompt` field.
- Write `redteam.purpose` as security-relevant behavior: allowed users/actions,
  forbidden data/actions, and domain-specific constraints.

### 3. Choose a small plugin set

Avoid `plugins: default` for an initial scan unless the user explicitly wants a
broad run.

Pick 2-5 plugins from the app's real risks:

- Policy/business rules: `policy`
- Authorization and object access: `bola`, `bfla`, `rbac`
- Prompt boundaries: `hijacking`, `prompt-extraction`, `system-prompt-override`
- RAG/document workflows: `indirect-prompt-injection`,
  `rag-document-exfiltration`, `rag-poisoning`, `rag-source-attribution`
- Tool/agent systems: `excessive-agency`, `tool-discovery`, `debug-access`,
  `shell-injection`, `sql-injection`, `ssrf`
- Privacy: `pii:direct`, `pii:session`, `pii:social`
- Domain packs: use finance, medical, insurance, ecommerce, real estate,
  telecom, teen-safety, or pharmacy plugins only when that domain is real.

For `policy`, include inline policy text unless the user intentionally references
a resolved Promptfoo Cloud policy object.

### 4. Choose strategies conservatively

- Use `basic` for the first setup/generation pass.
- Add `jailbreak:composite` or `jailbreak:meta` after the first generated cases
  look sane.
- Add multi-turn strategies only when the target is stateful and sessions are
  configured.

### 5. Configure generation and grading

- Use Promptfoo's default redteam generation unless a specific generator or
  model is needed for reproducibility, cost, or fixture QA.
- When using `redteam.provider: file://...`, make the path valid from the
  command working directory; JavaScript providers expose `callApi`, while Python
  providers expose `call_api` or the function named in a `file://x.py:name`
  suffix. Run commands from the repo root unless the project convention says
  otherwise.
- For deterministic QA, use a small local file provider that returns Promptfoo's
  expected prompt format.
- Use high-value plugins such as `bola` and `bfla` whenever target evidence
  shows object IDs, ownership checks, or authorization boundaries.
- Use `redteam.maxConcurrency: 1` for fragile local providers or rate-limited
  targets.
- Add plugin-level `graderGuidance` and `graderExamples` only when default
  grading would misunderstand domain-specific allowed behavior.

### 6. Validate and generate

From the promptfoo repo:

```bash
npm run local -- validate config -c path/to/promptfooconfig.yaml
npm run local -- validate target -c path/to/promptfooconfig.yaml
npm run local -- redteam generate -c path/to/promptfooconfig.yaml -o /tmp/redteam.yaml --no-cache --force --no-progress-bar --strict
```

Use a non-precreated output path or keep `--force`; `redteam generate` reads an
existing output file to compare metadata and an empty temp file can fail before
generation. Inspect generated YAML for `tests`, `assert`,
per-test `metadata.pluginId`, `defaultTest.metadata.purpose`, and preserved
multi-input vars. Do not proceed to `redteam run` until generated cases are
plausible.

If the target uses config-relative `file://./target.js` or `file://./target.py`,
write generated YAML next to the source config or switch the target to a stable
absolute/repo-root path before validating; `/tmp/redteam.yaml` makes relative
file targets resolve under `/tmp`.

## Common Mistakes

```yaml
# WRONG: too broad for a first pass
redteam:
  plugins:
    - default

# BETTER: risk-led starter
redteam:
  plugins:
    - id: policy
      config:
        policy: The assistant must not disclose another user's records.
    - bola
    - rbac
```

```yaml
# WRONG: multi-input mode configured under redteam
redteam:
  injectVar: message

# BETTER: define real input variables on the target
targets:
  - id: https
    inputs:
      user_id: Signed-in user identifier.
      record_id: Record being requested.
      message: User message.
```

## Output Contract

When done, state:

- Target mode and whether `promptfoo-provider-setup` was needed
- Purpose summary and selected plugin/strategy rationale
- Files created or changed
- Validation/generation commands run and generated test count
- Risks intentionally deferred to a later scan
