---
sidebar_label: vLLM
description: "Run vLLM's OpenAI-compatible server with promptfoo, including local chat targets, self-hosted judges, and thinking-model grading."
---

# vLLM

[vLLM's OpenAI-compatible server](https://docs.vllm.ai/en/latest/serving/openai_compatible_server/)
implements `/v1/chat/completions`, `/v1/completions`, `/v1/responses`, and `/v1/embeddings`.
Promptfoo connects to it through the OpenAI provider by changing `apiBaseUrl`.

Use this page when:

- vLLM is the model under test
- vLLM is the local LLM-as-a-judge provider for `llm-rubric`, `factuality`, RAG assertions, or red team grading
- your vLLM model returns a separate `reasoning` field and promptfoo should grade only the final `content`

## Start a vLLM server

```bash
vllm serve Qwen/Qwen3-8B \
  --host 0.0.0.0 \
  --port 8000 \
  --served-model-name qwen3-8b \
  --api-key token-abc123
```

Then verify the server directly:

```bash
curl http://localhost:8000/v1/chat/completions \
  -H 'Authorization: Bearer token-abc123' \
  -H 'Content-Type: application/json' \
  -d '{
    "model": "qwen3-8b",
    "messages": [{"role": "user", "content": "Reply with OK"}],
    "max_tokens": 8
  }'
```

`apiBaseUrl` should be the `/v1` root. Promptfoo appends `/chat/completions`,
`/completions`, or `/embeddings` depending on the provider type.

## Use vLLM as the target model

```yaml title="promptfooconfig.yaml"
prompts:
  - '{{question}}'

providers:
  - id: openai:chat:qwen3-8b
    label: vLLM qwen3-8b
    config:
      apiBaseUrl: http://localhost:8000/v1
      apiKey: token-abc123
      temperature: 0.2
      max_tokens: 512

tests:
  - vars:
      question: 'What is the capital of France?'
    assert:
      - type: contains
        value: Paris
```

For completions models, use `openai:completion:<served-model-name>` instead of
`openai:chat:<served-model-name>`.

You can also put the endpoint in an environment variable:

```bash
export OPENAI_BASE_URL=http://localhost:8000/v1
export OPENAI_API_KEY=token-abc123
```

## Use vLLM as an LLM judge

Model-graded assertions call a separate grading provider. Configure that provider under
`defaultTest.options.provider` when every model-graded assertion should use the same vLLM judge:

```yaml title="promptfooconfig.yaml"
prompts:
  - '{{answer}}'

providers:
  # System under test. This can be any provider.
  - echo

defaultTest:
  options:
    provider:
      id: openai:chat:llm_judge
      label: Judge: llm_judge @ vLLM
      config:
        apiBaseUrl: http://localhost:8000/v1
        apiKey: token-abc123
        temperature: 0
        max_tokens: 10000
        showThinking: false

tests:
  - vars:
      answer: 'Use the Forgot password link and verify by email or SMS.'
    assert:
      - type: llm-rubric
        value: |
          Pass if the answer explains how to reset a password and mentions a verification step.
```

Do not repeat `provider: openai:chat:llm_judge` on the `llm-rubric` assertion when the full provider
object already lives in `defaultTest.options.provider`. An assertion-level `provider` overrides the
default provider object, so the `apiBaseUrl`, `apiKey`, `showThinking`, and other config values above
will not be used.

If only one assertion should use vLLM, put the full object on that assertion:

```yaml
assert:
  - type: llm-rubric
    value: 'Answer gives correct password reset instructions'
    provider:
      id: openai:chat:llm_judge
      config:
        apiBaseUrl: http://localhost:8000/v1
        apiKey: token-abc123
        temperature: 0
        max_tokens: 10000
        showThinking: false
```

## Thinking and reasoning models

When vLLM is started with a reasoning parser, responses may include:

- `message.reasoning`: hidden reasoning extracted by vLLM
- `message.content`: final answer

Promptfoo's OpenAI-compatible chat provider includes reasoning in the returned output by default:

```text
Thinking: <reasoning>

<content>
```

That is useful when vLLM is the target model, because assertions can inspect the full visible output.
It is usually wrong when vLLM is the judge, because `llm-rubric` expects the judge response to contain
the final JSON verdict (`{"pass": boolean, "score": number, "reason": string}`). If the reasoning text
contains JSON-looking scratchpad content, promptfoo can parse that before the final verdict.

Set `showThinking: false` on vLLM judge providers so promptfoo discards `reasoning` and parses only
`content`.

### Disable thinking at the vLLM API level

`showThinking: false` only changes what promptfoo reads from the response; the model may still spend
tokens thinking. For Qwen3-style chat templates, vLLM also supports disabling thinking per request
through `chat_template_kwargs`:

```yaml
defaultTest:
  options:
    provider:
      id: openai:chat:llm_judge
      config:
        apiBaseUrl: http://localhost:8000/v1
        apiKey: token-abc123
        showThinking: false
        passthrough:
          chat_template_kwargs:
            enable_thinking: false
```

You can also set a server-wide default when launching vLLM:

```bash
vllm serve Qwen/Qwen3-8B \
  --served-model-name llm_judge \
  --reasoning-parser qwen3 \
  --default-chat-template-kwargs '{"enable_thinking": false}'
```

Use the request-level `passthrough` option when you want promptfoo evals to be explicit and
reproducible. Use the server-level default when every client of that vLLM server should share the
same thinking behavior.

## Provider maps for text and embeddings

Some assertions need a text judge and an embedding model. Use a provider map when a single eval uses
both `llm-rubric` and `similar`:

```yaml
defaultTest:
  options:
    provider:
      text:
        id: openai:chat:llm_judge
        config:
          apiBaseUrl: http://localhost:8000/v1
          apiKey: token-abc123
          temperature: 0
          showThinking: false
      embedding:
        id: openai:embedding:intfloat/e5-large-v2
        config:
          apiBaseUrl: http://localhost:8000/v1
          apiKey: token-abc123
```

## Troubleshooting

| Symptom                                                                   | Fix                                                                                                                                                        |
| ------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `API key is not set`                                                      | Set `apiKey` in provider config, or set `OPENAI_API_KEY`. If vLLM was started without `--api-key`, any placeholder such as `empty` is fine.                |
| `ECONNREFUSED`                                                            | Use `127.0.0.1` instead of `localhost`, verify the vLLM port, and confirm Docker or a remote host exposes the port.                                        |
| Promptfoo calls OpenAI instead of vLLM                                    | Put `apiBaseUrl: http://.../v1` on the provider object, or set `OPENAI_BASE_URL`. Do not set `apiBaseUrl` to `/v1/chat/completions`.                       |
| Judge returns `Could not extract JSON` or parses the wrong JSON           | Set `showThinking: false` on the judge provider and keep the full provider object in `defaultTest.options.provider` or `assert.provider`.                  |
| `assert.provider` appears to ignore `defaultTest.options.provider.config` | This is expected precedence. Use the full provider object at the assertion level, or remove `assert.provider` so the default provider object is inherited. |
| Local models reload between rows                                          | Run with `--max-concurrency 1`; promptfoo groups eligible model-graded calls by grading provider ID to reduce local model switching.                       |

Run with `--no-cache` while debugging:

```bash
promptfoo eval -c promptfooconfig.yaml --no-cache -o results.json
```

Then inspect the judge result:

```bash
jq '.results.results[].gradingResult.componentResults[] | {pass, score, reason}' results.json
```
