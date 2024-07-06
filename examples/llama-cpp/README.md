# Getting started with Promptfoo and llama.cpp

## Install llama.cpp

To get started, install `llama.cpp` following the [instructions on their GitHub page](https://github.com/ggerganov/llama.cpp).

## Starting the Server

To get the server started, use the following command:

```bash
./llama-server -m your_model.gguf --port 8080
```

You can check to see if it's running by going to [http://localhost:8080](http://localhost:8080).

## Configuring Promptfoo

1. Edit the text files in the `prompts/` directory and make any necessary changes to `promptfooconfig.yaml`.

2. Run the evaluation:

   ```sh
   promptfoo eval
   ```

3. View the results:

   ```sh
   promptfoo view
   ```

## Note on Supported Models

`llama.cpp` supports many models, which can be converted to the GGUF format. We recommend downloading models from [Hugging Face](https://huggingface.co/models?library=gguf). Note that you may need to authenticate with your Hugging Face account in their CLI to download models.

## Note on Prompt Formatting

We do not make any effort to format the prompts in a way that is compatible with `llama.cpp`. We simply pass the prompt as is. Therefore, you may wish to add `[INST]` and `[/INST]` to the prompt to make it compatible with `llama.cpp`, etc. You should consult the documentation for the specific model you are using to ensure compatibility with its interface. We provide a few different formatting examples to illustrate the different ways you can format your prompts.

