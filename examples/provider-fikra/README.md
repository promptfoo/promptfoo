# provider-fikra (Fikra chat example)

Evaluate models served by [Fikra](https://fikraapi.co.ke), an OpenAI-compatible API for open-weight models.

## Prerequisites

- A Fikra account and API key (self-serve sign-up at fikraapi.co.ke)
- `FIKRA_API_KEY` set in your environment

## Example

```sh
export FIKRA_API_KEY=fikra_...
npx promptfoo@latest init --example provider-fikra
cd provider-fikra
npx promptfoo@latest eval -c promptfooconfig.yaml
```
