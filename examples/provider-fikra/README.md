# Fikra

Evaluate models served by [Fikra](https://fikraapi.co.ke), an OpenAI-compatible API for open-weight models.

## Prerequisites

- A Fikra account and API key (self-serve sign-up at fikraapi.co.ke)
- `FIKRA_API_KEY` set in your environment

## Example

```sh
export FIKRA_API_KEY=fikra_...
promptfoo eval -c examples/provider-fikra/promptfooconfig.yaml
```
