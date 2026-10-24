# physics-consistency-assertion (Deterministic Physical-Law Output Checking)

This example adds a deterministic physics-consistency layer to Promptfoo assertions using **PHM-Lite** — a zero-dependency, pure-JavaScript checker that flags model outputs containing physically impossible statements.

## Why?

Promptfoo's LLM-based grading catches semantic errors. [ATR (Agent Threat Rules)](https://github.com/Agent-Threat-Rule/agent-threat-rules) catches known attack patterns. PHM-Lite catches a third category: **statements that violate universal physical law** — speeds above *c*, temperatures below absolute zero, negative masses, probabilities outside [0, 100%], free-fall timings that cannot happen at 1 *g*. The three layers complement each other:

| Layer | Method | Catches | Cost |
| ------------------------ | --------------- | ------------------------------------------- | --------- |
| Promptfoo grading | LLM rubric | Novel/semantic errors | API calls |
| ATR assertion | Regex | Known text patterns in output strings | None |
| **PHM-Lite assertion** | **Numeric + unit rules** | **Physically impossible numbers and claims** | **None** |

LLMs state impossible physics with high fluency ("the probe reached the planet in 2 hours travelling at 5c", "we cooled the sample to −300 °C"). A deterministic numeric checker catches these classes instantly, on every run, with the same verdict every time — no model in the judge loop.

## Getting Started

No npm install needed — the assertion is a single self-contained ES module.

Materialize this example locally:

```bash
npx promptfoo@latest init --example physics-consistency-assertion
```

Then, from the example directory, run the eval (uses the built-in `echo` provider, no API key):

```bash
npx promptfoo@latest eval
npx promptfoo@latest view
```

The example uses the built-in `echo` provider, so it runs **without any API key**: each test's variable text is echoed as the provider output, and the PHM-Lite assertion runs on that text — demonstrating each rule end-to-end. To check real model output, swap the provider for any Promptfoo provider (e.g. `openai:gpt-4.1-mini`) and keep everything else unchanged.

## Rules Covered

| Rule | Severity | Trigger | Example caught |
| ---------------------- | -------- | ------------------------------------ | --------------------------------- |
| `speed-of-light` | FAIL | speed > c (1% tolerance for rounded notation) | "travels at 1.5 c", "400,000 km/s" |
| `absolute-zero` | FAIL | temperature below −273.15 °C | "cooled to −300 °C" |
| `negative-mass-energy` | FAIL | negative mass/energy quantity | "consumed −5 kg" |
| `percentage-range` | FAIL | a stated percentage outside [0, 100] | "150% confident" |
| `free-fall-time` | WARN | fall time < 85% of the 1 g value for the height | "fell 100 m in 1 s" |
| `percentage-sum` | WARN | multiple percentages summing over 100% | "A: 60%, B: 70%" |

`FAIL` breaks the assertion with score 0. `WARN` (suspicious but not strictly impossible) also fails the assertion but scores 0.5, so soft violations can be separated from hard ones in the results table — flip `FAIL_ON` in the assertion file to score warnings 0 instead.

## Design Guarantees and Limits

- **Deterministic**: on a given Node runtime, repeated runs on identical input produce identical verdicts (verified via a SHA-256 repeated-run check). No model, no sampling.
- **No third-party runtime dependencies**: one ES module using Node ≥ 18 built-ins only. Nothing installed.
- **Designed for no network**: the checker performs no network calls and sends no data anywhere — everything runs inside the Promptfoo process. (Design property, not a runtime-monitored isolation claim.)
- **Scope — exactly the seven rules listed above**: arithmetic and physical-law consistency only. This is not a general physics engine, does not fact-check semantics, and is not a substitute for domain validation. What it flags, it flags because the numbers themselves are impossible — not because they look unusual.
- **The eval in this example is a rule self-test** on the `echo` provider (question text echoed as output), used to demonstrate assertion wiring at zero API cost. It is not a benchmark of model quality; point `providers` at any real model to use it for real.

## Reference Implementations

- Python offline subset implementing the same rule family: [PHM-Audit on GitHub](https://github.com/PHM-Audit) (public repo; not rule-for-rule equivalence-verified against this JS module).
