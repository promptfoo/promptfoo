## What's Changed

### New Features

- feat(assertions): update factuality grading prompt to improve compatibility across many different providers by @mldangelo in https://github.com/promptfoo/promptfoo/pull/3408
- feat(providers): add support for OpenAI Realtime API by @mldangelo in https://github.com/promptfoo/promptfoo/pull/3383
- feat(providers): update default Anthropic providers to latest version by @mldangelo in https://github.com/promptfoo/promptfoo/pull/3388

### Bug Fixes

- fix(providers): update Bedrock output method signature by @mldangelo in https://github.com/promptfoo/promptfoo/pull/3409
- fix(redteam): correct strategyId for jailbreak by @typpo in https://github.com/promptfoo/promptfoo/pull/3399

### Chores

- chore(cli): set PROMPTFOO_INSECURE_SSL to true by default by @typpo in https://github.com/promptfoo/promptfoo/pull/3397
- chore(webui): add success filter mode by @MrFlounder in https://github.com/promptfoo/promptfoo/pull/3387
- chore(webui): add more copying options in EvalOutputPromptDialog by @typpo in https://github.com/promptfoo/promptfoo/pull/3379
- chore(onboarding): update presets by @typpo in https://github.com/promptfoo/promptfoo/pull/3411
- chore(auth): improve login text formatting by @mldangelo in https://github.com/promptfoo/promptfoo/pull/3389
- chore(init): add fallback to 'main' branch for example fetching by @mldangelo in https://github.com/promptfoo/promptfoo/pull/3417
- chore(prompts): remove unused prompts from grading.ts by @mldangelo in https://github.com/promptfoo/promptfoo/pull/3407
- chore(redteam): update entity extraction prompt by @mldangelo in https://github.com/promptfoo/promptfoo/pull/3405
- chore(deps): update dependencies to latest stable versions by @mldangelo in https://github.com/promptfoo/promptfoo/pull/3385

### Refactor

- refactor(providers): split Anthropic provider into modular components by @mldangelo in https://github.com/promptfoo/promptfoo/pull/3406

### Documentation

- docs(blog): add data poisoning article by @vsauter in https://github.com/promptfoo/promptfoo/pull/2566
- docs(examples): update Amazon Bedrock provider documentation by @mldangelo in https://github.com/promptfoo/promptfoo/pull/3401
- docs(guides): add documentation on testing guardrails by @typpo in https://github.com/promptfoo/promptfoo/pull/3403
- docs(guides): add more content on agent and RAG testing by @typpo in https://github.com/promptfoo/promptfoo/pull/3412
- docs(providers): update AWS Bedrock documentation with Nova details by @mldangelo in https://github.com/promptfoo/promptfoo/pull/3395
- docs(redteam): remove duplicate plugin entry by @mldangelo in https://github.com/promptfoo/promptfoo/pull/3393
- docs(redteam): update examples by @mldangelo in https://github.com/promptfoo/promptfoo/pull/3394
- docs(style): introduce a cursor rule for documentation and do some cleanup by @mldangelo in https://github.com/promptfoo/promptfoo/pull/3404

**Full Changelog**: https://github.com/promptfoo/promptfoo/compare/0.107.0...0.107.2
