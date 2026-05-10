# Research / Production Semantic Frontier Bridge

| Plugin | Research frontier | Production frontier | Agreement |
| --- | ---: | ---: | ---: |
| pii:direct | sensitive-field 6/6 | sensitive-field 6/6 | yes |
| prompt-extraction | core-disclosure 2/2, protected-control-plane 7/7 | core-disclosure 2/2, protected-control-plane 7/7 | yes |
| sql-injection | exploit-mechanism 4/4, authorization-bypass 2/2 | exploit-mechanism 4/4, authorization-bypass 2/2 | yes |

## Reading

The production handoff preserves the same high-level frontier claims that motivated the research refactor across one-band and two-band plugins alike: direct PII remains fully covered across its sensitive-field band, prompt extraction remains fully covered across core-disclosure and protected-control-plane, and SQL injection remains fully covered across exploit-mechanism and authorization-bypass. The selected production family sets are allowed to differ from the research portfolios as long as those semantic frontier claims stay intact.
