---
sidebar_label: CircleCI
---

# Setting up promptfoo with CircleCI

This guide shows how to integrate promptfoo's LLM evaluation into your CircleCI pipeline. This allows you to automatically test your prompts and models whenever changes are made to your repository.

## Prerequisites

- A CircleCI account connected to your repository
- Your LLM provider's API keys (e.g., OpenAI API key)
- Basic familiarity with CircleCI configuration

## Configuration Steps

### 1. Create CircleCI Configuration

Create a `.circleci/config.yml` file in your repository. Here's a basic configuration that installs promptfoo and runs evaluations:

    ```yaml:/.circleci/config.yml
    version: 2.1
    jobs:
      evaluate_prompts:
        docker:
          - image: cimg/node:18.0.0
        steps:
          - checkout

          - restore_cache:
              keys:
                - promptfoo-cache-v1-{{ .Branch }}-{{ checksum "prompts/**/*" }}
                - promptfoo-cache-v1-{{ .Branch }}
                - promptfoo-cache-v1-

          - run:
              name: Install promptfoo
              command: npm install -g promptfoo

          - run:
              name: Run prompt evaluation
              command: promptfoo eval -c promptfooconfig.yaml --prompts prompts/**/*.json --share -o output.json
              environment:
                OPENAI_API_KEY: ${OPENAI_API_KEY}
                PROMPTFOO_CACHE_PATH: ~/.promptfoo/cache

          - save_cache:
              key: promptfoo-cache-v1-{{ .Branch }}-{{ checksum "prompts/**/*" }}
              paths:
                - ~/.promptfoo/cache

          - store_artifacts:
              path: output.json
              destination: evaluation-results

    workflows:
      version: 2
      evaluate:
        jobs:
          - evaluate_prompts:
              filters:
                paths:
                  - prompts/**/*
    ```

### 2. Set Up Environment Variables

1. Go to your project settings in CircleCI
2. Navigate to Environment Variables
3. Add your LLM provider's API keys:
   - e.g. Add `OPENAI_API_KEY` if you're using OpenAI

### 3. Configure Caching (Optional but Recommended)

The configuration above includes caching to save time and API costs. The cache:

- Stores LLM API responses
- Is keyed by branch and content hash
- Is saved in `~/.promptfoo/cache`

### 4. Storing Results

The configuration stores the evaluation results as artifacts:

- Results are saved to `output.json`
- CircleCI makes these available in the Artifacts tab
- The `--share` flag creates a shareable web URL for results

## Advanced Configuration

### Adding Custom Test Steps

You can add custom steps to process the evaluation results:

    ```yaml
    - run:
        name: Check evaluation results
        command: |
          if jq -e '.results.stats.failures > 0' output.json; then
            echo "Evaluation had failures"
            exit 1
          fi
    ```

### Parallel Evaluation

For large test suites, you can parallelize evaluations:

    ```yaml
    jobs:
      evaluate_prompts:
        parallelism: 3
        steps:
          - run:
              name: Split tests
              command: |
                prompts=$(find prompts -name "*.json" | circleci tests split)
                promptfoo eval -c promptfooconfig.yaml --prompts $prompts
    ```

## Example Output

After the evaluation runs, you'll see:

- Test results in the CircleCI UI
- Artifacts containing the full evaluation data
- A shareable link to view results in the promptfoo web viewer
- Any test failures will cause the CircleCI job to fail

## Troubleshooting

Common issues and solutions:

1. **Cache not working:**

   - Verify the cache key matches your configuration
   - Check that the cache path exists
   - Ensure file permissions are correct

2. **API key errors:**

   - Confirm environment variables are set in CircleCI
   - Check for typos in variable names
   - Verify API key permissions

3. **Evaluation timeout:**
   - Adjust the `no_output_timeout` setting in your job
   - Consider splitting tests into smaller batches

For more details on promptfoo configuration, see the [configuration reference](/docs/configuration/reference).
