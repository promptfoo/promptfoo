# Semgrep Security Triage

This document tracks the triage status of semgrep findings and provides guidance for addressing them.

## Running Semgrep

```bash
# Recommended: Use the scan script
./scripts/semgrep-scan.sh           # Full scan (security + best-practices)
./scripts/semgrep-scan.sh --quick   # Security only (faster)
./scripts/semgrep-scan.sh --ci      # CI mode (exit 1 on errors)
./scripts/semgrep-scan.sh --sarif   # SARIF output for GitHub Security tab

# Or run directly
semgrep scan --config auto          # Security rules
semgrep scan --config auto --error  # Fail on findings (for CI)
```

## Recommended Rulesets

| Ruleset                | Purpose                                                              | When to Use                                           |
| ---------------------- | -------------------------------------------------------------------- | ----------------------------------------------------- |
| `auto`                 | Curated security rules (includes typescript, react, nodejs, express) | Always - primary security scan                        |
| `p/r2c-best-practices` | Code quality and correctness                                         | Run on `src/` only (examples have intentional issues) |
| `p/github-actions`     | CI/CD security                                                       | Already included in `auto`                            |

### Evaluated but Excluded

| Ruleset          | Reason for Exclusion                                                  |
| ---------------- | --------------------------------------------------------------------- |
| `p/gitleaks`     | Too many false positives (placeholder text, public API keys)          |
| `p/trailofbits`  | False positives on intentional security test payloads in redteam code |
| `p/secrets`      | Redundant with `auto` config                                          |
| `p/supply-chain` | No findings for this codebase                                         |

## Current Status

Last triage: 2026-01-02

| Severity | Count | Status                                  |
| -------- | ----- | --------------------------------------- |
| ERROR    | 1     | 1 true positive (low risk)              |
| WARNING  | ~160  | Mostly false positives (path traversal) |
| INFO     | ~20   | Informational, no action needed         |

---

## ERROR Findings

### 1. GitHub Actions Shell Injection (TRUE POSITIVE - Low Risk)

**File:** `.github/workflows/docker.yml:279`
**Rule:** `yaml.github-actions.security.run-shell-injection.run-shell-injection`
**CWE:** CWE-78 (OS Command Injection)

**Finding:**

```yaml
- name: Inspect image
  run: |
    docker buildx imagetools inspect "${{ env.REGISTRY }}/${{ env.IMAGE_NAME }}:${{ inputs.tag_name || steps.meta.outputs.version }}"
```

**Analysis:**

- `inputs.tag_name` is interpolated directly in a `run:` block
- Could theoretically allow shell injection if malicious input provided

**Risk Assessment: LOW**

- `inputs.tag_name` comes from trusted sources only:
  - `workflow_call` from release-please (generates semantic versions)
  - `workflow_dispatch` by repository maintainers
- Not exposed to external/untrusted input (PR titles, commit messages, etc.)
- Fallback is `steps.meta.outputs.version` from docker/metadata-action

**Recommended Fix:**

```yaml
- name: Inspect image
  env:
    TAG_NAME: ${{ inputs.tag_name || steps.meta.outputs.version }}
  run: |
    docker buildx imagetools inspect "${{ env.REGISTRY }}/${{ env.IMAGE_NAME }}:$TAG_NAME"
```

**Status:** Open - Schedule for next workflow maintenance

---

## Suppressed Findings (False Positives)

### Algolia Public API Key

**File:** `site/docusaurus.config.ts:439`
**Suppression:** `// nosemgrep: generic.secrets.security.detected-generic-api-key`

Algolia search API keys are intentionally public. They only allow search queries,
not write operations. This is standard practice for documentation sites.

### WebSocket URL in Error Message

**File:** `src/app/src/pages/redteam/setup/components/Targets/ProviderConfigEditor.tsx:127`
**Suppression:** `// nosemgrep: javascript.lang.security.detect-insecure-websocket`

The string `ws://` appears in a user-facing error message explaining valid URL formats.
This is not an actual insecure WebSocket connection.

### WebSocket Protocol Conversion for Local Dev

**File:** `src/providers/openai/realtime.ts:159`
**Suppression:** `// nosemgrep: javascript.lang.security.detect-insecure-websocket`

This code converts `http://` to `ws://` for local development environments.
Production always uses `https://` → `wss://`. This is intentional for dev ergonomics.

---

## WARNING Categories

### Path Traversal (~134 findings)

**Rules:** `path-join-resolve-traversal`, `express-path-join-resolve-traversal`

**Analysis:**
These trigger on any `path.join()` or `path.resolve()` usage. In this codebase:

1. **Config file loading** - Paths come from YAML configs, not direct user input
2. **CLI file operations** - The CLI inherently needs filesystem access
3. **Server routes** - Some warrant review (see below)

**Files requiring review:**

- `src/server/routes/modelAudit.ts` - Expands `~` paths, validate input
- `src/server/routes/blobs.ts` - Serves blob data, ensure proper validation
- `src/storage/localFileSystemProvider.ts` - Storage abstraction, trusted paths

**Recommendation:** Review server routes individually; most CLI/config paths are acceptable.

### Non-literal RegExp (~12 findings)

**Rule:** `detect-non-literal-regexp`

**Analysis:**
Dynamic regex construction from:

- Language codes (controlled list)
- Config patterns (trusted input)
- User-defined test patterns (sandboxed)

**Recommendation:** Low risk; the patterns come from controlled sources.

### Direct Response Write (~3 findings)

**Rule:** `direct-response-write`

**Analysis:**
Express routes using `res.send()` with data. In context:

- `blobs.ts` - Binary blob data (not HTML)
- `eval.ts` - CSV export (not HTML)
- `media.ts` - Media files (not HTML)

**Recommendation:** Not XSS vectors since responses are not HTML. Consider adding
explicit `Content-Type` headers if not already present.

---

## Best Practices Findings (p/r2c-best-practices)

Run on `src/` only to avoid example code noise.

### javascript-alert, javascript-confirm, javascript-prompt

**Files:** `UpdateBanner.tsx`, `RunTestSuiteButton.tsx`, `config.ts`, `delete.ts`, `EvalOutputCell.tsx`

**Analysis:** These are intentional user interactions:

- `alert()` for update notifications
- `confirm()` for destructive action confirmation
- `prompt()` for user input in CLI

**Recommendation:** Acceptable use cases. Consider migrating to custom modal components
for better UX, but not a security issue.

### useless-assignment

**Files:** `scroll-timeline.js` (polyfill)

**Analysis:** This is a third-party polyfill with its own coding patterns.

**Recommendation:** Ignore - vendor code.

### arbitrary-sleep

**File:** `persistent_wrapper.py:435`

**Analysis:** Intentional delay for Python process management.

**Recommendation:** Review if timing is still appropriate.

---

## Ignored Paths (via .semgrepignore)

The following paths are excluded from scanning:

| Path                                             | Reason                            |
| ------------------------------------------------ | --------------------------------- |
| `examples/redteam-api-top-10/`                   | Intentionally vulnerable demo app |
| `examples/http-provider-auth-signature*/`        | Demo private keys                 |
| `examples/e2b-code-eval/`                        | Intentional shell execution       |
| `examples/agentic-sdk-comparison/test-codebase/` | Intentionally insecure test code  |
| `site/docs/`, `*.md`                             | Documentation code samples        |
| `scripts/`                                       | Internal tooling, not user-facing |
| `test/`, `*_test.*`                              | Test files                        |
| `node_modules/`, `dist/`                         | Dependencies and build output     |

---

## Adding New Suppressions

### Inline Suppression

```typescript
// nosemgrep: rule-id-here
const code = riskyButSafe();
```

### Path Exclusion

Add to `.semgrepignore`:

```
# Reason for exclusion
path/to/exclude/
```

### Rule Exclusion (not recommended)

Use sparingly via command line:

```bash
semgrep scan --config auto --exclude-rule rule-id
```

---

## CI Integration

For CI pipelines, consider:

```yaml
- name: Semgrep Security Scan
  run: |
    semgrep scan --config auto --error --json -o semgrep.json
  continue-on-error: true

- name: Upload Semgrep Results
  uses: github/codeql-action/upload-sarif@v2
  with:
    sarif_file: semgrep.sarif
```

Note: Use `--sarif` output for GitHub Security tab integration.
