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
    integrity: 'sha256-F82MAd/o9ov97cAfA8mtFPV7oJf9ngwD65yPc5vvabI='

promptfoo-eval:
  extends: .promptfoo-eval
  rules:
    - if: '$CI_PIPELINE_SOURCE == "merge_request_event"'
```

GitLab 17.9 or later supports `include:integrity`. On older GitLab versions, replace `main` in the remote URL with a full, reviewed commit SHA. The template uses Promptfoo's official, digest-pinned non-root container image, so it never installs npm dependencies with provider secrets present.

## Configuration

Override job variables as needed:

| Variable                        | Default                | Purpose                                                     |
| ------------------------------- | ---------------------- | ----------------------------------------------------------- |
| `PROMPTFOO_CONFIG`              | `promptfooconfig.yaml` | Config file to evaluate                                     |
| `PROMPTFOO_VERSION`             | `0.121.19`             | Exact expected version of the pinned Promptfoo image        |
| `PROMPTFOO_OUTPUT_DIR`          | `.promptfoo-results`   | JSON and JUnit artifact directory                           |
| `PROMPTFOO_PASS_RATE_THRESHOLD` | `100`                  | Minimum passing percentage                                  |
| `PROMPTFOO_SHARE`               | `false`                | Upload results only when explicitly set to `true`           |
| `PROMPTFOO_GITLAB_TOKEN`        | Unset                  | Optional token scoped to the `promptfoo-review` environment |

Configure provider credentials and optional tokens as masked GitLab CI/CD variables. Use protected variables only for trusted protected branches; ordinary merge request pipelines cannot access them unless GitLab's protected-resource requirements are met. Never run fork-controlled code with parent-project secrets.

To enable merge request comments, create a masked project access token with its environment scope set to exactly `promptfoo-review`, then add:

```yaml
promptfoo-comment:
  extends: .promptfoo-comment
  needs:
    - job: promptfoo-eval
      artifacts: true
  rules:
    - if: '$CI_PIPELINE_SOURCE == "merge_request_event"'
      when: always
```

The comment runs in a fresh non-root container without a checkout; its write token is never available to the eval. The eval removes token-bearing `.git` metadata, strips job/deploy credentials from executable providers, and always fails on failed assertions. Results remain restricted to project developers with one-week artifact expiration; GitLab keeps the latest successful artifacts by default unless that project setting is disabled.

For self-managed GitLab instances with an internal certificate authority, configure a file-type CI/CD variable containing the CA certificate and set `NODE_EXTRA_CA_CERTS` to that variable's file path. Do not disable TLS verification.
