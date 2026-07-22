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
    integrity: 'sha256-6GX5+uVTNV4J1FF7EYHr+BCdDg3XEvH8OpOYB62P2aY='

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

GitLab verifies the included template against its SHA-256 integrity value before starting the pipeline. The template also pins its Node image by digest and its Promptfoo npm release by exact version. For GitLab versions older than 17.9, replace `main` with a full, reviewed commit SHA and omit `integrity`. Do not include an unpinned third-party branch.

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

| Variable                        | Default                | Purpose                                                               |
| ------------------------------- | ---------------------- | --------------------------------------------------------------------- |
| `PROMPTFOO_CONFIG`              | `promptfooconfig.yaml` | Config file to evaluate                                               |
| `PROMPTFOO_VERSION`             | `0.121.19`             | Exact Promptfoo npm version; version ranges and `latest` are rejected |
| `PROMPTFOO_OUTPUT_DIR`          | `.promptfoo-results`   | Directory containing JSON and JUnit results                           |
| `PROMPTFOO_PASS_RATE_THRESHOLD` | `100`                  | Minimum passing percentage needed for the job to succeed              |
| `PROMPTFOO_SHARE`               | `false`                | Upload eval results only when explicitly set to `true`                |
| `PROMPTFOO_GITLAB_TOKEN`        | Unset                  | Optional project access token used only for merge request comments    |

### 3. Configure Caching (Optional but Recommended)

The template stores Promptfoo's response cache in `.promptfoo/cache` and uses a cache key containing both the job name and branch slug. Separate keys prevent unrelated jobs or branches from sharing cached responses.

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

Artifacts are uploaded even when the eval fails, are configured to expire after one week, and are restricted to users with the Developer role or higher. GitLab keeps artifacts from the most recent successful pipeline on each ref indefinitely by default; disable **Keep artifacts from most recent successful jobs** when strict expiration is required. Treat both files as sensitive because they can contain prompts, model responses, and grading details.

## Advanced Configuration

### Adding Custom Test Steps

Add a downstream job to inspect the JSON results without replacing the template's inherited `script`:

```yaml
inspect-promptfoo-results:
  image: node:24-alpine@sha256:a0b9bf06e4e6193cf7a0f58816cc935ff8c2a908f81e6f1a95432d679c54fbfd
  needs:
    - job: promptfoo-eval
      artifacts: true
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

The cache key already includes the GitLab job name. If these jobs should run in merge request pipelines, add the same explicit merge request `rules` shown in the basic configuration.

### Integration with GitLab Merge Requests

To enable optional merge request summaries, create a short-lived, project-scoped access token with the minimum API access needed to create and update merge request notes. Store it as the masked `PROMPTFOO_GITLAB_TOKEN` CI/CD variable.

GitLab's built-in `CI_JOB_TOKEN` can read merge request notes but cannot create or update them, so a project access token is required. The template removes GitLab job, deploy, dependency-proxy, and project-write credentials from both the npm-install and eval subprocess environments, then posts or updates one summary per job in `after_script`. This preserves summaries for failing evals without converting failures into passing pipelines.

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
3. **Merge request comments are missing:** Verify that `PROMPTFOO_GITLAB_TOKEN` has permission to create merge request notes and that the job runs in a merge request pipeline. An expired token or HTTP error is reported in the job's `after_script` logs.
4. **Internal certificate authority:** Store the CA bundle as a GitLab file-type variable and set `NODE_EXTRA_CA_CERTS` to its file path. Never disable TLS certificate verification.
5. **Job timing out:** Override `timeout` in the extending job, for example `timeout: 2 hours`.

For more details, see the [configuration reference](/docs/configuration/reference), [JUnit output formats](/docs/configuration/outputs), and [GitLab CI/CD component security guidance](https://docs.gitlab.com/ci/components/#cicd-component-security-best-practices).
