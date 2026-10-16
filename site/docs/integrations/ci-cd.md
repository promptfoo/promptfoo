---
sidebar_label: CI/CD
title: CI/CD Integration for LLM Eval and Security
description: Automate LLM testing in CI/CD pipelines with GitHub Actions, GitLab CI, and Jenkins for continuous security and quality checks
keywords:
  [
    ci/cd,
    continuous integration,
    llm testing,
    automated evaluation,
    security scanning,
    github actions,
  ]
---

# CI/CD Integration for LLM Evaluation and Security

Run a saved Promptfoo configuration in CI, fail the job when results miss your threshold, and retain the report for review. The examples below assume the config and its prompt and test files are committed to your repository.

## Why CI/CD for LLM Apps?

Use CI to check known examples after changes to prompts, models, or application code. Use scheduled red team runs to explore additional failure modes. Keep the test configuration and report with each run so a changed score can be traced to a changed input, grader, or target.

## Prerequisites

- Node.js `>=22.22.0` installed in your CI environment (Node.js 24 LTS recommended)
- LLM provider API keys (stored as secure environment variables)
- A promptfoo configuration file (`promptfooconfig.yaml`)

## Quick Start

If you're using GitHub Actions, check out our [dedicated GitHub Actions guide](/docs/integrations/github-action) or the [GitHub Marketplace action](https://github.com/marketplace/actions/test-llm-outputs).

For other platforms, here's a basic example:

```bash
# Run eval (no global install required)
npx promptfoo@latest eval -c promptfooconfig.yaml -o results.json

# Run security scan (red teaming)
npx promptfoo@latest redteam run
```

## Core Concepts

### 1. Eval vs Red Teaming

Promptfoo supports two main CI/CD workflows:

**Eval** - Test prompt quality and performance:

```bash
npx promptfoo@latest eval -c promptfooconfig.yaml
```

**Red Teaming** - Security vulnerability scanning:

```bash
npx promptfoo@latest redteam run
```

See our [red team quickstart](/docs/red-team/quickstart) for security testing details.

#### Attach CI/CD Context with Tags

Use repeatable `--tag key=value` flags to attach pipeline context to an evaluation
without modifying `promptfooconfig.yaml` or a red team scan template. Tags are saved
with the eval and included when results are shared.

```bash
npx promptfoo@latest eval --tag ci.run-id="$CI_PIPELINE_ID" --tag git.sha="$CI_COMMIT_SHA"
npx promptfoo@latest redteam run --tag ci.run-id="$CI_PIPELINE_ID" --tag git.sha="$CI_COMMIT_SHA"
```

`promptfoo redteam eval` accepts the same `--tag` option when running previously
generated probes from `redteam.yaml`.

### 2. Output Formats

Promptfoo supports multiple output formats for different CI/CD needs:

```bash
# JSON for programmatic processing
npx promptfoo@latest eval -o results.json

# HTML for human-readable reports
npx promptfoo@latest eval -o report.html

# JUnit XML for native CI test-report viewers
npx promptfoo@latest eval -o results.junit.xml

# Multiple formats
npx promptfoo@latest eval -o results.json -o report.html -o results.junit.xml
```

Learn more about [output formats and processing](/docs/configuration/outputs).

### 3. Quality Gates

By default, `promptfoo eval` exits with code `100` when the pass rate is below 100%. An assertion failure or execution error lowers the pass rate. Other failures, such as an invalid config, can return a different nonzero code. Let the CI runner fail on a nonzero exit:

```bash
npx promptfoo@latest eval -c promptfooconfig.yaml --no-cache -o results.json
```

To allow some assertion failures, set `PROMPTFOO_PASS_RATE_THRESHOLD` to a percentage. Check errors separately if execution failures must always block the job:

```bash
PROMPTFOO_PASS_RATE_THRESHOLD=95 npx promptfoo@latest eval -o results.json
jq -e '.results.stats.errors == 0' results.json
```

The pass rate is `successes / (successes + failures + errors)`. Inspect the failed rows before changing the threshold. See [assertions and metrics](/docs/configuration/expected-outputs) to configure the checks themselves.

## Platform-Specific Guides

### GitHub Actions

```yaml title=".github/workflows/eval.yml"
name: LLM Eval
on:
  pull_request:
    paths:
      - 'prompts/**'
      - 'promptfooconfig.yaml'

jobs:
  evaluate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: '24'
          cache: 'npm'

      - name: Cache promptfoo
        uses: actions/cache@v4
        with:
          path: ~/.cache/promptfoo
          key: ${{ runner.os }}-promptfoo-${{ hashFiles('prompts/**') }}
          restore-keys: |
            ${{ runner.os }}-promptfoo-

      - name: Run eval
        env:
          OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}
          PROMPTFOO_CACHE_PATH: ~/.cache/promptfoo
        run: |
          npx promptfoo@latest eval \
            -c promptfooconfig.yaml \
            -o results.json \
            -o report.html

      - name: Upload results
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: eval-results
          path: |
            results.json
            report.html
```

For red teaming in CI/CD:

```yaml title=".github/workflows/redteam.yml"
name: Security Scan
on:
  schedule:
    - cron: '0 0 * * *' # Daily
  workflow_dispatch:

jobs:
  red-team:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Set up Node.js
        uses: actions/setup-node@48b55a011bda9f5d6aeb4c2d9c7362e8dae4041e # v6
        with:
          node-version: '24'

      - name: Run red team scan
        uses: promptfoo/promptfoo-action@v1
        with:
          type: 'redteam'
          config: 'promptfooconfig.yaml'
          openai-api-key: ${{ secrets.OPENAI_API_KEY }}
          github-token: ${{ secrets.GITHUB_TOKEN }}
```

See also: [Standalone GitHub Action example](https://github.com/promptfoo/promptfoo/tree/main/examples/integration-github-action).

### GitLab CI

See our [detailed GitLab CI guide](/docs/integrations/gitlab-ci).

```yaml title=".gitlab-ci.yml"
image: node:24

evaluate:
  script:
    - |
      npx promptfoo@latest eval \
        -c promptfooconfig.yaml \
        -o output.json \
        -o report.html \
        -o output.junit.xml
  variables:
    OPENAI_API_KEY: ${OPENAI_API_KEY}
    PROMPTFOO_CACHE_PATH: .cache/promptfoo
  cache:
    key: ${CI_COMMIT_REF_SLUG}-promptfoo
    paths:
      - .cache/promptfoo
  artifacts:
    when: always
    reports:
      junit: output.junit.xml
    paths:
      - output.json
      - report.html
```

### Jenkins

See our [detailed Jenkins guide](/docs/integrations/jenkins).

```groovy title="Jenkinsfile"
pipeline {
    agent any

    environment {
        OPENAI_API_KEY = credentials('openai-api-key')
        PROMPTFOO_CACHE_PATH = "${WORKSPACE}/.cache/promptfoo"
    }

    stages {
        stage('Evaluate') {
            steps {
                sh '''
                    npx promptfoo@latest eval \
                        -c promptfooconfig.yaml \
                        -o results.json
                '''
            }
        }
    }

    post {
        always {
            archiveArtifacts artifacts: 'results.json', allowEmptyArchive: true
        }
    }
}
```

### Other Platforms

- [Azure Pipelines](/docs/integrations/azure-pipelines)
- [AWS CodeCommit](/docs/integrations/aws-codecommit)
- [CircleCI](/docs/integrations/circle-ci)
- [Bitbucket Pipelines](/docs/integrations/bitbucket-pipelines)
- [Travis CI](/docs/integrations/travis-ci)
- [n8n workflows](/docs/integrations/n8n)
- [Looper](/docs/integrations/looper)

## Advanced Patterns

### 1. Docker-based CI/CD

This image runs Promptfoo through `npx` when the container starts:

```dockerfile title="Dockerfile"
FROM node:24-slim
WORKDIR /app
COPY . .
CMD ["npx", "promptfoo@latest", "eval"]
```

### 2. Parallel Testing

Test multiple models in parallel by overriding the provider ID. Configure credentials for each provider in your workflow:

```yaml
# GitHub Actions example
strategy:
  matrix:
    include:
      - name: gpt-6-sol
        provider: openai:gpt-6-sol
      - name: claude-opus-5-5
        provider: anthropic:messages:claude-opus-5-5
      - name: gemini-3.1-pro-preview
        provider: google:gemini-3.1-pro-preview
steps:
  - name: Test ${{ matrix.name }}
    run: |
      npx promptfoo@latest eval \
        --providers "${{ matrix.provider }}" \
        -o "results-${{ matrix.name }}.json"
```

### 3. Scheduled Security Scans

After configuring a working red team target, run it on a schedule using the [GitHub Actions example above](#github-actions). Set the plugins, strategies, and test counts in `promptfooconfig.yaml` so the scope is recorded in version control.

### 4. SonarQube Integration

See the [SonarQube integration guide](/docs/integrations/sonarqube) for deployment requirements and the issue-import workflow. A standard Promptfoo JSON export is not itself a SonarQube issue report.

## Processing Results

### Parsing JSON Output

The [output reference](/docs/configuration/outputs#structured-output-fields) describes the export envelope. Summary counts are in `results.stats`, and individual results are in `results.results`.

This script reports the pass rate and fails if there are execution errors, no results, or fewer than 95% passing results:

<!-- prettier-ignore -->
```javascript title="process-results.cjs"
const fs = require('node:fs')
const output = JSON.parse(fs.readFileSync('results.json', 'utf8'))
const { successes, failures, errors } = output.results.stats
const total = successes + failures + errors
const passRate = total > 0 ? (successes / total) * 100 : 0

console.log(`Pass rate: ${passRate.toFixed(2)}%`)
console.log(`Assertion failures: ${failures}, execution errors: ${errors}`)
process.exitCode = errors > 0 || total === 0 || passRate < 95 ? 1 : 0
```

Do not infer vulnerability severity from words in an error message. Inspect a failed test's grading result and red team metadata when reviewing a security finding.

### Posting Results

Publish the HTML or JSON report as a CI artifact, including on failed jobs. If you choose to upload results with `--share`, configure [sharing and access](/docs/usage/sharing) first, then read the returned URL from `shareableUrl`. It is `null` when no shared URL is available.

## Caching Strategies

<!-- prettier-ignore -->
Optimize CI/CD performance with proper caching:

```yaml
# Set cache location
env:
  PROMPTFOO_CACHE_PATH: ~/.cache/promptfoo
  PROMPTFOO_CACHE_TTL: 86400 # 24 hours

# Cache configuration
cache:
  key: promptfoo-${{ hashFiles('prompts/**', 'promptfooconfig.yaml') }}
  paths:
    - ~/.cache/promptfoo
```

## Security Best Practices

Store provider credentials in your CI platform's secret store and pass them as environment variables. A runner must be able to reach the target and any generation or grading services used by the config.

Reports can contain prompts, test data, and model responses. Restrict access to the artifacts accordingly. To omit response outputs and test variables from exports and sharing, set these flags:

```bash
export PROMPTFOO_STRIP_RESPONSE_OUTPUT=true
export PROMPTFOO_STRIP_TEST_VARS=true
```

Review the exported file before distributing it. These flags do not prevent the configured providers from receiving the inputs needed to run the test.

## Troubleshooting

### Common Issues

| Symptom                                     | Check or next action                                                               |
| ------------------------------------------- | ---------------------------------------------------------------------------------- |
| Provider returns rate-limit errors          | Reduce concurrency with `--max-concurrency 1` and review the provider's limits     |
| Target requests time out                    | Check target connectivity and the provider's timeout settings                      |
| JSON export exceeds memory or string limits | Export individual rows with `-o results.jsonl`                                     |
| Expected cache entries are missing          | Confirm the CI cache restored the directory configured by `PROMPTFOO_CACHE_PATH`   |
| A job passes despite some failed tests      | Check `PROMPTFOO_PASS_RATE_THRESHOLD` and whether the runner ignores nonzero exits |

### Debug Mode

Enable detailed logging:

```bash
LOG_LEVEL=debug npx promptfoo@latest eval -c config.yaml
```

## Real-World Examples

### Automated Testing Examples

- [Self-grading example](https://github.com/promptfoo/promptfoo/tree/main/examples/eval-self-grading) - Automated LLM evaluation
- [Custom grading prompts](https://github.com/promptfoo/promptfoo/tree/main/examples/eval-custom-grading-prompt) - Complex evaluation logic
- [Store and reuse outputs](https://github.com/promptfoo/promptfoo/tree/main/examples/config-store-and-reuse-outputs) - Multi-step testing

### Security Examples

- [Red team starter](https://github.com/promptfoo/promptfoo/tree/main/examples/redteam-starter) - Basic security testing
- [RAG red team tests](https://github.com/promptfoo/promptfoo/tree/main/examples/redteam-rag) - Customer service red team testing (RBAC, competitors, harmful content)
- [DoNotAnswer dataset](https://github.com/promptfoo/promptfoo/tree/main/examples/redteam-donotanswer) - Harmful content detection

### Integration Examples

- [GitHub Action standalone](https://github.com/promptfoo/promptfoo/tree/main/examples/integration-github-action) - Custom GitHub workflows
- [JSON output processing](https://github.com/promptfoo/promptfoo/tree/main/examples/eval-json-output) - Result parsing patterns
- [CSV test data](https://github.com/promptfoo/promptfoo/tree/main/examples/simple-test) - Bulk test management

## Related Documentation

### Configuration & Testing

- [Configuration Guide](/docs/configuration/guide) - Complete setup instructions
- [Test Cases](/docs/configuration/test-cases) - Writing effective tests
- [Assertions & Metrics](/docs/configuration/expected-outputs) - Validation strategies
- [Python Assertions](/docs/configuration/expected-outputs/python) - Custom Python validators
- [JavaScript Assertions](/docs/configuration/expected-outputs/javascript) - Custom JS validators

### Security & Red Teaming

- [Red Team Architecture](/docs/red-team/architecture) - Security testing framework
- [OWASP Top 10 for LLMs](/docs/red-team/owasp-llm-top-10) - Security compliance
- [RAG Security Testing](/docs/red-team/rag) - Testing retrieval systems
- [MCP Security Testing](/docs/red-team/mcp-security-testing) - Model Context Protocol security

### Enterprise & Scaling

- [Enterprise Features](/docs/enterprise/) - Team collaboration and compliance
- [Red Teams in Enterprise](/docs/enterprise/red-teams) - Organization-wide security
- [Service Accounts](/docs/enterprise/service-accounts) - Automated access

## See Also

- [GitHub Actions Integration](/docs/integrations/github-action)
- [Red Team Quickstart](/docs/red-team/quickstart)
- [Enterprise Features](/docs/enterprise/)
- [Configuration Reference](/docs/configuration/reference)
