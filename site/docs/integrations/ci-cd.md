---
sidebar_label: CI/CD
---

# Setting up CI/CD for LLM evaluation

When scaling an LLM app, it's essential to be able to measure the impact of any prompt or model change. This guide shows how to use integrate promptfoo with CI/CD workflows to automatically evaluate test cases and ensure quality.

This approach works for any CI system. If you're using Github, you can skip directly to the [Github Actions tutorial](/docs/integrations/github-action) or view the action on the [Github Marketplace](https://github.com/marketplace/actions/test-llm-outputs).

![automatic LLM eval on CI](/img/docs/github-action-comment.png)

### Prerequisites

- A CI/CD platform that supports custom scripts or actions (e.g., GitHub Actions, GitLab CI, Jenkins).
- The promptfoo CLI installed in your CI/CD environment.
- Your LLM provider's API keys, if required.

### Steps to Integrate promptfoo in CI/CD

1. **Monitor Changes**: Configure your CI/CD pipeline to trigger on changes to prompt files. This can be done by setting path filters for pull requests or merge requests.

2. **Install promptfoo**: Ensure that the `promptfoo`` CLI is installed in the CI/CD environment. You can install it using package managers like npm:

   ```bash
   npm install -g promptfoo
   ```

   See [Getting Started](/docs/getting-started) for more info.

3. **Set API Keys**: Set the necessary API keys as environment variables in your CI/CD configuration. This may include keys for OpenAI, Azure, or other LLM providers.

4. **Run Evaluation**: Create a step in your pipeline to execute the promptfoo evaluation. Use the `promptfoo eval` command, specifying the configuration file and the prompts to evaluate.

   ```bash
   promptfoo eval -c path/to/config.yaml --prompts path/to/prompts/**/*.json --share -o output.json
   ```

   If do not want to automatically create a web-accessible eval view, remove the `--share` option.

5. **Handle Results**: After running the evaluation, you can parse the results and take actions such as commenting on pull requests, failing the build if there are issues, or posting the results to a dashboard.

The schema of the `output.json` file is defined [here](https://github.com/promptfoo/promptfoo/blob/da4fe137bcfd38ba7f6ac64a523537ebfbfe6ac1/src/types.ts#L498), and follows this format:

```typescript
interface OutputFile {
  evalId?: string;
  results: EvaluateSummary;
  config: Partial<UnifiedConfig>;
  shareableUrl: string | null;
}
```

See definitions of [EvaluateSummary](https://promptfoo.dev/docs/configuration/reference/#evaluatesummary) and [UnifiedConfig](https://promptfoo.dev/docs/configuration/reference/#unifiedconfig).

Here's an example of how you can use the output:

```typescript
// Parse the output file to get the evaluation results
const output: OutputFile = JSON.parse(fs.readFileSync('output.json', 'utf8'));

// Log the number of successful and failed evaluations
console.log(`Successes: ${output.results.stats.successes}`);
console.log(`Failures: ${output.results.stats.failures}`);
console.log(`View eval results: ${output.shareableUrl}`);
```

For a real-world example, see the [Github Action source code](https://github.com/promptfoo/promptfoo-action/blob/2d7ef1972c406db5770779312962f615ed383d09/src/main.ts#L126-L143).

6. **Cache Results**: To improve efficiency and reduce API calls, you can enable caching in your CI/CD pipeline. This will reuse results from previous LLM requests and outputs for subsequent evaluations.

   Configure caching by setting the `PROMPTFOO_CACHE_PATH` environment variable to a persistent directory in your CI environment. You can also control cache behavior using other environment variables such as `PROMPTFOO_CACHE_TYPE`, `PROMPTFOO_CACHE_MAX_FILE_COUNT`, and `PROMPTFOO_CACHE_TTL`. For more details on caching configuration, refer to the [caching documentation](/docs/configuration/caching).

   Here's an example of how to set up caching in a GitHub Actions workflow:

   ```yml
   jobs:
     evaluate:
       runs-on: ubuntu-latest
       steps:
         - name: Set up caching for promptfoo
           uses: actions/cache@v2
           with:
             path: ~/.promptfoo/cache
             key: ${{ runner.os }}-promptfoo-${{ hashFiles('**/prompts/**') }}
             restore-keys: |
               ${{ runner.os }}-promptfoo-
   ```

   Ensure that the `PROMPTFOO_CACHE_PATH` environment variable in your `promptfoo eval` command matches the path specified in the cache action.

### Example: GitHub Actions Integration

Here's a simplified example of how you might set up a GitHub Actions workflow to evaluate prompts on every pull request:

```yml
name: 'LLM Prompt Evaluation'

on:
  pull_request:
    paths:
      - 'path/to/prompts/**'

jobs:
  evaluate:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout code
        uses: actions/checkout@v2

      - name: Set up promptfoo
        run: npm install -g promptfoo

      - name: Run promptfoo evaluation
        run: promptfoo eval -c path/to/config.yaml --prompts path/to/prompts/**/*.json -o output.json
        env:
          OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}
```

If you're using Github, there's a full solution in the [Github Actions tutorial](/docs/integrations/github-action), and you can also view the action on the [Github Marketplace](https://github.com/marketplace/actions/test-llm-outputs).
