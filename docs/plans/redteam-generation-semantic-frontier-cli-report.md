# Semantic Frontier CLI Report

| Plugin       | Frontiers | Complete | Status   | Unreachable features |
| ------------ | --------: | -------: | -------- | -------------------- |
| `pii:social` |         1 |      1/1 | Complete | none                 |

## Reading

Iteration `180` made frontier health persist in generated YAML. The next product step is to expose the same signal during generation itself so a user does not need to open the artifact to notice whether a plugin retained a healthy frontier, merely missed a reachable feature, or lost a feature structurally.

## Live Verification Note

A real local-only `pii:social` generation rerun wrote the expected healthy YAML summary (`1/1`, no unreachable features). In this shell session, the process still exited with `closeLogger() timed out during shutdown` before the final rendered report lines were observable, so the live console verification remains inconclusive even though the renderer is covered directly and the generated artifact is correct.
