# integration-aisix (Evaluate AISIX Model Aliases)

This example evaluates two caller-facing model aliases through the open-source [AISIX AI gateway](https://github.com/api7/aisix). It uses Promptfoo's existing OpenAI-compatible provider; no AISIX-specific Promptfoo provider is required.

The two aliases let you compare a stable alias with a candidate alias without placing the upstream provider credential in the Promptfoo configuration. AISIX authenticates Promptfoo with a caller key, then resolves each alias to the provider model configured in `aisix/resources.yaml`.

## Prerequisites

- Docker
- Node.js supported by the current Promptfoo release
- An OpenAI API key with access to the two models you choose

## Get the example

Initialize the example from Promptfoo, then run the remaining commands from its directory:

```bash
npx promptfoo@latest init --example integration-aisix
cd integration-aisix
```

## Set environment variables

Choose two upstream models and separate the upstream credential from the caller credential:

```bash
export OPENAI_API_KEY="YOUR_PROVIDER_API_KEY"
export PROMPTFOO_CALLER_KEY="YOUR_LOCAL_CALLER_KEY"
export UPSTREAM_STABLE_MODEL="gpt-5.4-mini"
export UPSTREAM_CANDIDATE_MODEL="gpt-5.6"
export AISIX_BASE_URL="http://127.0.0.1:3000"
```

The configured Promptfoo providers use only `PROMPTFOO_CALLER_KEY`. AISIX reads `OPENAI_API_KEY` inside its container and uses it for upstream requests. The variables passed to the container intentionally avoid the reserved `AISIX_` prefix, which AISIX uses for configuration overrides.

## Validate and start AISIX

Validate the included resources before starting a listener:

```bash
docker run --rm \
  -v "$(pwd)/aisix:/etc/aisix:ro" \
  -e OPENAI_API_KEY \
  -e PROMPTFOO_CALLER_KEY \
  -e UPSTREAM_STABLE_MODEL \
  -e UPSTREAM_CANDIDATE_MODEL \
  --entrypoint /usr/local/bin/aisix \
  ghcr.io/api7/aisix:1.2.0 \
  validate --resources /etc/aisix/resources.yaml
```

Start the gateway:

```bash
docker run -d --name aisix-promptfoo \
  -v "$(pwd)/aisix:/etc/aisix:ro" \
  -e OPENAI_API_KEY \
  -e PROMPTFOO_CALLER_KEY \
  -e UPSTREAM_STABLE_MODEL \
  -e UPSTREAM_CANDIDATE_MODEL \
  -p 127.0.0.1:3000:3000 \
  ghcr.io/api7/aisix:1.2.0
```

If you do not want the Promptfoo process to inherit the upstream credential, remove it from the current shell after the AISIX container starts:

```bash
unset OPENAI_API_KEY
```

Confirm that the caller key can see both aliases:

```bash
curl -sS "$AISIX_BASE_URL/v1/models" \
  -H "Authorization: Bearer $PROMPTFOO_CALLER_KEY"
```

The response data should include `eval-stable` and `eval-candidate`.

## Run the evaluation

If you are working in the Promptfoo repository, run the example from the repository root instead:

```bash
npm run local -- eval \
  -c examples/integration-aisix/promptfooconfig.yaml \
  --no-cache \
  --no-share \
  -o /tmp/aisix-promptfoo-results.json
```

For the published CLI package, run:

```bash
npx promptfoo@latest eval \
  -c promptfooconfig.yaml \
  --no-cache \
  --no-share \
  -o /tmp/aisix-promptfoo-results.json
```

A successful run evaluates both test cases against both aliases. Review the matrix instead of treating the aggregate pass rate as proof that the two upstream models behave identically.

## What this example demonstrates

- One Promptfoo suite can compare two caller-facing gateway aliases.
- Upstream provider credentials remain in AISIX rather than the evaluation configuration.
- `--no-cache` prevents Promptfoo's response cache from hiding a fresh gateway request during validation.
- Deterministic assertions avoid introducing a separate model grader and its credentials.

AISIX policies such as routing, caching, rate limits, and guardrails are configured at the gateway. This example intentionally evaluates only the response contract of the two aliases; it does not claim to verify every gateway policy.

For gateway configuration details, see the [AISIX open-source quickstart](https://docs.api7.ai/ai-gateway/getting-started/gateway-quickstart) and [resources-file reference](https://docs.api7.ai/ai-gateway/reference/resources-file).

## Clean up

```bash
docker rm -f aisix-promptfoo
unset OPENAI_API_KEY PROMPTFOO_CALLER_KEY UPSTREAM_STABLE_MODEL UPSTREAM_CANDIDATE_MODEL AISIX_BASE_URL
```

The files in the example directory and the exported Promptfoo result remain on disk. Remove `/tmp/aisix-promptfoo-results.json` manually if you no longer need it.

AISIX is an Apache-2.0-licensed open-source AI gateway maintained by API7.ai. It is an independent project and is not an Apache Software Foundation project.
