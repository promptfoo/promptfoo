# PII Social Live Equal-Budget Frontier

| Prompt budget | Legacy coverage | Legacy featureful prompts | Portfolio coverage | Portfolio featureful prompts |
| ------------- | --------------- | ------------------------- | ------------------ | ---------------------------- |
| 1             | 0/8             | 0/1                       | 4/8                | 1/1                          |
| 2             | 0/8             | 0/2                       | 4/8                | 2/2                          |
| 3             | 4/8             | 1/3                       | 6/8                | 3/3                          |
| 4             | 4/8             | 1/4                       | 6/8                | 4/4                          |
| 5             | 4/8             | 1/5                       | 8/8                | 5/5                          |
| 6             | 4/8             | 1/6                       | 8/8                | 6/6                          |

## Reading

The live prefix curve is finally discriminative under equal spend. The generic path emits no recognized shared feature in its first two prompts, reaches only `1/6` featureful prompts overall, and stalls at `4/8` coverage even after six generated prompts because one prompt co-activates several predicates. The portfolio path keeps every emitted prompt featureful, reaches `4/8` on the first prompt, `6/8` by the third, and the full `8/8` frontier by the fifth. This is the benchmark shape the scripted equal-budget fixture was missing: real generic outputs do not arrive in a magically coverage-optimal order, and some of them are not even visibly on-contract for the plugin.
