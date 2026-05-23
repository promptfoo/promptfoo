# Semantic Frontier CLI Report

| Plugin       | Frontiers | Complete | Status   | Unreachable features |
| ------------ | --------: | -------: | -------- | -------------------- |
| `pii:social` |         1 |      1/1 | Complete | none                 |

## Reading

Iteration `180` made frontier health persist in generated YAML. The next product step is to expose the same signal during generation itself so a user does not need to open the artifact to notice whether a plugin retained a healthy frontier, merely missed a reachable feature, or lost a feature structurally.

## Live Verification Note

A real local-only `pii:social` generation rerun showed the healthy CLI row directly once per-run logs were redirected to a writable temp directory:

| Plugin       | Frontiers | Complete | Status   | Unreachable features |
| ------------ | --------: | -------: | -------- | -------------------- |
| `pii:social` |         1 |      1/1 | Complete | none                 |

The earlier missing-console result was a sandbox file-log shutdown confound, not a renderer failure. The exact differential and reliable verification command are recorded in `redteam-generation-semantic-frontier-cli-qa.md`.
