---
sidebar_label: GitLab CI
description: Run trusted Promptfoo evals in GitLab CI with a pinned container template, an independent pass-rate check, JSON and JUnit artifacts, and explicit sharing.
---

# Setting up Promptfoo with GitLab CI

Use the reusable Promptfoo template to run trusted evals in merge request, branch, and scheduled pipelines. The job checks the pass rate, exports JSON and JUnit results, and shares results only when enabled.

## Prerequisites

- A GitLab project with CI/CD enabled.
- A Docker or Kubernetes runner that honors the pinned container image.
- A Promptfoo config file, such as `promptfooconfig.yaml`.
- GitLab 17.9 or later for [`include:integrity`](https://docs.gitlab.com/ci/yaml/#includeintegrity), or a reviewed commit SHA on older versions.

## Configuration Steps

### 1. Create GitLab CI Configuration

Add this to `.gitlab-ci.yml`:

```yaml title=".gitlab-ci.yml"
include:
  - remote: 'https://raw.githubusercontent.com/promptfoo/promptfoo/main/examples/integration-gitlab-ci/gitlab-ci.yml'
    integrity: 'sha256-SgzKzJQY6AAFx/tlDmV/d/N0l6O+X2cLt/nZeXwybSE='

promptfoo-eval:
  extends: .promptfoo-eval
  variables:
    PROMPTFOO_CONFIG: promptfooconfig.yaml
    PROMPTFOO_PASS_RATE_THRESHOLD: '100'
  rules:
    - if: '$CI_PIPELINE_SOURCE == "merge_request_event"'
      changes:
        - .gitlab-ci.yml
        - promptfooconfig.yaml
        - prompts/**/*
        - tests/**/*
    - if: '$CI_PIPELINE_SOURCE == "schedule"'
    - if: '$CI_COMMIT_BRANCH == $CI_DEFAULT_BRANCH'
```

GitLab verifies the template's SHA-256 integrity value before starting the pipeline. On versions older than 17.9, replace `main` with a full, reviewed commit SHA and omit `integrity`. Update the pinned image tag and digest together when upgrading Promptfoo.

The job-level `merge_request_event` rule is required for merge request pipelines. To copy a runnable example with a local template instead:

```bash
npx promptfoo@latest init --example integration-gitlab-ci
cd integration-gitlab-ci
```

The bundled config uses the `echo` provider and needs no API credentials.

### 2. Set Up Environment Variables

Store provider credentials as masked, protected variables under **Settings > CI/CD > Variables**. Only trusted pipelines should receive them. Protected variables in merge request pipelines require protected source and target branches in the same project, appropriate user permissions, and the project's protected-resource setting. See [GitLab's requirements](https://docs.gitlab.com/ci/pipelines/merge_request_pipelines/#control-access-to-protected-variables-and-runners).

The template runs project code with the job's permissions. Configs, providers, assertions, and pipeline files can access credentials available to the job; this template does not provide a sandbox for untrusted code.

| Variable                        | Default                | Purpose                                        |
| ------------------------------- | ---------------------- | ---------------------------------------------- |
| `PROMPTFOO_CONFIG`              | `promptfooconfig.yaml` | Config file to evaluate                        |
| `PROMPTFOO_OUTPUT_DIR`          | `.promptfoo-results`   | Empty directory for JSON and JUnit results     |
| `PROMPTFOO_PASS_RATE_THRESHOLD` | `100`                  | Minimum passing percentage, from 0 through 100 |
| `PROMPTFOO_SHARE`               | `false`                | Upload results only when set to `true`         |
| `PROMPTFOO_CACHE_PATH`          | `.promptfoo/cache`     | Response cache directory                       |

The job sets `PROMPTFOO_SELF_HOSTED: 'false'` to enable ordinary `{{env.NAME}}` templates in CLI configs. It uses the installed CLI in the pinned image and does not install npm packages during the job.

### 3. Configure Caching (Optional but Recommended)

The response-cache key includes the project, job name, and commit SHA. Retries of the same commit can reuse responses; scheduled pipelines always use `--no-cache`. To disable the GitLab cache:

```yaml
promptfoo-eval:
  extends: .promptfoo-eval
  cache: []
```

### 4. Storing Results

Each job writes `.promptfoo-results/results.json` and `.promptfoo-results/results.junit.xml`. Artifacts upload after both passing and failing evals. GitLab displays JUnit results in the pipeline **Tests** tab and merge request test summary.

UI and API artifact downloads require the Developer role or higher. This restriction does not cover runner job-token downloads; review [artifact access](https://docs.gitlab.com/ci/yaml/#artifactsaccess) and project CI/CD visibility before storing sensitive results. Artifacts can contain prompts, responses, and grading details.

Artifacts expire after one week. GitLab keeps the latest successful artifacts on each ref by default; disable **Keep artifacts from most recent successful jobs** if strict expiration is required.

## Advanced Configuration

### Adding Custom Test Steps

Use a downstream job to inspect exported results. Extending `script` replaces the template's CLI invocation and pass-rate check, so leave it inherited when using the built-in behavior.

The job preserves CLI errors. After a successful CLI exit, it independently validates the JSON counts and checks the job's pass-rate threshold. Config-level exit-code or threshold overrides cannot skip this check. Missing, malformed, or empty results fail the job. Lower `PROMPTFOO_PASS_RATE_THRESHOLD` only when a lower passing percentage is intentional.

### Parallel Evaluation

Use separate jobs for independent configs:

```yaml
promptfoo-support:
  extends: .promptfoo-eval
  variables:
    PROMPTFOO_CONFIG: evals/support/promptfooconfig.yaml
    PROMPTFOO_OUTPUT_DIR: .promptfoo-results/support

promptfoo-billing:
  extends: .promptfoo-eval
  variables:
    PROMPTFOO_CONFIG: evals/billing/promptfooconfig.yaml
    PROMPTFOO_OUTPUT_DIR: .promptfoo-results/billing
```

Add the same explicit merge request rules from the basic configuration if these jobs should run in merge request pipelines. Each output directory must be empty before the eval starts.

### Integration with GitLab Merge Requests

GitLab reads the JUnit report directly to show passing and failing tests. The template needs no project access token and does not post merge request comments.

Sharing is disabled with `--no-share`. To upload results to Promptfoo Cloud, set `PROMPTFOO_SHARE: 'true'` and configure a protected `PROMPTFOO_API_KEY` variable. Review which prompts and outputs will be shared before enabling it.

## Example Output

A successful job prints the passed and total test counts and the required pass rate. GitLab shows the job status, JUnit test summary, and downloadable JSON and JUnit artifacts.

## Troubleshooting

1. **Template integrity mismatch:** Review the updated template before changing its hash. Calculate it with `openssl dgst -sha256 -binary gitlab-ci.yml | openssl base64 -A` and prefix the value with `sha256-`.
2. **Provider credentials are unavailable:** Check the variable's protected status and whether the pipeline meets GitLab's protected-resource requirements.
3. **Artifact directory is not empty:** Use a fresh checkout and keep the output directory out of caches and incoming artifacts.
4. **Missing or invalid results:** Inspect the CLI logs and confirm the configured file contains runnable tests. A successful process exit alone does not pass the job.
5. **Job timing out:** Set `timeout` on the extending job, for example `timeout: 2 hours`.

See the [configuration reference](/docs/configuration/reference) and [JUnit output formats](/docs/configuration/outputs) for more details.
