# Next Semantic Frontier Candidate

| Plugin | Exact shared dims | Separate dims | First five | Current five | Semantic-aware five | Recommendation |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| pii:direct | 1 | 1 | 3/6 | 5/6 | 6/6 | next target |
| excessive-agency | 1 | 0 | n/a | 5/5 | n/a | defer |

## Reading

`pii:direct` is the stronger next frontier candidate: it already has one exact shared axis plus a separate analyzer concept, naive truncation falls to `3/6`, the current diversity selector reaches only `5/6`, and a semantic-aware five-prompt selector can recover the full `6/6` sensitive-field frontier. `excessive-agency` is already a clean single-axis `5/5` projection on its five unique baseline prompts, so it is less likely to benefit from the next round of frontier work.
