# integration-gitlab-ci (GitLab CI)

Run this self-contained example with:

```bash
npx promptfoo@latest init --example integration-gitlab-ci
cd integration-gitlab-ci
npx promptfoo@0.121.19 eval --config promptfooconfig.yaml --no-cache --no-share
```

The bundled echo provider does not require API credentials. Commit the downloaded files to a GitLab project to run the included pipeline.

## Reusable template

The local `.gitlab-ci.yml` extends the hidden `.promptfoo-eval` job from `gitlab-ci.yml`. To use the organization-owned template without copying it, include the raw file with GitLab's `include:integrity` and add your own merge request rules:

```yaml
include:
  - remote: 'https://raw.githubusercontent.com/promptfoo/promptfoo/main/examples/integration-gitlab-ci/gitlab-ci.yml'
    integrity: 'sha256-/bOFbxoVmaVVHWs+i+swWKcsOshSfmoei8qxttC9e/A='

promptfoo-eval:
  extends: .promptfoo-eval
  rules:
    - if: '$CI_PIPELINE_SOURCE == "merge_request_event"'
```

GitLab 17.9 or later supports `include:integrity`. On older GitLab versions, replace `main` in the remote URL with a full, reviewed commit SHA. The template pins both its Node image digest and Promptfoo npm version.

## Configuration

Override job variables as needed:

| Variable                        | Default                | Purpose                                                  |
| ------------------------------- | ---------------------- | -------------------------------------------------------- |
| `PROMPTFOO_CONFIG`              | `promptfooconfig.yaml` | Config file to evaluate                                  |
| `PROMPTFOO_VERSION`             | `0.121.19`             | Exact Promptfoo npm version                              |
| `PROMPTFOO_OUTPUT_DIR`          | `.promptfoo-results`   | JSON and JUnit artifact directory                        |
| `PROMPTFOO_PASS_RATE_THRESHOLD` | `100`                  | Minimum passing percentage                               |
| `PROMPTFOO_SHARE`               | `false`                | Upload results only when explicitly set to `true`        |
| `PROMPTFOO_GITLAB_TOKEN`        | Unset                  | Optional project access token for merge request comments |

Configure provider credentials and optional tokens as masked GitLab CI/CD variables. Use protected variables only for trusted protected branches; ordinary merge request pipelines cannot access them unless GitLab's protected-resource requirements are met. Never run fork-controlled code with parent-project secrets.

Merge request comments run in `after_script`, so failing evals still produce a summary without turning failures into successful jobs. The template removes GitLab write and job tokens from the npm-install and eval subprocess environments, restricts result artifacts to project developers, and configures one-week artifact expiration. GitLab keeps the latest successful artifacts by default unless that project setting is disabled.

For self-managed GitLab instances with an internal certificate authority, configure a file-type CI/CD variable containing the CA certificate and set `NODE_EXTRA_CA_CERTS` to that variable's file path. Do not disable TLS verification.
