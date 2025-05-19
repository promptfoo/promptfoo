---
sidebar_label: Azure Pipelines
---

# Azure Pipelines Integration

This guide demonstrates how to set up promptfoo with Azure Pipelines to run evaluations as part of your CI pipeline.

## Prerequisites

- A GitHub or Azure DevOps repository with a promptfoo project
- An Azure DevOps account with permission to create pipelines
- API keys for your LLM providers stored as [Azure Pipeline variables](https://learn.microsoft.com/en-us/azure/devops/pipelines/process/variables)

## Setting up the Azure Pipeline

Create a new file named `azure-pipelines.yml` in the root of your repository with the following configuration:

```yaml
trigger:
  - main
  - master # Include if you use master as your main branch

pool:
  vmImage: 'ubuntu-latest'

variables:
  npm_config_cache: $(Pipeline.Workspace)/.npm

steps:
  - task: NodeTool@0
    inputs:
      versionSpec: '18.x'
    displayName: 'Install Node.js'

  - task: Cache@2
    inputs:
      key: 'npm | "$(Agent.OS)" | package-lock.json'
      restoreKeys: |
        npm | "$(Agent.OS)"
      path: $(npm_config_cache)
    displayName: 'Cache npm packages'

  - script: |
      npm ci
      npm install -g promptfoo
    displayName: 'Install dependencies'

  - script: |
      npx promptfoo eval
    displayName: 'Run promptfoo evaluations'
    env:
      OPENAI_API_KEY: $(OPENAI_API_KEY)
      ANTHROPIC_API_KEY: $(ANTHROPIC_API_KEY)
      # Add other API keys as needed

  - task: PublishTestResults@2
    inputs:
      testResultsFormat: 'JUnit'
      testResultsFiles: 'promptfoo-results.xml'
      mergeTestResults: true
      testRunTitle: 'Promptfoo Evaluation Results'
    condition: succeededOrFailed()
    displayName: 'Publish test results'

  - task: PublishBuildArtifacts@1
    inputs:
      pathtoPublish: 'promptfoo-results.json'
      artifactName: 'promptfoo-results'
    condition: succeededOrFailed()
    displayName: 'Publish evaluation results'
```

## Environment Variables

Store your LLM provider API keys as [secret pipeline variables](https://learn.microsoft.com/en-us/azure/devops/pipelines/process/variables#secret-variables) in Azure DevOps:

1. Navigate to your project in Azure DevOps
2. Go to Pipelines > Your Pipeline > Edit > Variables
3. Add variables for each provider API key (e.g., `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`)
4. Mark them as secret to ensure they're not displayed in logs

## Advanced Configuration

### Fail the Pipeline on Failed Assertions

You can configure the pipeline to fail when promptfoo assertions don't pass by modifying the script step:

```yaml
- script: |
    npx promptfoo eval --fail-on-error
  displayName: 'Run promptfoo evaluations'
  env:
    OPENAI_API_KEY: $(OPENAI_API_KEY)
```

### Configure Custom Output Location

If you want to customize where results are stored:

```yaml
- script: |
    npx promptfoo eval --output-path $(Build.ArtifactStagingDirectory)/promptfoo-results.json
  displayName: 'Run promptfoo evaluations'
```

### Run on Pull Requests

To run evaluations on pull requests, add a PR trigger:

```yaml
trigger:
  - main
  - master

pr:
  - main
  - master
# Rest of pipeline configuration
```

### Conditional Execution

Run promptfoo only when certain files change:

```yaml
steps:
  - task: NodeTool@0
    inputs:
      versionSpec: '18.x'
    displayName: 'Install Node.js'

  - script: |
      npm ci
      npm install -g promptfoo
    displayName: 'Install dependencies'

  - script: |
      npx promptfoo eval
    displayName: 'Run promptfoo evaluations'
    condition: |
      and(
        succeeded(),
        or(
          eq(variables['Build.SourceBranch'], 'refs/heads/main'),
          eq(variables['Build.Reason'], 'PullRequest')
        ),
        or(
          eq(variables['Build.Reason'], 'PullRequest'),
          contains(variables['Build.SourceVersionMessage'], '[run-eval]')
        )
      )
    env:
      OPENAI_API_KEY: $(OPENAI_API_KEY)
```

## Using with Matrix Testing

Test across multiple configurations or models in parallel:

```yaml
strategy:
  matrix:
    gpt4:
      MODEL: 'gpt-4'
    claude:
      MODEL: 'claude-3-opus-20240229'

steps:
  - script: |
      npx promptfoo eval --providers.0.config.model=$(MODEL)
    displayName: 'Test with $(MODEL)'
    env:
      OPENAI_API_KEY: $(OPENAI_API_KEY)
      ANTHROPIC_API_KEY: $(ANTHROPIC_API_KEY)
```

## Troubleshooting

If you encounter issues with your Azure Pipelines integration:

- **Check logs**: Review detailed logs in Azure DevOps to identify errors
- **Verify API keys**: Ensure your API keys are correctly set as pipeline variables
- **Permissions**: Make sure the pipeline has access to read your configuration files
- **Node.js version**: Promptfoo requires Node.js >= 18.0.0

If you're getting timeouts during evaluations, you may need to adjust the pipeline timeout settings or consider using a [self-hosted agent](https://learn.microsoft.com/en-us/azure/devops/pipelines/agents/agents) for better stability with long-running evaluations.
