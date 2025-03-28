# redteam-deepseek (DeepSeek Red Team Evaluation)

This example demonstrates how to run both an eval from a csv file and a redteam against DeepSeek models.

You can run this example with:

```bash
npx promptfoo@latest init --example redteam-deepseek
```

## Environment Variables

This example requires the following environment variables:

- `OPENROUTER_API_KEY` - Your OpenRouter API key for accessing DeepSeek models

You can set this in a `.env` file or directly in your environment.

## Getting Started

### Running an eval

1. Set up your `OPENROUTER_API_KEY` environment variable
2. Run the standard evaluation:

   ```sh
   promptfoo eval
   ```

3. View the results:

   ```sh
   promptfoo view
   ```

### Running the redteam

1. Set up your `OPENROUTER_API_KEY` environment variable
2. Edit `redteamconfig.yaml` if needed for your test parameters
3. Run the red team evaluation:

   ```sh
   promptfoo redteam run -c redteamconfig.yaml
   ```

## Configuration

This example includes:

- `promptfooconfig.yaml` - Configuration for standard evaluation tests
- `redteamconfig.yaml` - Configuration for red team evaluation tests
- `tests.csv` - Test cases for evaluating model responses

## Additional Resources

For more information about this evaluation and our analysis of DeepSeek models' content moderation, read our detailed [DeepSeek Censorship Blog Post](https://www.promptfoo.dev/blog/deepseek-censorship/).
