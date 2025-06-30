---
sidebar_label: Jenkins
---

# Setting up promptfoo with Jenkins

This guide demonstrates how to integrate promptfoo's LLM evaluation into your Jenkins pipeline. This setup enables automatic testing of your prompts and models whenever changes are made to your repository.

## Prerequisites

- Jenkins server with pipeline support
- Node.js installed on the Jenkins agent
- Your LLM provider's API keys (e.g., OpenAI API key)
- Basic familiarity with Jenkins Pipeline syntax

## Configuration Steps

### 1. Create Jenkinsfile

Create a `Jenkinsfile` in your repository root. Here's a basic configuration that installs promptfoo and runs evaluations:

```groovy:Jenkinsfile
pipeline {
    agent any

    environment {
        OPENAI_API_KEY = credentials('openai-api-key')
        PROMPTFOO_CACHE_PATH = '~/.promptfoo/cache'
    }

    stages {
        stage('Setup') {
            steps {
                sh 'npm install -g promptfoo'
            }
        }

        stage('Evaluate Prompts') {
            steps {
                script {
                    try {
                        sh 'promptfoo eval -c promptfooconfig.yaml --prompts prompts/**/*.json --share -o output.json'
                    } catch (Exception e) {
                        currentBuild.result = 'FAILURE'
                        error("Prompt evaluation failed: ${e.message}")
                    }
                }
            }
        }

        stage('Process Results') {
            steps {
                script {
                    def output = readJSON file: 'output.json'
                    echo "Evaluation Results:"
                    echo "Successes: ${output.results.stats.successes}"
                    echo "Failures: ${output.results.stats.failures}"

                    if (output.shareableUrl) {
                        echo "View detailed results at: ${output.shareableUrl}"
                    }

                    if (output.results.stats.failures > 0) {
                        currentBuild.result = 'UNSTABLE'
                    }
                }
            }
        }
    }

    post {
        always {
            archiveArtifacts artifacts: 'output.json', fingerprint: true
        }
    }
}
```

### 2. Configure Jenkins Credentials

You'll need to add the API keys for any LLM providers you're using. For example, if you're using OpenAI, you'll need to add the OpenAI API key.

1. Navigate to Jenkins Dashboard → Manage Jenkins → Credentials
2. Add a new credential:
   - Kind: Secret text
   - Scope: Global
   - ID: openai-api-key
   - Description: OpenAI API Key
   - Secret: Your API key value

### 3. Set Up Caching

To implement caching for better performance and reduced API costs:

1. Create a cache directory on your Jenkins agent:

```bash
mkdir -p ~/.promptfoo/cache
```

2. Ensure the Jenkins user has write permissions:

```bash
chown -R jenkins:jenkins ~/.promptfoo/cache
```

### 4. Advanced Pipeline Configuration

Here's an example of a more advanced pipeline with additional features:

The advanced configuration includes several important improvements:

- **Build timeouts**: The `timeout` option ensures builds don't run indefinitely (1 hour limit)
- **Timestamps**: Adds timestamps to console output for better debugging
- **SCM polling**: Automatically checks for changes every 15 minutes using `pollSCM`
- **Conditional execution**: Only runs evaluations when files in `prompts/` directory change
- **Email notifications**: Sends emails to developers on pipeline failures
- **Workspace cleanup**: Automatically cleans up workspace after each run
- **Artifact management**: Archives both JSON and HTML reports with fingerprinting
- **Better error handling**: More robust error catching and build status management

```groovy:Jenkinsfile
pipeline {
    agent any

    environment {
        OPENAI_API_KEY = credentials('openai-api-key')
        PROMPTFOO_CACHE_PATH = '~/.promptfoo/cache'
    }

    options {
        timeout(time: 1, unit: 'HOURS')
        timestamps()
    }

    triggers {
        pollSCM('H/15 * * * *')
    }

    stages {
        stage('Setup') {
            steps {
                sh 'npm install -g promptfoo'
            }
        }

        stage('Evaluate Prompts') {
            when {
                changeset 'prompts/**'
            }
            steps {
                script {
                    try {
                        sh '''
                            promptfoo eval \
                                -c promptfooconfig.yaml \
                                --prompts prompts/**/*.json \
                                --share \
                                -o output.json
                        '''
                    } catch (Exception e) {
                        currentBuild.result = 'FAILURE'
                        error("Prompt evaluation failed: ${e.message}")
                    }
                }
            }
        }

        stage('Process Results') {
            steps {
                script {
                    def output = readJSON file: 'output.json'

                    // Create HTML report
                    writeFile file: 'evaluation-report.html', text: """
                        <html>
                            <body>
                                <h1>Prompt Evaluation Results</h1>
                                <p>Successes: ${output.results.stats.successes}</p>
                                <p>Failures: ${output.results.stats.failures}</p>
                                <p>View detailed results: <a href="${output.shareableUrl}">${output.shareableUrl}</a></p>
                            </body>
                        </html>
                    """

                    // Publish HTML report
                    publishHTML([
                        allowMissing: false,
                        alwaysLinkToLastBuild: true,
                        keepAll: true,
                        reportDir: '.',
                        reportFiles: 'evaluation-report.html',
                        reportName: 'Prompt Evaluation Report'
                    ])

                    if (output.results.stats.failures > 0) {
                        currentBuild.result = 'UNSTABLE'
                    }
                }
            }
        }
    }

    post {
        always {
            archiveArtifacts artifacts: 'output.json,evaluation-report.html', fingerprint: true
            cleanWs()
        }
        failure {
            emailext (
                subject: "Failed Pipeline: ${currentBuild.fullDisplayName}",
                body: "Prompt evaluation failed. Check console output at ${env.BUILD_URL}",
                recipientProviders: [[$class: 'DevelopersRecipientProvider']]
            )
        }
    }
}
```

## Troubleshooting

Common issues and solutions:

1. **Permission issues:**

   - Ensure Jenkins has appropriate permissions to install global npm packages
   - Verify cache directory permissions
   - Check API key credential permissions

2. **Pipeline timeout:**

   - Adjust the timeout in pipeline options
   - Consider splitting evaluations into smaller batches
   - Monitor API rate limits

3. **Cache problems:**

   - Verify cache path exists and is writable
   - Check disk space availability
   - Clear cache if needed: `rm -rf ~/.promptfoo/cache/*`

4. **Node.js issues:**
   - Ensure Node.js is installed on the Jenkins agent
   - Verify npm is available in PATH
   - Consider using `nodejs` tool installer in Jenkins

For more information on promptfoo configuration and usage, refer to the [configuration reference](/docs/configuration/guide/).
