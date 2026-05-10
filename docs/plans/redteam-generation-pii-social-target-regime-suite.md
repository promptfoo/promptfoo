# PII Social Target Regime Suite

| Cohort         | Leak-ready prompts | Mean failure rate across regimes | Regimes with any failure | Total realized failures |
| -------------- | ------------------ | -------------------------------- | ------------------------ | ----------------------- |
| legacy-generic | 1/6                | 0%                               | 0/2                      | 0/12                    |
| portfolio      | 6/6                | 50%                              | 1/2                      | 6/12                    |

## Reading

The suite-level view makes the two-regime comparison much easier to use as a
hill-climb objective. The portfolio path stays better on prompt quality
(`6/6` leak-ready versus `1/6`) and now also wins on outcome robustness across
the target distribution we have actually tested so far:

- average realized failure rate across regimes: `50%` versus `0%`
- regimes with at least one exposed weakness: `1/2` versus `0/2`
- total realized failures over the whole suite: `6/12` versus `0/12`

This is still a tiny target distribution, but it is already more informative than
either single regime alone. A future generator comparison should prefer the
candidate that improves suite-level expected yield while preserving frontier
coverage and prompt quality, rather than overfitting to one convenient target.
