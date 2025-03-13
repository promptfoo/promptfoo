# Getting Started with Promptfoo and llama.cpp

## Install llama.cpp

To begin, install `llama.cpp` by following the [instructions on their GitHub page](https://github.com/ggerganov/llama.cpp).

## Starting the Server

To start the server, use the following command:

```bash
./llama-server -m your_model.gguf --port 8080
```

You can check if it's running by visiting [http://localhost:8080](http://localhost:8080).

## Configuring Promptfoo

1. Edit the prompts in `promptfooconfig.yaml`.
2. Run the evaluation:

   ```sh
   npx promptfoo@latest eval
   ```

3. View the results:

   ```sh
   npx promptfoo@latest view
   ```

## Note on Supported Models

`llama.cpp` supports many models that can be converted to the GGUF format. We recommend downloading models from [Hugging Face](https://huggingface.co/models?library=gguf). You may need to [authenticate with your Hugging Face account](https://huggingface.co/docs/huggingface_hub/en/guides/cli) using their CLI to download models.

## Note on Prompt Formatting

We do not format the prompts for compatibility with `llama.cpp`. Prompts are passed as-is. Refer to the documentation or model card for the specific model you are using to ensure compatibility with its interface. We provide various formatting examples to illustrate different ways to format your prompts.

## Note on Caching

Since promptfoo is unaware of the underlying model being run in `llama.cpp`, it will not invalidate the cache when the model is updated. This means you may see stale results from the cache if you change the model. Run `npx promptfoo@latest eval --no-cache` to perform the evaluation without using the cache.
