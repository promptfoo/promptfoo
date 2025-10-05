---
sidebar_label: GitHub Actions
description: Automate LLM prompt testing in CI/CD with GitHub Actions integration. Compare prompt changes, view diffs, and analyze results directly in pull requests using promptfoo.
---

# Testing Prompts with GitHub Actions

This guide describes how to automatically run a before vs. after evaluation of edited prompts using the [promptfoo GitHub Action](https://github.com/promptfoo/promptfoo-action/).

On every pull request that modifies a prompt, the action will automatically run a full comparison:

![GitHub Action comment on modified LLM prompt](/img/docs/github-action-comment.png)

The provided link opens the [web viewer](/docs/usage/web-ui) interface, which allows you to interactively explore the before vs. after:

![promptfoo web viewer](https://user-images.githubusercontent.com/310310/244891219-2b79e8f8-9b79-49e7-bffb-24cba18352f2.png)

## Using the GitHub Action

Here's an example action that watches a PR for modifications. If any file in the `prompts/` directory is modified, we automatically run the eval and post a link to the results using the `promptfoo/promptfoo-action@v1`:

```yml
name: 'Prompt Evaluation'

on:
  pull_request:
    paths:
      - 'prompts/**'

jobs:
  evaluate:
    runs-on: ubuntu-latest
    permissions:
      # This permission is used to post comments on Pull Requests
      pull-requests: write
    steps:
      # This cache is optional, but you'll save money and time by setting it up!
      - name: Set up promptfoo cache
        uses: actions/cache@v4
        with:
          path: ~/.cache/promptfoo
          key: ${{ runner.os }}-promptfoo-v1
          restore-keys: |
            ${{ runner.os }}-promptfoo-

      # This step will actually run the before/after evaluation
      - name: Run promptfoo evaluation
        uses: promptfoo/promptfoo-action@v1
        with:
          openai-api-key: ${{ secrets.OPENAI_API_KEY }}
          github-token: ${{ secrets.GITHUB_TOKEN }}
          prompts: 'prompts/**/*.json'
          config: 'prompts/promptfooconfig.yaml'
          cache-path: ~/.cache/promptfoo
```

## Configuration

To make this GitHub Action work for your project, you'll need to do a few things:

1. **Set paths**: Replace `'prompts/**'` with the path to the files you want to monitor for changes. This could either be a list of paths to single files or a directory where your prompts are stored.

   Don't forget to also update the paths in the "Run promptfoo evaluation" step to point to your prompts and `promptfooconfig.yaml` configuration file.

2. **Set OpenAI API key**: If you're using an OpenAI API, you need to set the `OPENAI_API_KEY` secret in your GitHub repository.

   To do this, go to your repository's Settings > Secrets and variables > Actions > New repository secret and create one named `OPENAI_API_KEY`.

3. **Set environment variables**: The action uses `PROMPTFOO_CONFIG_DIR` and `PROMPTFOO_CACHE_PATH` to record state on the filesystem.

4. **Add it to your project**: GitHub automatically runs workflows in the `.github/workflows` directory, so save it as something like `.github/workflows/prompt-eval.yml`.

Here are the supported parameters:

| Parameter        | Description                                                                                                               | Required |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------- | -------- |
| `github-token`   | The GitHub token. Used to authenticate requests to the GitHub API.                                                        | Yes      |
| `prompts`        | The glob patterns for the prompt files. These patterns are used to find the prompt files that the action should evaluate. | Yes      |
| `config`         | The path to the configuration file. This file contains settings for the action.                                           | Yes      |
| `openai-api-key` | The API key for OpenAI. Used to authenticate requests to the OpenAI API.                                                  | No       |
| `cache-path`     | The path to the cache. This is where the action stores temporary data.                                                    | No       |

## How It Works

1. **Caching**: We use caching to speed up subsequent runs. The cache stores LLM requests and outputs, which can be reused in future runs to save cost.

2. **Run Promptfoo Evaluation**: This is where the magic happens. We run the evaluation, passing in the configuration file and the prompts we want to evaluate. The results of this step are automatically posted to the pull request.

For more information on how to set up the promptfoo config, see the [Getting Started](/docs/getting-started) docs.

## For red teaming

For red teaming integrations, we recommend embedding more detailed reporting in your workflow.

Here's an example:

```yaml
- name: Run Promptfoo redteam
  run: |
    start=$(date +%s)
    npx promptfoo@latest redteam run \
      -c 9d32de26-7926-44f1-af13-bd06cb86f691 \
      -t 213c2235-865c-4aa4-90cc-a002256e0a94 \
      -j 5 \
      -o output.json || true
    end=$(date +%s)
    echo "DURATION_SECONDS=$((end-start))" >> $GITHUB_ENV
    test -f output.json || { echo 'output.json not found'; exit 1; }

- name: Build redteam summary (JS)
  run: |
    node .github/scripts/redteam-summary.js --input output.json --out comment.md --print
```

> **💡 Tip**: To speed up builds, you can cache promptfoo instead of downloading it every run:
>
> **Getting started**: If you don't have a package.json file yet, create one first:
>
> ```bash
> npm init -y
> ```
>
> **With package.json**: Add promptfoo as a dependency, then use setup-node with caching:
>
> ```bash
> npm install --save-dev promptfoo
> ```
>
> ```yaml
> steps:
>   - uses: actions/checkout@v5
>   - uses: actions/setup-node@v4
>     with:
>       node-version: '22'
>       cache: 'npm'
>   - run: npm ci
>   - name: Run Promptfoo redteam
>     run: npx promptfoo redteam run -c config.yaml -o output.json
> ```
>
> **Without package.json**: Cache npx downloads using workflow files as the cache key:
>
> ```yaml
> steps:
>   - uses: actions/checkout@v5
>   - uses: actions/setup-node@v4
>     with:
>       node-version: '22'
>       cache: 'npm'
>       cache-dependency-path: '**/.github/workflows/*.yml'
>   - name: Run Promptfoo redteam
>     run: npx promptfoo@latest redteam run -c config.yaml -o output.json
> ```

In this example, the [redteam-summary.js](https://gist.github.com/MrFlounder/2d9c719873ad9f221db5f87efb13ece9) file parses the red team results and produces a summary:

![llm red team github action](/img/docs/github-action-redteam.png)

The results posted on the PR include more detailed information about plugin, strategy, and target performance.
