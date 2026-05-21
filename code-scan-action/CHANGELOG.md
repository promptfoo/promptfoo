# Changelog

All notable changes to this package will be documented in this file.

## [0.1.6](https://github.com/promptfoo/promptfoo/compare/code-scan-action-0.1.5...code-scan-action-0.1.6) (2026-05-21)

### Features

- **code-scan:** add SARIF output support ([#9161](https://github.com/promptfoo/promptfoo/issues/9161)) ([4da26e9](https://github.com/promptfoo/promptfoo/commit/4da26e95e4837ad9fd3363dfb52a86e5e1ceb66d))
- **code-scan:** refine SARIF output ergonomics ([#9159](https://github.com/promptfoo/promptfoo/issues/9159)) ([ea3a655](https://github.com/promptfoo/promptfoo/commit/ea3a65521c55a7360cc315efa5f971673fb1f981))

### Bug Fixes

- **code-scan:** honor enable-fork-prs ([#8938](https://github.com/promptfoo/promptfoo/issues/8938)) ([517ec9d](https://github.com/promptfoo/promptfoo/commit/517ec9d3a0589be726bf024ea7d38bc28bb46702))
- **code-scan:** isolate action OIDC token env ([#9309](https://github.com/promptfoo/promptfoo/issues/9309)) ([30c99e9](https://github.com/promptfoo/promptfoo/commit/30c99e924e02160db90385eff6f668c0ee551bc3))
- **code-scan:** scope OIDC token to scan subprocess ([#9308](https://github.com/promptfoo/promptfoo/issues/9308)) ([178b57a](https://github.com/promptfoo/promptfoo/commit/178b57adb39d96d50012afd92a5e1b8e8e12ff75))
- **deps:** update dependency undici to ^7.25.0 ([#9017](https://github.com/promptfoo/promptfoo/issues/9017)) ([5be6015](https://github.com/promptfoo/promptfoo/commit/5be6015ed51bccbaad03fc3c5a48e099f1f552cd))

## [0.1.5](https://github.com/promptfoo/promptfoo/compare/code-scan-action-0.1.4...code-scan-action-0.1.5) (2026-04-14)

### Bug Fixes

- **app:** clarify attack success rate label ([#8387](https://github.com/promptfoo/promptfoo/issues/8387)) ([7482eff](https://github.com/promptfoo/promptfoo/commit/7482eff88f193e857822b43da040638eb4ae1565))
- **code-scan:** avoid npm before env for MCP npx ([#8515](https://github.com/promptfoo/promptfoo/issues/8515)) ([7d2eacd](https://github.com/promptfoo/promptfoo/commit/7d2eacd7820a33de24f8253b1ebe14e23b25faf1))
- **deps:** update dependency undici to ^7.24.5 ([#8411](https://github.com/promptfoo/promptfoo/issues/8411)) ([3d8a24d](https://github.com/promptfoo/promptfoo/commit/3d8a24dcdb06cc729cc9b4d94f7b3f8763d03b9a))

## [0.1.4](https://github.com/promptfoo/code-scan-action/releases/tag/v0.1.4) (2026-01-21)

### Bug Fixes

- pass base branch to CLI for stacked PRs ([#6892](https://github.com/promptfoo/promptfoo/issues/6892)) ([642a409](https://github.com/promptfoo/promptfoo/commit/642a4095dc65e6e875625d5b8ce664a00f7f5835))
- support fork PR auth and comment-triggered scans ([#7038](https://github.com/promptfoo/promptfoo/issues/7038)) ([4eebb81](https://github.com/promptfoo/promptfoo/commit/4eebb81792bb09f44cbb9b67c4f850d223675c05))
