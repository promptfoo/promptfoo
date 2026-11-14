# baseline-vs-ejentum-harness (Cognitive Scaffold Comparison)

You can run this example with:

```bash
npx promptfoo@latest init --example baseline-vs-ejentum-harness
cd baseline-vs-ejentum-harness
```

## Usage

This example provides a controlled comparison between an unaugmented baseline model and the same model augmented with a task-matched cognitive scaffold from the [Ejentum Logic API](https://ejentum.com):

- **baseline-gpt-5.4-mini**: plain OpenAI chat completion via Promptfoo's native OpenAI provider.
- **ejentum-reasoning-gpt-5.4-mini**: pre-fetches a cognitive scaffold from Ejentum and delegates completion execution directly to Promptfoo's maintained OpenAI provider.

Both arms reuse Promptfoo's maintained OpenAI request path with identical configuration (`reasoning_effort: none`, `verbosity: low`, identical decoding parameters). Keep the model settings equal between arms. Repeat the eval to measure variability before interpreting differences in scores.

### Controlled Benchmark Design

Rather than using generic presentation compliance rubrics (which merely reward mentioning words like "trade-offs"), this evaluation evaluates real engineering decision-making and trap resistance across four scenario-specific benchmarks:

1. **Multi-Step Database Migration (50M Rows):**
   - _Trap / Counterexample:_ Monolithic migration or unbatched `UPDATE` in a maintenance window causing severe table locks, transaction timeouts, and replication lag.
   - _Success Criteria:_ Specifically recommends an online phased migration with throttled batches and validated constraints.
2. **Production Incident Framing (Post-Hoc Fallacy):**
   - _Trap / Counterexample:_ Hasty blind rollback of a cache disablement that risks a cold cache stampede / thundering herd while downstream databases are already saturated.
   - _Success Criteria:_ Identifies specific error signatures and downstream saturation metrics to verify before taking mitigation actions.
3. **Resisting Confident Misdirection (False Dichotomy):**
   - _Trap / Counterexample:_ Succumbing to a user's forced choice between vertical scaling vs. sharding.
   - _Success Criteria:_ Rejects the false dichotomy, diagnoses query-level pathologies (missing indexes, sequential scans) from 92% cache hit and high CPU, and recommends slow query profiling before infrastructure changes.
4. **Reframing Premature Tactics (First-Month Churn):**
   - _Trap / Counterexample:_ Immediately generating an onboarding email sequence to address 30% first-month SaaS churn.
   - _Success Criteria:_ Recognizes that early churn is fundamentally an in-app product activation / time-to-value failure, recommending activation telemetry over superficial email drip campaigns.

## Setup

Set `OPENAI_API_KEY` (required for both providers) and `EJENTUM_API_KEY` (required for the augmented provider):

```bash
export OPENAI_API_KEY="your-openai-key"
export EJENTUM_API_KEY="your-ejentum-key"
promptfoo eval --no-cache
```

The augmented arm sends each rendered prompt to Ejentum. Use inputs approved for both services. Get an Ejentum key at <https://ejentum.com/account>.

### Pointing to Custom Endpoints

The Ejentum API endpoint defaults to `https://api.ejentum.com/logicv1/`. You can override it via `config.apiUrl` or `EJENTUM_API_URL`:

```yaml
- id: file://provider.mjs
  label: ejentum-reasoning-gpt-5.4-mini
  config:
    mode: reasoning
    model: gpt-5.4-mini
    apiUrl: https://api.ejentum.com/logicv1/
```

Set the same OpenAI `config.apiBaseUrl` on both arms when targeting a custom model gateway. The adapter receives suite and provider environment variables already merged. If that merged environment contains multiple OpenAI endpoint aliases (`OPENAI_API_HOST`, `OPENAI_API_BASE_URL`, or `OPENAI_BASE_URL`), the adapter requires an explicit `config.apiBaseUrl` or `config.apiHost` before sending the prompt. Other OpenAI configuration options, such as `organization`, `headers`, and `apiKeyEnvar`, are forwarded to the native provider.

## How the Custom Provider Works

`provider.mjs` is an adapter:

1. Calls the Ejentum Logic API (`POST https://api.ejentum.com/logicv1/`) with the test prompt and mode (default: `reasoning`).
2. Splices the returned scaffold into the prompt as a system message.
3. Delegates the completion call directly to Promptfoo's maintained `loadApiProvider('openai:chat:<model>')`, passing all model and endpoint configurations without modification.
