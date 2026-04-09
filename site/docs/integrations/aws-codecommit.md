---
title: AWS CodeCommit Integration
sidebar_label: AWS CodeCommit
sidebar_position: 6
description: Run promptfoo from AWS CodeCommit-backed CodeBuild pipelines, store results as build artifacts, and optionally post scan summaries to CodeCommit pull requests.
---

# AWS CodeCommit Integration

This guide shows how to run promptfoo in AWS CodeBuild for repositories hosted in AWS CodeCommit.

Use this setup when you want to:

- Run `promptfoo eval` on every push or pull request
- Fail a build when assertions fail
- Persist JSON/HTML eval reports as CodeBuild artifacts
- Run `promptfoo code-scans run` against CodeCommit pull requests and post a summary comment back to the pull request

## Prerequisites

- An AWS CodeCommit repository with a promptfoo config such as `promptfooconfig.yaml`
- An AWS CodeBuild project connected to that repository
- LLM provider credentials stored in AWS Systems Manager Parameter Store or AWS Secrets Manager
- A Promptfoo API key if you want to run `promptfoo code-scans run`

## Run promptfoo eval in CodeBuild

Create a `buildspec.yml` file in the root of your CodeCommit repository:

```yaml title="buildspec.yml"
version: 0.2

env:
  parameter-store:
    OPENAI_API_KEY: /promptfoo/openai-api-key
  variables:
    PROMPTFOO_CACHE_PATH: .promptfoo/cache

phases:
  install:
    runtime-versions:
      nodejs: 20
    commands:
      - npm install -g promptfoo
  build:
    commands:
      - |
        promptfoo eval \
          -c promptfooconfig.yaml \
          --share \
          --fail-on-error \
          -o promptfoo-results.json \
          -o promptfoo-report.html

artifacts:
  files:
    - promptfoo-results.json
    - promptfoo-report.html

cache:
  paths:
    - '.promptfoo/cache/**/*'
```

### What this does

- Loads `OPENAI_API_KEY` from Parameter Store
- Runs the eval suite defined in `promptfooconfig.yaml`
- Fails the CodeBuild build if any assertions fail
- Saves JSON and HTML reports as build artifacts
- Caches promptfoo responses between builds

## Add a quality gate

If you want a custom pass-rate threshold instead of `--fail-on-error`, write the JSON output and check the stats in a second command:

```yaml
phases:
  install:
    runtime-versions:
      nodejs: 20
    commands:
      - npm install -g promptfoo
  build:
    commands:
      - promptfoo eval -c promptfooconfig.yaml --share -o promptfoo-results.json
      - |
        PASS_RATE=$(jq '.results.stats.successes / (.results.stats.successes + .results.stats.failures) * 100' promptfoo-results.json)
        echo "Pass rate: ${PASS_RATE}%"
        if (( $(echo "${PASS_RATE} < 95" | bc -l) )); then
          echo "Quality gate failed: ${PASS_RATE}% < 95%"
          exit 1
        fi
```

## Run promptfoo code scans on CodeCommit pull requests

Promptfoo's hosted GitHub Action posts inline review comments on GitHub pull requests, but CodeCommit pull requests are not a first-class target in `promptfoo code-scans run` today.

For CodeCommit, run the scanner in CodeBuild, save JSON output, and post a summary comment back to the pull request with the AWS CLI.

### 1. Pass pull request context into CodeBuild

Trigger your CodeBuild project from a CodeCommit pull request event and provide the pull request ID as an environment variable such as `CODECOMMIT_PULL_REQUEST_ID`.

CodeBuild exposes source metadata in environment variables including `CODEBUILD_SOURCE_REPO_URL`, `CODEBUILD_SOURCE_VERSION`, and `CODEBUILD_RESOLVED_SOURCE_VERSION`. For CodeCommit sources, `CODEBUILD_SOURCE_VERSION` is the commit ID or branch name and `CODEBUILD_RESOLVED_SOURCE_VERSION` is the commit ID after `DOWNLOAD_SOURCE`.

### 2. Add a pull request scan buildspec

```yaml title="buildspec-code-scan.yml"
version: 0.2

env:
  parameter-store:
    PROMPTFOO_API_KEY: /promptfoo/api-key

phases:
  install:
    runtime-versions:
      nodejs: 20
    commands:
      - npm install -g promptfoo
      - apt-get update && apt-get install -y jq
  build:
    commands:
      - |
        if [ -z "$CODECOMMIT_PULL_REQUEST_ID" ]; then
          echo "CODECOMMIT_PULL_REQUEST_ID is required for pull request scans"
          exit 1
        fi

        PR_JSON=$(aws codecommit get-pull-request \
          --pull-request-id "$CODECOMMIT_PULL_REQUEST_ID")

        REPOSITORY_NAME=$(echo "$PR_JSON" | jq -r '.pullRequest.pullRequestTargets[0].repositoryName')
        DESTINATION_REF=$(echo "$PR_JSON" | jq -r '.pullRequest.pullRequestTargets[0].destinationReference')
        SOURCE_COMMIT=$(echo "$PR_JSON" | jq -r '.pullRequest.pullRequestTargets[0].sourceCommit')
        DESTINATION_COMMIT=$(echo "$PR_JSON" | jq -r '.pullRequest.pullRequestTargets[0].destinationCommit')
        DESTINATION_BRANCH="${DESTINATION_REF#refs/heads/}"

        git fetch origin "${DESTINATION_BRANCH}:${DESTINATION_BRANCH}"

        promptfoo code-scans run . \
          --base "$DESTINATION_BRANCH" \
          --compare "$CODEBUILD_RESOLVED_SOURCE_VERSION" \
          --json \
          > promptfoo-code-scan.json

        COMMENT_BODY=$(jq -r '
          def sev(c): if c.severity then "\(.severity | ascii_upcase): " else "" end;
          [
            "## Promptfoo Code Scan",
            "",
            (.review // "Scan complete."),
            "",
            "### Findings",
            (
              if (.comments | length) == 0 then
                "- No findings"
              else
                (.comments[:20] | map(
                  "- " + sev(.) +
                  (if .file then "`\(.file)\(if .line then ":\(.line)" else "" end)` - " else "" end) +
                  .finding
                ) | .[])
              end
            ),
            "",
            "[View code scanning docs](https://www.promptfoo.dev/docs/code-scanning/cli/)"
          ] | join("\n")
        ' promptfoo-code-scan.json)

        aws codecommit post-comment-for-pull-request \
          --pull-request-id "$CODECOMMIT_PULL_REQUEST_ID" \
          --repository-name "$REPOSITORY_NAME" \
          --before-commit-id "$DESTINATION_COMMIT" \
          --after-commit-id "$SOURCE_COMMIT" \
          --content "$COMMENT_BODY"

artifacts:
  files:
    - promptfoo-code-scan.json
```

This posts one general pull request comment with the scan summary and up to 20 findings. `PostCommentForPullRequest` also supports file-level locations, but promptfoo's scanner output is currently tuned for GitHub review semantics, so a summary comment is the simplest integration path for CodeCommit.

## IAM permissions

The CodeBuild service role needs access to your repository, your secret store, and any CodeCommit pull request APIs you use.

For eval-only builds:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": ["ssm:GetParameters"],
      "Resource": "arn:aws:ssm:REGION:ACCOUNT_ID:parameter/promptfoo/*"
    }
  ]
}
```

For pull request scan comments, add CodeCommit permissions:

```json
{
  "Effect": "Allow",
  "Action": ["codecommit:GetPullRequest", "codecommit:PostCommentForPullRequest"],
  "Resource": "arn:aws:codecommit:REGION:ACCOUNT_ID:REPOSITORY_NAME"
}
```

## Troubleshooting

### `promptfoo code-scans run` fails with an auth error

`promptfoo code-scans run` requires a Promptfoo API key outside of the GitHub Action flow. Store `PROMPTFOO_API_KEY` in Parameter Store or Secrets Manager and expose it to CodeBuild.

### The scan compares against the wrong branch

Fetch the destination branch before running `promptfoo code-scans run`, then pass `--base` explicitly. For CodeCommit pull requests, you can read the destination branch from `aws codecommit get-pull-request`.

### No pull request comment appears

Confirm `CODECOMMIT_PULL_REQUEST_ID` is present in the build environment, and verify the CodeBuild service role can call `codecommit:GetPullRequest` and `codecommit:PostCommentForPullRequest`.

### Secrets appear in logs

Prefer Parameter Store or Secrets Manager mappings in `buildspec.yml` instead of plain environment variables for provider API keys.

## See Also

- [CI/CD Integration](/docs/integrations/ci-cd)
- [CLI Command](/docs/code-scanning/cli)
- [Sharing and Collaboration](/docs/usage/sharing)
