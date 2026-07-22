---
sidebar_label: GitLab CI
description: Run Promptfoo evals in GitLab CI with a pinned reusable template, protected credentials, JUnit reports, merge request comments, and explicit sharing.
---

# Setting up Promptfoo with GitLab CI

Use the reusable Promptfoo GitLab CI template to run evals in merge request, branch, and scheduled pipelines. Failed evals block the pipeline, GitLab displays JUnit results, and sharing stays disabled unless explicitly enabled.

## Prerequisites

- A GitLab repository with CI/CD enabled
- A Promptfoo config file, such as `promptfooconfig.yaml`
- Masked provider credentials when your provider requires authentication
- GitLab 17.9 or later for [`include:integrity`](https://docs.gitlab.com/ci/yaml/#includeintegrity), or an immutable commit SHA on older GitLab versions

## Configuration Steps

### 1. Create GitLab CI Configuration

Add the organization-owned template to your `.gitlab-ci.yml` file:

```yaml title=".gitlab-ci.yml"
include:
  - remote: 'https://raw.githubusercontent.com/promptfoo/promptfoo/main/examples/integration-gitlab-ci/gitlab-ci.yml'
    integrity: 'sha256-RiO16sOFJwNPl8f1qo5g59vpQjP6/Mdn54+gTAKQD4M='

promptfoo-eval:
  extends: .promptfoo-eval
  variables:
    PROMPTFOO_CONFIG: promptfooconfig.yaml
    PROMPTFOO_PASS_RATE_THRESHOLD: '100'
  rules:
    - if: '$CI_PIPELINE_SOURCE == "merge_request_event"'
      changes:
        - promptfooconfig.yaml
        - prompts/**/*
        - tests/**/*
    - if: '$CI_PIPELINE_SOURCE == "schedule"'
    - if: '$CI_COMMIT_BRANCH == $CI_DEFAULT_BRANCH'
```

GitLab verifies the included template against its SHA-256 integrity value before starting the pipeline. The template runs as the unprivileged user in Promptfoo's official, digest-pinned container image, so provider secrets are never exposed to an npm installation. For GitLab versions older than 17.9, replace `main` with a full, reviewed commit SHA and omit `integrity`. Do not include an unpinned third-party branch.

The job-level merge request rule is intentional: GitLab requires `merge_request_event` rules in the consuming pipeline configuration to create merge request pipelines.

To copy a complete, runnable example instead:

```bash
npx promptfoo@latest init --example integration-gitlab-ci
cd integration-gitlab-ci
```

The example uses the `echo` provider, so its sample config runs without provider credentials.

### 2. Set Up Environment Variables

In GitLab, go to **Settings > CI/CD > Variables** and add provider credentials such as `OPENAI_API_KEY` as masked variables. Use protected variables for trusted protected branches and tags whenever possible.

:::warning

Protected variables are not available to ordinary merge request pipelines. GitLab only exposes protected resources when the source and target branches are both protected, belong to the same project, and the triggering user has the required access. Never run fork-controlled code in a parent-project pipeline that has access to provider credentials or GitLab write tokens.

:::

The template supports these job variables:

| Variable                        | Default                | Purpose                                                                |
| ------------------------------- | ---------------------- | ---------------------------------------------------------------------- |
| `PROMPTFOO_CONFIG`              | `promptfooconfig.yaml` | Config file to evaluate                                                |
| `PROMPTFOO_VERSION`             | `0.121.19`             | Exact expected version of the digest-pinned Promptfoo container        |
| `PROMPTFOO_OUTPUT_DIR`          | `.promptfoo-results`   | Directory containing JSON and JUnit results                            |
| `PROMPTFOO_PASS_RATE_THRESHOLD` | `100`                  | Minimum passing percentage needed for the job to succeed               |
| `PROMPTFOO_SHARE`               | `false`                | Upload eval results only when explicitly set to `true`                 |
| `PROMPTFOO_GITLAB_TOKEN`        | Unset                  | Optional write token scoped only to the `promptfoo-review` environment |

### 3. Configure Caching (Optional but Recommended)

The template stores Promptfoo's response cache in `.promptfoo/cache` and uses a key containing the project, job name, and immutable commit SHA. This avoids collisions between branch names that normalize to the same GitLab slug; caches are reused by retries of the same commit rather than shared between commits.

Keep GitLab's separate caches for protected branches enabled, and consider disabling caching when prompt inputs or model responses contain sensitive data:

```yaml
promptfoo-eval:
  extends: .promptfoo-eval
  cache: []
```

### 4. Storing Results

Each job writes:

- `.promptfoo-results/results.json` for the complete eval output.
- `.promptfoo-results/results.junit.xml` for the merge request test summary and pipeline **Tests** tab.
- `.promptfoo-results/job-status.txt` for the isolated merge request summary job.

Artifacts are uploaded even when the eval fails, are configured to expire after one week, and are restricted to users with the Developer role or higher. GitLab keeps artifacts from the most recent successful pipeline on each ref indefinitely by default; disable **Keep artifacts from most recent successful jobs** when strict expiration is required. Treat all result artifacts as sensitive because they can contain prompts, model responses, and grading details.

## Advanced Configuration

### Adding Custom Test Steps

Add a downstream job to inspect the JSON results without replacing the template's inherited `script`:

```yaml
inspect-promptfoo-results:
  image: node:24-alpine@sha256:a0b9bf06e4e6193cf7a0f58816cc935ff8c2a908f81e6f1a95432d679c54fbfd
  needs:
    - job: promptfoo-eval
      artifacts: true
  when: always
  script:
    - node -e 'console.log(JSON.parse(require("node:fs").readFileSync(".promptfoo-results/results.json", "utf8")).results.stats)'
```

Do not override `script` merely to enforce failures: the template already preserves Promptfoo's exit code and defaults to a 100% pass-rate threshold.

### Parallel Evaluation

Run independent eval configs as separate jobs and give each one a unique artifact directory:

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

The cache key already includes the GitLab job name and commit SHA. If these jobs should run in merge request pipelines, add the same explicit merge request `rules` shown in the basic configuration.

### Integration with GitLab Merge Requests

To enable optional merge request summaries, create a short-lived, project-scoped access token with the minimum API access needed to create and update merge request notes. Store it as the masked `PROMPTFOO_GITLAB_TOKEN` CI/CD variable and set its **Environment scope** to exactly `promptfoo-review`.

Add a separate comment job after the eval:

```yaml
promptfoo-comment:
  extends: .promptfoo-comment
  variables:
    PROMPTFOO_OUTPUT_DIR: .promptfoo-results
    PROMPTFOO_SHARE: 'false'
  needs:
    - job: promptfoo-eval
      artifacts: true
      optional: true
  rules:
    - if: '$CI_PIPELINE_SOURCE == "merge_request_event"'
      when: always
```

GitLab's built-in `CI_JOB_TOKEN` can read merge request notes but cannot create or update them, so a project access token is required. The separate comment job starts in a fresh, unprivileged container with no checkout and accesses the write token only through its `promptfoo-review` environment scope. Repeat any job-level `PROMPTFOO_OUTPUT_DIR` or `PROMPTFOO_SHARE` overrides from the eval job in the comment job because GitLab `needs` does not inherit job variables. The eval job fails closed if that token is exposed to it, removes token-bearing Git metadata before executable providers run, and forces failed assertions to return a nonzero exit code.

The eval records its job status as an artifact, and `when: always` lets the isolated comment job summarize both successful and failed evals without turning failures into passing pipelines. A per-merge-request resource group serializes overlapping updates, and older pipelines cannot overwrite a newer summary.

Only provide a write token to trusted pipelines. Masking does not prevent malicious executable providers, JavaScript assertions, or modified pipeline configuration from exfiltrating credentials that are otherwise exposed to a job.

To include a Promptfoo Cloud link, set `PROMPTFOO_SHARE: 'true'` and configure a masked `PROMPTFOO_API_KEY`. Sharing is disabled with `--no-share` by default, including when cloud credentials or sharing-enabled config are present.

## Example Output

After the eval runs, GitLab displays:

- A passing or failing pipeline status that reflects the configured pass-rate threshold.
- JUnit results in the merge request test summary and pipeline **Tests** tab.
- Restricted JSON and JUnit artifacts, including for failed jobs.
- An optional merge request comment with the pass count and, when explicitly enabled, a Promptfoo Cloud link.

## Troubleshooting

1. **Template integrity mismatch:** Update the integrity value only after reviewing the new template content. To calculate it locally, run `openssl dgst -sha256 -binary gitlab-ci.yml | openssl base64 -A` and prefix the result with `sha256-`.
2. **Provider credentials are unavailable:** Check whether the variables are masked or protected and whether the merge request pipeline satisfies GitLab's protected-resource requirements.
3. **Merge request comments are missing:** Verify that the `.promptfoo-comment` job is configured, `PROMPTFOO_GITLAB_TOKEN` is scoped to exactly `promptfoo-review`, and the job runs in a merge request pipeline. The comment job reports expired tokens and HTTP errors directly.
4. **Internal certificate authority:** Store the CA bundle as a GitLab file-type variable and set `NODE_EXTRA_CA_CERTS` to its file path. Never disable TLS certificate verification.
5. **Job timing out:** Override `timeout` in the extending job, for example `timeout: 2 hours`.

For more details, see the [configuration reference](/docs/configuration/reference), [JUnit output formats](/docs/configuration/outputs), and [GitLab CI/CD component security guidance](https://docs.gitlab.com/ci/components/#cicd-component-security-best-practices).
