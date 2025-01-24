---
sidebar_label: LocalAI
---

# Local AI

LocalAI is an API wrapper for open-source LLMs that is compatible with OpenAI. You can run LocalAI for compatibility with Llama, Alpaca, Vicuna, GPT4All, RedPajama, and many other models compatible with the ggml format.

View all compatible models [here](https://github.com/go-skynet/LocalAI#model-compatibility-table).

Once you have LocalAI up and running, specify one of the following based on the model you have selected:

- `localai:chat:<model name>`, which invokes models using the
  [LocalAI chat completion endpoint](https://localai.io/features/text-generation/#chat-completions)
- `localai:completion:<model name>`, which invokes models using the
  [LocalAI completion endpoint](https://localai.io/features/text-generation/#completions)
- `localai:<model name>`, which defaults to chat-type model
- `localai:embeddings:<model name>`, which invokes models using the
  [LocalAI embeddings endpoint](https://localai.io/features/embeddings/)

The model name is typically the filename of the `.bin` file that you downloaded to set up the model in LocalAI. For example, `ggml-vic13b-uncensored-q5_1.bin`. LocalAI also has a `/models` endpoint to list models, which can be queried with `curl http://localhost:8080/v1/models`.

## Configuring parameters

You can set parameters like `temperature` and `apiBaseUrl` ([full list here](https://github.com/promptfoo/promptfoo/blob/main/src/providers/localai.ts#L7)). For example, using [LocalAI's lunademo](https://localai.io/docs/getting-started/models/):

```yaml title=promptfooconfig.yaml
providers:
  - id: localai:lunademo
    config:
      temperature: 0.5
```

Supported environment variables:

- `LOCALAI_BASE_URL` - defaults to `http://localhost:8080/v1`
- `REQUEST_TIMEOUT_MS` - maximum request time, in milliseconds. Defaults to 60000.
