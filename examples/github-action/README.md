# github-action (GitHub Action)

You can run this example with:

```bash
npx promptfoo@latest init --example github-action
```

This folder contains a standalone GitHub Action that runs **promptfoo** when a pull request modifies prompts.

## Prerequisites

- GitHub repository with Actions enabled
- API keys for LLM providers set as repository secrets:
  - `OPENAI_API_KEY` - Get from [OpenAI API keys page](https://platform.openai.com/api-keys)
  - `ANTHROPIC_API_KEY` - Get from [Anthropic Console](https://console.anthropic.com/) (optional)

### Setting up GitHub Secrets:

1. Go to your repository → Settings → Secrets and variables → Actions
2. Click "New repository secret"
3. Add `OPENAI_API_KEY` with your OpenAI API key as the value
4. Repeat for other provider keys as needed

## Usage

Edit [standalone-action.yaml](./standalone-action.yaml) as needed and add it to your repository's `.github/workflows/` directory. The action will automatically run when pull requests modify prompt files.

## Expected Results

When triggered, the action will:

- Install promptfoo in the GitHub runner environment
- Run evaluations on the modified prompts
- Post results as PR comments or check results
- Fail the check if evaluations don't meet configured thresholds
