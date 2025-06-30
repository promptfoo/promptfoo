---
sidebar_label: Gradio WebUI
---

# text-generation-webui

promptfoo can run evals on oobabooga's gradio based [text-generation-webui](https://github.com/oobabooga/text-generation-webui)-hosted models through the [OpenAPI API extension](https://github.com/oobabooga/text-generation-webui/wiki/12-%E2%80%90-OpenAI-API).

The text-gen-webui extension can be activated from with the UI or via command line. Here is an example of command line usage.

```sh
python server.py --loader <LOADER-NAME> --model <MODEL-NAME> --api
# Replace `python server.py` with ./start_linux if simple installer is used
```

Usage is compatible with the [OpenAI API](/docs/providers/openai).

In promptfoo we can address the API as follows.

```yaml
providers:
  - openai:chat:<MODEL-NAME>:
      id: <MODEL-ID>
      config:
        apiKey: placeholder
        apiBaseUrl: http://localhost:5000/v1
        temperature: 0.8
        max_tokens: 1024
        passthrough: # These config values are passed directly to the API
          mode: instruct
          instruction_template: LLama-v2
```

If desired, you can instead use the `OPENAI_BASE_URL` and `OPENAI_API_KEY` environment variables instead of the `apiBaseUrl` and `apiKey` configs.
