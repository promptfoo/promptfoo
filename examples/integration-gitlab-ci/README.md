# integration-gitlab-ci (GitLab CI)

Run this example without API credentials:

```bash
npx promptfoo@latest init --example integration-gitlab-ci
cd integration-gitlab-ci
npx promptfoo@0.124.1 eval --config promptfooconfig.yaml --no-cache --no-share
```

Commit the downloaded files to a GitLab project to run the bundled echo eval. The local `.gitlab-ci.yml` extends the `.promptfoo-eval` job from `gitlab-ci.yml`.

## Reusable template

Use a Docker or Kubernetes runner. To include the template without copying it:

```yaml
include:
  - remote: 'https://raw.githubusercontent.com/promptfoo/promptfoo/ec50c5ba1a356d335289cf919d17775c78766e1f/examples/integration-gitlab-ci/gitlab-ci.yml'
    integrity: 'sha256-cz2wVf0zjR0hztQqPoLIJw8d7xUc2oqVhG9nmFWSS0I='

promptfoo-eval:
  extends: .promptfoo-eval
  rules:
    - if: '$CI_PIPELINE_SOURCE == "merge_request_event"'
```

The URL pins the template to a reviewed commit. GitLab 17.9 or later also verifies `include:integrity`; on older versions, omit `integrity` and keep the pinned URL. Update the URL and integrity value together when changing template versions. The template uses a digest-pinned Promptfoo image.

This template runs trusted project code with the job's permissions. It does not isolate providers or assertions from CI credentials. Keep provider credentials in masked, protected GitLab variables and only make them available to trusted pipelines. Merge request pipelines must meet [GitLab's protected-resource requirements](https://docs.gitlab.com/ci/pipelines/merge_request_pipelines/#control-access-to-protected-variables-and-runners) to receive protected variables.

## Configuration

| Variable                        | Default                | Purpose                                           |
| ------------------------------- | ---------------------- | ------------------------------------------------- |
| `PROMPTFOO_CONFIG`              | `promptfooconfig.yaml` | Config file to evaluate                           |
| `PROMPTFOO_OUTPUT_DIR`          | `.promptfoo-results`   | Empty directory for JSON and JUnit results        |
| `PROMPTFOO_PASS_RATE_THRESHOLD` | `100`                  | Minimum passing percentage, from 0 through 100    |
| `PROMPTFOO_SHARE`               | `false`                | Upload results only when explicitly set to `true` |
| `PROMPTFOO_CACHE_PATH`          | `.promptfoo/cache`     | Response cache, keyed by job and commit           |

The job preserves a nonzero CLI exit code. If the CLI exits successfully, it also checks the exported test counts against the job's pass-rate threshold. A config-level exit-code or threshold override cannot skip this check. Missing, invalid, or empty results fail the job.

Scheduled pipelines use `--no-cache`. Sharing is disabled with `--no-share`; set `PROMPTFOO_SHARE: 'true'` and configure `PROMPTFOO_API_KEY` to upload to Promptfoo Cloud. The job sets `PROMPTFOO_SELF_HOSTED: 'false'` so the image supports ordinary `{{env.NAME}}` templates in CLI configs.

## Results

The job uploads JSON and JUnit results, including after failures. GitLab displays JUnit results in the pipeline **Tests** tab and merge request test summary. No separate comment job or project access token is needed.

Artifact downloads through the GitLab UI and API require the Developer role. This restriction does not cover runner job-token downloads; review [artifact access](https://docs.gitlab.com/ci/yaml/#artifactsaccess) and project CI/CD visibility before storing sensitive results. Artifacts expire after one week, except that GitLab keeps the latest successful artifacts unless that project setting is disabled.
