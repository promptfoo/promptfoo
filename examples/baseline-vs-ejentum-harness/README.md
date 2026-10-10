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

Both arms reuse Promptfoo's maintained OpenAI request path with identical configuration (`reasoning_effort: none`, `verbosity: low`, identical decoding parameters). This ensures strict parameter parity so that differences in evaluation scores are solely attributable to the cognitive scaffolding.

### Controlled Benchmark Design

Rather than using generic presentation compliance rubrics (which merely reward mentioning words like "trade-offs"), this evaluation evaluates real engineering decision-making and trap resistance across four scenario-specific benchmarks:

1. **Multi-Step Database Migration (50M Rows):**
   - *Trap / Counterexample:* Monolithic migration or unbatched `UPDATE` in a maintenance window causing severe table locks, transaction timeouts, and replication lag.
   - *Success Criteria:* Specifically recommends an online phased migration with throttled batches and validated constraints.
2. **Production Incident Framing (Post-Hoc Fallacy):**
   - *Trap / Counterexample:* Hasty blind rollback of a cache disablement that risks a cold cache stampede / thundering herd while downstream databases are already saturated.
   - *Success Criteria:* Identifies specific error signatures and downstream saturation metrics to verify before taking mitigation actions.
3. **Resisting Confident Misdirection (False Dichotomy):**
   - *Trap / Counterexample:* Succumbing to a user's forced choice between vertical scaling vs. sharding.
   - *Success Criteria:* Rejects the false dichotomy, diagnoses query-level pathologies (missing indexes, sequential scans) from 92% cache hit and high CPU, and recommends slow query profiling before infrastructure changes.
4. **Reframing Premature Tactics (First-Month Churn):**
   - *Trap / Counterexample:* Immediately generating an onboarding email sequence to address 30% first-month SaaS churn.
   - *Success Criteria:* Recognizes that early churn is fundamentally an in-app product activation / time-to-value failure, recommending activation telemetry over superficial email drip campaigns.

## Setup

Set `OPENAI_API_KEY` (required for both providers) and `EJENTUM_API_KEY` (required for the augmented provider):

```bash
export OPENAI_API_KEY="your-openai-key"
export EJENTUM_API_KEY="your-ejentum-key"
promptfoo eval --no-cache
```

Get an Ejentum key at <https://ejentum.com/dashboard>.

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

Because `provider.mjs` delegates execution to Promptfoo's native OpenAI provider, all standard OpenAI configuration options (`apiHost`, `apiBaseUrl`, `organization`, `headers`, `apiKeyEnvar`, etc.) work natively and identically across both providers.

## How the Custom Provider Works

`provider.mjs` is a lightweight adapter (~80 lines):

1. Calls the Ejentum Logic API (`POST https://api.ejentum.com/logicv1/`) with the test prompt and mode (default: `reasoning`).
2. Splices the returned scaffold into the prompt as a system message.
3. Delegates the completion call directly to Promptfoo's maintained `loadApiProvider('openai:chat:<model>')`, passing all model and endpoint configurations without modification.
