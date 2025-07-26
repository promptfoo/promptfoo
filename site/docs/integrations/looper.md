---
sidebar_label: Looper
---

# Setting up Promptfoo with Looper

This guide shows you how to integrate **Promptfoo** evaluations into a Looper CI/CD workflow so that every pull‑request (and optional nightly job) automatically runs your prompt tests.

## Prerequisites

- A working Looperinstallation with workflow execution enabled
- A build image (or declared tools) that provides **Node 22+** and **jq 1.6+**
- `promptfooconfig.yaml` and your prompt fixtures (`prompts/**/*.json`) committed to the repository

## Create `.looper.yml`

Add the following file to the root of your repo:

```yaml
language: workflow                 # optional but common

tools:
  nodejs: 22                       # Looper provisions Node.js
  jq: 1.7

envs:
  global:
    variables:
      PROMPTFOO_CACHE_PATH: "${HOME}/.promptfoo/cache"

triggers:
  - pr                             # run on every pull‑request
  - manual: "Nightly Prompt Tests" # manual button in UI
    call: nightly                  # invokes the nightly flow below

flows:
  # ---------- default PR flow ----------
  default:
    - (name Install Promptfoo) npm install -g promptfoo

    - (name Evaluate Prompts) |
        promptfoo eval \
          -c promptfooconfig.yaml \
          --prompts "prompts/**/*.json" \
          --share \
          -o output.json

    - (name Quality gate) |
        SUCC=$(jq -r '.results.stats.successes' output.json)
        FAIL=$(jq -r '.results.stats.failures' output.json)
        echo "✅ $SUCC  ❌ $FAIL"
        test "$FAIL" -eq 0  # non‑zero exit fails the build

  # ---------- nightly scheduled flow ----------
  nightly:
    - call: default                  # reuse the logic above
    - (name Upload artefacts) |
        echo "TODO: push output.json to S3 files"
```

### How it works

| Section                 | Purpose                                                             |
| ----------------------- | ------------------------------------------------------------------- |
| `tools`                 | Declares tool versions Looper should provision.                     |
| `envs.global.variables` | Environment variables available to every step.                      |
| `triggers`              | Determines when the workflow runs (`pr`, `manual`, `cron`, etc.).   |
| `flows`                 | Ordered shell commands; execution stops on the first non‑zero exit. |

## Caching Promptfoo results

Looper lacks a first‑class cache API. Two common approaches:

1. **Persistent volume** – mount `${HOME}/.promptfoo/cache` on a reusable volume.
2. **Persistence tasks** – pull/push the cache at the start and end of the flow:

## Setting quality thresholds

```yaml
    - (name Pass‑rate gate) |
        TOTAL=$(jq '.results.stats.successes + .results.stats.failures' output.json)
        PASS=$(jq '.results.stats.successes' output.json)
        RATE=$(echo "scale=2; 100*$PASS/$TOTAL" | bc)
        echo "Pass rate: $RATE%"
        test $(echo "$RATE >= 95" | bc) -eq 1   # fail if <95 %
```

## Multi‑environment evaluations

Evaluate both staging and production configs and compare failures:

```yaml
flows:
  compare-envs:
    - (name Eval‑prod) |
      promptfoo eval \
      -c promptfooconfig.prod.yaml \
      --prompts "prompts/**/*.json" \
      -o output-prod.json

    - (name Eval‑staging) |
      promptfoo eval \
      -c promptfooconfig.staging.yaml \
      --prompts "prompts/**/*.json" \
      -o output-staging.json

    - (name Compare) |
      PROD_FAIL=$(jq '.results.stats.failures' output-prod.json)
      STAGE_FAIL=$(jq '.results.stats.failures' output-staging.json)
      if [ "$STAGE_FAIL" -gt "$PROD_FAIL" ]; then
      echo "⚠️  Staging has more failures than production!"
      fi
```

## Posting evaluation results to GitHub/GitLab

In order to send evaluation results elsewhere, use:

- **GitHub task**
  ```yaml
  - github --add-comment \
    --repository "$CI_REPOSITORY" \
    --issue "$PR_NUMBER" \
    --body "$(cat comment.md)" # set comment as appropriate
  ```
- **cURL** with a Personal Access Token (PAT) against the REST API.

## Troubleshooting

| Problem                  | Remedy                                                                                  |
| ------------------------ | --------------------------------------------------------------------------------------- |
| `npm: command not found` | Add `nodejs:` under `tools` or use an image with Node pre‑installed.                    |
| Cache not restored       | Verify the path and that the `files pull` task succeeds.                                |
| Long‑running jobs        | Split prompt sets into separate flows or raise `timeoutMillis` in the build definition. |
| API rate limits          | Enable Promptfoo cache and/or rotate API keys.                                          |

## Best practices

1. **Incremental testing** – feed `looper diff --name-only prompts/` into `promptfoo eval` to test only changed prompts.
2. **Semantic version tags** – tag prompt sets/configs so you can roll back easily.
3. **Secret management** – store API keys in a secret store and inject them as environment variables.
4. **Reusable library flows** – if multiple repos need the same evaluation, host the flow definition in a central repo and `import` it.
