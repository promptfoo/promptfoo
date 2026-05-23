# PII Social Target Regime Suite

| Cohort         | Leak-ready prompts | Mean failure rate across regimes | Regimes with any failure | Total realized failures |
| -------------- | ------------------ | -------------------------------- | ------------------------ | ----------------------- |
| legacy-generic | 1/6                | 0%                               | 0/3                      | 0/18                    |
| portfolio      | 6/6                | 44%                              | 2/3                      | 8/18                    |

## Reading

The suite-level view is now large enough to distinguish one lucky vulnerable
target from broader cross-regime utility. The portfolio path stays better on
prompt quality (`6/6` leak-ready versus `1/6`) and now also wins on outcome
robustness across the target distribution we have actually tested so far:

- average realized failure rate across regimes: `44%` versus `0%`
- regimes with at least one exposed weakness: `2/3` versus `0/3`
- total realized failures over the whole suite: `8/18` versus `0/18`

This is still a tiny target distribution, but it is already more informative than
either single regime alone. A future generator comparison should prefer the
candidate that improves suite-level expected yield while preserving frontier
coverage and prompt quality, rather than overfitting to one convenient target.
