---
sidebar_label: CI/CD
description: Integrate ModelAudit into GitHub Actions, GitLab CI, Jenkins, and CircleCI pipelines for automated ML model security scanning with SARIF output and deployment gates
keywords:
  [
    modelaudit ci cd,
    github actions model scanning,
    gitlab ci model security,
    jenkins model scanning,
    circleci model security,
    automated model scanning,
    sarif integration,
    model security automation,
    production deployment gates,
    scheduled security scans,
    strict mode validation,
    exit codes,
    security pipeline integration,
    github code scanning,
    model scan workflow,
    continuous security,
    ml security automation,
    automated vulnerability scanning,
  ]
---

# CI/CD Integration

ModelAudit integrates into CI/CD pipelines to automatically scan ML model files for security vulnerabilities before deployment.

## Exit Codes

ModelAudit uses specific exit codes for CI/CD automation:

- **0**: No security issues found ✅
- **1**: Security issues detected (warnings or critical findings) 🟡
- **2**: Scan errors (file access, installation, timeouts) 🔴

In CI/CD pipelines, exit code 1 indicates findings that should be reviewed. Only exit code 2 represents actual scan failures.

## GitHub Actions

### Scan Changed Model Files

Scan model files modified in pull requests:

```yaml
name: Model Security Scan

on:
  pull_request:
    types: [opened, synchronize, reopened]

jobs:
  scan-models:
    runs-on: ubuntu-latest

    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'

      - name: Setup Python
        uses: actions/setup-python@v5
        with:
          python-version: '3.11'

      - name: Install Promptfoo and ModelAudit
        run: |
          npm install -g promptfoo
          pip install modelaudit

      - name: Get changed model files
        id: changed-files
        run: |
          CHANGED=$(git diff --name-only --diff-filter=ACM \
            ${{ github.event.pull_request.base.sha }} ${{ github.sha }} | \
            grep -E '\.(pkl|pickle|pth|pt|h5|hdf5|onnx|pb|tflite|safetensors|gguf|bin|keras)$' || true)

          if [ -z "$CHANGED" ]; then
            echo "has_changes=false" >> $GITHUB_OUTPUT
          else
            echo "$CHANGED"
            echo "has_changes=true" >> $GITHUB_OUTPUT
            echo "$CHANGED" > changed_files.txt
          fi

      - name: Scan changed models
        if: steps.changed-files.outputs.has_changes == 'true'
        run: |
          mkdir -p scan_results
          while IFS= read -r file; do
            if [ -f "$file" ]; then
              echo "Scanning: $file"
              promptfoo scan-model "$file" \
                --format json \
                --output "scan_results/$(basename "$file").json" || true
            fi
          done < changed_files.txt

      - name: Upload scan results
        if: steps.changed-files.outputs.has_changes == 'true'
        uses: actions/upload-artifact@v4
        with:
          name: model-scan-results
          path: scan_results/

      - name: Check for critical issues
        if: steps.changed-files.outputs.has_changes == 'true'
        run: |
          CRITICAL_COUNT=$(jq -s '[.[] | select(.has_errors == true)] | length' scan_results/*.json)
          WARNING_COUNT=$(jq -s '[.[] | select(.issues | any(.severity == "warning"))] | length' scan_results/*.json)

          if [ "$CRITICAL_COUNT" -gt 0 ]; then
            echo "❌ Found critical security issues in $CRITICAL_COUNT file(s)"
            exit 1
          elif [ "$WARNING_COUNT" -gt 0 ]; then
            echo "⚠️  Found warnings in $WARNING_COUNT file(s)"
            exit 0
          else
            echo "✅ No security issues detected"
          fi
```

### Upload to GitHub Advanced Security

Use SARIF format to integrate with GitHub Code Scanning:

```yaml
name: Model Security Scan with SARIF

on:
  push:
    branches: [main]
    paths:
      - '**/*.pkl'
      - '**/*.pth'
      - '**/*.h5'
      - '**/*.onnx'
  pull_request:
    branches: [main]

jobs:
  scan-models:
    runs-on: ubuntu-latest
    permissions:
      security-events: write
      contents: read

    steps:
      - uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'

      - name: Setup Python
        uses: actions/setup-python@v5
        with:
          python-version: '3.11'

      - name: Install tools
        run: |
          npm install -g promptfoo
          pip install modelaudit

      - name: Scan models directory
        run: |
          promptfoo scan-model models/ \
            --format sarif \
            --output modelaudit.sarif

      - name: Upload SARIF to GitHub
        uses: github/codeql-action/upload-sarif@v3
        with:
          sarif_file: modelaudit.sarif
          category: model-security
```

### Scheduled Security Scans

Run periodic scans on all models:

```yaml
name: Weekly Model Security Audit

on:
  schedule:
    - cron: '0 2 * * 0' # Sundays at 2 AM UTC
  workflow_dispatch:

jobs:
  comprehensive-scan:
    runs-on: ubuntu-latest

    steps:
      - uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'

      - name: Setup Python
        uses: actions/setup-python@v5
        with:
          python-version: '3.11'

      - name: Install tools
        run: |
          npm install -g promptfoo
          pip install modelaudit[all]

      - name: Comprehensive model scan
        run: |
          promptfoo scan-model models/ \
            --format json \
            --output scan_results.json \
            --strict \
            --sbom sbom.json

      - name: Generate SBOM
        run: |
          echo "Software Bill of Materials generated: sbom.json"

      - name: Check for critical issues
        id: check-issues
        run: |
          HAS_ERRORS=$(jq -r '.has_errors // false' scan_results.json)
          if [ "$HAS_ERRORS" = "true" ]; then
            echo "critical=true" >> $GITHUB_OUTPUT
            exit 1
          fi

      - name: Create issue if critical found
        if: failure() && steps.check-issues.outputs.critical == 'true'
        uses: actions/github-script@v7
        with:
          script: |
            const fs = require('fs');
            const results = JSON.parse(fs.readFileSync('scan_results.json', 'utf8'));

            if (results.has_errors && results.issues) {
              const criticalIssues = results.issues
                .filter(i => i.severity === 'critical')
                .map(i => `- ${i.message}`)
                .join('\n');

              await github.rest.issues.create({
                owner: context.repo.owner,
                repo: context.repo.repo,
                title: '🚨 Critical Model Security Issues Detected',
                body: `Weekly security scan found critical issues:\n\n${criticalIssues}`,
                labels: ['security', 'critical', 'model-audit']
              });
            }

      - name: Upload artifacts
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: weekly-audit-results
          path: |
            scan_results.json
            sbom.json
```

### Strict Mode for Production

Block deployments on any security findings:

```yaml
name: Production Model Validation

on:
  push:
    branches: [main]
    paths:
      - 'models/production/**'

jobs:
  strict-validation:
    runs-on: ubuntu-latest

    steps:
      - uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'

      - name: Setup Python
        uses: actions/setup-python@v5
        with:
          python-version: '3.11'

      - name: Install tools
        run: |
          npm install -g promptfoo
          pip install modelaudit[all]

      - name: Strict security scan
        run: |
          promptfoo scan-model models/production/ \
            --strict \
            --format json \
            --output results.json

      - name: Verify no issues
        run: |
          # In strict mode, exit code 1 means issues found
          # This step fails if any warnings or critical issues exist
          if [ $? -ne 0 ]; then
            echo "❌ Security scan found issues - deployment blocked"
            exit 1
          fi
```

## GitLab CI

Example `.gitlab-ci.yml`:

```yaml
model-security-scan:
  stage: test
  image: node:20

  before_script:
    - apt-get update && apt-get install -y python3 python3-pip
    - npm install -g promptfoo
    - pip3 install modelaudit

  script:
    - |
      CHANGED=$(git diff --name-only --diff-filter=ACM $CI_COMMIT_BEFORE_SHA $CI_COMMIT_SHA | \
        grep -E '\.(pkl|pth|h5|onnx|pb|tflite|safetensors|gguf)$' || true)

      if [ -n "$CHANGED" ]; then
        echo "$CHANGED" | while read -r file; do
          if [ -f "$file" ]; then
            promptfoo scan-model "$file" --format json >> scan_results.json
          fi
        done
      else
        echo "No model files changed"
      fi

  artifacts:
    reports:
      junit: scan_results.json
    paths:
      - scan_results.json
    expire_in: 30 days

  only:
    - merge_requests
    - main
```

## Jenkins

Example Jenkinsfile:

```groovy
pipeline {
    agent any

    stages {
        stage('Setup') {
            steps {
                sh '''
                    npm install -g promptfoo
                    pip install modelaudit
                '''
            }
        }

        stage('Scan Models') {
            steps {
                script {
                    def changed = sh(
                        script: '''
                            git diff --name-only HEAD~1 HEAD | \
                            grep -E '\\.(pkl|pth|h5|onnx|pb|tflite|safetensors|gguf)$' || true
                        ''',
                        returnStdout: true
                    ).trim()

                    if (changed) {
                        changed.split('\n').each { file ->
                            sh """
                                promptfoo scan-model ${file} \
                                  --format json \
                                  --output scan_${file.replaceAll('/', '_')}.json
                            """
                        }

                        // Check for critical issues
                        def critical = sh(
                            script: '''
                                jq -s '[.[] | select(.has_errors == true)] | length' scan_*.json
                            ''',
                            returnStdout: true
                        ).trim().toInteger()

                        if (critical > 0) {
                            error("Found ${critical} model(s) with critical security issues")
                        }
                    }
                }
            }
        }
    }

    post {
        always {
            archiveArtifacts artifacts: 'scan_*.json', allowEmptyArchive: true
        }
    }
}
```

## CircleCI

Example `.circleci/config.yml`:

```yaml
version: 2.1

jobs:
  model-scan:
    docker:
      - image: cimg/node:20.0

    steps:
      - checkout

      - run:
          name: Install tools
          command: |
            npm install -g promptfoo
            pip install modelaudit

      - run:
          name: Scan changed models
          command: |
            CHANGED=$(git diff --name-only origin/main...HEAD | \
              grep -E '\.(pkl|pth|h5|onnx|pb|tflite|safetensors|gguf)$' || true)

            if [ -n "$CHANGED" ]; then
              echo "$CHANGED" | while read -r file; do
                if [ -f "$file" ]; then
                  promptfoo scan-model "$file" --format json >> scan_results.json
                fi
              done
            fi

      - store_artifacts:
          path: scan_results.json
          destination: model-scan-results

workflows:
  security:
    jobs:
      - model-scan:
          filters:
            branches:
              only:
                - main
                - develop
```

## Best Practices

### Scan Strategy

- **Pull Requests**: Scan only changed files for fast feedback
- **Main Branch**: Run comprehensive scans on merge
- **Scheduled Scans**: Weekly or daily full audits
- **Production Gate**: Use `--strict` mode to block deployments

### Performance

```yaml
# Cache dependencies
- name: Cache npm and pip
  uses: actions/cache@v3
  with:
    path: |
      ~/.npm
      ~/.cache/pip
    key: ${{ runner.os }}-deps-${{ hashFiles('**/package-lock.json', '**/requirements.txt') }}

# Parallel scanning
- name: Parallel scan
  run: |
    find models/ -name "*.pkl" -print0 | \
      xargs -0 -P 4 -I {} promptfoo scan-model {} --format json --output {}.json
```

### Security

- Store credentials as encrypted secrets
- Use read-only tokens when possible
- Rotate credentials regularly
- Audit access to scan results

### Timeout Configuration

For large models (8GB+):

```yaml
- name: Scan large model
  run: |
    promptfoo scan-model large_model.bin \
      --timeout 1800 \
      --verbose \
      --format json \
      --output results.json
```

### Retry Logic

```yaml
- name: Scan with retry
  uses: nick-fields/retry@v2
  with:
    timeout_minutes: 10
    max_attempts: 3
    command: promptfoo scan-model models/ --format json --output results.json
```

### Notifications

```yaml
- name: Notify on critical issues
  if: failure()
  uses: slackapi/slack-github-action@v1
  with:
    payload: |
      {
        "text": "🚨 Critical model security issues detected!",
        "blocks": [
          {
            "type": "section",
            "text": {
              "type": "mrkdwn",
              "text": "*Model Security Scan Failed*\nRepository: ${{ github.repository }}\n<${{ github.server_url }}/${{ github.repository }}/actions/runs/${{ github.run_id }}|View Details>"
            }
          }
        ]
      }
  env:
    SLACK_WEBHOOK_URL: ${{ secrets.SLACK_WEBHOOK }}
```

## Troubleshooting

### Verbose Output

```bash
promptfoo scan-model models/ --verbose
```

### File Size Limits

```bash
# Set maximum file size
promptfoo scan-model models/ --max-size 1GB
```

### Dry Run

```bash
# Preview scan without processing
promptfoo scan-model models/ --dry-run
```

## Next Steps

- [Scanner Reference](./scanners.md) - Security checks performed
- [Advanced Usage](./usage.md) - Cloud storage, authentication, remote sources
- [Overview](./index.md) - Getting started with ModelAudit
