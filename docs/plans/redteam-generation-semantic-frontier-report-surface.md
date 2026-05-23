# Semantic Frontier Report Surface

| Surface            | Source of truth                         | Result |
| ------------------ | --------------------------------------- | ------ |
| generated YAML     | top-level `semanticFrontierDiagnostics` | proven |
| generation CLI     | shared frontier diagnostic reducer      | proven |
| red-team report UI | selected eval rows' test-case metadata  | proven |

## Reading

The report UI does not need a new persistence channel for the top-level generated
config metadata. Evaluated rows already retain the originating test-case
metadata, including each selected attack portfolio's `semanticFrontier`
summary. The smallest useful downstream handoff is therefore to reuse the same
diagnostic reducer against the rows for the currently selected target and render
that derived summary next to the existing overview.

## Resulting Contract

For frontier-aware evaluations, the red-team report now shows one compact row per
plugin with:

- retained frontier count
- completed frontier count
- completion status
- structurally unreachable feature ids, when any exist

This keeps the YAML, CLI, and report UI aligned around one definition of frontier
health without threading a second top-level metadata object through eval storage.
