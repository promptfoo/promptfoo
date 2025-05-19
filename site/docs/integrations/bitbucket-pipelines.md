---
sidebar_label: Bitbucket Pipelines
---

# Bitbucket Pipelines Integration

This guide demonstrates how to set up promptfoo with Bitbucket Pipelines to run evaluations as part of your CI pipeline.

## Prerequisites

- A Bitbucket repository with a promptfoo project
- Bitbucket Pipelines enabled for your repository
- API keys for your LLM providers stored as [Bitbucket repository variables](https://support.atlassian.com/bitbucket-cloud/docs/variables-and-secrets/)

## Setting up Bitbucket Pipelines

Create a new file named `bitbucket-pipelines.yml` in the root of your repository with the following configuration:

```yaml
image: node:18

pipelines:
  default:
    - step:
        name: Promptfoo Evaluation
        caches:
          - node
        script:
          - npm ci
          - npm install -g promptfoo
          - npx promptfoo eval
        artifacts:
          - promptfoo-results.json
          - promptfoo-results.xml
```

## Environment Variables

Store your LLM provider API keys as repository variables in Bitbucket:

1. Navigate to your repository in Bitbucket
2. Go to Repository settings > Pipelines > Repository variables
3. Add variables for each provider API key (e.g., `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`)
4. Mark them as "Secured" to ensure they're not displayed in logs

## Advanced Configuration

### Fail the Pipeline on Failed Assertions

You can configure the pipeline to fail when promptfoo assertions don't pass:

```yaml
script:
  - npm ci
  - npm install -g promptfoo
  - npx promptfoo eval --fail-on-error
```

### Custom Evaluation Configurations

Run evaluations with specific configuration files:

```yaml
script:
  - npm ci
  - npm install -g promptfoo
  - npx promptfoo eval --config custom-config.yaml
```

### Run on Pull Requests

Configure different behavior for pull requests:

```yaml
pipelines:
  default:
    - step:
        name: Promptfoo Evaluation
        script:
          - npm ci
          - npm install -g promptfoo
          - npx promptfoo eval
  pull-requests:
    '**':
      - step:
          name: Promptfoo PR Evaluation
          script:
            - npm ci
            - npm install -g promptfoo
            - npx promptfoo eval --fail-on-error
```

### Scheduled Evaluations

Run evaluations on a schedule:

```yaml
pipelines:
  default:
    - step:
        name: Promptfoo Evaluation
        script:
          - npm ci
          - npm install -g promptfoo
          - npx promptfoo eval
  custom:
    nightly-evaluation:
      - step:
          name: Nightly Evaluation
          script:
            - npm ci
            - npm install -g promptfoo
            - npx promptfoo eval
  schedules:
    - cron: '0 0 * * *' # Run at midnight UTC every day
      pipeline: custom.nightly-evaluation
      branches:
        include:
          - main
```

### Parallel Testing

Test across multiple configurations in parallel:

```yaml
image: node:18

pipelines:
  default:
    - parallel:
        - step:
            name: Evaluate with GPT-4
            script:
              - npm ci
              - npm install -g promptfoo
              - npx promptfoo eval --providers.0.config.model=gpt-4
            artifacts:
              - promptfoo-results-gpt4.json
        - step:
            name: Evaluate with Claude
            script:
              - npm ci
              - npm install -g promptfoo
              - npx promptfoo eval --providers.0.config.model=claude-3-opus-20240229
            artifacts:
              - promptfoo-results-claude.json
```

### Using Pipes

Leverage Bitbucket Pipes for a more concise configuration:

```yaml
image: node:18

pipelines:
  default:
    - step:
        name: Promptfoo Evaluation
        script:
          - npm ci
          - npm install -g promptfoo
          - npx promptfoo eval
        after-script:
          - pipe: atlassian/junit-report:0.3.0
            variables:
              REPORT_PATHS: 'promptfoo-results.xml'
```

## Troubleshooting

If you encounter issues with your Bitbucket Pipelines integration:

- **Check logs**: Review detailed logs in Bitbucket to identify errors
- **Verify repository variables**: Ensure your API keys are correctly set
- **Pipeline timeouts**: Bitbucket Pipelines has timeout limits. For long-running evaluations, consider breaking them down or [increasing the timeout](https://support.atlassian.com/bitbucket-cloud/docs/build-timeouts/)
- **Debug with SSH**: For complex issues, use [enabling SSH access](https://support.atlassian.com/bitbucket-cloud/docs/debug-your-pipelines-with-ssh/) to debug the pipeline environment directly
