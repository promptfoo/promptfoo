# Cloudflare Workers AI

This provider supports the [models](https://developers.cloudflare.com/workers-ai/models/) provided by Cloudflare Workers AI, a serverless edge embedding and inference runtime.

## Required Configuration

Calling the Workers AI requires the user to supply a Cloudflare account ID and API key with sufficient permissions to invoke the Workers AI REST endpoints.

```bash
export CLOUDFLARE_ACCOUNT_ID=YOUR_ACCOUNT_ID_HERE
export CLOUDFLARE_API_KEY=YOUR_API_KEY_HERE
```

The Cloudflare account ID is not secret and therefore it is safe to put it in your `promptfoo` configuration file. The Cloudflare API key is secret, so while you can provide it in the config, this is **HIGHLY NOT RECOMMENDED** as it might lead to abuse. See below for an example safe configuration:

```yaml
prompts:
  - Tell me a really funny joke about {{topic}}. The joke should contain the word {{topic}}

providers:
  - id: cloudflare-ai:chat:@cf/meta/llama-3-8b-instruct
    config:
      accountId: YOUR_ACCOUNT_ID_HERE
      # It is not recommended to keep your API key on the config file since it is a secret value.
      # Use the CLOUDFLARE_API_KEY environment variable or set the apiKeyEnvar value
      # in the config
      # apiKey: YOUR_API_KEY_HERE
      # apiKeyEnvar: SOME_ENV_HAR_CONTAINING_THE_API_KEY

tests:
  - vars:
      topic: birds
    assert:
      - type: icontains
        value: '{{topic}}'
```

In addition to `apiKeyEnvar` allowed environment variable redirection for the `CLOUDFLARE_API_KEY` value, the `accountIdEnvar` can be used to similarly redirect to a value for the `CLOUDFLARE_ACCOUNT_ID`.

## Available Models and Model Parameters

Cloudflare is constantly adding new models to its inventory. See their [official list of models](https://developers.cloudflare.com/workers-ai/models/) for a list of supported models. Different models support different parameters, which is supported by supplying those parameters as additional keys of the config object in the `promptfoo` config file.

For an example of how advanced embedding configuration should be supplied, see `examples/cloudflare-ai/embedding_configuration.yaml`

For an example of how advanced completion/chat configuration should be supplied, see `examples/cloudflare-ai/chat_advanced_configuration.yaml`

Different models support different parameters. While this provider strives to be relatively flexible, it is possible that not all possible parameters have been added. If you need support for a parameter that is not yet supported, please open up a PR to add support.

## Future Improvements

- [ ] Allow for the pass through of all generic configuration parameters for Cloudflare REST API
