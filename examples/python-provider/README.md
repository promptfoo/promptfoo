To get started:

1. You must have the OpenAI SDK installed for this example to work.

   ```sh
   pip install openai
   ```

   Refer to `requirements.txt` for a full list of dependencies.

2. Set your `OPENAI_API_KEY` environment variable.

3. Edit `promptfooconfig.yaml` with your custom prompts and assertions.

4. Run the following commands:

   ```sh
   cd examples/python-provider
   npx promptfoo@latest eval
   ```

5. View the results:

   ```sh
   npx promptfoo@latest view
   ```
