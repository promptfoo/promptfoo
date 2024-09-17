To get started:

1. You must have Go installed and the OpenAI Go client library. Install the OpenAI library with:

   ```sh
   go get github.com/sashabaranov/go-openai
   ```

2. Set your `OPENAI_API_KEY` environment variable.

3. Edit `promptfooconfig.yaml` with your custom prompts and assertions.

4. No need to compile the Go plugin separately. The provider will be compiled and run automatically.

5. Run the following commands:

   ```sh
   cd examples/golang-provider
   npx promptfoo@latest eval
   ```

6. View the results:

   ```sh
   npx promptfoo@latest view
   ```

Note: This implementation now works on all platforms supported by Go, including Windows, Linux, and macOS.
