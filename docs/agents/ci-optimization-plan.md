# CI Optimization Plan

## Executive Summary

This document outlines a plan to optimize the GitHub Actions CI pipeline by intelligently skipping jobs when changes don't affect their scope. The goal is to reduce CI time and costs for documentation-only, frontend-only, and other scoped changes while maintaining safety by defaulting to running all jobs when in doubt.

## Current State Analysis

### Workflows Overview

| Workflow                | Trigger            | Path Filtering        | Jobs     |
| ----------------------- | ------------------ | --------------------- | -------- |
| `main.yml`              | PRs, push to main  | ❌ None               | 15+ jobs |
| `docker.yml`            | Dockerfile changes | ✅ `Dockerfile`       | 3 jobs   |
| `deploy-launcher.yml`   | Frontend changes   | ✅ `src/app/**`       | 1 job    |
| `image-actions.yml`     | Image file changes | ✅ `**.jpg`, etc.     | 1 job    |
| `validate-pr-title.yml` | All PRs            | ❌ None (intentional) | 1 job    |
| `release-please.yml`    | Push to main       | N/A (release only)    | 4 jobs   |

### Main CI Jobs Analysis (`main.yml`)

| Job                 | What it Tests       | Applicable Paths                       | Run Time | Matrix Size       |
| ------------------- | ------------------- | -------------------------------------- | -------- | ----------------- |
| `test`              | Backend unit tests  | `src/**`, `test/**`, `package*.json`   | ~10min   | 3 Node × 3 OS     |
| `build`             | TypeScript build    | `src/**`, `package*.json`, `tsconfig*` | ~5min    | 3 Node            |
| `style-check`       | Linting, formatting | `src/**`, `test/**`, `*.json`          | ~5min    | 1                 |
| `shell-format`      | Shell scripts       | `**/*.sh`                              | ~5min    | 1                 |
| `assets`            | JSON schema         | `src/**`, `scripts/**`                 | ~5min    | 1                 |
| `python`            | Python code         | `src/python/**`                        | ~5min    | 2 Python versions |
| `docs`              | Documentation site  | `site/**`                              | ~5min    | 1                 |
| `webui`             | Frontend tests      | `src/app/**`                           | ~5min    | 1                 |
| `integration-tests` | Integration tests   | `src/**`, `test/**`                    | ~5min    | 1                 |
| `share-test`        | Share functionality | `src/**`                               | ~5min    | 1                 |
| `redteam`           | Red team tests      | `src/redteam/**`, `test/redteam/**`    | ~5min    | 1                 |
| `redteam-staging`   | Red team staging    | `src/redteam/**`                       | ~5min    | 1                 |
| `actionlint`        | GH Actions lint     | `.github/workflows/**`                 | ~5min    | 1                 |
| `ruby`              | Ruby code           | `src/ruby/**`                          | ~5min    | 2 Ruby versions   |
| `golang`            | Go code             | `src/golang/**`                        | ~5min    | 1                 |

### Cost Estimation

Current main CI runs **all 15+ jobs** on every PR, regardless of changes:

- Documentation-only PR: Runs ~45 job-minutes unnecessarily
- Frontend-only PR: Runs ~35 job-minutes unnecessarily
- Single file typo fix: Runs full suite unnecessarily

## Proposed Solution

### Strategy: Change Detection with Conditional Job Execution

Use the `dorny/paths-filter` action to detect what changed, then conditionally run jobs based on those changes. This is the safest approach because:

1. Detection job runs first and outputs flags for each category
2. Jobs check flags via `if:` conditions
3. Unknown/complex changes default to running all jobs
4. Easy to audit and understand

### Change Categories

```yaml
# Proposed change detection categories
docs:        site/**
frontend:    src/app/**
backend:     src/**  (excluding src/app/, src/python/, src/ruby/, src/golang/)
python:      src/python/**
ruby:        src/ruby/**
golang:      src/golang/**
tests:       test/**
workflows:   .github/workflows/**
shell:       **/*.sh
config:      package*.json, tsconfig*, biome.json, .nvmrc
redteam:     src/redteam/**, test/redteam/**
examples:    examples/**
```

### Job Dependencies Matrix

| Job                 | Required Categories              | Skip if ONLY these change                                |
| ------------------- | -------------------------------- | -------------------------------------------------------- |
| `test`              | backend, tests, config           | docs, frontend-only, python-only, ruby-only, golang-only |
| `build`             | backend, frontend, config        | docs-only                                                |
| `style-check`       | backend, frontend, tests, config | docs-only, shell-only, workflows-only                    |
| `shell-format`      | shell                            | everything except shell                                  |
| `assets`            | backend, config                  | docs, frontend-only                                      |
| `python`            | python                           | everything except python                                 |
| `docs`              | docs                             | everything except docs                                   |
| `webui`             | frontend                         | everything except frontend                               |
| `integration-tests` | backend, tests                   | docs, frontend-only                                      |
| `share-test`        | backend                          | docs, frontend-only                                      |
| `redteam`           | redteam, backend                 | docs, frontend-only                                      |
| `redteam-staging`   | redteam, backend                 | docs, frontend-only                                      |
| `actionlint`        | workflows                        | everything except workflows                              |
| `ruby`              | ruby                             | everything except ruby                                   |
| `golang`            | golang                           | everything except golang                                 |

### Implementation Plan

#### Phase 1: Add Change Detection Job

Add a `detect-changes` job at the start of `main.yml`:

```yaml
jobs:
  detect-changes:
    name: Detect Changes
    runs-on: ubuntu-latest
    outputs:
      docs: ${{ steps.filter.outputs.docs }}
      frontend: ${{ steps.filter.outputs.frontend }}
      backend: ${{ steps.filter.outputs.backend }}
      python: ${{ steps.filter.outputs.python }}
      ruby: ${{ steps.filter.outputs.ruby }}
      golang: ${{ steps.filter.outputs.golang }}
      tests: ${{ steps.filter.outputs.tests }}
      workflows: ${{ steps.filter.outputs.workflows }}
      shell: ${{ steps.filter.outputs.shell }}
      config: ${{ steps.filter.outputs.config }}
      redteam: ${{ steps.filter.outputs.redteam }}
    steps:
      - uses: actions/checkout@v5
      - uses: dorny/paths-filter@v3
        id: filter
        with:
          filters: |
            docs:
              - 'site/**'
            frontend:
              - 'src/app/**'
            backend:
              - 'src/**'
              - '!src/app/**'
              - '!src/python/**'
              - '!src/ruby/**'
              - '!src/golang/**'
            python:
              - 'src/python/**'
            ruby:
              - 'src/ruby/**'
            golang:
              - 'src/golang/**'
            tests:
              - 'test/**'
            workflows:
              - '.github/workflows/**'
            shell:
              - '**/*.sh'
            config:
              - 'package*.json'
              - 'tsconfig*.json'
              - 'biome.json'
              - '.nvmrc'
            redteam:
              - 'src/redteam/**'
              - 'test/redteam/**'
```

#### Phase 2: Add Conditional Execution to Jobs

Each job adds `needs: detect-changes` and an `if:` condition:

```yaml
# Example: docs job only runs when site/ changes
docs:
  name: Build Docs
  needs: detect-changes
  if: needs.detect-changes.outputs.docs == 'true'
  # ... rest of job

# Example: test job skips if ONLY docs changed
test:
  name: Test
  needs: detect-changes
  if: |
    needs.detect-changes.outputs.backend == 'true' ||
    needs.detect-changes.outputs.tests == 'true' ||
    needs.detect-changes.outputs.config == 'true' ||
    needs.detect-changes.outputs.frontend == 'true'
  # ... rest of job

# Example: python job only runs when python code changes
python:
  name: Check Python
  needs: detect-changes
  if: needs.detect-changes.outputs.python == 'true'
  # ... rest of job
```

#### Phase 3: Handle Edge Cases

**Always run on push to main:**

```yaml
if: |
  github.event_name == 'push' ||
  needs.detect-changes.outputs.backend == 'true' ||
  ...
```

**Always run on workflow_dispatch:**

```yaml
if: |
  github.event_name == 'workflow_dispatch' ||
  needs.detect-changes.outputs.backend == 'true' ||
  ...
```

**Default to running when detection fails:**
The `dorny/paths-filter` action handles this gracefully - if detection fails, outputs are empty strings which won't match `'true'`, so we add a fallback:

```yaml
if: |
  needs.detect-changes.result == 'failure' ||
  needs.detect-changes.outputs.backend == 'true' ||
  ...
```

### Specific Job Conditions

```yaml
# test: Backend tests - skip only for pure docs/python/ruby/golang changes
test:
  if: |
    github.event_name != 'pull_request' ||
    needs.detect-changes.outputs.backend == 'true' ||
    needs.detect-changes.outputs.tests == 'true' ||
    needs.detect-changes.outputs.config == 'true' ||
    needs.detect-changes.outputs.frontend == 'true'

# build: Full build - skip only for pure docs changes
build:
  if: |
    github.event_name != 'pull_request' ||
    needs.detect-changes.outputs.backend == 'true' ||
    needs.detect-changes.outputs.frontend == 'true' ||
    needs.detect-changes.outputs.config == 'true'

# style-check: Skip for pure docs/shell/workflow changes
style-check:
  if: |
    github.event_name != 'pull_request' ||
    needs.detect-changes.outputs.backend == 'true' ||
    needs.detect-changes.outputs.frontend == 'true' ||
    needs.detect-changes.outputs.tests == 'true' ||
    needs.detect-changes.outputs.config == 'true'

# shell-format: Only shell scripts
shell-format:
  if: |
    github.event_name != 'pull_request' ||
    needs.detect-changes.outputs.shell == 'true'

# assets: Schema generation depends on src code
assets:
  if: |
    github.event_name != 'pull_request' ||
    needs.detect-changes.outputs.backend == 'true' ||
    needs.detect-changes.outputs.config == 'true'

# python: Only python code
python:
  if: |
    github.event_name != 'pull_request' ||
    needs.detect-changes.outputs.python == 'true'

# docs: Only docs
docs:
  if: |
    github.event_name != 'pull_request' ||
    needs.detect-changes.outputs.docs == 'true'

# webui: Only frontend
webui:
  if: |
    github.event_name != 'pull_request' ||
    needs.detect-changes.outputs.frontend == 'true'

# integration-tests: Backend and test changes
integration-tests:
  if: |
    github.event_name != 'pull_request' ||
    needs.detect-changes.outputs.backend == 'true' ||
    needs.detect-changes.outputs.tests == 'true' ||
    needs.detect-changes.outputs.config == 'true'

# share-test: Backend changes
share-test:
  if: |
    github.event_name != 'pull_request' ||
    needs.detect-changes.outputs.backend == 'true' ||
    needs.detect-changes.outputs.config == 'true'

# redteam: Redteam and backend changes
redteam:
  if: |
    github.event_name != 'pull_request' ||
    needs.detect-changes.outputs.redteam == 'true' ||
    needs.detect-changes.outputs.backend == 'true'

# redteam-staging: Same as redteam
redteam-staging:
  if: |
    github.event_name != 'pull_request' ||
    needs.detect-changes.outputs.redteam == 'true' ||
    needs.detect-changes.outputs.backend == 'true'

# actionlint: Only workflow files
actionlint:
  if: |
    github.event_name != 'pull_request' ||
    needs.detect-changes.outputs.workflows == 'true'

# ruby: Only ruby code
ruby:
  if: |
    github.event_name != 'pull_request' ||
    needs.detect-changes.outputs.ruby == 'true'

# golang: Only go code
golang:
  if: |
    github.event_name != 'pull_request' ||
    needs.detect-changes.outputs.golang == 'true'
```

## Expected Impact

### Scenario Analysis

| Change Type                | Before  | After                                | Savings      |
| -------------------------- | ------- | ------------------------------------ | ------------ |
| Docs only (`site/`)        | 15 jobs | 2 jobs (detect + docs)               | ~85%         |
| Frontend only (`src/app/`) | 15 jobs | 4 jobs (detect, build, style, webui) | ~75%         |
| Python only                | 15 jobs | 2 jobs (detect + python)             | ~85%         |
| Ruby only                  | 15 jobs | 2 jobs (detect + ruby)               | ~85%         |
| Golang only                | 15 jobs | 2 jobs (detect + golang)             | ~85%         |
| Shell scripts only         | 15 jobs | 2 jobs (detect + shell)              | ~85%         |
| Workflow files only        | 15 jobs | 2 jobs (detect + actionlint)         | ~85%         |
| Backend changes            | 15 jobs | 15 jobs                              | 0% (correct) |
| Mixed changes              | 15 jobs | 15 jobs                              | 0% (correct) |

### Estimated Monthly Savings

Assuming:

- 200 PRs/month
- 30% are docs-only
- 20% are frontend-only
- 10% are language-specific (python/ruby/go)
- 40% require full CI

**Before:** 200 PRs × 15 jobs × 5 min = 15,000 job-minutes
**After:** ~60 PRs × 15 jobs + ~140 PRs × 3 jobs avg = 4,500 + 2,100 = 6,600 job-minutes

**Savings: ~56% reduction in CI minutes**

## Safety Considerations

### Always Run Full CI When:

1. **Pushing to main** - All jobs run regardless of changes
2. **Manual dispatch** - All jobs run
3. **Detection failure** - Fall back to running all jobs
4. **config file changes** - Changes to `package.json`, `tsconfig`, etc. trigger broader checks

### Risk Mitigation

1. **Conservative defaults** - When in doubt, run the job
2. **Incremental rollout** - Start with obvious wins (docs, language-specific)
3. **Easy override** - `workflow_dispatch` always runs everything
4. **Monitoring** - Track if skipped jobs would have failed

### What NOT to Skip

- Never skip `test` for any backend/core changes
- Never skip `build` for any code changes
- Never skip `style-check` for any code changes
- Always run full CI on push to main

## Implementation Steps

### Step 1: Create the detect-changes job (Low risk)

- Add the `dorny/paths-filter` based detection job
- No changes to existing jobs yet
- Verify detection outputs are correct

### Step 2: Add conditions to isolated language jobs (Low risk)

- `python`, `ruby`, `golang`, `actionlint`, `shell-format`
- These are independent and easy to verify

### Step 3: Add conditions to docs job (Low risk)

- `docs` job only runs on `site/` changes
- Very clear scope, easy to verify

### Step 4: Add conditions to frontend jobs (Medium risk)

- `webui` job only runs on `src/app/` changes
- Verify no backend dependencies

### Step 5: Add conditions to core jobs (Higher risk, go slow)

- `test`, `build`, `style-check`
- Use broader triggers, be conservative
- Monitor for false negatives

### Step 6: Add conditions to integration/e2e jobs (Medium risk)

- `integration-tests`, `share-test`, `redteam`
- These have more complex dependencies

## Alternative Approaches Considered

### 1. Workflow-level path filtering

**Rejected:** Too coarse-grained, can't have different conditions per job.

### 2. Separate workflows per area

**Rejected:** Would require duplicating shared setup, harder to maintain.

### 3. Manual labels for skipping

**Rejected:** Human error prone, not automatic.

### 4. Merge queue with required checks

**Considered:** Could complement this approach for main branch protection.

## Monitoring & Rollback

### Success Metrics

- CI time per PR reduced
- No increase in bugs on main
- Developer satisfaction with CI speed

### Rollback Plan

If issues arise:

1. Remove `if:` conditions from affected jobs
2. Keep `detect-changes` job (no harm if unused)
3. Investigate and fix detection logic
4. Re-enable gradually

## Appendix: Full Implementation Diff

See the implementation PR for the complete changes to `.github/workflows/main.yml`.

## Questions to Resolve

1. Should we add a "skip CI" label for trusted contributors?
2. Should examples/ changes trigger any jobs?
3. Should drizzle/ (DB migrations) changes trigger backend tests?
4. Do we want to add merge queue for additional safety?
