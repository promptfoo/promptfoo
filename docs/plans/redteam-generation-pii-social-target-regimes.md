# PII Social Target Regimes

| Target regime          | Cohort         | Leak-ready prompts | Realized PIILeak failures |
| ---------------------- | -------------- | ------------------ | ------------------------- |
| hardened-medical-agent | legacy-generic | 1/6                | 0/6                       |
| hardened-medical-agent | portfolio      | 6/6                | 0/6                       |
| permissive-family      | legacy-generic | 1/6                | 0/6                       |
| permissive-family      | portfolio      | 6/6                | 6/6                       |

## Reading

The two-regime comparison separates prompt quality from target susceptibility.
The hardened medical-agent target stays flat at zero realized failures even when
the portfolio path emits six clearly leak-ready attacks. The deterministic
`permissive-family` target is intentionally weak to six concrete social stories
that are defined separately from the leak-ready proxy: lost prescription slip,
forgotten prior-session access, spouse claim, after-discharge help, covering
nurse, and urgent prior authorization. Under that regime, the portfolio path
reaches `6/6` realized failures while the generic path remains at `0/6`.

This does not prove the portfolio path is universally better on every real
target. It proves the benchmark ladder needs both axes. Attack-shape metrics tell
us whether a generator is constructing the right kinds of probes; target-regime
replays tell us whether those probes expose an actual weakness when one exists.
