---
sidebar_label: CI/CD
---

# CI/CD Integrations

Promptfoo Model Audit can be integrated into your CI/CD pipeline to automatically perform static scanning of ML models for security issues.

## GitHub Actions

### Basic Model Scanning

This example scans new or modified ML-related files:

```yaml
name: Model Security Audit - Changed Files

on:
  pull_request:
    types: [opened, synchronize, reopened]

jobs:
  model-audit-changed:
    runs-on: ubuntu-latest

    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0 # Fetch full history for comparison

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'

      - name: Install Promptfoo
        run: npm install -g promptfoo

      - name: Get changed ML files
        id: changed-files
        run: |
          # Get list of changed files between base and head
          CHANGED_FILES=$(git diff --name-only ${{ github.event.pull_request.base.sha }} ${{ github.sha }} | \
            grep -E '\.(pkl|pth|h5|onnx|pb|tflite|safetensors|gguf|bin|model|json|yaml|yml)$' | \
            grep -E '(model|weight|checkpoint|embed)' || true)

          if [ -z "$CHANGED_FILES" ]; then
            echo "No ML model files changed"
            echo "has_changes=false" >> $GITHUB_OUTPUT
          else
            echo "Changed ML files:"
            echo "$CHANGED_FILES"
            echo "has_changes=true" >> $GITHUB_OUTPUT
            echo "files=$CHANGED_FILES" >> $GITHUB_OUTPUT
          fi

      - name: Scan changed models
        if: steps.changed-files.outputs.has_changes == 'true'
        run: |
          # Scan each changed model file
          echo "${{ steps.changed-files.outputs.files }}" | while read -r file; do
            if [ -f "$file" ]; then
              echo "Scanning: $file"
              promptfoo scan-model "$file" --output json > "scan_$(basename $file).json"
            fi
          done

          # Combine results
          jq -s '.' scan_*.json > model_audit_results.json

      - name: Upload scan results
        if: steps.changed-files.outputs.has_changes == 'true'
        uses: actions/upload-artifact@v4
        with:
          name: model-audit-results
          path: model_audit_results.json

      - name: Comment PR with results
        if: steps.changed-files.outputs.has_changes == 'true' && github.event_name == 'pull_request'
        uses: actions/github-script@v7
        with:
          script: |
            const fs = require('fs');
            const results = JSON.parse(fs.readFileSync('model_audit_results.json', 'utf8'));

            let comment = '## 🔍 Model Security Audit Results\n\n';

            for (const scan of results) {
              if (scan.vulnerabilities && scan.vulnerabilities.length > 0) {
                comment += `### ⚠️ Issues found in ${scan.model}:\n`;
                scan.vulnerabilities.forEach(vuln => {
                  comment += `- **${vuln.severity}**: ${vuln.description}\n`;
                });
              } else {
                comment += `### ✅ No issues found in ${scan.model}\n`;
              }
              comment += '\n';
            }

            github.rest.issues.createComment({
              issue_number: context.issue.number,
              owner: context.repo.owner,
              repo: context.repo.repo,
              body: comment
            });
```

### Scheduled Security Scans

Run periodic security audits on your deployed models:

```yaml
name: Weekly Model Security Audit

on:
  schedule:
    # Run every Sunday at 2 AM UTC
    - cron: '0 2 * * 0'
  workflow_dispatch: # Allow manual triggers

jobs:
  scheduled-audit:
    runs-on: ubuntu-latest

    steps:
      - uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'

      - name: Install Promptfoo
        run: npm install -g promptfoo

      - name: Run comprehensive model audit
        run: |
          # Scan all models with detailed configuration
          promptfoo scan-model models/ \
            --scanners all \
            --threshold high \
            --output json > audit_results.json

      - name: Check for critical issues
        id: check-critical
        run: |
          CRITICAL_COUNT=$(jq '[.[] | .vulnerabilities[] | select(.severity == "critical")] | length' audit_results.json)
          echo "critical_count=$CRITICAL_COUNT" >> $GITHUB_OUTPUT

          if [ "$CRITICAL_COUNT" -gt 0 ]; then
            echo "Found $CRITICAL_COUNT critical vulnerabilities!"
            exit 1
          fi

      - name: Create issue if critical vulnerabilities found
        if: failure()
        uses: actions/github-script@v7
        with:
          script: |
            const fs = require('fs');
            const results = JSON.parse(fs.readFileSync('audit_results.json', 'utf8'));

            const criticalVulns = results.flatMap(scan => 
              (scan.vulnerabilities || [])
                .filter(v => v.severity === 'critical')
                .map(v => `- ${scan.model}: ${v.description}`)
            );

            await github.rest.issues.create({
              owner: context.repo.owner,
              repo: context.repo.repo,
              title: '🚨 Critical Model Security Vulnerabilities Detected',
              body: `The weekly security audit found critical vulnerabilities:\n\n${criticalVulns.join('\n')}`,
              labels: ['security', 'critical', 'model-audit']
            });
```

### Configuration with Custom Scanners

Use a configuration file to customize which scanners to run:

```yaml
name: Model Audit with Config

on:
  push:
    paths:
      - 'models/**'
      - 'embeddings/**'
      - '.github/workflows/model-audit.yml'
      - 'modelaudit.config.yaml'

jobs:
  custom-audit:
    runs-on: ubuntu-latest

    steps:
      - uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'

      - name: Install Promptfoo
        run: npm install -g promptfoo

      - name: Create audit configuration
        run: |
          cat > modelaudit.config.yaml << EOF
          scanners:
            - prompt-injection
            - pii-leakage
            - bias-detection
            - jailbreak
            - hallucination

          thresholds:
            critical: 0.9
            high: 0.7
            medium: 0.5
            low: 0.3

          models:
            - path: models/production/
              scanners:
                - all
            - path: models/experimental/
              scanners:
                - prompt-injection
                - jailbreak
          EOF

      - name: Run audit with configuration
        run: |
          promptfoo scan-model \
            --config modelaudit.config.yaml \
            --output json > results.json

      - name: Generate report
        run: |
          promptfoo scan-model \
            --config modelaudit.config.yaml \
            --output html > report.html

      - name: Upload HTML report
        uses: actions/upload-artifact@v4
        with:
          name: model-audit-report
          path: report.html
```

## GitLab CI

Example `.gitlab-ci.yml` configuration:

```yaml
model-security-audit:
  stage: test
  image: node:20

  before_script:
    - npm install -g promptfoo

  script:
    - |
      # Detect changed model files
      CHANGED_FILES=$(git diff --name-only $CI_COMMIT_BEFORE_SHA $CI_COMMIT_SHA | \
        grep -E '\.(pkl|pth|h5|onnx|pb|tflite|safetensors|gguf)$' || true)

      if [ -n "$CHANGED_FILES" ]; then
        echo "Scanning changed model files..."
        for file in $CHANGED_FILES; do
          if [ -f "$file" ]; then
            promptfoo scan-model "$file"
          fi
        done
      else
        echo "No model files changed"
      fi

  artifacts:
    reports:
      junit: model-audit-results.xml
    paths:
      - model-audit-results.json
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
                sh 'npm install -g promptfoo'
            }
        }

        stage('Model Security Audit') {
            steps {
                script {
                    def changedFiles = sh(
                        script: "git diff --name-only HEAD~1 HEAD | grep -E '\\.(pkl|pth|h5|onnx|pb|tflite|safetensors|gguf)\$' || true",
                        returnStdout: true
                    ).trim()

                    if (changedFiles) {
                        changedFiles.split('\n').each { file ->
                            sh "promptfoo scan-model ${file} --output json >> audit_results.json"
                        }

                        // Archive results
                        archiveArtifacts artifacts: 'audit_results.json', allowEmptyArchive: false

                        // Check for critical issues
                        def criticalCount = sh(
                            script: "jq '[.[] | .vulnerabilities[] | select(.severity == \"critical\")] | length' audit_results.json",
                            returnStdout: true
                        ).trim().toInteger()

                        if (criticalCount > 0) {
                            error("Found ${criticalCount} critical vulnerabilities in models")
                        }
                    } else {
                        echo "No model files changed"
                    }
                }
            }
        }
    }

    post {
        always {
            publishHTML target: [
                allowMissing: false,
                alwaysLinkToLastBuild: true,
                keepAll: true,
                reportDir: '.',
                reportFiles: 'model_audit_report.html',
                reportName: 'Model Security Audit Report'
            ]
        }
    }
}
```

## CircleCI

Example `.circleci/config.yml`:

```yaml
version: 2.1

jobs:
  model-audit:
    docker:
      - image: cimg/node:20.0

    steps:
      - checkout

      - run:
          name: Install Promptfoo
          command: npm install -g promptfoo

      - run:
          name: Detect and scan changed model files
          command: |
            # Get changed files
            CHANGED_FILES=$(git diff --name-only origin/main...HEAD | \
              grep -E '\.(pkl|pth|h5|onnx|pb|tflite|safetensors|gguf)$' || true)

            if [ -n "$CHANGED_FILES" ]; then
              for file in $CHANGED_FILES; do
                if [ -f "$file" ]; then
                  echo "Scanning: $file"
                  promptfoo scan-model "$file" --output json >> scan_results.json
                fi
              done
              
              # Generate HTML report
              promptfoo scan-model --output html > report.html
            else
              echo "No model files to scan"
            fi

      - store_artifacts:
          path: scan_results.json
          destination: model-audit-results

      - store_artifacts:
          path: report.html
          destination: model-audit-report

workflows:
  model-security:
    jobs:
      - model-audit:
          filters:
            branches:
              only:
                - main
                - develop
                - /feature-.*/
```

## Best Practices

### 1. Scan Strategy

- **PR/MR Scanning**: Scan only changed files to reduce CI time
- **Main Branch**: Run comprehensive scans on merge to main
- **Scheduled Scans**: Perform weekly or daily full audits
- **Critical Path**: Block deployments if critical vulnerabilities are found

### 2. Performance Optimization

```yaml
# Cache Promptfoo installation
- name: Cache Promptfoo
  uses: actions/cache@v3
  with:
    path: ~/.npm
    key: ${{ runner.os }}-promptfoo-${{ hashFiles('**/package-lock.json') }}

# Parallel scanning for multiple models
- name: Parallel Model Scan
  run: |
    find models/ -name "*.pkl" -o -name "*.pth" | \
      xargs -P 4 -I {} promptfoo scan-model {}
```

### 3. Security Considerations

- Store API keys as encrypted secrets
- Use least-privilege service accounts
- Rotate credentials regularly
- Audit access to scan results

### 4. Failure Handling

```yaml
- name: Model Audit with Retry
  uses: nick-fields/retry@v2
  with:
    timeout_minutes: 10
    max_attempts: 3
    command: promptfoo scan-model models/
    on_retry_command: echo "Retrying model scan..."
```

### 5. Notification Integration

```yaml
- name: Notify Slack on Critical Issues
  if: failure()
  uses: slackapi/slack-github-action@v1
  with:
    payload: |
      {
        "text": "🚨 Critical model vulnerabilities detected!",
        "blocks": [
          {
            "type": "section",
            "text": {
              "type": "mrkdwn",
              "text": "*Model Security Audit Failed*\nRepository: ${{ github.repository }}\nBranch: ${{ github.ref }}\n<${{ github.server_url }}/${{ github.repository }}/actions/runs/${{ github.run_id }}|View Results>"
            }
          }
        ]
      }
  env:
    SLACK_WEBHOOK_URL: ${{ secrets.SLACK_WEBHOOK }}
```

### Debug Mode

Enable debug logging for troubleshooting:

```bash
DEBUG=promptfoo:* promptfoo scan-model models/ --verbose
```

## Next Steps

- [Configure Scanners](./scanners.md) - Learn about available security scanners
- [Usage Guide](./usage.md) - Detailed usage instructions
- [Configuration Reference](/docs/configuration/reference) - Complete configuration options
