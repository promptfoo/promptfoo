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
- vLLM is the local LLM-as-a-judge provider for model-graded assertions such as
  `llm-rubric`, `g-eval`, `factuality`, `answer-relevance`, `context-*`, or `select-best`
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

For a wiring-only smoke test, a tiny reasoning model such as `Qwen/Qwen3-0.6B` can verify that
promptfoo reaches vLLM and that `showThinking` behaves correctly. Do not use a tiny model as a real
judge; use it only to test the endpoint, parser, and config shape:

```bash
vllm serve Qwen/Qwen3-0.6B \
  --host 0.0.0.0 \
  --port 8000 \
  --served-model-name llm_judge \
  --reasoning-parser qwen3 \
  --max-model-len 4096 \
  --api-key token-abc123
```

### Example judge models

Keep `--served-model-name` short and stable; promptfoo uses that alias in
`openai:chat:<served-model-name>`.

#### GPT-OSS

For GPT-OSS, use the Hugging Face model name as the vLLM model and expose a short served alias.
The example below uses `openai/gpt-oss-20b`; use a larger GPT-OSS checkpoint the same way when your
host has enough memory:

```bash
vllm serve openai/gpt-oss-20b \
  --host 0.0.0.0 \
  --port 8000 \
  --served-model-name gpt-oss-20b \
  --api-key token-abc123
```

Prefer a Linux CUDA or ROCm host for GPT-OSS with vLLM. If CPU or ARM serving fails, check the
[vLLM GPT-OSS recipe](https://docs.vllm.ai/projects/recipes/en/latest/OpenAI/GPT-OSS.html) for the
backend support notes that match your vLLM release.

#### GLM-4.7

For GLM-4.7, use a vLLM and Transformers combination that supports the exact GLM checkpoint you are
serving. The [vLLM GLM recipe](https://docs.vllm.ai/projects/recipes/en/latest/GLM/GLM.html) keeps
the install guidance for GLM releases:

```bash
vllm serve zai-org/GLM-4.7-FP8 \
  --host 0.0.0.0 \
  --port 8000 \
  --served-model-name glm-4.7 \
  --tensor-parallel-size 4 \
  --tool-call-parser glm47 \
  --reasoning-parser glm45 \
  --enable-auto-tool-choice \
  --api-key token-abc123
```

For `zai-org/GLM-4.7-Flash`, use a served name such as `glm-4.7-flash`. If you do not need tool
calling, the tool flags are optional for ordinary model-graded assertions; keep
`--reasoning-parser glm45` when you want vLLM to split reasoning from final content.

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

Do not repeat `provider: openai:chat:llm_judge` on an assertion when the full provider object
already lives in `defaultTest.options.provider`. An assertion-level `provider` overrides the default
provider object, so the `apiBaseUrl`, `apiKey`, `showThinking`, and other config values above will
not be used.

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

- `message.reasoning_content` or `message.reasoning`: hidden reasoning extracted by vLLM
- `message.content`: final answer

Promptfoo's OpenAI-compatible chat provider includes reasoning in the returned output by default:

```text
Thinking: <reasoning>

<content>
```

That is useful when vLLM is the target model, because assertions can inspect the full visible output.
It is usually wrong when vLLM is the judge, because model-graded assertions consume the judge output
as the material to parse, embed, classify, or score. If the reasoning text contains JSON-looking
scratchpad content, attribution markers, candidate sentences, or numeric choices, promptfoo can use
that scratchpad before the final answer.

Set `showThinking: false` on vLLM judge providers so promptfoo discards reasoning fields and parses
only `content`.

This depends on vLLM successfully splitting the response. If the request stops before the model
closes its thinking block, vLLM can return raw `<think>...` text in `message.content` instead of
`reasoning_content`. In that case `showThinking: false` cannot distinguish scratchpad text from
final content. Increase the server `--max-model-len` and provider `max_tokens`, or disable thinking
for judge calls with `chat_template_kwargs.enable_thinking: false`.

`search-rubric` is special because it requires web search. A plain vLLM chat server is not a
web-search-capable grader; promptfoo will prefer or load a search-capable provider instead. The
`showThinking` guidance applies to the search provider that actually grades the assertion.

This applies to every model-graded assertion that consumes text from the judge. JSON-first metrics
can parse scratchpad JSON, RAG metrics can score scratchpad sentences or attribution markers,
`answer-relevance` can embed generated questions with `Thinking:` prepended, and `select-best` can
read a scratchpad number as the winning index.

### Disable thinking at the vLLM API level

`showThinking: false` only changes what promptfoo reads from the response; the model may still spend
tokens thinking. For small local judges and CI smoke tests, disabling thinking is often faster and
avoids truncated `<think>` content. Qwen3 and GLM chat templates support disabling thinking per
request through `chat_template_kwargs`:

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

For GPT-OSS-style chat completions, request-level reasoning controls use different fields:

```yaml
defaultTest:
  options:
    provider:
      id: openai:chat:gpt-oss-20b
      config:
        apiBaseUrl: http://localhost:8000/v1
        apiKey: token-abc123
        showThinking: false
        passthrough:
          include_reasoning: false
          reasoning_effort: low
```

Keep `showThinking: false` even when you pass model-specific controls such as
`include_reasoning: false` or `chat_template_kwargs.enable_thinking: false`. Those controls save
tokens when vLLM honors them; `showThinking: false` is the promptfoo-side guard.

## Provider maps for text and embeddings

Some assertions need a text judge and an embedding model. Use a provider map when a single eval uses
both text-graded assertions and embedding-based assertions such as `answer-relevance` or `similar`:

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

| Symptom                                                                                                  | Fix                                                                                                                                                                                                              |
| -------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `API key is not set`                                                                                     | Set `apiKey` in provider config, or set `OPENAI_API_KEY`. If vLLM was started without `--api-key`, any placeholder such as `empty` is fine.                                                                      |
| `ECONNREFUSED`                                                                                           | Use `127.0.0.1` instead of `localhost`, verify the vLLM port, and confirm Docker or a remote host exposes the port.                                                                                              |
| Promptfoo calls OpenAI instead of vLLM                                                                   | Put `apiBaseUrl: http://.../v1` on the provider object, or set `OPENAI_BASE_URL`. Do not set `apiBaseUrl` to `/v1/chat/completions`.                                                                             |
| Judge returns `Could not extract JSON`, wrong categories, odd RAG scores, or wrong `select-best` winners | Set `showThinking: false` on the judge provider and keep the full provider object in `defaultTest.options.provider` or `assert.provider`.                                                                        |
| Judge output still starts with `<think>` even with `showThinking: false`                                 | The generation was truncated before vLLM split reasoning into `reasoning_content`. Increase `--max-model-len` / `max_tokens`, or disable thinking via `passthrough.chat_template_kwargs.enable_thinking: false`. |
| `search-rubric` uses a different provider than vLLM                                                      | This is expected unless the configured provider has web-search capability. Plain vLLM chat is not a search provider; configure a web-search-capable grader for `search-rubric`.                                  |
| `assert.provider` appears to ignore `defaultTest.options.provider.config`                                | This is expected precedence. Use the full provider object at the assertion level, or remove `assert.provider` so the default provider object is inherited.                                                       |

Run with `--no-cache` while debugging:

```bash
promptfoo eval -c promptfooconfig.yaml --no-cache -o results.json
```

Then inspect the judge result:

```bash
jq '.results.results[].gradingResult.componentResults[] | {pass, score, reason}' results.json
```
