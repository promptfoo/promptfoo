---
sidebar_position: 99
---

# Replicate

Replicate is an API for machine learning models. It currently hosts models like [Llama v2](https://replicate.com/replicate/llama70b-v2-chat).

To run a model, specify the Replicate model name and version, like so:

```
replicate:replicate/llama70b-v2-chat:e951f18578850b652510200860fc4ea62b3b16fac280f83ff32282f87bbd2e48
```

This example uses the `replicate/llama70b-v2-chat`, version `e951f...`.

Supported environment variables:

- `REPLICATE_API_TOKEN` - your Replicate API key
- `REPLICATE_MAX_LENGTH` - `max_length` property
- `REPLICATE_TEMPERATURE` - `temperature` property
- `REPLICATE_REPETITION_PENALTY` - `repitition_penalty` property

The Replicate provider supports several [configuration options](https://github.com/promptfoo/promptfoo/blob/main/src/providers/replicate.ts#L9-L17) that can be used to customize the behavior of the models, like so:

```yaml
providers:
  - id: replicate:replicate/llama70b-v2-chat:...
    config:
      temperature: 0
      max_length: 1024
```
