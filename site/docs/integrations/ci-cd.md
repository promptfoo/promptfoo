---
sidebar_label: CI/CD
title: CI/CD Integration for LLM Eval and Security
description: Integrate promptfoo into CI/CD pipelines for automated prompt eval, security scanning, and quality assurance
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

Integrate promptfoo into your CI/CD pipelines to automatically evaluate prompts, test for security vulnerabilities, and ensure quality before deployment. This guide covers modern CI/CD workflows for both quality testing and security scanning.

## Why CI/CD for LLM Apps?

- **Catch regressions early** - Test prompt changes before they reach production
- **Security scanning** - Automated red teaming and vulnerability detection
- **Quality gates** - Enforce minimum performance thresholds
- **Compliance** - Generate reports for OWASP, NIST, and other frameworks
- **Cost control** - Track token usage and API costs over time

## Quick Start

If you're using GitHub Actions, check out our [dedicated GitHub Actions guide](/docs/integrations/github-action) or the [GitHub Marketplace action](https://github.com/marketplace/actions/test-llm-outputs).

For other platforms, here's a basic example:

```bash
# Run eval (no global install required)
npx promptfoo@latest eval -c promptfooconfig.yaml -o results.json

# Run security scan (red teaming)
npx promptfoo@latest redteam run
```

## Prerequisites

- Node.js 18+ installed in your CI environment
- LLM provider API keys (stored as secure environment variables)
- A promptfoo configuration file (`promptfooconfig.yaml`)
- (Optional) Docker for containerized environments

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

### 2. Output Formats

Promptfoo supports multiple output formats for different CI/CD needs:

```bash
# JSON for programmatic processing
npx promptfoo@latest eval -o results.json

# HTML for human-readable reports
npx promptfoo@latest eval -o report.html

# XML for enterprise tools
npx promptfoo@latest eval -o results.xml

# Multiple formats
npx promptfoo@latest eval -o results.json -o report.html
```

Learn more about [output formats and processing](/docs/configuration/outputs).

:::info Enterprise Feature

SonarQube integration is available in [Promptfoo Enterprise](/docs/enterprise/). Use the standard JSON output format and process it for SonarQube import.

:::

### 3. Quality Gates

Fail the build when quality thresholds aren't met:

```bash
# Fail on any test failures
npx promptfoo@latest eval --fail-on-error

# Custom threshold checking
npx promptfoo@latest eval -o results.json
PASS_RATE=$(jq '.results.stats.successes / (.results.stats.successes + .results.stats.failures) * 100' results.json)
if (( $(echo "$PASS_RATE < 95" | bc -l) )); then
  echo "Quality gate failed: Pass rate ${PASS_RATE}% < 95%"
  exit 1
fi
```

See [assertions and metrics](/docs/configuration/expected-outputs) for comprehensive validation options.

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
          node-version: '22'
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
            --share \
            -o results.json \
            -o report.html

      - name: Check quality gate
        run: |
          FAILURES=$(jq '.results.stats.failures' results.json)
          if [ "$FAILURES" -gt 0 ]; then
            echo "❌ Eval failed with $FAILURES failures"
            exit 1
          fi
          echo "✅ All tests passed!"

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

      - name: Run red team scan
        uses: promptfoo/promptfoo-action@v1
        with:
          type: 'redteam'
          config: 'promptfooconfig.yaml'
          openai-api-key: ${{ secrets.OPENAI_API_KEY }}
          github-token: ${{ secrets.GITHUB_TOKEN }}
```

See also: [Standalone GitHub Action example](https://github.com/promptfoo/promptfoo/tree/main/examples/github-action).

### GitLab CI

See our [detailed GitLab CI guide](/docs/integrations/gitlab-ci).

```yaml title=".gitlab-ci.yml"
image: node:20

evaluate:
  script:
    - |
      npx promptfoo@latest eval \
        -c promptfooconfig.yaml \
        --share \
        -o output.json
  variables:
    OPENAI_API_KEY: ${OPENAI_API_KEY}
    PROMPTFOO_CACHE_PATH: .cache/promptfoo
  cache:
    key: ${CI_COMMIT_REF_SLUG}-promptfoo
    paths:
      - .cache/promptfoo
  artifacts:
    reports:
      junit: output.xml
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
                        --share \
                        -o results.json
                '''
            }
        }

        stage('Quality Gate') {
            steps {
                script {
                    def results = readJSON file: 'results.json'
                    def failures = results.results.stats.failures
                    if (failures > 0) {
                        error("Eval failed with ${failures} failures")
                    }
                }
            }
        }
    }
}
```

### Other Platforms

- [Azure Pipelines](/docs/integrations/azure-pipelines)
- [CircleCI](/docs/integrations/circle-ci)
- [Bitbucket Pipelines](/docs/integrations/bitbucket-pipelines)
- [Travis CI](/docs/integrations/travis-ci)
- [n8n workflows](/docs/integrations/n8n)
- [Looper](/docs/integrations/looper)

## Advanced Patterns

### 1. Docker-based CI/CD

Create a custom Docker image with promptfoo pre-installed:

```dockerfile title="Dockerfile"
FROM node:20-slim
WORKDIR /app
COPY . .
CMD ["npx", "promptfoo@latest", "eval"]
```

### 2. Parallel Testing

Test multiple models or configurations in parallel:

```yaml
# GitHub Actions example
strategy:
  matrix:
    model: [gpt-4, gpt-3.5-turbo, claude-3-opus]
steps:
  - name: Test ${{ matrix.model }}
    run: |
      npx promptfoo@latest eval \
        --providers.0.config.model=${{ matrix.model }} \
        -o results-${{ matrix.model }}.json
```

### 3. Scheduled Security Scans

Run comprehensive security scans on a schedule:

```yaml
# GitHub Actions
on:
  schedule:
    - cron: '0 2 * * *' # 2 AM daily

jobs:
  security-scan:
    runs-on: ubuntu-latest
    steps:
      - name: Full red team scan
        run: |
          npx promptfoo@latest redteam generate \
            --plugins harmful,pii,contracts \
            --strategies jailbreak,prompt-injection
          npx promptfoo@latest redteam run
```

### 4. SonarQube Integration

:::info Enterprise Feature

Direct SonarQube output format is available in [Promptfoo Enterprise](/docs/enterprise/). For open-source users, export to JSON and transform the results.

:::

For enterprise environments, integrate with SonarQube:

```yaml
# Export results for SonarQube processing
- name: Run promptfoo security scan
  run: |
    npx promptfoo@latest eval \
      --config promptfooconfig.yaml \
      -o results.json

# Transform results for SonarQube (custom script required)
- name: Transform for SonarQube
  run: |
    node transform-to-sonarqube.js results.json > sonar-report.json

- name: SonarQube scan
  env:
    SONAR_TOKEN: ${{ secrets.SONAR_TOKEN }}
  run: |
    sonar-scanner \
      -Dsonar.externalIssuesReportPaths=sonar-report.json
```

See our [SonarQube integration guide](/docs/integrations/sonarqube) for detailed setup.

## Processing Results

### Parsing JSON Output

The output JSON follows this schema:

```typescript
interface OutputFile {
  evalId?: string;
  results: {
    stats: {
      successes: number;
      failures: number;
      errors: number;
    };
    outputs: Array<{
      pass: boolean;
      score: number;
      error?: string;
      // ... other fields
    }>;
  };
  config: UnifiedConfig;
  shareableUrl: string | null;
}
```

Example processing script:

```javascript title="process-results.js"
const fs = require('fs');
const results = JSON.parse(fs.readFileSync('results.json', 'utf8'));

// Calculate metrics
const passRate =
  (results.results.stats.successes /
    (results.results.stats.successes + results.results.stats.failures)) *
  100;

console.log(`Pass rate: ${passRate.toFixed(2)}%`);
console.log(`Shareable URL: ${results.shareableUrl}`);

// Check for specific failures
const criticalFailures = results.results.outputs.filter(
  (o) => o.error?.includes('security') || o.error?.includes('injection'),
);

if (criticalFailures.length > 0) {
  console.error('Critical security failures detected!');
  process.exit(1);
}
```

### Posting Results

Post eval results to PR comments, Slack, or other channels:

```bash
# Extract and post results
SHARE_URL=$(jq -r '.shareableUrl' results.json)
PASS_RATE=$(jq '.results.stats.successes / (.results.stats.successes + .results.stats.failures) * 100' results.json)

# Post to GitHub PR
gh pr comment --body "
## Promptfoo Eval Results
- Pass rate: ${PASS_RATE}%
- [View detailed results](${SHARE_URL})
"
```

## Caching Strategies

Optimize CI/CD performance with proper caching [[memory:3455374]]:

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

1. **API Key Management**
   - Store API keys as encrypted secrets
   - Use least-privilege access controls
   - Rotate keys regularly

2. **Network Security**
   - Use private runners for sensitive data
   - Restrict outbound network access
   - Consider on-premise deployments for enterprise

3. **Data Privacy**
   - Enable output stripping for sensitive data:

   ```bash
   export PROMPTFOO_STRIP_RESPONSE_OUTPUT=true
   export PROMPTFOO_STRIP_TEST_VARS=true
   ```

4. **Audit Logging**
   - Keep eval history
   - Track who triggered security scans
   - Monitor for anomalous patterns

## Troubleshooting

### Common Issues

| Issue         | Solution                                         |
| ------------- | ------------------------------------------------ |
| Rate limits   | Enable caching, reduce concurrency with `-j 1`   |
| Timeouts      | Increase timeout values, use `--max-concurrency` |
| Memory issues | Use streaming mode, process results in batches   |
| Cache misses  | Check cache key includes all relevant files      |

### Debug Mode

Enable detailed logging:

```bash
LOG_LEVEL=debug npx promptfoo@latest eval -c config.yaml
```

## Real-World Examples

### Automated Testing Examples

- [Self-grading example](https://github.com/promptfoo/promptfoo/tree/main/examples/self-grading) - Automated LLM evaluation
- [Custom grading prompts](https://github.com/promptfoo/promptfoo/tree/main/examples/custom-grading-prompt) - Complex evaluation logic
- [Store and reuse outputs](https://github.com/promptfoo/promptfoo/tree/main/examples/store-and-reuse-outputs) - Multi-step testing

### Security Examples

- [Red team starter](https://github.com/promptfoo/promptfoo/tree/main/examples/redteam-starter) - Basic security testing
- [RAG poisoning tests](https://github.com/promptfoo/promptfoo/tree/main/examples/rag-poisoning) - Document poisoning detection
- [DoNotAnswer dataset](https://github.com/promptfoo/promptfoo/tree/main/examples/donotanswer) - Harmful content detection

### Integration Examples

- [GitHub Action standalone](https://github.com/promptfoo/promptfoo/tree/main/examples/github-action) - Custom GitHub workflows
- [JSON output processing](https://github.com/promptfoo/promptfoo/tree/main/examples/json-output) - Result parsing patterns
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
