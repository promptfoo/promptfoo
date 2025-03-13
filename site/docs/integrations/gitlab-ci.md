---
sidebar_label: GitLab CI
---

# Setting up Promptfoo with GitLab CI

This guide shows how to integrate Promptfoo's LLM evaluation into your GitLab CI pipeline. This allows you to automatically test your prompts and models whenever changes are made to your repository.

## Prerequisites

- A GitLab repository
- Your LLM provider's API keys (e.g., OpenAI API key)
- Basic familiarity with GitLab CI/CD configuration

## Configuration Steps

### 1. Create GitLab CI Configuration

Create a `.gitlab-ci.yml` file in your repository root. Here's a basic configuration that installs Promptfoo and runs evaluations:

```yaml
image: node:18

evaluate_prompts:
  script:
    - npm install -g promptfoo
    - promptfoo eval -c promptfooconfig.yaml --prompts prompts/**/*.json --share -o output.json
  variables:
    OPENAI_API_KEY: ${OPENAI_API_KEY}
    PROMPTFOO_CACHE_PATH: .promptfoo/cache
  cache:
    key:
      files:
        - prompts/**/*
    paths:
      - .promptfoo/cache
  artifacts:
    paths:
      - output.json
    reports:
      json: output.json
  rules:
    - changes:
        - prompts/**/*
```

### 2. Set Up Environment Variables

1. Go to Settings > CI/CD in your GitLab project
2. Expand the Variables section
3. Add your LLM provider's API keys:
   - Click "Add Variable"
   - Add `OPENAI_API_KEY` (or other provider keys) as masked and protected variables

### 3. Configure Caching (Optional but Recommended)

The configuration above includes caching to save time and API costs. The cache:

- Stores LLM API responses
- Is keyed based on the content of your prompt files
- Is saved in `.promptfoo/cache`

### 4. Storing Results

The configuration stores the evaluation results as artifacts:

- Results are saved to `output.json`
- GitLab makes these available in the job artifacts
- The `--share` flag creates a shareable web URL for results

## Advanced Configuration

### Adding Custom Test Steps

You can add custom steps to process the evaluation results:

```yaml
evaluate_prompts:
  script:
    - npm install -g promptfoo
    - promptfoo eval -c promptfooconfig.yaml --prompts prompts/**/*.json --share -o output.json
    - |
      if jq -e '.results.stats.failures > 0' output.json; then
        echo "Evaluation had failures"
        exit 1
      fi
```

### Parallel Evaluation

For large test suites, you can use GitLab's parallel feature:

```yaml
evaluate_prompts:
  parallel: 3
  script:
    - |
      prompts=$(find prompts -name "*.json" | awk "NR % $CI_NODE_TOTAL == $CI_NODE_INDEX")
      promptfoo eval -c promptfooconfig.yaml --prompts $prompts
```

### Integration with GitLab Merge Requests

You can configure the job to post results as merge request comments:

```yaml
evaluate_prompts:
  script:
    - npm install -g promptfoo
    - |
      OUTPUT=$(promptfoo eval -c promptfooconfig.yaml --prompts prompts/**/*.json --share)
      SHARE_URL=$(echo "$OUTPUT" | grep "View results:" | cut -d' ' -f3)
      echo "Evaluation Results: $SHARE_URL" | tee merge_request_comment.txt
  artifacts:
    reports:
      junit: output.json
    paths:
      - merge_request_comment.txt
  after_script:
    - |
      if [ -n "$CI_MERGE_REQUEST_IID" ]; then
        curl --request POST \
          --header "PRIVATE-TOKEN: ${GITLAB_API_TOKEN}" \
          --data-urlencode "body=$(cat merge_request_comment.txt)" \
          "${CI_API_V4_URL}/projects/${CI_PROJECT_ID}/merge_requests/${CI_MERGE_REQUEST_IID}/notes"
      fi
```

## Example Output

After the evaluation runs, you'll see:

- Test results in the GitLab CI/CD pipeline interface
- Artifacts containing the full evaluation data
- A shareable link to view results in the promptfoo web viewer
- Any test failures will cause the GitLab job to fail

## Troubleshooting

Common issues and solutions:

1. **Cache not working:**

   - Verify the cache key and paths in your configuration
   - Check that the cache path exists
   - Ensure file permissions are correct

2. **API key errors:**

   - Confirm variables are set in GitLab CI/CD settings
   - Check that variables are properly masked
   - Verify API key permissions

3. **Job timing out:**
   - Add a timeout override to your job configuration:
     ```yaml
     evaluate_prompts:
       timeout: 2 hours
     ```

For more details on Promptfoo configuration, see the [configuration reference](/docs/configuration/reference).
