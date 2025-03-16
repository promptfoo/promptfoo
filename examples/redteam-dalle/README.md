# DALL-E Red Team Example

This example demonstrates how to use promptfoo to automatically discover jailbreaks in OpenAI's DALL-E image generation model. It includes pre-configured test cases that attempt to generate various types of harmful content.

⚠️ **Warning**: Running this example may get your OpenAI account flagged for moderation or banned.

## Setup

1. Set your OpenAI API key:

   ```sh
   export OPENAI_API_KEY=your_key_here
   ```

2. Initialize the example:
   ```sh
   npx promptfoo@latest init --example redteam-dalle
   ```

## Usage

1. Review and optionally modify the test cases in `promptfooconfig.yaml`. The example includes the same test cases shown in our [blog post](https://promptfoo.dev/blog/jailbreak-dalle).

2. Run the evaluation:

   ```sh
   npx promptfoo@latest eval
   ```

3. View the results in the web UI:

   ```sh
   npx promptfoo@latest view
   ```

   Important table settings:

   - Under TABLE SETTINGS, enable "Render model outputs as Markdown" to display generated images
   - Set "Max text length" to unlimited to view complete responses
   - Click the magnifying glass icon (🔍) in the "View output and test details" column to see the final modified prompt that was used, complete conversation history, and scoring breakdown for each iteration.

## Expected Behavior

During evaluation, you may see error messages like:

```
Error from target provider: 400 Your request was rejected as a result of our safety system.
Error from target provider: 400 This request has been blocked by our content filters.
```

This is normal expected behavior. Promptfoo automatically retries with modified prompts in a loop until it succeeds or reaches the maximum number of iterations.

## Configuration

- The default configuration uses 4 iterations per test case. To increase this (and potentially find more jailbreaks), set:

  ```sh
  export PROMPTFOO_NUM_JAILBREAK_ITERATIONS=6
  ```

- For debugging or to see the internal workings, enable debug logging:

  ```sh
  LOG_LEVEL=debug npx promptfoo@latest eval -j 1
  ```

## Troubleshooting

Note: DALL-E image URLs expire after 2 hours. The example includes an extension hook that downloads images to a local `images` directory as soon as they are generated. Each image is saved with a filename based on the test description and timestamp.

- If you get rate limit errors, try reducing concurrency with `-j 1`
- If you get timeout errors, the evaluation is still running in the background. Wait a few minutes and check the results
- For other issues, please check our [documentation](https://promptfoo.dev/docs/red-team) or [file an issue](https://github.com/promptfoo/promptfoo/issues)

## Learn More

For more details about LLM red teaming with promptfoo, check out:

- [Red Team Documentation](https://promptfoo.dev/docs/red-team)
- [Blog Post: Automated jailbreaking techniques with Dall-E](https://promptfoo.dev/blog/jailbreak-dalle)
