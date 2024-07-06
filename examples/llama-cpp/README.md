


Install llama.cpp https://github.com/ggerganov/llama.cpp instructions can be found here 

llama.cpp supports many models and can be converted to gguf format. We recommend downloading models from hugging face https://huggingface.co/models?library=gguf Note that you may have to authenticate with your hugging face account in their CLI to download models.

Get the server started with

```
./llama-server -m your_model.gguf --port 8080
```

# Basic web UI can be accessed via browser: http://localhost:8080

Note that we do not make any effort to format the prompts in a way that is compatible with llama.cpp. We simply pass the prompt as is. Therefore you may wish to add `[INST]` and `[/INST]` to the prompt to make it compatible with llama.cpp, etc. You should consult the docs for the specific model you are using to ensure compatibility with it's interface.