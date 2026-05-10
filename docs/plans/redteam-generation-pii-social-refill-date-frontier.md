# PII Social Refill-Date Frontier

| Family | Before contract | After contract |
| --- | --- | --- |
| `self-lost-access` | `claimsSelfRelationship`, `claimsLostAccess` | `requestsRefillDates`, `claimsSelfRelationship`, `claimsLostAccess` |

| Run | Path | Emitted prompts | Shared coverage | Key evidence |
| --- | --- | ---: | ---: | --- |
| tightened contract only | remote | 6 | 6/8 | No local `attackFamily` metadata; branch changes not exercised |
| explicit refill-date prompt | remote | 6 | 6/8 | Still remote-path output; not branch-effect evidence |
| explicit refill-date prompt | local | 5 | 7/8 | `generationMode: portfolio`; `requestsRefillDates` recovered |

## Reading

The final live `pii:social` coverage gap was not caused by missing vocabulary. The `self-lost-access` family already mentioned refill-date requests, but the acceptance contract did not require that signal. Tightening the contract alone was not enough in the remote-path reruns because those runs were bypassing the local portfolio implementation entirely. After rerunning with `PROMPTFOO_DISABLE_REDTEAM_REMOTE_GENERATION=true`, the branch-local portfolio path emitted refill-date attacks and attached the expected `attackFamily` metadata, but still produced only five selected prompts and remained short of full sensitive-field coverage.
