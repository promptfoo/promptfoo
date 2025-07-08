---
sidebar_label: Looper
---

# Setting up Promptfoo with Looper

This guide demonstrates how to integrate Promptfoo's LLM evaluation into your Looper CI/CD pipeline. This setup enables automatic testing of your prompts and models whenever changes are made to your repository.

## Prerequisites

- A Looper CI/CD environment with pipeline support
- Node.js installed on the Looper runner/agent
- Basic familiarity with Looper configuration syntax

## Configuration Steps

### 1. Create Looper Configuration

Create a `.looper.yml` or `looper.yaml` file in your repository. Here's a basic configuration that installs Promptfoo and runs evaluations:

```yaml
version: 1.0

pipelines:
  evaluate-prompts:
    trigger:
      paths:
        - 'prompts/**'
        - 'promptfooconfig.yaml'

    environment:
      PROMPTFOO_CACHE_PATH: ~/.promptfoo/cache

    stages:
      - name: setup
        steps:
          - run: npm install -g promptfoo
            name: Install Promptfoo CLI

      - name: evaluate
        steps:
          - run: |
              promptfoo eval \
                -c promptfooconfig.yaml \
                --prompts prompts/**/*.json \
                --share \
                -o output.json
            name: Run Promptfoo evaluation

      - name: process-results
        steps:
          - run: |
              # Extract results from output.json
              SUCCESSES=$(jq -r '.results.stats.successes' output.json)
              FAILURES=$(jq -r '.results.stats.failures' output.json)
              SHARE_URL=$(jq -r '.shareableUrl' output.json)

              echo "Evaluation Results:"
              echo "✅ Successes: $SUCCESSES"
              echo "❌ Failures: $FAILURES"

              if [ ! -z "$SHARE_URL" ]; then
                echo "📊 View detailed results: $SHARE_URL"
              fi

              # Fail the pipeline if there are failures
              if [ "$FAILURES" -gt 0 ]; then
                echo "Pipeline failed due to $FAILURES test failures"
                exit 1
              fi
            name: Process evaluation results

    artifacts:
      - path: output.json
        name: evaluation-results
      - path: '**/*.html'
        name: html-reports
```

### 2. Set Up Caching

Caching is crucial for reducing API costs and speeding up evaluations. Configure Looper's cache to persist the Promptfoo cache directory:

```yaml
cache:
  key: promptfoo-cache-${{ checksum "prompts/**/*.json" }}
  paths:
    - ~/.promptfoo/cache
  restore-keys:
    - promptfoo-cache-
```

Add this cache configuration to your pipeline:

```yaml
pipelines:
  evaluate-prompts:
    cache:
      key: promptfoo-cache-${{ checksum "prompts/**/*.json" }}
      paths:
        - ~/.promptfoo/cache
    # ... rest of configuration
```

### 3. Advanced Configuration

#### Parallel Evaluation

For large test suites, you can leverage Looper's parallel execution capabilities:

```yaml
pipelines:
  evaluate-prompts:
    parallel:
      matrix:
        prompt-set:
          - 'prompts/set1/**/*.json'
          - 'prompts/set2/**/*.json'
          - 'prompts/set3/**/*.json'

    stages:
      - name: evaluate
        steps:
          - run: |
              promptfoo eval \
                -c promptfooconfig.yaml \
                --prompts "${{ matrix.prompt-set }}" \
                -o output-${{ matrix.index }}.json
```

#### Scheduled Evaluations

Run evaluations on a schedule to catch drift or model changes:

```yaml
pipelines:
  nightly-evaluation:
    trigger:
      schedule:
        cron: '0 2 * * *' # Run at 2 AM daily


    # ... evaluation configuration
```

#### Integration with Pull Requests

Configure Looper to comment on pull requests with evaluation results:

```yaml
pipelines:
  pr-evaluation:
    trigger:
      pull_request:
        types: [opened, synchronize]
        paths:
          - 'prompts/**'

    stages:
      - name: evaluate
        steps:
          - run: |
              # Run evaluation
              promptfoo eval -c promptfooconfig.yaml --prompts prompts/**/*.json --share -o output.json

              # Extract results for PR comment
              SHARE_URL=$(jq -r '.shareableUrl' output.json)
              SUCCESSES=$(jq -r '.results.stats.successes' output.json)
              FAILURES=$(jq -r '.results.stats.failures' output.json)

              # Create markdown comment
              cat > pr-comment.md << EOF
              ## 🤖 Promptfoo Evaluation Results

              - ✅ **Successes:** $SUCCESSES
              - ❌ **Failures:** $FAILURES

              [View detailed results]($SHARE_URL)

              ### Summary
              $(jq -r '.results.table | @json' output.json | jq -r '. | to_entries | map("- **\(.key)**: \(.value.pass)/\(.value.total) passed") | join("\n")')
              EOF
            name: Run evaluation and prepare comment

      - name: post-comment
        steps:
          - looper: comment-pr
            with:
              file: pr-comment.md
```

#### Custom Metrics and Thresholds

Set up quality gates based on evaluation metrics:

```yaml
pipelines:
  evaluate-with-thresholds:
    stages:
      - name: evaluate
        steps:
          - run: |
              promptfoo eval -c promptfooconfig.yaml --prompts prompts/**/*.json -o output.json

              # Check pass rate
              TOTAL=$(jq -r '.results.stats.successes + .results.stats.failures' output.json)
              SUCCESSES=$(jq -r '.results.stats.successes' output.json)
              PASS_RATE=$(echo "scale=2; $SUCCESSES * 100 / $TOTAL" | bc)

              echo "Pass rate: $PASS_RATE%"

              # Fail if pass rate is below threshold
              if (( $(echo "$PASS_RATE < 95" | bc -l) )); then
                echo "❌ Pass rate $PASS_RATE% is below threshold of 95%"
                exit 1
              fi
            name: Evaluate with quality gates
```

### 4. Multi-Environment Testing

Test prompts across different environments or model configurations:

```yaml
pipelines:
  multi-env-evaluation:
    stages:
      - name: evaluate-production
        environment:
          PROMPTFOO_LABEL: production
        steps:
          - run: promptfoo eval -c promptfooconfig.prod.yaml --prompts prompts/**/*.json -o output-prod.json

      - name: evaluate-staging
        environment:
          PROMPTFOO_LABEL: staging
        steps:
          - run: promptfoo eval -c promptfooconfig.staging.yaml --prompts prompts/**/*.json -o output-staging.json

      - name: compare-environments
        steps:
          - run: |
              # Compare results between environments
              PROD_FAILURES=$(jq -r '.results.stats.failures' output-prod.json)
              STAGING_FAILURES=$(jq -r '.results.stats.failures' output-staging.json)

              echo "Production failures: $PROD_FAILURES"
              echo "Staging failures: $STAGING_FAILURES"

              if [ "$STAGING_FAILURES" -gt "$PROD_FAILURES" ]; then
                echo "⚠️ Warning: Staging has more failures than production!"
              fi
```

## Troubleshooting

### Common Issues

1. **Node.js not found:**

   ```yaml
   stages:
     - name: setup
       image: node:22 # Use a Docker image with Node.js
       steps:
         - run: npm install -g promptfoo
   ```

2. **Cache not persisting:**
   - Verify the cache key is correctly computed
   - Check that the cache path exists and has proper permissions
   - Try clearing the cache if it becomes corrupted

3. **API rate limits:**
   - Implement retry logic with exponential backoff
   - Use caching to avoid redundant API calls
   - Consider using multiple API keys with rotation

4. **Large output files:**

   ```yaml
   artifacts:
     - path: output.json
       name: evaluation-results
       compress: true # Compress large artifacts
       retention: 30d # Keep for 30 days
   ```

5. **Timeout issues:**
   ```yaml
   pipelines:
     evaluate-prompts:
       timeout: 3600 # 1 hour timeout
       stages:
         - name: evaluate
           timeout: 2700 # 45 minute timeout for evaluation stage
   ```

### Debug Mode

Enable verbose logging for troubleshooting:

```yaml
stages:
  - name: evaluate
    steps:
      - run: |
          export PROMPTFOO_LOG_LEVEL=debug
          promptfoo eval -c promptfooconfig.yaml --prompts prompts/**/*.json -o output.json --verbose
```

## Best Practices

1. **Version your configurations:** Keep `promptfooconfig.yaml` in version control alongside your prompts

2. **Use semantic versioning:** Tag your prompts and configurations for easy rollback

3. **Incremental testing:** Only test modified prompts to save time and costs:

   ```yaml
   steps:
     - run: |
         CHANGED_FILES=$(looper diff --name-only prompts/)
         if [ ! -z "$CHANGED_FILES" ]; then
           promptfoo eval -c promptfooconfig.yaml --prompts "$CHANGED_FILES" -o output.json
         fi
   ```

4. **Secure secrets:** Never commit API keys or sensitive data to your repository

For more information on Promptfoo configuration and usage, refer to the [configuration reference](/docs/configuration/guide/).
