# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

## [Unreleased]

## [0.118.17] - 2025-10-15

### Changed

- chore: bump version to 0.118.17 (#5936)

### Fixed

- fix(evaluator): support `defaultTest.options.provider` for model-graded assertions (#5931)
- fix(webui): improve UI email validation handling when email is invalid; add better tests (#5932)
- fix(deps): move `claude-agent-sdk` to optionalDependencies (#5935)

### Dependencies

- chore(deps): bump `@aws-sdk/client-bedrock-runtime` from 3.908.0 to 3.910.0 (#5933)

## [0.118.16] - 2025-10-15

### Added

- feat(providers): add TrueFoundry LLM Gateway provider (#5839)
- feat(redteam): add test button for request and response transforms in red-team setup UI (#5482)

### Changed

- chore(providers): count errors in websocket responses as errors (#5915)
- chore(providers): update Alibaba model support (#5919)
- chore(redteam): validate emails after prompt for red team evaluations (#5912)
- chore(redteam): implement web UI email verification (#5928)
- chore(redteam): display estimated probes on red team review page (#5863)
- chore(webui): add flag to hide traces (#5924)
- chore(build): stop tracking TypeScript build cache file (#5914)
- chore(build): update dependencies to latest minor versions (#5916)
- chore(cli): remove duplicate 'Successfully logged in' message from auth login (#5907)
- chore(redteam): add max height and scroll to custom policies container (#5910)
- chore: bump version to 0.118.16 (#5920)
- docs: add docstrings to `feat/ruby-provider` (#5903)
- test: cover red team setup components and hooks in `src/app` (#5911)

### Fixed

- fix(providers): dynamically import `DefaultAzureCredential` from `@azure/identity` (#5921)
- fix(providers): improve debugging and address hanging in websocket provider (#5918)
- fix(http): parse stringified JSON body in provider config (#5927)
- fix(redteam): improve ASR calculation accuracy in redteam report (#5792)

### Documentation

- docs(site): fix typo (#5922)

## [0.118.15] - 2025-10-13

### Added

- feat(providers): add ruby provider (#5902)
- feat(providers): Claude Agent SDK provider support (#5509)
- feat(providers): Azure AI Foundry Assistants provider (#5181)
- feat(providers): add support for streaming websocket responses (#5890)
- feat(providers): snowflake cortex provider (#5882)

### Changed

- chore(providers): add support for new OpenAI models (GPT-5 Pro, gpt-audio-mini, gpt-realtime-mini) (#5876)
- chore(providers): rename azure ai foundry assistant to ai foundry agent (#5908)
- chore(providers): update params passed to azure ai foundry provider (#5906)
- chore(webui): group agentic strategies by turn compatibility in red team UI (#5861)
- chore(webui): sort red team plugins alphabetically by display name (#5862)
- chore(webui): improved color consistency and dark mode legibility on Red Team dashboard (#5829)
- chore(test): add snowflake provider tests and environment variables (#5883)
- chore(config): add conductor config (#5904)

### Fixed

- fix(app): disable red team scan Run Now button when Promptfoo Cloud is unavailable (#5891)
- fix(webui): fix infinite re-render when custom intents are specified (#5897)
- fix(redteam): clean up multilingual strategy logging and fix chunk numbering (#5878)
- fix(redteam): requested column in 'redteam generate' output incorporates fan out strategies (#5864)
- fix(core): resolve Windows path compatibility issues (#5841)
- fix(core): restore correct cache matching behavior for test results (#5879)

### Dependencies

- chore(deps): bump @aws-sdk/client-bedrock-runtime from 3.901.0 to 3.906.0 (#5877)
- chore(deps): bump @aws-sdk/client-bedrock-runtime from 3.906.0 to 3.907.0 (#5888)
- chore(deps): bump openai from 6.2.0 to 6.3.0 (#5887)
- chore(deps): update dependencies to latest safe minor/patch versions (#5900)

### Documentation

- docs(providers): add missing providers and troubleshooting pages to index (#5905)
- docs(guardrails): remove open source guardrails page (#5880)

## [0.118.14] - 2025-10-09

### Changed

- fix: there should always be a guardrails field passed out form openai chat provider (#5874)
- chore: bump version 0.118.14 (#5875)

## [0.118.13] - 2025-10-08

### Added

- feat(cli): Add connectivity tests to promptfoo validate (#5802)
- feat(guardrails): map content filter response to guardrails output (#5859)
- feat(webui): Download full results (#5674)

### Changed

- chore(core): change default log level to debug for network errors (#5860)
- chore(core): Don't log all request error messages (#5870)
- chore(linter): Enforce no unused function params (#5853)
- chore(providers): remove deprecated IBM BAM provider (#5843)
- refactor(webui): improve EvalOutputPromptDialog with grouped dependency injection (#5845)

### Fixed

- fix(webui): Don't prepend fail reasons to output text (#5872)
- fix(redteam): filter out placeholders before purpose generation (#5852)
- fix(tests): make auth login test tolerate colorized output (#5851)

### Dependencies

- chore(deps): bump @azure/identity from 4.12.0 to 4.13.0 (#5858)
- chore(deps): bump langchain-text-splitters from 0.3.5 to 1.0.0a1 in /examples/redteam-langchain in the pip group across 1 directory (#5855)

## [0.118.12] - 2025-10-08

### Added

- feat(providers): add Slack provider (#3469)

### Changed

- feat: postman import for http provider (#5778)
- feat: Bring request transform to parity with response transform (#5850)
- fix: import command (#5794)
- fix: implement remote generation environment variable controls (#5815)
- fix: resolve Windows path handling issues (#5827)
- fix: custom strategy UI (#5834)
- fix: eliminate Python validation race condition on Windows (#5837)
- fix: escape JSON special characters in raw HTTP request variables (#5842)
- fix: Show response headers in test target results (#5848)
- fix: double sharing red teams (#5854)
- chore: update DeepSeek provider to V3.2-Exp (#5787)
- chore: bump the github-actions group with 3 updates (#5789)
- chore: bump openai from 5.23.2 to 6.0.0 (#5790)
- chore: Revert "perf: Don't create new agent for every fetch (#5633)" (#5793)
- chore: add /index to directory imports for ESM compatibility (#5798)
- chore: bump @aws-sdk/client-bedrock-runtime from 3.899.0 to 3.901.0 (#5799)
- chore: bump openai from 6.0.0 to 6.0.1 (#5800)
- chore(telemetry): Add CI flag to identify call (#5801)
- chore: bump openai from 6.0.1 to 6.1.0 (#5806)
- chore: fix npm audit vulnerabilities (#5810)
- chore: Fix incorrect session parser help text (#5811)
- chore(internals): make `runAssertion` easier to read by moving const outside function scope (#5813)
- chore: update investor info and user count (#5816)
- chore(internals): Prevent `GradingResult.assertion` definition from being overridden in select red team grading cases (#5785)
- chore: show "why" in modelaudit ui (#5821)
- chore(site): migrate OG image generation to Satori (#5826)
- chore: remove outdated license notice (#5828)
- chore: show # github stars on site (#5831)
- chore(site): update Docusaurus to v3.9.1 and fix deprecated config (#5835)
- chore: bump openai from 6.1.0 to 6.2.0 (#5844)
- chore: invert default unblocking behavior (#5856)
- chore: bump version 0.118.12 (#5857)
- chore(site): Adds Travis to team page (#5786)
- docs: update readme.md (#5812)
- docs: add CLAUDE.md context files for Claude Code (#5819)
- docs: safety benchmark blog post (#5781)
- docs: update IBM WatsonX model list (#5838)
- docs: add warning against using commit --amend and force push (#5840)
- test: fix vitest timeout error in EvalOutputPromptDialog tests (#5820)
- test: fix flaky Python test failures on Windows (#5824)
- test: add mock cleanup to Python provider tests (#5825)
- refactor: Remove null from GradingResult.assertion type (#5818)

### Fixed

- fix(site): add metadata key to the provider response class (#5796)
- fix(webui): prevent empty state flash when loading large evals (#5797)
- fix(webui): Clicking "Show Charts" does not show charts (#5814)
- fix(webui): remove delimiter stripping logic from EvalOutputCell (#5817)
- fix(provider): merge config and prompt systemInstruction instead of throwing error in gemini (#5823)
- fix(assertions): allow is-refusal to detect refusals in provider error messages (#5830)
- fix(webui): improve usability of number inputs (#5804)
- test: Unit tests for fix(webui): improve usability of number inputs (#5836)

### Documentation

- docs(site): adding new hire bio (#5788)
- docs(site): fix formatting issue in about page (#5803)
- docs(site): add Dane to About page team section (#5833)

## [0.118.11] - 2025-09-30

### Added

- feat(providers): add support for Claude Sonnet 4.5 (#5764)
- feat(providers): add support for Gemini 2.5 Flash and Flash-Lite (#5737)
- feat(providers): add gpt-5-codex model support (#5733)
- feat(providers): add support for Qwen models in AWS Bedrock provider (#5718)
- feat(cli): add browser opening support for auth login command (#5722)
- feat(cli): add team switching functionality (#5750)
- feat(webui): add latency to eval export CSV (#5771)
- feat(cli): sanitize all log objects (#5773)
- feat(providers): add Anthropic web_fetch_20250910 and web_search_20250305 tool support (#5573)
- feat(providers): add CometAPI provider support with environment variable configuration and example usage (#5721)
- feat(providers): add Nscale provider support (#5690)
- feat(providers): add OpenAI gpt-realtime model with full audio support (#5426)
- feat(webui): add metadata `exists` operator to eval results filter (#5697)

### Changed

- chore(cli): improve installer-aware command generation utility for consistent CLI invocation (#5747)
- chore(core): sort metadata entries (#5751)
- chore(core): update error mapping (#5783)
- chore(providers): update Claude 4.5 Sonnet (#5763)
- chore(providers): update default Granite model to granite-3-3-8b-instruct (#5768)
- chore(redteam): remove on-topic call (#5774)
- chore(redteam): update red team init default to gpt-5 (#5756)

### Fixed

- fix(core): ensure `-filter-failing` correctly filters failing tests when re-running an eval (#5770)
- fix(core): ensure Python and JavaScript providers have appropriate path prefix (#5765)
- fix(core): preserve glob patterns in vars context for test case expansion (#5701)
- fix(core): suppress verbose error logging for update check timeouts (#5745)
- fix(providers): improve OpenAI embedding provider error handling (#5742)
- fix(tests): resolve Windows test failures in Python tests (#5767)
- fix(webui): apply proper truncation initialization to variable cells (#5657)
- fix(webui): disable prompt editing in header row dialogs (#5746)
- fix(webui): handle login redirects (#5734)
- fix(webui): improve empty state UI and handle null eval data (#5780)

### Dependencies

- chore(deps): bump @anthropic-ai/sdk from 0.63.1 to 0.64.0 (#5758)
- chore(deps): bump @anthropic-ai/sdk from 0.64.0 to 0.65.0 (#5776)
- chore(deps): bump @aws-sdk/client-bedrock-runtime from 3.896.0 to 3.899.0 (#5777)
- chore(deps): bump openai from 5.23.0 to 5.23.1 (#5759)
- chore(deps): bump openai from 5.23.1 to 5.23.2 (#5775)

### Documentation

- docs(site): add new hire bio (#5769)
- docs(site): improve AWS Bedrock SSO authentication documentation (#5585)
- docs(site): refine and extend e2b sandbox evaluation guide with improved examples and fixes (#5753)
- docs(site): remove incorrect Python globals persistence tip (#5782)
- docs(site): strengthen git workflow warnings in CLAUDE.md (#5762)
- docs(site): write lethal trifecta blog (#5754)

### Tests

- test(webui): add tests for evaluation UI components (`src/app`) (#5766)

## [0.118.10] - 2025-09-26

### Changed

- feat: Revamp HTTP Provider setup (#5717)
- chore: introduce grading provider to RedteamProviderManager (#5741)
- chore(webui): UX improvements for displaying custom policies in Eval Results and Red Team Vulnerabilities Reports (#5562)
- chore: bump version 0.118.10 (#5749)

## [0.118.9] - 2025-09-25

### Changed

- feat: envoy ai gateway provider (#5731)
- feat: iso 42001 mappings (#5724)
- feat: Compress data when sharing an eval (#5738)
- fix: rename agentcore provider to bedrock agents provider (#5709)
- fix: increase timeout for version checks from 1s to 10s (#5715)
- fix: add missing backend support for filtering by highlights, plus tests (#5735)
- chore: improve parsing so in case a redteam provider doesn't take json obje… (#5700)
- chore: bump @aws-sdk/client-bedrock-runtime from 3.893.0 to 3.894.0 (#5706)
- chore: bump openai from 5.22.0 to 5.22.1 (#5707)
- chore: support multilingual provider set from server boot (#5703)
- chore: Add docstrings to `applying-column-format` (#5719)
- chore(webui): in eval creator disable `Run Eval` button if no prompts or test cases are available (#5558)
- chore: bump @aws-sdk/client-bedrock-runtime from 3.894.0 to 3.895.0 (#5727)
- chore: bump @anthropic-ai/sdk from 0.62.0 to 0.63.1 (#5728)
- chore: bump openai from 5.22.1 to 5.23.0 (#5729)
- chore: bump @aws-sdk/client-bedrock-runtime from 3.895.0 to 3.896.0 (#5732)
- chore: bump version 0.118.9 (#5740)

### Fixed

- fix(webui): prioritize JSON prettify over Markdown rendering when both enabled (#5705)
- fix(webui): Copying truncated text in eval results (#5711)
- fix(internals/redteam): decrease debug access grading false negatives (#5713)

## [0.118.8] - 2025-09-23

### Added

- **feat(webui):** populate keys in metadata filters dropdown by [@mldangelo](https://github.com/mldangelo) in [#5584](https://github.com/promptfoo/promptfoo/pull/5584)

### Changed

- **fix:** iterative judge parsing by [@MrFlounder](https://github.com/MrFlounder) in [#5691](https://github.com/promptfoo/promptfoo/pull/5691)  
- **fix:** Promptfoo CLI hanging after command finishes by [@sklein12](https://github.com/sklein12) in [#5698](https://github.com/promptfoo/promptfoo/pull/5698)  
- **fix:** suppress noisy health check logs during dev startup by [@mldangelo](https://github.com/mldangelo) in [#5667](https://github.com/promptfoo/promptfoo/pull/5667)
- **fix:** update more prompts to get less refusal by [@MrFlounder](https://github.com/MrFlounder) in [#5689](https://github.com/promptfoo/promptfoo/pull/5689)
- **chore:** bump version 0.118.8 by [@sklein12](https://github.com/sklein12) in [#5699](https://github.com/promptfoo/promptfoo/pull/5699)  
- **docs:** release notes August by [@ladyofcode](https://github.com/ladyofcode) in [#5625](https://github.com/promptfoo/promptfoo/pull/5625)  

### Documentation

- **docs(site):** add `linkedTargetId` documentation for custom provider linking by [@mldangelo](https://github.com/mldangelo) in [#5684](https://github.com/promptfoo/promptfoo/pull/5684)

## [0.118.7] - 2025-09-22

## [0.118.6] - 2025-09-18

### Added

- feat(redteam): support threshold in custom plugin configuration (#5644)

### Changed

- feat: report filters (#5634)
- feat: Add string array support for context-based assertions (#5631)
- chore: Exclude node modules and build/dist from biome (#5641)
- chore: improvements to framework compliance cards (#5642)
- chore: improve design of eval download dialog (#5622)
- chore: bump @aws-sdk/client-bedrock-runtime from 3.888.0 to 3.890.0 (#5636)
- chore: bump @aws-sdk/client-bedrock-runtime from 3.890.0 to 3.891.0 (#5649)
- chore: bump openai from 5.20.3 to 5.21.0 (#5651)
- chore: update redteam small model to gpt-4.1-mini-2025-04-14 (#5645)
- chore: reduce coloration on Report View Test Suites table (#5643)
- chore: bump version 0.118.6 (#5655)
- fix: handle dynamic imports without eval (#5630)
- fix: Catch exception when no vertex projectId is found (#5640)
- fix: spacing on report view (#5646)
- fix: plugin counts flickering (#5635)

### Fixed

- fix(webui): Filtering eval results on severity (#5632)

## [0.118.5] - 2025-09-16

### Added

- feat(webui): organize `EvalOutputPromptDialog` and convert it to a drawer, (#5619)
- feat(webui): add keyboard navigation to the web UI results table, (#5591)
- feat(webui): enable bulk deletion of eval results, (#5438)
- feat(providers): add `azure:responses` provider alias for Azure Responses API, (#5293)
- feat(providers): support application inference profiles in Bedrock, (#5617)
- feat(redteam): add "layer" strategy for combining multiple strategies, (#5606)
- feat(redteam): set severity on reusable custom policies, (#5539)
- feat(redteam): display unencrypted attacks in the web UI results table, (#5565)
- feat(redteam): enable test generation for custom policies in the plugins view, (#5587)
- feat(redteam): allow uploading CSVs for custom policies, (#5618)
- feat(cli): add ability to pause and resume evals, (#5570)

### Changed

- chore(examples): update model IDs to GPT-5 and latest models, (#5593)
- chore(providers): remove Lambda Labs provider due to API deprecation, (#5599)
- chore(providers): update Cloudflare AI models and remove deprecated ones, (#5590)
- chore(redteam): add MCP plugin preset, (#5557)
- chore(redteam): add UI indicators and documentation for HuggingFace gated datasets in redteam web UI, (#5545)
- chore(internals): improve error logging on redteam test generation failures, (#5458)
- chore(internals): reduce log level of global fetch logs, (#5588)
- chore(server): add context to health check logging during startup, (#5568)
- chore(webui): hide trace timeline section when no traces are available, (#5582)
- chore(webui): improve delete confirmation dialog styling, (#5610)
- chore(webui): remove `React.FC` type annotations for React 19 compatibility, (#5572)
- ci: increase test timeout from 8 to 10 minutes, (#5586)
- ci: temporarily disable macOS Node 24.x tests due to flaky failures, (#5579)
- refactor: move `src/util/file.node.ts` path utilities, (#5596)
- refactor: standardize all directory import paths for ESM compatibility, (#5603)
- refactor: standardize directory import paths for ESM compatibility, (#5605)
- refactor: standardize import paths for ESM preparation, (#5600)
- refactor: standardize TypeScript import paths for ESM compatibility, (#5597)
- test: CoverBot: add tests for UI interaction utilities and components (`src/app`), (#5611)
- chore: update `act` import for React 19 compatibility, (#5574)
- chore(dependencies): bump `@aws-sdk/client-bedrock-runtime` from 3.886.0 to 3.887.0, (#5580)
- chore(dependencies): bump `@aws-sdk/client-bedrock-runtime` from 3.887.0 to 3.888.0, (#5602)
- chore(dependencies): bump `axios` from 1.11.0 to 1.12.0 in npm_and_yarn group across one directory, (#5569)
- chore(dependencies): bump `openai` from 5.20.1 to 5.20.2, (#5601)
- chore(dependencies): bump `openai` from 5.20.2 to 5.20.3, (#5624)
- chore(dependencies): bump version to 0.118.5, (#5626)

### Fixed

- fix(assertions): handle `threshold=0` correctly across all assertion types, (#5581)
- fix(cli): prevent accidental escaping of Python path override, (#5589)
- fix(cli): fix table display for `promptfoo list`, (#5616)
- fix(cli): temporarily disable SIGINT handler, (#5620)
- fix(internal): strip authentication headers in HTTP provider metadata, (#5577)
- fix(redteam): ensure custom policies skip the basic refusal check, (#5614)
- fix(server): hide non-critical `hasModelAuditBeenShared` error logging, (#5607)
- fix(webui): always show failure reasons in the results view when available, (#5608)
- fix(webui): improve filter component styling and layout, (#5604)
- fix(webui): prevent phantom strategy filter options for non-redteam evaluations, (#5575)
- fix(webui): fix undulating CSS header animation, (#5571)

### Documentation

- docs(site): clarify llm-rubric pass/score/threshold semantics, (#5623)

## [0.118.4] - 2025-09-12

### Added

- feat(cli): Add CI-friendly progress reporting for long-running evaluations (#5144)
- feat(cli): Auto-share if connected to the cloud (#5475)
- feat(cli): Log all requests and persist debug logs (#5504)
- feat(internals): Reuse FilterMode type across backend (#5542)
- feat(providers): Add AWS Bedrock AgentCore provider (#5267)
- feat(providers): Extend configuration options for Ollama provider to support thinking (#5212)
- feat(providers): OpenAI real-time custom ws URLs (#5528)
- feat(redteam): Add VLGuard plugin for multi-modal red teaming (#5243)
- feat(redteam): More financial plugins (#5419)
- feat(redteam): Risk scoring (#5191)
- feat(redteam): Special token injection plugin (#5489)
- feat(webui): Add passes-only filter to results view (#5430)

### Changed

- chore(internals): Add probes and token metrics to eval event (#5538)
- chore(internals): Add support for reusable custom policies (#5290)
- chore(internals): Remove node-fetch (#5503)
- chore(internals): Send auth info to cloud (#3744)
- chore(modelaudit): Add support for modelaudit v0.2.5 CLI arguments (#5500)
- chore(onboarding): Add Azure preset (#5537)
- chore(onboarding): Make provider menu single-select (#5536)
- chore(providers): Make OpenAI max retries configurable (#5541)
- chore(providers): Update OpenAI pricing and add missing models (#5495)
- chore(redteam): Consolidate accordion UIs on review page (#5508)
- chore(redteam): Improve user persona question in config (#5559)
- chore(redteam): Minor improvements to red team setup flow (#5523)
- chore(redteam): Retire Pandamonium redteam strategy (#5122)
- chore(redteam): Unify all date formats across tables (#5561)
- chore(redteam): Update plugin prompts to reduce rejection (#5560)
- chore(redteam): Use sharp to modify unsafeBench image formats (#5304)
- perf(webui): Optimize history endpoint to eliminate N+1 queries (#5333)
- refactor(modelaudit): Move modelAuditCliParser.ts to correct directory (#5511)
- refactor(internals): Gracefully handle remote generation disabled in plugins that require it (#5413)
- revert(redteam): Remove red team limits functionality (#5527)

### Fixed

- fix(redteam): Allow users to delete values from numeric inputs and then type (#5530)
- fix(redteam): Deduplicate assertions in DoNotAnswer and XSTest (#5513)
- fix(internals): Eliminate flaky Unicode test timeouts on Windows CI (#5485)
- fix(config): Handle function references in external file loading (#5548)
- fix(providers): Fix MCP tool calls returning [object Object] in Azure Chat provider (#5423)
- fix(config): Preserve Python assertion file references in YAML tests (issue #5519) (#5550)
- fix(providers): Proxy HTTP provider generate request through server (#5486)
- fix(internals): Resolve SIGSEGV crash in evaluator tests on macOS Node 24 (#5525)
- fix(webui): Revert migration from MUI Grid to Grid2 across all components (#5510)
- fix(cli): Use fetch with proxy to get server version (#5490)
- fix(internals): Read evaluateOptions from config file properly (#5375)
- fix(onboarding): Don't throw error when user refuses permission to write (#5535)
- fix(provider): Prioritize explicit projectId config over google-auth-library (#5492)
- fix(providers): Handle system-only prompt in Gemini (#5502)
- fix(providers): Update outdated Azure OpenAI Provider data sources (#5411)
- fix(redteam): Add missing finance graders (#5564)
- fix(redteam): Add missing plugins to webui (#5546)
- fix(redteam): Handle empty string responses in multi-turn strategies (#5549)
- fix(redteam): Prevent JSON blob injection in Crescendo chat templates (#5532)
- fix(webui): Text truncation initialization on eval page (#5483)

### Dependencies

- chore(deps): Bump @anthropic-ai/sdk from 0.61.0 to 0.62.0 (#5551)
- chore(deps): Bump @aws-sdk/client-bedrock-runtime from 3.879.0 to 3.882.0 (#5480)
- chore(deps): Bump @aws-sdk/client-bedrock-runtime from 3.882.0 to 3.883.0 (#5506)
- chore(deps): Bump @aws-sdk/client-bedrock-runtime from 3.883.0 to 3.886.0 (#5553)
- chore(deps): Bump @azure/identity from 4.11.2 to 4.12.0 (#5533)
- chore(deps): Bump langchain-community from 0.3.14 to 0.3.27 in /examples/redteam-langchain in the pip group across 1 directory (#5481)
- chore(deps): Bump langchain-community from 0.3.3 to 0.3.27 in /examples/langchain-python in the pip group across 1 directory (#5484)
- chore(deps): Bump openai from 5.19.1 to 5.20.0 (#5526)
- chore(deps): Bump openai from 5.20.0 to 5.20.1 (#5552)
- chore(deps): Bump version to 0.118.4 (#5567)
- chore(deps): Bump vite from 6.3.5 to 6.3.6 in the npm_and_yarn group across 1 directory (#5531)

### Documentation

- docs(e2b-example): Add e2b-code-eval example (promptfoo + e2b sandbox) (#5477)
- docs(examples): Add Google ADK integration example (#5520)
- docs(examples): Add YAML schema directives to example configs (#5476)
- docs(redteam): Add missing plugins to sidebar and improve bias docs (#5498)
- docs(site): Add Alan DeLong to the team section on the About page (#5507)
- docs(site): Add comprehensive multilingual evaluation support (#5505)
- docs(site): Add SKIP_OG_GENERATION environment variable for faster docs builds (#5521)
- docs(site): Clarify file extension requirements for custom providers (#5478)
- docs(site): Clarify JFrog ML vs JFrog Artifactory distinction (#5543)
- docs(site): Complete parameters page migration (#5494)
- docs(site): Redteam limits documentation (#5516)
- docs(site): Update Lily bio (#5515)
- docs(site): Updates to agent guide (#5499)
- docs(site): Latency assertion description (#5479)

### Tests

- test(webui): CoverBot: Added tests for frontend UI components and discovery utility (`src/app`) (#5514)

## [0.118.3] - 2025-09-04

### Changed

- Add AWS Bedrock support for OpenAI GPT OSS models (#5444)
- Add Amazon Bedrock API key authentication support (#5468)
- Ability to filter evals view by severity (#5443)
- Check cloud permissions for target before running red team (#5400)
- Make vars and context available for request transform (#5461)
- Add Vertex AI responseSchema file loading support (#5414)
- Close menus when mouse leaves (#5456)
- Default sharing to false (#5473)
- Handle empty function arguments in OpenAI Responses API tool callbacks (#5454)
- Improve Windows Python detection and add sys.executable support (#5467)
- Prioritize tool calls over content in openrouter provider (#5417)
- Support commandLineOptions.envPath in config files (#5415)
- Support setting HELICONE_API_KEY for Cloud Gateway (#5465)
- Token tracking (#5239)
- Add "results" menu, link to red team reports view (#5459)
- Bump version 0.118.3 (#5474)
- Include provider response metadata on test case transform (#5316)
- Refactor Crescendo maxTurns property (#4528)
- Remove accidental server directory (#5471)
- Replace direct process.env calls with environment helpers (#5472)
- Reorganize misplaced test files from src/ to test/ directory (#5470)
- Fix enterprise email (#5463)
- Bump openai from 5.18.1 to 5.19.1 (#5466)
- Add Tusk test runner workflow for src Jest unit tests (#5469)

## [0.118.2] - 2025-09-03

### Added

- feat(providers): Add support for Meta Llama API provider (#5432)
- feat(providers): Support TLS certs in http provider (#5452)
- feat(providers): add support for xAI Grok Code Fast models (#5425)

### Changed

- fix: Update util.ts to reflect correct Anthropic Haiku 3.5 pricing (#5436)
- chore: drop Node.js 18 support (#5428)
- chore(http): improve PFX debug logging + tests (#5445)
- chore(webui): Show footer on custom metrics dialog (#5424)
- chore: silence dotenv commercial logging messages (#5453)
- chore: remove example (#5420)
- test: CoverBot: Added tests for analytics tracking and red team reporting components (`src/app`) (#5441)
- test: optimize Python Unicode test suite for CI reliability (#5449)
- chore: bump the github-actions group with 3 updates (#5440)
- chore: update dependencies (non-breaking) (#5448)
- chore: update dependencies to latest minor/patch versions (#5433)

### Fixed

- fix(sharing): Share when it's enabled via the Config or the CLI command (#5404)
- fix(grader): reduce grader false positives (#5431)

### Documentation

- docs(site): add more guardrails assertion doc (#5434)
- docs(site): add multi-lingual RAG evaluation guidance (#5447)
- docs(site): optimize OG image generation performance (#5451)
- docs(site): update blog post (#5422)

## [0.118.1] - 2025-08-29

### Added

- feat(redteam): Add AI auto-fill for HTTP target configuration in redteam target setup ui (#5391)
- feat(redteam): Handle uploaded signatureAuth in target setup ui (#5405)

### Changed

- chore(site): integrate pylon chat into site (#5407)

### Fixed

- fix(providers): Handle Qwen tool call responses in openrouter provider (#5416)

### Documentation

- docs(site): avoid logging full image/base64; use boolean presence only (#5408)

## [0.118.0] - 2025-08-28

### Added

- feat(providers): add support for database-stored certificates in HTTP provider for promptfoo cloud (#5401)

### Changed

- fix: stop progress bar to show a clearer share error message (#5399)
- chore(internals)!: send provider-transformed output directly to test context transforms (#5376)
  **Breaking:** `contextTransform` now receives the provider transform directly.
- chore(providers): sanitize sensitive credentials in HTTP provider debug logs (#5387)
- chore: warn when tests and red-team configuration are both present during generation (#5398)
- chore(release): bump version to 0.118.0 (#5402)
- test: add tests for CoverBot store management and red-team reporting components (`src/app`) (#5372)

### Documentation

- docs(site): update model-graded metrics (#5285)
- docs(site): remove references to "parallel" introduced by #5376 (#5403)

## [0.117.11] - 2025-08-27

### Added

- feat(redteam): add -t/--target option to redteam generate command (#5338)

### Changed

- feat: MCP Agent example to red team with tool call results (#5379)
- feat: medical offlabel use (#5342)
- feat: modelaudit ability to remove recent paths (#5330)
- fix: Address design nits in redteam setup UI (#5264)
- fix: allow custom ApiProvider instances in defaultTest configuration (#5381)
- fix: mcp eval example (#5390)
- fix: Prioritize tool calls over thinking for openrouter reasoning models (#5395)
- fix: use `model` role for gemini ai studio models (#5386)
- chore: Adjust padding in plugins page (#5396)
- chore: bump version 0.117.11 (#5397)
- chore(CI): enable and refactor Docker build for caching (#5374)
- chore: remove promptfoo/package-lock.json (#5380)
- chore: visual formatting for modelaudit flat list (#5331)
- refactor(webui): Clicking "show more" on eval results metric pills renders dialog (#5337)
- docs: expose sidebar on pages that aren't in the sidebar (#5377)
- docs: model audit ci/cd (#5335)
- docs: remove orphaned star animation gif (#5383)
- docs: update site user count to 150,000+ across site constants and pages (#5394)
- chore: bump @aws-sdk/client-bedrock-runtime from 3.873.0 to 3.876.0 (#5392)
- chore: bump openai from 5.15.0 to 5.16.0 (#5388)

### Documentation

- docs(site): fix context transform examples to use context.vars.prompt (#5393)

## [0.117.10] - 2025-08-25

### Changed

- feat: improve HuggingFace dataset fetching performance and reliability (#5346)
- feat: add Google AI Studio default providers (#5361)
- feat: share model audit scans to cloud (#5336)
- feat: add google vertex credentials in config (#5179)
- fix: safe raw HTTP templating via Nunjucks raw-wrap + CRLF normalization (#5358)
- fix: improve JSON export error handling for large datasets (#5344)
- fix: replace raw-request editor with auto-growing textarea to prevent layout overflow (#5369)
- chore: better error messages for browser (#5226)
- chore: improve strategy presets (#5357)
- chore: set onboarding defaults to gpt 5 (#5360)
- chore: update dependencies to latest minor versions (#5363)
- chore: log posthog errors to debug (#5359)
- chore: sync dependencies (#5367)
- test: clean up skipped tests and add FunctionCallbackHandler coverage (#5366)
- chore: bump version 0.117.10 (#5373)
- docs: add critical git workflow guidelines to CLAUDE.md (#5362)
- docs: add SARIF output format documentation for ModelAudit (#5364)

### Fixed

- fix(CI): refactor docker build (#5353)
- fix(internals): defaultTest.provider doesn't override  (#5348)

## [0.117.8] - 2025-08-20

### Added

- feat(redteam): make unblock call optional for multi-turn strategies  (#5292)

### Changed

- fix: add lru-cache dependency (#5309)
- chore: many plugins and strategies selected warning (#5306)
- chore: add max max concurrency to generate (#5305)
- chore: bump version 0.117.8 (#5311)
- ci: add depcheck (#5310)

## [0.117.7] - 2025-08-19

### Added

- feat(site): add hero image for red teaming tools blog post (#5291)
- feat(webui): Demarcate redteam results (#5255)

### Changed

- feat: Add unverifiable claims red team plugin (#5190)
- fix: lower sharing chunk size (#5270)
- chore(webui): Rename "Redteam" to "Red Team" in evals datagrid (#5288)
- chore: bump version 0.117.7 (#5299)
- test: CoverBot: Added test coverage for History page component (`src/app`) (#5289)
- docs: add open source ai red teaming tools post (#5259)
- docs: add red team github action info (#5294)

### Fixed

- fix(webui/reports): Don't exclude failure cases from stats (#5298)
- fix(internals): Gracefully handle object responses during target purpose discovery (#5236)
- fix(site): fix YAML front matter parsing error in jailbreaking blog post (#5287)
- fix(webui): Improved handling of long loglines (#5227)

### Documentation

- docs(site): add AI Safety vs AI Security blog post with interactive quiz (#5268)
- docs(site): add blog post about prompt injection vs jailbreaking differences (#5282)
- docs(site): document transform and contextTransform for model-graded assertions (#5258)
- docs(site): improve context assertion documentation (#5249)

## [0.117.6] - 2025-08-18

### Changed

- feat: Add Agent provider types in red team setup (#5244)
- feat: add update check for modelaudit package (#5278)
- feat: add update notification banner to web UI (#5279)
- feat: edit and replay requests in details dialog (#5242)
- feat: Surface run options and probes on red team review page (#5272)
- fix: composite indices and query optimization (#5275)
- fix: exclude errors from report (#5271)
- fix: Fix json-output example (#5213)
- fix: handle json schema for openrouter provider (#5284)
- fix: handle thinking tokens for openrouter (#5263)
- fix: OpenAI Responses API function callbacks and Azure implementation (#5176)
- fix: throw error instead of failing when trace data is unavailable (#5192)
- perf(webui): Reduces eval results load-time when filters are applied via search param (#5234)
- chore: add bias to foundation plugins list (#5280)
- chore: Add .serena to .gitignore (#5225)
- chore: bump version 0.117.6 (#5273)
- chore: fix model id name (#5232)
- chore: improve generated constants handling to prevent accidental commits (#5148)
- chore: remove file (#5229)
- chore: show final prompt in table view for attacks that mutate prompts (#5269)
- chore: simplify eval progress bar (#5238)
- chore: update dark mode styles, formatting, etc (#5251)
- chore(webui): Don't show loading animations while streaming eval results (#5201)
- chore(webui/eval results): Sticky header sticks to the top of the viewport (#5208)
- test: CoverBot: Added tests for red team reporting components (`src/app`) (#5228)
- docs: Add AWS Bedrock Guardrails image testing documentation (#5253)
- docs: add july release notes (#5133)
- docs: hide events banner (#5217)
- docs: separate malicious code plugin documentation (#5222)
- chore: bump @anthropic-ai/sdk from 0.58.0 to 0.59.0 (#5218)
- chore: bump @anthropic-ai/sdk from 0.59.0 to 0.60.0 (#5257)
- chore: bump @aws-sdk/client-bedrock-runtime from 3.862.0 to 3.863.0 (#5211)
- chore: bump @aws-sdk/client-bedrock-runtime from 3.863.0 to 3.864.0 (#5221)
- chore: bump openai from 5.12.0 to 5.12.1 (#5210)
- chore: bump openai from 5.12.1 to 5.12.2 (#5219)
- chore: bump pypdf from 5.7.0 to 6.0.0 in /examples/rag-full in the pip group across 1 directory (#5252)
- chore: bump the npm_and_yarn group with 2 updates (#5276)

### Fixed

- fix(provider): Remove maxTokens for gpt-5 calls (#5224)
- fix(providers): Validate that OpenAI response reasoning outputs have summary items (#5235)
- fix(site): suppress noisy font loading warnings in OG image plugin (#5254)

### Documentation

- docs(site): add cross-links between multimodal strategy documentation (#5241)
- docs(site): add missing meta descriptions and optimize existing ones for SEO (#5247)
- docs(site): enhance OG image generation with full metadata support (#5246)
- docs(site): remove unused markdown-page.md (#5245)

## [0.117.5] - 2025-08-08

### Added

- feat(assertions): add conversational relevancy metric (#2130)
- feat(export): add metadata to exported evaluation files (#4886)
- feat(providers): add support for Docker Model Runner provider (#5081)
- feat(webui): add plugin and strategy filters for red team results (#5086)

### Changed

- feat: add GPT-5 support (#5205)
- feat: add collapsible header to ResultsView (#5159)
- feat: add contains-html and is-html assertions (#5161)
- feat: add Google Imagen image generation support (#5104)
- feat: add max-score assertion for objective output selection (#5067)
- feat: add selected state to provider type picker (#5152)
- feat: add unified page wrapper around each red team setup step (#5136)
- feat: apply plugin modifiers for crescendo (#5032)
- feat: help text to nudge towards better red teams (#5153)
- feat: improve red team plugin selection UI with test generation (#5125)
- feat: respect prompt config override in all providers (#5189)
- feat: update red team provider selection UI (#5078)
- fix: adjust padding on docs sidebar to prevent overlap (#5099)
- fix: fix XML crash (#5194)
- fix: list reasoning tokens on the left side of token breakdown tooltip (#5113)
- fix: map critical severity to error in ModelAudit scanner output (#5098)
- fix: prevent double stateful target question in strategies page (#4988)
- fix: prevent Unicode corruption in Python providers (#5108)
- fix: remove problematic caching from ModelAudit installation check (#5120)
- fix: replace broken Ashby iframe with link to careers page (#5088)
- fix: reset provider type correctly and handle Go providers (#5154)
- fix: share debugging (#5131)
- chore: add link to documentation in plugin sample modal (#5193)
- chore: add missing image back to home page (#5196)
- chore: fix width on application details page (#5139)
- chore: improve RAG metrics with detailed metadata and fix context relevance scoring (#5164)
- chore: memoize context value in PostHog provider (#5089)
- chore: remove accidentally committed PR description file (#5175)
- chore: rename scan templates to attack profiles (#5165)
- chore: support verbosity and reasoning parameters for GPT-5 (#5207)
- chore: update dependencies to latest minor and patch versions (#5109)
- chore: update dependencies to latest minor and patch versions (#5173)
- chore: update Replicate provider (#5085)
- chore(providers): improve Google API key error handling and test reliability (#5147)
- chore(webui): add intelligent scroll-timeline polyfill loading (#5130)
- chore: bump @anthropic-ai/sdk from 0.57.0 to 0.58.0 (#5186)
- chore: bump @aws-sdk/client-bedrock-runtime from 3.848.0 to 3.855.0 (#5096)
- chore: bump @aws-sdk/client-bedrock-runtime from 3.855.0 to 3.856.0 (#5107)
- chore: bump @aws-sdk/client-bedrock-runtime from 3.856.0 to 3.857.0 (#5126)
- chore: bump @aws-sdk/client-bedrock-runtime from 3.857.0 to 3.858.0 (#5145)
- chore: bump @aws-sdk/client-bedrock-runtime from 3.858.0 to 3.859.0 (#5167)
- chore: bump @aws-sdk/client-bedrock-runtime from 3.859.0 to 3.861.0 (#5188)
- chore: bump @aws-sdk/client-bedrock-runtime from 3.861.0 to 3.862.0 (#5198)
- chore: bump @azure/identity from 4.10.2 to 4.11.0 (#5180)
- chore: bump @azure/identity from 4.11.0 to 4.11.1 (#5185)
- chore: bump openai from 5.10.2 to 5.11.0 (#5127)
- chore: bump openai from 5.11.0 to 5.12.0 (#5187)
- chore: bump version to 0.117.5 (#5206)
- chore(webui/evals): filter by categorical plugins (#5118)
- docs: add bert-score example (#5091)
- docs: add dynamic OG image generation for social media previews (#5157)
- docs: add red teaming best practices (#5155)
- docs: clarify contains-any/contains-all CSV format (#5150)
- docs: fix company name (#5143)
- docs: fix images (#5197)
- docs: fix multi-turn strategy documentation (#5156)
- docs: guide for evaluating LangGraph agents with Promptfoo (#4926)
- docs: include font for meta image (#5158)
- docs: make MCP image taller (#5199)
- docs: update Ollama documentation with latest models and defaultTest guidance (#5084)
- perf: make database migrations non-blocking and fix error handling (#5105)
- style: extract helper function for deduplicating strategy IDs (#5138)
- test: add tests for fix width on application details page (#5140)
- test: add tests for red team compliance reporting utilities in src/app (#5170)
- test: fix flaky Python Unicode tests (#5128)
- test: fix modelGradedClosedQa test segmentation fault on macOS/Node 24 (#5163)
- test: increase test coverage for unified page wrapper around each red team setup step (#5142)

### Fixed

- fix(internals): force CommonJS mode for db:migrate in Node 24 (#5123)
- fix(openrouter): handle Gemini thinking tokens correctly (#5116)
- fix(providers): correct WebP image detection in Google provider (#5171)
- fix(webui): deduplicate strategy IDs (#5132)
- fix(webui): fix custom policy validation timing issue (#5141)
- fix(webui): refresh eval list when navigating back after editing eval name (#5090)
- fix(webui/evals): prevent applying the same plugin/strategy multiple times (#5114)
- fix(webui/evals): show highlights after search results (#5137)

### Documentation

- docs(site): add comprehensive command line options documentation (#5135)
- docs(site): add Lily Liu to team page (#5177)
- docs(site): add Series A post (#5097)
- docs(site): rename will.jpg to will.jpeg for consistency (#5178)

## [0.117.4] - 2025-07-29

### Changed

- fix: progress bars incrementing beyond their maximum values (#5049)
- docs: clarifiy derivedMetrics documentation (#5068)
- chore: refactor token tracking utilities, track all tokens (#4897)
- fix: resolve Jest test failures and open handles (#5052)
- fix: skip validation for defaultTest to allow partial test case properties (#4732)
- chore: add new fields to eval_ran telemetry (#4638)
- chore(redteam): improve redteam plugin error messaging (#4330)
- feat: add support for OpenAI deep research models (#4661)
- feat: add mcp server (#4595)
- feat: add support for connecting to existing Chrome browser sessions (#5069)
- docs: update defcon posting (#5070)
- docs: update defcon posting (#5071)
- fix: Nested config field for custom target json (#5076)
- docs: switch to likert preview image (#5083)
- test: CoverBot: Added tests for model audit and prompt management UI components (`src/app`) (#5087)
- fix: handle multi-line prompts in parseGeneratedPrompts for testGenerationInstructions (#5093)
- chore: bump version 0.117.4 (#5094)

### Fixed

- fix(providers): Preserve text formatting when no images present for Google provider (#5058)
- fix(simba): fix simba host (#5092)

### Documentation

- docs(site): add AI red teaming for first-timers blog post (#5017)
- docs(blog): defcon and blackhat info (#5050)

## [0.117.3] - 2025-07-25

### Added

- feat(eval-creator): add YAML file upload support for test cases (#5054)

### Changed

- fix: improve x.ai provider error handling for 502 errors (#5051)
- fix: Infinite re-render on redteam review page (#5061)
- fix: sessionid(s) in extension hooks (#5053)
- fix: Bias Plugins should send config in remote generation (#5064)
- chore(redteam): regenerate sessionId for each iteration in single-turn strategies (#4835)
- chore: Change mcp log from error to debug (#5060)
- chore: Improve telemetry (#5062)
- chore: Add simba command (#5063)
- chore(webui): improve redteam setup UI with progressive disclosure for advanced options (#5028)
- refactor: remove redundant dotenv from Vite app (#4983)
- chore: bump version 0.117.3 (#5066)
- test: CoverBot: Added tests for eval-creator components and feature flag hook (`src/app`) (#5013)
- docs: fix cli command and remove gratuitous hover (#5056)
- docs: update user count from 100,000 to 125,000 (#5046)
- docs: updates to political bias post (#5057)
- docs: improve crewai eval example (#5035)
- docs: update GitHub Actions to v4 across documentation and examples (#5008)
- docs: add style check guidance to CLAUDE.md (#5065)

### Fixed

- fix(webui): Eval results pass rate chart rendering incorrect percentages (#5048)
- fix(webui): Eval results histogram improvements (#5059)
- fix(google): handle multiple candidates in gemini response (#5020)

### Documentation

- docs(blog): grok-4 political bias post (#4953)

## [0.117.2] - 2025-07-24

### Added

- feat(webui): First-class support for zooming eval results table by @will-holley in #4966
- feat(webui): Apply metrics filter when clicking on a metric pill rendered in eval results cell by @will-holley in #4991

### Changed

- feat: Grading and test generation improvements for BFLA, BOLA and RBAC by @sklein12 in #4982
- feat: New Sample Target by @sklein12 in #4979
- feat: HTTP Target test button improvements by @faizanminhas in #5007
- feat: Add metadata filtering to eval results by @will-holley in #5014
- fix: add goal related rubric when grade crescendo turns to increase grading accuracy by @MrFlounder in #4980
- fix: update HTTP config generator endpoint to use v1 API by @mldangelo in #4989
- fix: View logs button on redteam report by @sklein12 in #5009
- fix: undo unintended changes to http config editor by @faizanminhas in #5012
- fix: Autofocus on Redteam configuration description field by @sklein12 in #5019
- fix: remove filter icon by @sklein12 in #5021
- fix: Ollama token usage by @SamPatt in #5022
- chore: revert eval view ui improvements by @mldangelo in #4969
- chore(webui): Improvements to pagination "go to" functionality by @will-holley in #4976
- chore(webui): Eval results sticky header improvements by @will-holley in #4978
- chore: update custom strategy prompt by @MrFlounder in #4994
- chore(cli): add support for 'help' argument to display command help by @mldangelo in #4823
- chore(examples): remove redteam-agent example by @mldangelo in #5001
- chore(providers): add GEMINI_API_KEY environment variable support by @mldangelo in #5004
- chore(webui): Migrate from JS to CSS for eval results scroll effects by @will-holley in #4995
- chore(webui): Eval result pagination UX improvements by @will-holley in #4993
- chore: Sort imports and turn on rule against unused imports by @faizanminhas in #5010
- chore: Make default target stateful by @faizanminhas in #4992
- chore: add medical plugins collection by @MrFlounder in #5006
- chore: Improve grading accuracy with Goal-Aware Grading for iterative/iterative tree by @MrFlounder in #4996
- chore: Add additionalRubric and storedGraderResult to GOAT and Custom providers by @MrFlounder in #5015
- chore: prevent testGenerationInstructions from being serialized if not present by @faizanminhas in #5029
- chore: Add lint rule to ensure key in jsx by @faizanminhas in #5034
- chore(webui): Eval Results UI Tweaks by @will-holley in #5023
- chore: skip goal extraction for datasets by @MrFlounder in #5036
- chore(providers): add GitHub Models provider by @mldangelo in #4998
- chore: bump version 0.117.2 by @MrFlounder in #5045
- ci: increase build job timeout from 4 to 5 minutes by @mldangelo in #5043
- test: refactor share.test.ts to prevent flaky timeouts by @mldangelo in #5037
- test: remove share.test.ts file by @mldangelo in #5044
- docs: remove label from featured blog post by @typpo in #5011
- chore: bump @aws-sdk/client-bedrock-runtime from 3.846.0 to 3.848.0 by @dependabot in #4985
- chore: bump the npm_and_yarn group with 2 updates by @dependabot in #4984
- chore: bump @anthropic-ai/sdk from 0.56.0 to 0.57.0 by @dependabot in #5016
- chore: bump openai from 5.10.1 to 5.10.2 by @dependabot in #5024
- chore: bump the npm_and_yarn group with 2 updates by @dependabot in #5026
- chore: bump axios from 1.10.0 to 1.11.0 in the npm_and_yarn group by @dependabot in #5031

### Fixed

- fix(redteam): find plugin assertion in strategy providers by @MrFlounder in #4981
- fix(site): dark mode style on redteam setup ui by @mldangelo in #5000
- fix(test): improve share test isolation to prevent CI timeouts by @mldangelo in #5038

### Documentation

- docs(providers): update OpenAI Assistants example by @aloisklink in #4987
- docs(redteam): improve custom strategy documentation by @mldangelo in #4990
- docs(blog): correct author attribution in DeepSeek censorship post by @mldangelo in #5002
- docs(openai): remove gpt-4.5-preview references after API deprecation by @mldangelo in #5005
- docs(site): vegas contact redirect by @typpo in #5033
- docs(browser): improve browser provider documentation and examples by @mldangelo in #5030
- docs(providers): remove deprecated claude-3-sonnet-20240229 model references by @mldangelo in #5018
- docs(site): add hipaa badge by @typpo in #5039
- docs(site): add documentation for using text and embedding providers with Azure by @mldangelo in #5027
- docs(blog): fix missing blog posts by removing even-number enforcement by @mldangelo in #5042

## [0.117.1] - 2025-07-17

### Changed

- fix: move inquirer dependencies to production dependencies (#4973)
- fix: grading in crescendo (#4960)
- fix: composite strategy test generation (#4971)
- chore: bump version 0.117.1 (#4974)
- docs: remove tags from blog card (#4970)

### Documentation

- docs(blog): add system cards security analysis with vulnerability testing (#4937)

## [0.117.0] - 2025-07-17

### Added

- feat(http): support JKS and PFX Certificates in HTTP providers (#4865)
- feat(langfuse): add Langfuse prompt label support with improved parsing (#4847)
- feat(prompts): preserve function names when using glob patterns (#4927)
- feat(providers): add grok-4 support (#4855)
- feat(providers): image understanding for Google providers (#4767)
- feat(azure): add system prompt support for azure provider (#4869)
- feat(cli): xml output (#4912)

### Changed

- chore(knip): integrate knip for unused code detection and clean up codebase (#4464)
- chore(linting): migrate from ESLint + Prettier to Biome (#4903)
- chore(assertions): additional checking on llm-rubric response (#4954)
- chore(assertions): include reason in model-graded-closedqa pass reason (#4931)
- chore(build): resolve build warnings and optimize bundle size (#4895)
- chore(csv): improve __metadata warning message and test coverage (#4842)
- chore(providers): improve guardrails handling in Azure providers (#4788)
- chore(redteam): add domain-specific risks section and reduce verbose descriptions (#4879)
- chore(release): bump version 0.117.0 (#4963)
- chore(server): check if server is already running before starting (#4896)
- chore(server): log correct eval ID instead of description in WebSocket updates (#4910)
- chore(telemetry): add telemetry logging when tracing is enabled (#4925)
- chore(types): typings needed for enterprise (#4955)
- chore(vscode): use Biome as default formatter of TS files in vscode (#4920)
- chore(webui): conditionally render metrics selector (#4936)
- chore(webui): display context values in eval results (#4856)
- chore(webui): improves eval results table spacing (#4965)
- chore(webui): revert eval view ui improvements (#4967)
- chore(webui/eval): allow filtering results by >1 metrics simultaneously (disabled by default) (#4870)
- refactor(eval-config): modernize eval-creator state management (#4908)
- refactor(webui): improve metrics ui (#4938)
- refactor(webui/eval results): pagination improvements (#4914)

### Fixed

- fix(cli): --filter-failing not working with custom providers (#4911)
- fix(google-sheets): replace hardcoded range with dynamic approach (#4822)
- fix(internal): fixes filtering by metric keys which contain dots (#4964)
- fix(providers): add thinking token tracking for Google Gemini models (#4944)
- fix(providers): esm provider loading (#4915)
- fix(providers): implement callEmbeddingApi for LiteLLM embedding provider (#4952)
- fix(redteam): prevent redteam run from hanging when using an mcp client (#4924)
- fix(redteam): respect PROMPTFOO_DISABLE_REDTEAM_REMOTE_GENERATION for cloud users (#4839)
- fix(redteam): set pluginId on eval results (#4928)
- fix(redteam): test target in http provider setup with non-200 status codes (#4932)
- fix(webui): eval results table horizontal scrolling (#4826)
- fix(webui): fix hard-coded light mode colors in model audit interface (#4907)
- fix(webui): handle null table.body in DownloadMenu disabled prop (#4913)
- fix(webui): resolve pagination scrolling and layout issues in ResultsTable (#4943)
- fix(webui): scrolling when `tbody` is outside of viewport (#4948)

### Dependencies

- chore(deps): add overrides to fix build issues (#4957)
- chore(deps): bump @aws-sdk/client-bedrock-runtime from 3.842.0 to 3.844.0 (#4850)
- chore(deps): bump aiohttp from 3.11.11 to 3.12.14 in /examples/redteam-langchain in the pip group across 1 directory (#4922)
- chore(deps): bump openai from 5.8.3 to 5.9.0 (#4863)
- chore(deps): bump openai from 5.9.2 to 5.10.1 (#4961)
- chore(deps): move knip to dev dependencies (#4958)
- chore(deps): npm audit fix (#4962)
- chore(deps): test removing knip to resolve installation errors (#4956)
- chore(deps): update all example dependencies to latest versions (#4900)
- chore(deps): update dependencies to latest minor/patch versions (#4899)
- chore(deps): update non-breaking dependencies (#4935)
- chore(deps): update Jest to version 30 (#4939)

### Documentation

- docs(analytics): add google tag manager (#4904)
- docs(api): improves `contextTransform` documentation (#4854)
- docs(assertions): add missing deterministic assertions (#4891)
- docs(azure): improve Azure provider documentation (#4836)
- docs(blog): add blog image generation script (#4945)
- docs(blog): add truncation markers to articles without them (#4934)
- docs(blog): add truncation markers to blog posts (#4906)
- docs(blog): mcp proxy blog (#4860)
- docs(blog): revise article tags (#4949)
- docs(blog): soc2 type ii and iso 27001 blog (#4880)
- docs(comparison): pyrit comparison (#4679)
- docs(config): clarify PROMPTFOO_EVAL_TIMEOUT_MS and PROMPTFOO_MAX_EVAL_TIME_MS descriptions (#4947)
- docs(enterprise): adaptive guardrails enterprise (#4951)
- docs(events): blackhat landing page (#4862)
- docs(events): defcon landing page (#4864)
- docs(events): events banner (#4867)
- docs(examples): add mischievous-user strategy to redteam multi-turn examples (#4837)
- docs(gemini): update experimental Gemini model IDs to stable versions (#4894)
- docs(google): add examples for gemini URL context and code execution tools (#4923)
- docs(guide): guide for evaluating CrewAI agents with Promptfoo (#4861)
- docs(images): standardize CrewAI image filenames to kebab-case (#4941)
- docs(integration): add n8n integration (#4917)
- docs(litellm): fix example with modern model IDs and proper embedding config (#4885)
- docs(mcp): add mcp testing guide (#4846)
- docs(mcp): add mcp to sidebar (#4852)
- docs(metrics): add similar to model graded metrics table (#4830)
- docs(providers): update available databricks models (#4887)
- docs(providers): update provider index with missing providers and latest 2025 model IDs (#4888)
- docs(release): add monthly release notes (#4358)
- docs(resources): add arsenal link (#4878)
- docs(security): add soc2 badge (#4877)
- docs(site): add OWASP top 10 tldr blog post (#4853)
- docs(site): expand June 2025 release notes with detailed feature documentation (#4881)
- docs(site): improve Google AI and Vertex authentication documentation (#4892)
- docs(site): improve NLP metric explanations and add SEO metadata (#4890)
- docs(site): update python documentation for basePath config option (#4819)
- docs(ui): better mobile wrap on homepage tabs (#4884)
- docs(ui): colors (#4875)
- docs(ui): contrast fixes (#4901)
- docs(ui): fix button clickability issue on hero sections (#4905)
- docs(ui): remove bouncing down arrow in mobile (#4882)
- docs(ui): remove text shadow (#4898)

### Tests

- test(core): coverBot: added tests for core UI components and user context hooks (`src/app`) (#4929)
- test(EnterpriseBanner): add unit tests for EnterpriseBanner component (#4919)
- test(redteam): add unit test for src/redteam/remoteGeneration.ts (#4834)
- test(server): fix flaky server share tests (#4942)
- test(server): fix flaky server tests (#4968)
- test(server): mock database in server tests (#4959)
- test(tusk): update Tusk test runner workflow - coverage script (#4921)

## [0.116.7] - 2025-07-09

### Changed

- fix: Always do remote generation if logged into cloud (#4832)
- chore(providers/sagemaker): Improves error handling in SageMakerCompletionProvider (#4808)
- chore(providers/sagemaker): Improves validation of user-provided config (#4809)
- chore: update graderExamplesString (#4821)
- chore: bump version 0.116.7 (#4833)

## [0.116.6] - 2025-07-09

### Changed

- fix: Failing test (#4829)
- chore: bump version 0.116.6 (#4831)

## [0.116.5] - 2025-07-09

### Changed

- feat: add support for loading defaultTest from external files (#4720)
- feat: add embedding support to LiteLLM provider (#4804)
- feat: add mischievous user strategy (#4107)
- fix: add glob pattern support for loading scenario files (#4761)
- fix: improve model-audit installation check dark mode display (#4816)
- fix: pass env vars to MCP server (#4827)
- chore: better remote grading logs (#4820)
- chore: bump openai from 5.8.2 to 5.8.3 (#4817)
- chore: bump version 0.116.5 (#4828)
- chore: capitalize 'Red Team' in navigation menu for consistency (#4799)
- chore: remove redundant 'Done.' message from evaluation output (#4810)
- chore: remove python script result data type debug log (#4807)
- chore: update website with MCP Proxy (#4812)
- docs: add Azure OpenAI vision example (#4806)
- docs: add looper guide (#4814)
- docs: add SonarQube integration (#4815)
- test: add unit test for src/assertions/guardrails.ts (#4765)
- test: add unit test for src/redteam/commands/generate.ts (#4789)
- test: add unit test for src/redteam/constants/strategies.ts (#4800)
- test: add unit test for src/redteam/plugins/pii.ts (#4780)
- test: add unit test for src/types/providers.ts (#4766)
- test: add unit test for src/validators/redteam.ts (#4803)

## [0.116.4] - 2025-07-08

### Added

- feat(redteam): add support for custom multi-turn strategy by @MrFlounder in #4783
- feat(redteam): expose generate function in redteam namespace by @mldangelo in #4793

### Changed

- chore: bump version 0.116.4 by @MrFlounder in #4805
- chore: rename strategy name from playbook to custom by @MrFlounder in #4798
- refactor: inline MEMORY_POISONING_PLUGIN_ID constant by @mldangelo in #4794
- docs: add doc for custom strategy by @MrFlounder in #4802
- docs: modular configuration management by @typpo in #4763

## [0.116.3] - 2025-07-07

### Added

- feat(providers): add MCP provider (#4768)
- feat(providers): add new AIMLAPI provider (#4721)
- feat(assertions): add contextTransform support for RAG evaluation (#4467)
- feat(assertions): add finish reason as assertion option (#3879)
- feat(assertions): trace assertions (#4750)
- feat(tracing): add traces to JavaScript, Python asserts (#4745)

### Changed

- chore(schema): remove duplicate 'bias' entry in config-schema.json (#4773)
- chore(telemetry): add PostHog client to app (#4726)
- chore(redteam): add reason field to give clear/customized guardrails triggering reason (#4764)
- chore(providers): expose MCP plugin in UI (#4762)
- chore(providers): AWS SageMaker AI provider cleanup (#4667)
- chore(providers): update AIML integration (#4751)
- chore(redteam): improve organization of redteam strategies in setup UI (#4738)
- chore(telemetry): identify to PostHog whether user is also cloud user (#4782)
- chore: expose doRedteamRun in package exports (#4758)
- docs: add Gemini Live API audio (#4729)
- docs: ModelAudit vs ModelScan (#4769)
- docs: multiple MCP server connections (#4755)
- docs: update ModelAudit documentation with new features and fixes (#4699)
- test: add integrity check for generated-constants.ts (#4753)
- test: fix flaky Google Live test and improve test speed (#4774)
- test: fix mock pollution in testCaseReader (#4775)
- test: isolate mocks so tests can run in any order with --randomize (#4744)

### Fixed

- fix(telemetry): prevent PostHog initialization when telemetry is disabled (#4772)
- fix(redteam): fix modifiers application order in PII plugins (#4779)

### Dependencies

- chore(deps): bump @anthropic-ai/sdk from 0.55.1 to 0.56.0 (#4756)
- chore(deps): bump @aws-sdk/client-bedrock-runtime from 3.840.0 to 3.842.0 (#4747)
- chore(deps): bump @azure/identity from 4.10.1 to 4.10.2 (#4748)
- chore(deps): bump version 0.116.3 (#4792)
- chore(deps): update pbkdf2 to 3.1.3 (#4777)
- chore(deps): upgrade glob from v10 to v11 (#4776)

## [0.116.2] - 2025-07-02

### Changed

- fix: unblock postbuild for ci by @MrFlounder in #4742
- chore: bump version 0.116.2 by @MrFlounder in #4743

## [0.116.1] - 2025-07-02

### Added

- feat(cli): support pdb tracing in 3rd party Python scripts by @will-holley in #4723

### Changed

- fix: http body parsing when it comes from yaml string by @MrFlounder in #4728
- fix: remove accidentally committed redteam.yaml file by @mldangelo in #4733
- fix: fix the case when http body has not escaped charactors by @MrFlounder in #4739
- fix: update package-lock.json by @mldangelo in #4719
- test: fix SIGSEGV caused by better-sqlite3 in test environment by @mldangelo in #4737
- chore: Add unblocking detection to GOAT strategy by @MrFlounder in #4532
- chore: add preset for guardrails eval by @MrFlounder in #4640
- chore: Improve telemetry delivery by @sklein12 in #4655
- chore: reset generated constants after build by @mldangelo in #4731
- chore: update onboarding model defaults by @typpo in #4708
- chore(webui): improve styling of EvalsDataGrid by @mldangelo in #4736
- ci(workflows): gracefully handle missing PostHog secret in forks by @ggiiaa in #4725
- test: refactor assertion tests by @mldangelo in #4718
- chore: bump version 0.116.1 by @MrFlounder in #4741
- docs: add system prompt hardening blog post by @ladyofcode in #4630
- chore: bump @anthropic-ai/sdk from 0.55.0 to 0.55.1 by @dependabot in #4710
- chore: bump @aws-sdk/client-bedrock-runtime from 3.839.0 to 3.840.0 by @dependabot in #4709

### Fixed

- fix(webui): replace window.location.href with React Router navigation by @mldangelo in #4717

### Documentation

- docs(site): add guide on humanity's last exam by @mldangelo in #4694
- docs(site): clarify self-hosting workflow for eval sharing by @mldangelo in #4730
- docs(site): fix relative link in HLE benchmark guide by @mldangelo in #4711

## [0.116.0] - 2025-07-01

### Added

- feat(redteam): add financial plugins (#4416)
- feat(redteam): add bias plugins (#4382)
- feat(providers): add Helicone AI Gateway provider (#4662)

### Changed

- chore: enable WAL mode for SQLite (#4104)
- chore(providers): add thread ID function call for OpenAI and Azure assistants (#2263)
- chore(app): improve target test error handling (#4652)
- chore(cli): add missing CLI options to scan-model command for feature parity (#4670)
- chore(providers): convert Cloudflare AI to use OpenAI-compatible endpoints (#4683)
- chore(providers): log flagged output for Azure chat models (#4636)
- chore(redteam): add centralized REDTEAM_DEFAULTS and maxConcurrency support (#4656)
- chore(webui): add checkbox to clear all variables (#666)
- chore(webui): add defaultTest variables to red team setup UI (#4671)
- chore(webui): remove unused components (#4695)
- chore(webui): set page titles on every page (#4668)
- chore(telemetry): add pass/fail/errors to eval_run event (#4639)
- chore(telemetry): improve page view deduplication (#4651)
- test: add unit test for src/server/routes/providers.ts (#4658)
- test: verify that plugins are synced between code and documentation (#4681)

### Fixed

- fix(app): use client-generated session IDs when testing targets (#4653)
- fix(matchers): track token usage for successful API calls (#4677)
- fix(providers): handle content filter errors in Azure Assistant API (#4674)
- fix(providers): fix SageMaker Llama inference configuration serialization (#4637)
- fix(redteam): respect maxConcurrency from Web UI (#4605)
- fix(simulated-user): pass context variables to custom providers (#4654)
- fix(telemetry): add telemetry for red teams (#4641)
- fix(webui): handle undefined outputs in DownloadMenu (#4693)
- fix(webui): prevent pass/fail badge from disappearing when toggling highlight (#4700)
- fix(webui): support derived metrics in eval configuration uploaded via Web UI (#4647)
- fix(webui): use backendCounts first before counting metrics on page (#4659)
- fix(sharing): fix file outputs when sharing (#4698)

### Dependencies

- chore(deps): bump @anthropic-ai/sdk from 0.54.0 to 0.55.0 (#4628)
- chore(deps): bump openai from 5.7.0 to 5.8.1 (#4664)
- chore(deps): bump version to 0.116.0 (#4707)
- chore(deps): update minor and patch dependencies (#4686)

### Documentation

- docs(site): add async Python note (#4680)
- docs(site): add Garak comparison (#4660)
- docs(site): update Garak post (#4672)
- docs(site): add ModelAudit HuggingFace scanner (#4645)
- docs(redteam): add missing docs to sidebar (#4690)
- docs(redteam): remove duplicate ToxicChat plugin (#4689)
- docs(redteam): update Target Purpose documentation (#4523)
- docs(site): add FAQ section for offline environment usage (#4650)
- docs(site): add HuggingFace datasets integration documentation (#4691)
- docs(site): add truncation marker to Garak blog post (#4666)
- docs(site): clarify self-hosting replica limitations (#4669)
- docs(site): remove copy for LLM button (#4665)
- docs(site): remove unnecessary configuration review text from getting started guide (#4597)
- docs(site): reorganize configuration documentation structure (#4692)
- docs(site): use relative URLs for internal links and fix broken references (#4688)
- docs(site): correct typos in red team agent blog post (#4634)

## [0.115.4] - 2025-06-25

### Changed

- feat: opentelemetry tracing support (#4600)
- chore: bump version 0.115.4 (#4635)
- chore: remove invariant (#4633)
- chore: update Tusk test runner workflow (#4627)*
- docs: prevent copy button from overlapping screenshot overlay (#4632)

## [0.115.3] - 2025-06-24

### Changed

- fix: empty vars array on eval results [#4621](https://github.com/promptfoo/promptfoo/pull/4621) by @sklein12
- fix: save sessionId for multi-turn strategies [#4625](https://github.com/promptfoo/promptfoo/pull/4625) by @sklein12
- chore: PROMPTFOO_DISABLE_TEMPLATE_ENV_VARS controls process.env access, not `env:` access [#4620](https://github.com/promptfoo/promptfoo/pull/4620) by @mldangelo
- chore: bump version to 0.115.3 [#4626](https://github.com/promptfoo/promptfoo/pull/4626) by @sklein12

### Fixed

- fix(webui): handle null scores in ResultsCharts component [#4610](https://github.com/promptfoo/promptfoo/pull/4610) by @mldangelo
- fix(redteam): skip goal extraction when remote generation is disabled [#4623](https://github.com/promptfoo/promptfoo/pull/4623) by @mldangelo
- fix(test): hyperbolic provider tests failing due to env variable pollution [#4619](https://github.com/promptfoo/promptfoo/pull/4619) by @mldangelo
- fix(cli): remove context schema validation from extension hooks [#4622](https://github.com/promptfoo/promptfoo/pull/4622) by @will-holley

## [0.115.2] - 2025-06-24

### Added

- feat(cli): add assertion generation (#4559)
- feat(providers): add support for hyperbolic image and audio providers (#4260)

### Changed

- chore(redteam): add cross-session leak strategy exclusions (#4516)
- chore(cli): display key metrics (success, failures, pass rate) at the bottom of output (#4580)
- chore: remove unused import (#4530)
- chore(webui): show provider breakdown only for multiple providers (#4599)
- chore(redteam): update Target Purpose Discovery (#4480)
- chore(ci): update CodeRabbit config to be less aggressive (#4586)
- chore(providers): update Gemini models to include latest 2.5 Pro Preview and Flash models (#4499)
- chore(providers): update tau-simulated-user docs and example (#4468)
- chore(webui): use CSS to create PDF-optimized report and browser to save as PDF (#4535)
- chore(app): remove discovered purpose from report view (#4541)
- chore(cli): add cache busting for select provider API calls (#4508)
- chore(cli): improve concurrency log statements (#4606)
- chore(eval): add first-class support for `beforeAll` and `beforeEach` extension hooks mutation of context (#4197)
- chore(providers): document support for loading system instructions from files (#4582)
- chore(providers): enhance OpenAI provider with legacy models and new parameters (#4502)
- chore(redteam): add continueAfterSuccess option to multi-turn strategies (#4570)
- chore(webui): improve purpose form (#4603)
- chore(redteam): add JSON file support to intent plugin with enhanced UI (#4574)
- chore(redteam): add unblock multiturn (#4498)
- chore(ci): clean up CodeRabbit configuration and minimize automated comments (#4573)
- build: update Tusk vitest reporter (#4602)
- chore: bump version to 0.115.2 (#4617)
- docs: add audit logging documentation for enterprise features (#4482)
- docs: add feedback page and update CLI link (#4591)
- docs: add ISO badge (#4534)
- docs: improve contact form (#4531)
- docs: update ModelAudit documentation (#4585)
- docs: clarify no OpenAI key required for Claude redteam (#4524)
- docs: add red team Gemini documentation (#4542)
- docs: add trust center documentation (#4539)
- docs: update contact form (#4529)
- test: add unit test for src/commands/delete.ts (#4572)
- test: add unit test for src/commands/modelScan.ts (#4526)
- test: add unit test for src/commands/show.ts (#4571)
- test: add unit test for src/providers/azure/completion.ts (#4510)
- test: add unit test for src/providers/ollama.ts (#4509)
- test: add unit test for src/providers/ollama.ts (#4512)
- test: add unit test for src/providers/openai/completion.ts (#4511)
- test: add unit test for src/python/pythonUtils.ts (#4486)
- test: improve mock setup and teardown for --randomize (#4569)

### Fixed

- fix(openrouter): unpack passthrough at the root level (#4592)
- fix(webui): escape HTML special characters in output reports (#4555)
- fix(webui): sort EvalsDataGrid by creation date (#4594)
- fix(cli): include cached results in grand total (#4581)
- fix(webui): improve base64 matching (#4609)
- fix(modelaudit): use modelaudit binary (#4525)
- fix(webui): make Citations font consistent with other headers (#4598)
- fix(redteam): respect maxTurns from dev doc in crescendo (#4527)
- fix(webui): prevent Welcome component from rendering while loading eval data (#4604)
- fix(cli): prevent RangeError in progress bar variable display (#4475)
- fix(server): resolve Express.js NotFoundError when serving app (#4601)

### Dependencies

- chore(deps): bump @aws-sdk/client-bedrock-runtime from 3.830.0 to 3.835.0 (#4614)
- chore(deps): bump openai from 5.5.0 to 5.5.1 (#4537)
- chore(deps): bump openai from 5.5.1 to 5.6.0 (#4596)
- chore(deps): bump openai from 5.6.0 to 5.7.0 (#4615)
- chore(deps): bump urllib3 from 1.26.19 to 2.5.0 in /examples/docker-code-generation-sandbox (#4556)
- chore(deps): bump urllib3 from 2.3.0 to 2.5.0 in /examples/redteam-langchain (#4557)

### Documentation

- docs(blog): add authors to blog posts and update authors.yml (#4564)
- docs(blog): add descriptions and keywords to blog posts (#4565)
- docs(examples): add pydantic-ai example with structured output evaluation (#4575)
- docs(examples): consolidate Google Vertex Tools examples (#4587)
- docs(examples): consolidate Python assertion examples into unified folder (#4588)
- docs(examples): consolidate translation examples (#4590)
- docs(site): document new features in ModelAudit (#4593)
- docs(site): document new features in modelaudit (#4593)
- docs(site): fix author reference on 2025-summer-new-redteam-agent blog post (#4563)
- docs(site): Update ModelAudit scanners documentation with comprehensive scanner coverage (#4562)

## [0.115.1] - 2025-06-17

### Changed

- fix: Windows Python path validation race condition (#4485)
- fix: View results as evaluation runs (#4459)
- chore: refactor modifiers and apply to all plugins (#4454)
- chore(cli): update plugin severity overrides API endpoint (#4460)
- chore(webui): fix text length reset value to use reasonable default (#4469)
- chore(webui): remove unused hook files (#4470)
- chore: remove unused token usage utilities (#4471)
- chore: convert console.logs to logger (#4479)
- chore: improve tusk workflow (#4461)
- chore: bump version to 0.115.1 (#4520)
- docs: add log file location section to troubleshooting guide (#4473)
- docs: capitalize Promptfoo (#4515)
- docs: update red-teaming agent blog post title (#4497)
- docs: improve installation and getting-started pages with tabbed interface and SEO metadata (#4395)
- docs: improve Python provider documentation (#4484)
- docs: add ModelAudit binary formats documentation (#4500)
- docs: update ModelAudit documentation (#4514)
- docs: add ModelAudit weighted distribution scanner documentation (#4501)
- docs: add ModelAudit ZIP feature documentation (#4491)
- docs: separate pages for prompts, test cases, and outputs (#4505)
- docs: update model reference in guide.md (#4513)
- docs: fix typo in blog post (#4496)
- docs: update title on blog post (#4495)
- test: add unit test for src/util/cloud.ts (#4462)
- test: add unit test for src/util/convertEvalResultsToTable.ts (#4457)

### Dependencies

- chore(deps): bump @aws-sdk/client-bedrock-runtime from 3.828.0 to 3.830.0 (#4519)
- chore(deps): bump @azure/identity from 4.10.0 to 4.10.1 (#4477)
- chore(deps): bump openai from 5.3.0 to 5.5.0 (#4518)
- chore(deps): update zod to 3.25.63 and zod-validation-error to 3.5.0 (#4463)

### Documentation

- docs(blog): add new redteam agent documentation (#4494)
- docs(examples): fix custom-grader-csv README inconsistencies (#4474)
- docs(site): add llms.txt mentions and documentation standards (#4481)
- docs(site): add robots.txt (#4488)

## [0.115.0] - 2025-06-12

### Added

- feat(providers): Google live audio output ([#4280](https://github.com/promptfoo/promptfoo/pull/4280)) by **@adelmuursepp**
- feat(webui): static model-scanning UI ([#4368](https://github.com/promptfoo/promptfoo/pull/4368)) by **@typpo**
- feat(tests): configuration support for test generators ([#4301](https://github.com/promptfoo/promptfoo/pull/4301)) by **@mldangelo**
- feat(cli): per-provider token-usage statistics ([#4044](https://github.com/promptfoo/promptfoo/pull/4044)) by **@mldangelo**
- feat(providers): optional token-estimation for HTTP provider ([#4439](https://github.com/promptfoo/promptfoo/pull/4439)) by **@mldangelo**
- feat(redteam): enable HTTP-token estimation by default in red-team mode ([#4449](https://github.com/promptfoo/promptfoo/pull/4449)) by **@mldangelo**
- feat(redteam): cloud-based plugin-severity overrides ([#4348](https://github.com/promptfoo/promptfoo/pull/4348)) by **@will-holley**
- feat(providers): custom-header support for Azure API ([#4409](https://github.com/promptfoo/promptfoo/pull/4409)) by **@yurchik11**
- feat(core): maximum evaluation-time limit via `PROMPTFOO_MAX_EVAL_TIME_MS` ([#4322](https://github.com/promptfoo/promptfoo/pull/4322)) by **@mldangelo**
- feat(redteam): Aegis red-team dataset ([#4119](https://github.com/promptfoo/promptfoo/pull/4119)) by **@mldangelo**
- feat(providers): Mistral Magistral reasoning models ([#4435](https://github.com/promptfoo/promptfoo/pull/4435)) by **@mldangelo**
- feat(core): WebSocket header support ([#4456](https://github.com/promptfoo/promptfoo/pull/4456)) by **@typpo**

### Changed

- refactor(redteam): consolidate constants ([#4372](https://github.com/promptfoo/promptfoo/pull/4372)) by **@mldangelo**
- chore(ci): set CodeRabbit review settings ([#4413](https://github.com/promptfoo/promptfoo/pull/4413)) by **@sklein12**
- chore(core): coding-rules for error messages ([#4401](https://github.com/promptfoo/promptfoo/pull/4401)) by **@sklein12**
- chore(core): improve `RangeError` diagnostics ([#4431](https://github.com/promptfoo/promptfoo/pull/4431)) by **@mldangelo**
- chore(core): prefer remote-purpose generation ([#4444](https://github.com/promptfoo/promptfoo/pull/4444)) by **@typpo**
- chore(core): remove unused types & deprecated functions ([#4450](https://github.com/promptfoo/promptfoo/pull/4450)) by **@mldangelo**
- chore(cursor): local-dev guidance for coding agents ([#4403](https://github.com/promptfoo/promptfoo/pull/4403)) by **@mldangelo**
- chore(docs): add README for missing examples ([#4404](https://github.com/promptfoo/promptfoo/pull/4404)) by **@mldangelo**
- chore(providers): initial o3-pro support ([#4397](https://github.com/promptfoo/promptfoo/pull/4397)) by **@mldangelo**
- chore(providers): o3-pro improvements ([#4396](https://github.com/promptfoo/promptfoo/pull/4396)) by **@mldangelo**
- chore(redteam): delimit user-inputs in purpose discovery ([#4405](https://github.com/promptfoo/promptfoo/pull/4405)) by **@typpo**
- chore(redteam): turn off discovery by default ([#4393](https://github.com/promptfoo/promptfoo/pull/4393)) by **@sklein12**
- chore(release): bump version → 0.115.0 ([#4451](https://github.com/promptfoo/promptfoo/pull/4451)) by **@mldangelo**
- chore(ui): improve `EvalOutputPromptDialog` styling ([#4364](https://github.com/promptfoo/promptfoo/pull/4364)) by **@typpo**
- chore(webui): remove extra OpenAI targets ([#4447](https://github.com/promptfoo/promptfoo/pull/4447)) by **@mldangelo**
- chore(webui): add token-estimation UI ([#4448](https://github.com/promptfoo/promptfoo/pull/4448)) by **@mldangelo**

### Fixed

- fix(eval): gracefully handle `RangeError` & truncate oversized output ([#4424](https://github.com/promptfoo/promptfoo/pull/4424)) by **@Sly1029**
- fix(providers): add timeout to `ProxyAgent` ([#4369](https://github.com/promptfoo/promptfoo/pull/4369)) by **@AegisAurora**
- fix(config): persist Goat configuration ([#4370](https://github.com/promptfoo/promptfoo/pull/4370)) by **@sklein12**
- fix(parser): lenient JSON parsing for MathPrompt ([#4361](https://github.com/promptfoo/promptfoo/pull/4361)) by **@typpo**
- fix(redteam): standardize plugin parameter to `prompt` ([#4425](https://github.com/promptfoo/promptfoo/pull/4425)) by **@mldangelo**
- fix(assertions): support `snake_case` fields in Python assertions ([#4398](https://github.com/promptfoo/promptfoo/pull/4398)) by **@mldangelo**
- fix(redteam): handle purpose without prompts ([#4445](https://github.com/promptfoo/promptfoo/pull/4445)) by **@typpo**
- fix(webui): stream test-cases to viewer ([#4440](https://github.com/promptfoo/promptfoo/pull/4440)) by **@mldangelo**
- fix(redteam): connect `MisinformationDisinformationGrader` ([#4452](https://github.com/promptfoo/promptfoo/pull/4452)) by **@mldangelo**

### Dependencies

- chore(deps): bump `@aws-sdk/client-bedrock-runtime` → 3.826.0 ([#4366](https://github.com/promptfoo/promptfoo/pull/4366)) by **@dependabot**
- chore(deps): bump `@aws-sdk/client-bedrock-runtime` → 3.828.0 ([#4442](https://github.com/promptfoo/promptfoo/pull/4442)) by **@dependabot**
- chore(deps): bump `brace-expansion` → 1.1.12 ([#4423](https://github.com/promptfoo/promptfoo/pull/4423)) by **@dependabot**
- chore(deps): bump `openai` → 5.3.0 ([#4407](https://github.com/promptfoo/promptfoo/pull/4407)) by **@dependabot**
- chore(deps): bump pip group dependencies ([#4379](https://github.com/promptfoo/promptfoo/pull/4379)) by **@dependabot**
- chore(deps): minor + patch bumps across workspaces ([#4377](https://github.com/promptfoo/promptfoo/pull/4377)) by **@mldangelo**
- chore(deps): upgrade Express → 5.1.0 ([#4378](https://github.com/promptfoo/promptfoo/pull/4378)) by **@mldangelo**

### Documentation

- docs(blog): GPT red-team post ([#4363](https://github.com/promptfoo/promptfoo/pull/4363)) by **@typpo**
- docs(blog): Claude red-team post ([#4365](https://github.com/promptfoo/promptfoo/pull/4365)) by **@typpo**
- docs(guides): clarify completion-variable for factuality ([#4385](https://github.com/promptfoo/promptfoo/pull/4385)) by **@mldangelo**
- docs(blog): fix broken image link in GPT post ([#4391](https://github.com/promptfoo/promptfoo/pull/4391)) by **@mldangelo**
- docs(blog): update Claude-4 post date ([#4392](https://github.com/promptfoo/promptfoo/pull/4392)) by **@mldangelo**
- docs(site): move discovery docs under *Tools* ([#4408](https://github.com/promptfoo/promptfoo/pull/4408)) by **@typpo**
- docs(guides): GPT-4.1 vs GPT-4o MMLU comparison ([#4399](https://github.com/promptfoo/promptfoo/pull/4399)) by **@mldangelo**
- docs(blog): 100 k-users milestone post ([#4402](https://github.com/promptfoo/promptfoo/pull/4402)) by **@mldangelo**
- docs(redteam): configuration precedence section ([#4412](https://github.com/promptfoo/promptfoo/pull/4412)) by **@typpo**
- docs(policies): PromptBlock format for custom policies ([#4327](https://github.com/promptfoo/promptfoo/pull/4327)) by **@mldangelo**
- docs(site): improve copy-button positioning ([#4414](https://github.com/promptfoo/promptfoo/pull/4414)) by **@mldangelo**
- docs(workflow): GH-CLI rule improvements ([#4415](https://github.com/promptfoo/promptfoo/pull/4415)) by **@mldangelo**
- docs(blog): overflow in MCP blog post ([#4367](https://github.com/promptfoo/promptfoo/pull/4367)) by **@AISimplyExplained**
- docs(redteam): remove duplicate memory-poisoning entry ([#4388](https://github.com/promptfoo/promptfoo/pull/4388)) by **@mldangelo**

### Tests

- test(redteam): unique risk-category IDs ([#4390](https://github.com/promptfoo/promptfoo/pull/4390)) by **@mldangelo**
- test(pricing): add missing o3 pricing information ([#4400](https://github.com/promptfoo/promptfoo/pull/4400)) by **@mldangelo**
- test(providers): Azure embedding ([#4411](https://github.com/promptfoo/promptfoo/pull/4411)) & completion ([#4410](https://github.com/promptfoo/promptfoo/pull/4410)) by **@gru-agent**
- test(redteam): graders unit tests ([#4433](https://github.com/promptfoo/promptfoo/pull/4433), [#4455](https://github.com/promptfoo/promptfoo/pull/4455)) by **@gru-agent**
- test(redteam): Aegis plugin unit tests ([#4434](https://github.com/promptfoo/promptfoo/pull/4434)) by **@gru-agent**
- test(redteam): memory-poisoning plugin tests ([#4453](https://github.com/promptfoo/promptfoo/pull/4453)) by **@gru-agent**

## [0.114.7] - 2025-06-06

### Changed

- Revert "chore(redteam): add target option to generate command (#4215)" (#4359)
- chore: bump version 0.114.7 (#4360)

## [0.114.6] - 2025-06-06

### Added

- feat(redteam): add medical plugins for testing medical anchoring bias (#4196)

### Changed

- chore(redteam): add target option to generate command (#4215)
- chore(redteam): update OpenAI model options in redteam setup (#4344)
- chore(webui): update OpenAI model options with GPT-4.1 series and o4-mini models in eval-creator (#4350)
- docs: update getting-started example (#4346)
- test: clean up teardown and setup to remove side effects from tests (#4351)

### Fixed

- fix(redteam): include plugin and strategy IDs in report CSV output (#4347)
- fix(webui): reset defaultTest configuration on setup page (#4345)

### Dependencies

- chore(deps): bump @aws-sdk/client-bedrock-runtime from 3.823.0 to 3.825.0 (#4355)
- chore(deps): bump openai from 5.1.0 to 5.1.1 (#4354)
- chore(deps): bump version to 0.114.6 (#4357)

## [0.114.5] - 2025-06-05

### Changed

- chore(redteam): update custom policy template and generatedPrompts parser (#4324)
- chore(redteam): add severity levels to redteam plugin objects (#4310)
- chore(redteam): store original text for encoding strategies (#4248)
- chore(redteam): add emoji encoding strategy (#4263)
- chore(cli): terminal cleanup on Ctrl+C (#4313)
- chore(providers): improve logging when inheriting from OpenAiChatCompletionProvider (#4320)
- chore(tusk): fix tusk test runner workflow configuration (#4328)
- chore(tusk): add Tusk test runner workflow for even more unit tests (#4326)
- test: add unit test for src/redteam/providers/agentic/memoryPoisoning.ts (#4319)
- test: improve test setup and teardown for better isolation (#4331)

### Fixed

- fix(redteam): exclude memory poisoning plugin from strategies (#4317)
- fix(redteam): agent discovered info dark mode (#4312)
- fix(eval): handle undefined maxConcurrency with proper fallbacks (#4314)

### Dependencies

- chore(deps): bump @anthropic-ai/sdk from 0.52.0 to 0.53.0 (#4333)
- chore(deps): bump version 0.114.5 (#4332)

### Documentation

- docs(site): add Tabs Fakier as Founding Developer Advocate to team page (#4315)

### Tests

- test(webui): add telemetry hook tests (#4329)

## [0.114.4] - 2025-06-04

### Changed

- chore(templating): add PROMPTFOO_DISABLE_OBJECT_STRINGIFY environment variable for object template handling (#4297)
- chore(cli): improve token usage presentation (#4294)
- chore(providers): add base URL override for Google provider (#4255)
- chore(providers): add custom headers support for Google Gemini (#4308)
- chore(redteam): add tool-discovery:multi-turn alias to tool-discovery (#4302)
- chore(redteam): remove empty values from discovery result (#4295)
- chore(redteam): improve shell injection attack generation (#4304)
- chore(redteam): update goal extraction logic (#4285)
- chore(webui): add highlight count to eval view (#4249)
- docs: update GPT-4o to GPT-4.1 references (#4296)
- docs: refresh getting started models section (#4290)
- docs: standardize file references to use file:// scheme (#4291)
- docs: add descriptions to example configs (#4283)

### Fixed

- fix(webui): restore dark mode cell highlighting without breaking status pill visibility (#4300)
- fix(redteam): set plugin severity (#4303)
- fix(redteam): remove empty values from discovery result (#4295)

### Dependencies

- chore(deps): bump @aws-sdk/client-bedrock-runtime from 3.821.0 to 3.823.0 (#4306)
- chore(deps): bump openai from 5.0.1 to 5.0.2 (#4292)
- chore(deps): bump openai from 5.0.2 to 5.1.0 (#4307)
- chore(deps): bump tar-fs from 2.1.2 to 2.1.3 in npm_and_yarn group (#4293)
- chore(deps): bump version to 0.114.4 (#4309)

### Documentation

- docs(examples): update model references from gpt-4o-mini to gpt-4.1-mini (#4289)

### Tests

- test(redteam): add unit test for discover command (#4298)

## [0.114.3] - 2025-06-02

### Added

- **feat(redteam):** Update application definition flow to collect better info  

### Changed

- **feat:** Display audio file variables in result table  
  [#3864](https://github.com/promptfoo/promptfoo/pull/3864) by @faizanminhas
  [#4244](https://github.com/promptfoo/promptfoo/pull/4244) by @faizanminhas
- **fix:** Resolve model-graded assertion providers from providerMap  
  [#4273](https://github.com/promptfoo/promptfoo/pull/4273) by @mldangelo
- **fix:** File content not being loaded when referenced with `file://` prefix in vars  
  [#3793](https://github.com/promptfoo/promptfoo/pull/3793) by @adityabharadwaj198
- **fix:** Use array as type for vars  
  [#4281](https://github.com/promptfoo/promptfoo/pull/4281) by @sklein12
- **test:** Add unit test for `src/globalConfig/accounts.ts`  
  [#4259](https://github.com/promptfoo/promptfoo/pull/4259) by @gru-agent
- **test:** Add unit test for `src/util/config/manage.ts`  
  [#4258](https://github.com/promptfoo/promptfoo/pull/4258) by @gru-agent
- **test:** Add vitest coverage for frontend pages  
  [#4274](https://github.com/promptfoo/promptfoo/pull/4274) by @mldangelo
- **test:** Add unit test for `renderVarsInObject` formatting  
  [#4254](https://github.com/promptfoo/promptfoo/pull/4254) by @mldangelo
- **test:** Add unit test for `src/redteam/plugins/base.ts`  
  [#4233](https://github.com/promptfoo/promptfoo/pull/4233) by @gru-agent
- **test:** Add unit test for `src/redteam/providers/crescendo/index.ts`  
  [#4211](https://github.com/promptfoo/promptfoo/pull/4211)
  [#4214](https://github.com/promptfoo/promptfoo/pull/4214) by @gru-agent
- **test:** Add unit test for `src/redteam/providers/crescendo/prompts.ts`  
  [#4213](https://github.com/promptfoo/promptfoo/pull/4213) by @gru-agent
- **docs:** Add job board  
  [#4264](https://github.com/promptfoo/promptfoo/pull/4264) by @typpo
- **docs:** Add custom policy to sidebar  
  [#4272](https://github.com/promptfoo/promptfoo/pull/4272) by @typpo
- **docs:** Add native build guidance to troubleshooting section  
  [#4253](https://github.com/promptfoo/promptfoo/pull/4253) by @mldangelo
- **docs:** Add anchor links to press page section headings  
  [#4265](https://github.com/promptfoo/promptfoo/pull/4265) by @mldangelo
- **docs:** Add JSON schema to example  
  [#4276](https://github.com/promptfoo/promptfoo/pull/4276) by @ladyofcode
- **docs:** Add schema header to example configs  
  [#4277](https://github.com/promptfoo/promptfoo/pull/4277) by @mldangelo
- **docs:** Unify formatting across site  
  [#4270](https://github.com/promptfoo/promptfoo/pull/4270) by @mldangelo
- **chore:** Fix open handles in readline tests preventing graceful Jest exit  
  [#4242](https://github.com/promptfoo/promptfoo/pull/4242) by @mldangelo
- **chore:** Add external file loading support for `response_format` in OpenAI API  
  [#4240](https://github.com/promptfoo/promptfoo/pull/4240) by @mldangelo
- **chore:** Always have unique redteam file when running live  
  [#4237](https://github.com/promptfoo/promptfoo/pull/4237) by @sklein12
- **chore:** Add metadata to generated `redteam.yaml`  
  [#4257](https://github.com/promptfoo/promptfoo/pull/4257) by @typpo
- **chore:** Bump `openai` from 4.103.0 to 5.0.1  
  [#4250](https://github.com/promptfoo/promptfoo/pull/4250) by @dependabot
- **chore:** Redteam → red team  
  [#4268](https://github.com/promptfoo/promptfoo/pull/4268) by @typpo
- **chore:** Improve dark mode highlight styling for eval cell views  
  [#4269](https://github.com/promptfoo/promptfoo/pull/4269) by @mldangelo
- **chore:** Update dependencies to latest minor/patch versions  
  [#4271](https://github.com/promptfoo/promptfoo/pull/4271) by @mldangelo
- **chore:** Clarify wording  
  [#4278](https://github.com/promptfoo/promptfoo/pull/4278) by @typpo
- **chore:** Format estimated probes  
  [#4279](https://github.com/promptfoo/promptfoo/pull/4279) by @typpo
- **chore:** Update grader for malicious code  
  [#4286](https://github.com/promptfoo/promptfoo/pull/4286) by @MrFlounder
- **chore:** Add back example config to red team create flow  
  [#4282](https://github.com/promptfoo/promptfoo/pull/4282) by @faizanminhas
- **chore:** Bump version 0.114.3  
  [#4287](https://github.com/promptfoo/promptfoo/pull/4287) by @sklein12
- **chore(webui):** Hide diff filter option on /eval when single column  
  [#4246](https://github.com/promptfoo/promptfoo/pull/4246) by @mldangelo
- **chore(webui):** Allow toggling highlight on eval outputs  
  [#4252](https://github.com/promptfoo/promptfoo/pull/4252) by @mldangelo

## [0.114.2] - 2025-05-29

### Added

- feat(redteam): Off-Topic Plugin (#4168)
- feat(redteam): Set a goal for attacks (#4217)

### Changed

- fix: fix border radius on purpose example (#4229)
- fix: resolve env variables in renderVarsInObject (issue #4143) (#4231)
- fix: Check if body is good json before sending warning (#4239)
- chore: bump version 0.114.2 (#4241)

### Documentation

- docs(site): clarify deepseek model aliases and fix configuration examples (#4236)

## [0.114.1] - 2025-05-29

### Added

- feat(redteam): Target Discovery Agent (#4203)
- feat(providers): add OpenAI MCP (Model Context Protocol) support to Responses API (#4180)

### Changed

- fix: Relax private key validation (#4216)
- fix: Undefined values on red team application purpose page (#4202)
- chore: Add purpose to crescendo prompt (#4212)
- chore: Add purpose with goat generation (#4222)
- chore: Always include raw output from http provider, status code and status text (#4206)
- chore: centralize readline utilities to fix Jest open handle issues (#4219)
- chore: move http data to metadata (#4209)
- chore(redteam): tight up some graders (#4210)
- chore(redteam): tight up some graders (#4224)
- chore: bump version 0.114.1 (#4228)

## [0.114.0] - 2025-05-28

### Added

- feat(providers): Add xAI image provider (#4130)
- feat(cli): add validate command (#4134)
- feat(redteam): add camelCase strategy (#4146)

### Changed

- feat: add typed row interfaces for eval queries (#4186)
- feat: add goal/intent extraction (#4178)
- fix: isolate proxy vars in bedrock tests (#4181)
- fix: when there’s too many intents result won’t render error (#4175)
- fix: need to send auth request to api path (#4199)
- fix: Gemini MCP integration - can not parse $schema field (#4200)
- chore(redteam): add harmful plugin preset to redteam setup ui  (#4132)
- chore(redteam): add label strategy-less plugins in redteam setup ui (#4131)
- chore(redteam): improve style of redteam purpose field in webui (#4124)
- chore(providers): add xai live search support (#4123)
- chore(providers): add Claude 4 support to anthropic, bedrock, and vertex providers (#4129)
- chore: bump @aws-sdk/client-bedrock-runtime from 3.816.0 to 3.817.0 (#4164)
- chore(providers): update fal provider (#4182)
- chore: remove redundant test comments (#4183)
- chore: add typed interface for MCP tool schemas (#4187)
- chore(redteam): add ToxicChat dataset as redteam plugin (#4121)
- chore(webui): add max concurrency as an option for run in browser (#4147)
- chore(app/evals): Adds Agent Discovered Information to Redteam Report (#4198)
- chore: bump version 0.114.0 (#4201)
- docs: fix DOM nesting warning and sort plugins array (#4174)
- docs: iterative jailbreak diagram (#4191)

### Fixed

- fix(prompts): splitting when PROMPTFOO_PROMPT_SEPARATOR is contained within a string with text files (#4142)
- fix(docs): Fix issue with docs links not scrolling to the top (#4195)

### Documentation

- docs(site): minimal copy page button + sanitize text (#4156)
- docs(site): scroll to top when using  (#4162)
- docs(site): document missing redteam plugins (#4169)
- docs(site): restore scroll-to-top behavior on page navigation (#4176)

## [0.113.4] - 2025-05-26

### Changed

- feat: Server-side pagination, filtering and search for eval results table (#4054)
- feat: add score to pass/fail in CSV and add json download (#4153)
- fix: Run red team from UI without email (#4158)
- chore: bump version 0.113.4 (#4160)

### Fixed

- fix(webui): defaultTest shown in webui YAML editor (#4152)

### Documentation

- docs(site): reduce sidebar padding (#4154)

## [0.113.3] - 2025-05-24

### Changed

- fix: zod error when state.answer has object (#4136)
- fix: use current working directory for redteam file if loading from cloud (#4145)
- fix: Throw error on un-supported command - redteam run with a cloud target but no config (#4144)
- fix: bias:gender plugin generation (#4126)
- chore: bump openai from 4.100.0 to 4.103.0 (#4140)
- chore: bump @aws-sdk/client-bedrock-runtime from 3.812.0 to 3.816.0 (#4137)
- chore: bump @anthropic-ai/sdk from 0.51.0 to 0.52.0 (#4138)
- chore(telemetry): add isRedteam property to telemetry events (#4149)
- build: increase build job timeout from 3 to 4 minutes (#4150)
- chore: bump version 0.113.3 (#4151)

## [0.113.2] - 2025-05-22

### Changed

- fix: intent grader crescendo (#4113)
- chore: revert telemtry changes (#4122)
- chore: bump version 0.113.2 (#4128)

### Dependencies

- chore(deps): update peer dependencies to latest versions (#4125)

## [0.113.1] - 2025-05-21

### Changed

- chore(redteam): Target discovery agent by @sklein12 in [#4084](https://github.com/promptfoo/promptfoo/pull/4084)
- chore(redteam): Add log by @MrFlounder in [#4108](https://github.com/promptfoo/promptfoo/pull/4108)
- chore(redteam): Update purpose example by @MrFlounder in [#4109](https://github.com/promptfoo/promptfoo/pull/4109)
- chore(providers): Support templated URLs in HTTP by @mldangelo in [#4103](https://github.com/promptfoo/promptfoo/pull/4103)
- chore(redteam): Update default REDTEAM_MODEL from 'openai:chat:gpt-4o' to 'openai:chat:gpt-4.1-2025-04-14' by @mldangelo in [#4100](https://github.com/promptfoo/promptfoo/pull/4100)
- chore(telemetry): Add isRunningInCi flag to telemetry events by @mldangelo in [#4115](https://github.com/promptfoo/promptfoo/pull/4115)
- chore: Bump version 0.113.1 by @mldangelo in [#4116](https://github.com/promptfoo/promptfoo/pull/4116)
- docs: Add enterprise disclaimer to self-hosting by @mldangelo in [#4102](https://github.com/promptfoo/promptfoo/pull/4102)

### Fixed

- fix(redteam): Skip plugins when validation fails by @faizanminhas in [#4101](https://github.com/promptfoo/promptfoo/pull/4101)

### Dependencies

- chore(deps): Update Smithy dependencies to latest version by @mldangelo in [#4105](https://github.com/promptfoo/promptfoo/pull/4105)

## [0.113.0] - 2025-05-20

### Changed

- fix: target purpose not making it into redteam config (#4097)
- chore: Remove deprecated sharing setups (#4082)
- chore: add vision grading example (#4090)
- chore: bump version to 0.113.0 (#4099)

## [0.112.8] - 2025-05-20

### Changed

- feat: multilingual combinations (#4048)
- feat: add copy as markdown button to doc pages (#4039)
- fix: telemetry key (#4093)
- chore: bump @anthropic-ai/sdk from 0.50.4 to 0.51.0 (#4030)
- chore: add headers support for url remote mcp servers (#4018)
- chore(providers): Adds support for openai codex-mini-latest (#4041)
- chore(redteam): improve multilingual strategy performance and reliability (#4055)
- chore(providers): update default openai models for openai:chat alias (#4066)
- chore: Update prompt suffix help text (#4058)
- chore(docs): update model IDs in documentation to reflect latest naming convention (#4046)
- chore(redteam): introduce strategy collection for other-encodings (#4075)
- chore(webui): display currently selected eval in eval dialogue (#4079)
- chore: Improve memory usage when sharing results (#4050)
- chore(docs): Handle index.md files for copy page (#4081)
- chore: update Google Sheets fetch to use proxy helper (#4087)
- chore: simplify crypto usage in sagemaker provider (#4089)
- chore: bump version 0.112.8 (#4095)
- docs: add curl example for medical agent (#4049)
- docs: update CLI docs (#4063)
- docs: standardize code block titles (#4067)
- test: add unit test for src/redteam/commands/discover.ts (#4034)
- test: add unit test for src/redteam/commands/generate.ts (#4036)
- test: add unit test for src/providers/ai21.ts (#4056)
- test: add unit test for src/commands/eval.ts (#4062)
- test: add unit test for src/evaluatorHelpers.ts (#4037)

### Fixed

- fix(providers): AI21 response validation (#4052)
- fix(redteam): respect cliState.webUI in multilingual progressbar (#4047)
- fix(redteam): fix test count calculation for multiple strategies (#4065)
- fix(redteam): replace other-encodings with individual morse and piglatin strategies (#4064)
- fix(webui): evaluateOptions removal in YAML editor (#4059)
- fix(redteam): fix open handle in video test (#4069)
- fix(hooks): add missing results to afterAll hook context (#4071)

### Dependencies

- chore(deps): update dependencies (#4073)

### Documentation

- docs(examples): add uniform init commands to all example READMEs (#4068)

## [0.112.7] - 2025-05-15

### Added

- feat(redteam): add MCP plugin (#3989)

### Changed

- fix: stringify objects in matcher templates (#3896)
- fix: Azure auth headers get set to null in subclass (#4015)
- fix: move custom policies into the correct accordion (#4017)
- fix: update return type for task extract-goat-failure (#4021)
- chore: adjust framework compliance column width (#4005)
- chore: bump @aws-sdk/client-bedrock-runtime from 3.808.0 to 3.810.0 (#4012)
- chore: bump @azure/identity from 4.9.1 to 4.10.0 (#4013)
- chore: bump version 0.112.7 (#4023)
- chore: exclude response from crescendo if privacy setting is enabled (#4009)
- chore: remove accidentally committed example prompt (#4008)
- chore: update GOAT implementation (#4011)
- chore: update multilingual description (#4016)
- chore(cli): improve color of Red Team test generation table headers (#4004)
- chore(redteam): add link to view all logs at top of report (#4007)

### Fixed

- fix(redteam): remove duplicate Datasets section in Plugins component (#4022)

### Documentation

- docs(blog): Agent2Agent Protocol (#3981)
- docs(examples): add OpenAI Agents SDK example (#4006)
- docs(usage): update sharing instructions with API key details (#4010)

## [0.112.6] - 2025-05-14

### Added

- feat(redteam): add EU AI Act mappings (#4000)
- feat(redteam): add gender bias plugin (#3886)
- feat(eval): add evaluation duration display (#3996)

### Changed

- fix: autowrap prompts with partial nunjucks tags (#3999)
- chore(providers): improve Perplexity API integration (#3990)
- build: add Node.js 24 support (#3941)
- chore(redteam): set plugin config type (#3982)
- chore(providers): add EU Claude 3.7 Sonnet model to Bedrock (#3998)
- chore(redteam): update iterative tree (#3987)
- chore: bump version to 0.112.6 (#4003)
- refactor: clean up providers for redteam generate (#3954)
- docs: add basic enterprise architecture diagram (#3988)
- test: add unit test for src/redteam/types.ts (#3983)

### Fixed

- fix(python): resolve paths relative to promptfooconfig when not cloud config (#4001)

### Dependencies

- chore(deps): update dependencies (#3985)

### Documentation

- docs(ci): add Azure pipelines (#3986)
- docs(ci): add Bitbucket and Travis CI (#3997)
- docs(examples): add medical agent example (#3993)
- docs(blog): add truncation marker to MCP blog post (#3984)

## [0.112.5] - 2025-05-12

### Added

- chore(cli): revert "feat(cli): adds global `--verbose` option" (#3945)

### Changed

- chore(cli): add global env-file option to all commands recursively (#3969)
- chore(cli): add global verbose option to all commands recursively (#3950)
- chore(cli): better error handling and logging for remote generation (#3965)
- chore(cli): better error handling for remote generation (#3956)
- revert: "chore: better error handling for remote generation" (#3964)
- chore(cli): better response parsing errors (#3955)
- chore(providers): add support for Amazon Nova Premier model (#3951)
- chore(redteam): improvement, include purpose in iterative attacker prompt (#3948)
- chore(redteam): minor changes to category descriptions and ordering (#3960)
- chore(redteam): order attack methods by decreasing ASR (#3959)
- chore(redteam): red teamer two words (#3976)
- chore(logger): replace console.error with logger.error in MCPClient (#3944)
- chore(providers): add google ai studio embedding provider and improve docs (#3686)
- chore: lint with type info (#3932)
- docs: how to create inline assertions for package users (#3974)
- docs: improve Docusaurus documentation instructions (#3977)
- docs: instructions on how to run the documentation (#3973)
- docs: update CLAUDE.md with additional commands and project conventions (#3972)
- docs: update user count from 75,000 to 80,000 (#3940)
- test: add unit test for src/redteam/plugins/pii.ts (#3947)

### Fixed

- fix(config): resolve relative paths in combineConfigs (#3942)
- fix(evaluator): correctly count named scores based on contributing assertions (#3968)
- fix(fetch): no proxy values should take priority in fetch (#3962)
- fix(providers): combine prompt config with provider config for bedrock (#3970)
- fix(providers): ensure correct addition for bedrock token counts (#3762)
- fix(redteam): crescendo formatting (#3952)
- fix(redteam): pii grader false positives (#3946)
- fix(redteam): shell injection false positives (#3957)
- fix(redteam): add strategy pills and output details to passed tests (#3961)

### Dependencies

- chore(deps): bump version 0.112.5 (#3980)
- chore(deps): sync dependencies (#3971)
- chore(deps): update dependencies (#3943)

### Documentation

- docs(google-vertex): fix duplicate readme (#3979)
- docs(openai): update structured output external schema file example (#3967)

## [0.112.4] - 2025-05-08

### Added

- feat(assertions): add PI scorer (#3799)
- feat(redteam): add video strategy (#3820)
- feat(evals): optionally time out eval steps (#3765)

### Changed

- fix: foreign key error in better-sqlite3 and adapt new transaction API (#3937)
- chore(cli): add global `--verbose` option (#3931)
- chore(redteam): implement agentic plugin UI (#3880)
- chore(providers): improve error message in http provider transform (#3910)
- chore(cloud): improve error messages on cloud requests (#3934)
- chore: bump version 0.112.4 (#3939)
- chore(telemetry): implement minor telemetry changes (#3895)
- chore(telemetry): remove assertion-used event (#3894)
- chore(assertions): add throw error option for LLM Rubric if provider doesn't return a result or errors out (#3909)
- chore(cli): allow sharing urls with auth credentials (#3903)
- revert: "chore(cli): allow sharing urls with auth credentials" (#3918)
- refactor: improve self hosting environment variable handling (#3920)
- test: add unit test for src/models/eval.ts (#3904)
- test: add unit test for src/python/pythonUtils.ts (#3915)
- test: add unit test for src/redteam/constants.ts (#3881)
- test: fix huggingface dataset tests to mock environment variables (#3936)

### Fixed

- fix(redteam): filter null values in harmful completion provider output (#3908)
- fix(python): increase timeout for python path validation (#3914)
- fix(cli): read `.env` file prior to calling env var getters (#3892)

### Dependencies

- chore(deps): bump @anthropic-ai/sdk from 0.40.1 to 0.41.0 (#3930)
- chore(deps): bump @aws-sdk/client-bedrock-runtime from 3.799.0 to 3.803.0 (#3898)
- chore(deps): bump @aws-sdk/client-bedrock-runtime from 3.803.0 to 3.804.0 (#3913)
- chore(deps): bump openai from 4.96.2 to 4.97.0 (#3890)

### Documentation

- docs(http-provider): add documentation about returning object for custom parser (#3897)
- docs(http-provider): fix missing return statement in HTTP provider example (#3925)
- docs(blog): fix scroll to top when linking into blog post (#3889)
- docs(assertions): improve PI scorer documentation (#3924)
- docs(redteam): add memory poisoning plugin documentation (#3867)
- docs(usage): add information about HTTP Basic Authentication (#3919)
- docs(site): fix landing page content jumping on step switch (#3891)
- docs(blog): add mcp blog (#3893)

## [0.112.3] - 2025-05-02

### Changed

- Red team: Added memory poisoning plugin ([#3785](https://github.com/promptfoo/promptfoo/pull/3785)) @will-holley
- CLI: Improved progress bar visualization with thread grouping ([#3768](https://github.com/promptfoo/promptfoo/pull/3768)) @AISimplyExplained
- Improved red team strategy documentation ([#3870](https://github.com/promptfoo/promptfoo/pull/3870)) @mldangelo
- Bumped version to 0.112.2 ([#3872](https://github.com/promptfoo/promptfoo/pull/3872)) @sklein12
- Bumped version to 0.112.3 ([#3877](https://github.com/promptfoo/promptfoo/pull/3877)) @sklein12
- Implemented plumbing and prompt enabling customers to use cloud attacker and unified configurations ([#3852](https://github.com/promptfoo/promptfoo/pull/3852)) @MrFlounder
- Optimized Meteor tests for improved performance ([#3869](https://github.com/promptfoo/promptfoo/pull/3869)) @mldangelo
- Optimized Nova Sonic tests for improved performance ([#3868](https://github.com/promptfoo/promptfoo/pull/3868)) @mldangelo
- Retrieve unified config with provider from cloud ([#3865](https://github.com/promptfoo/promptfoo/pull/3865)) @sklein12
- Dataset plugins now clearly marked in setup UI ([#3859](https://github.com/promptfoo/promptfoo/pull/3859)) @mldangelo
- Moved maybeLoadFromExternalFile to file.ts ([#3851](https://github.com/promptfoo/promptfoo/pull/3851)) @benbuzz790

## [0.112.2] - 2025-05-01

### Added

- **feat(providers):** support Google Search grounding [#3800](https://github.com/promptfoo/promptfoo/pull/3800)
- **feat(providers):** mcp support for all models that support function calling [#3832](https://github.com/promptfoo/promptfoo/pull/3832)
- **feat(providers):** Add support for Amazon nova-sonic [#3713](https://github.com/promptfoo/promptfoo/pull/3713)

### Changed

- **fix:** allow escaping of `{{ }}` placeholders in prompts [#3858](https://github.com/promptfoo/promptfoo/pull/3858)
- **fix:** Trim CSV assertion values [#3863](https://github.com/promptfoo/promptfoo/pull/3863)
- **chore(providers):** add llama4 support for bedrock [#3850](https://github.com/promptfoo/promptfoo/pull/3850)
- **chore:** make custom metrics more obviously clickable [#3682](https://github.com/promptfoo/promptfoo/pull/3682)
- **refactor:** colocate fetching evalID [#3715](https://github.com/promptfoo/promptfoo/pull/3715)
- **chore:** Respect Max text length for variable cells in results table [#3862](https://github.com/promptfoo/promptfoo/pull/3862)
- **docs:** updates to grading documentation [#3848](https://github.com/promptfoo/promptfoo/pull/3848)
- **docs:** add false positives [#3857](https://github.com/promptfoo/promptfoo/pull/3857)
- **chore(workflows):** update permissions in GitHub workflows [#3849](https://github.com/promptfoo/promptfoo/pull/3849)
- **chore:** bump `openai` from 4.96.0 to 4.96.2 [#3853](https://github.com/promptfoo/promptfoo/pull/3853)
- **chore:** bump `vite` from 6.2.6 to 6.2.7 [#3856](https://github.com/promptfoo/promptfoo/pull/3856)
- **chore:** bump `@aws-sdk/client-bedrock-runtime` from 3.798.0 to 3.799.0 [#3854](https://github.com/promptfoo/promptfoo/pull/3854)
- **chore:** bump `@aws-sdk/client-bedrock-runtime` from 3.797.0 to 3.798.0 [#3843](https://github.com/promptfoo/promptfoo/pull/3843)
- **chore:** bump `@anthropic-ai/sdk` from 0.40.0 to 0.40.1 [#3842](https://github.com/promptfoo/promptfoo/pull/3842)
- **chore:** bump `formidable` from 3.5.2 to 3.5.4 [#3845](https://github.com/promptfoo/promptfoo/pull/3845)

### Fixed

- **fix(sharing):** sharing to self-hosted [#3839](https://github.com/promptfoo/promptfoo/pull/3839)
- **fix(webui):** align settings icon to top right in strategy cards [#2938](https://github.com/promptfoo/promptfoo/pull/2938)

### Documentation

- **docs(site):** improve pricing page [#3790](https://github.com/promptfoo/promptfoo/pull/3790)

## [0.112.1] - 2025-04-29

### Changed

- chore: set telemetry key (#3838)
- chore: improve chunking (#3846)

## [0.112.0] - 2025-04-29

### Added

- feat(env): allow every env variable to be overridden within the env block in a promptfoo config (#3786)
- feat(redteam): homoglyph strategy (#3811)
- feat(redteam): add more encodings (#3815)
- feat(providers): add cerebras provider (#3814)

### Changed

- feat: persist search in url (#3717)
- feat: METEOR score (#3776)
- feat: enable custom response parser to optionally return provider response (#3824)
- fix: update dependencies to address npm audit issues (#3791)
- fix: accordion positioning in plugins view (#3807)
- fix: results api returns elements ordered by date (#3826)
- chore: write static plugin severity to metadata (#3783)
- chore: respect redteam commandLineOptions from config (#3782)
- chore: update telemetry endpoint (#3751)
- chore: add cloud log in link (#3787)
- chore: bump h11 from 0.14.0 to 0.16.0 in /examples/python-provider in the pip group across 1 directory (#3794)
- chore: bump openai from 4.95.1 to 4.96.0 (#3792)
- chore: bump h11 from 0.14.0 to 0.16.0 in /examples/redteam-langchain in the pip group across 1 directory (#3796)
- chore: add target option to cli redteam run (#3795)
- chore: bump @aws-sdk/client-bedrock-runtime from 3.787.0 to 3.796.0 (#3802)
- refactor: remove if string check (#3801) (Refactor categorized as chore)
- chore: add info banner for community red teams (#3809)
- chore(examples): remove moderation assertions from foundation model redteam (#3804)
- refactor: remove unused datasetGenerationProvider in favor of synthesizeProvider (#3818) (Refactor categorized as chore)
- chore: resolve relative provider paths from cloud configs (#3805)
- chore: bump @aws-sdk/client-bedrock-runtime from 3.796.0 to 3.797.0 (#3829)
- chore: bump @anthropic-ai/sdk from 0.39.0 to 0.40.0 (#3828)
- chore: bump version 0.112.0 (#3844)
- docs: donotanswer example (#3780)
- docs: "red team" two words (#3798)
- docs: add self-hosting caveats (#3808)
- docs: add CLAUDE.md (#3810)
- test: add unit test for src/redteam/plugins/xstest.ts (#3779)
- test: add unit test for src/models/eval.ts (#3827)

### Fixed

- fix(provider): OpenAI Realtime history issue (#3719)
- fix(matchers): score results correctly with trailing newlines. (#3823)
- fix(webui): overlapping text results pill on narrow screens (#3831)
- fix(build): add missing strategy entries for build (#3836)

### Dependencies

- chore(deps): update react-router-dom to v7.5.2 (#3803)
- chore(deps): move 'natural' to peer dependency (#3813)

### Documentation

- docs(plugins): `harmful:bias` => `bias` name correction (#3731)
- docs(vertex): put setup and config at the top (#3830)
- docs(site): add redirect from /docs to /docs/intro (#3837)

## [0.111.1] - 2025-04-22

### Changed

- chore(release): bump version to 0.111.1 (#3778)
- chore(ui): capitalize "UI" in text (#3773)

### Fixed

- fix(redteam): correct the URL format in XSTest plugin (#3777)

### Dependencies

- chore(deps): bump @azure/identity from 4.9.0 to 4.9.1 (#3775)

### Documentation

- docs(about): add Ben Shipley to team section (#3758)

## [0.111.0] - 2025-04-21

### Added

- feat(grading): update OpenAI grading model to GPT-4.1 (#3741)
- feat(assertions): modify LLM Rubric rubricPrompt rendering to support arbitrary objects (#3746)
- feat(redteam): add donotanswer plugin (#3754)
- feat(redteam): add xstest plugin (#3771)
- feat(webui): add anchor link to specific row and show on top (#1582)

### Changed

- chore!(redteam): default to outputting generated Redteam config in same dir as input config (#3721)
- chore(providers): add support for gemini-2.5-flash (#3747)
- chore: use ajv with formats everywhere (#3716)
- chore(cli): improve readline handling and tests (#3763)
- chore(eval): add warning for redteam config without test cases (#3740)
- chore(providers): increase max output tokens for `google:gemini-2.5-pro-exp-03-25` to 2048 in Gemini example (#3753)
- chore(redteam): add canGenerateRemote property to redteam plugins (#3761)
- chore(webui): improve Eval Quick Selector (cmd+k) (#3742)
- chore: bump version to 0.111.0 (#3772)
- docs: update homepage (#3733)
- test: add unit test for src/redteam/plugins/donotanswer.ts (#3755)

### Dependencies

- chore(deps): bump @azure/identity from 4.8.0 to 4.9.0 (#3737)
- chore(deps): bump openai from 4.94.0 to 4.95.0 (#3736)
- chore(deps): bump openai from 4.95.0 to 4.95.1 (#3766)

### Documentation

- docs(redteam): add donotanswer to sidebar and plugins list (#3767)
- docs(redteam): add isRemote to all harmful plugins (#3769)
- docs(providers): update model IDs to latest versions (#3770)
- docs(about): add Asmi Gulati to team section (#3760)
- docs(about): add Matthew Bou to team section (#3759)

## [0.110.1] - 2025-04-17

### Added

- feat(openai): add support for GPT-4.1 model by [@mldangelo](https://github.com/promptfoo/promptfoo/pull/3698)  
- feat(openai): add support for o4-mini reasoning model by [@mldangelo](https://github.com/promptfoo/promptfoo/pull/3727)  

### Changed

- feat: Change pass rate to ASR and add export in report by [@sklein12](https://github.com/promptfoo/promptfoo/pull/3694)  
- fix: Update prompt extraction to work in more scenarios without providing a prompt by [@sklein12](https://github.com/promptfoo/promptfoo/pull/3697)  
- fix: google is valid function call allow property_ordering field in tool schema by [@abrayne](https://github.com/promptfoo/promptfoo/pull/3704)  
- fix: settings positioning in strategies view by [@typpo](https://github.com/promptfoo/promptfoo/pull/3723)  
- fix: stricter test for null or undefined in transform response by [@typpo](https://github.com/promptfoo/promptfoo/pull/3730)  
- chore(dependencies): update dependencies to latest versions by [@mldangelo](https://github.com/promptfoo/promptfoo/pull/3693)  
- chore: rename owasp plugin presets by [@typpo](https://github.com/promptfoo/promptfoo/pull/3695)  
- chore: expand frameworks section by [@typpo](https://github.com/promptfoo/promptfoo/pull/3700)  
- chore(self-hosting): update self-hosting instructions by [@mldangelo](https://github.com/promptfoo/promptfoo/pull/3701)  
- chore: bump openai from 4.93.0 to 4.94.0 by [@dependabot](https://github.com/promptfoo/promptfoo/pull/3702)  
- chore(cli): When sharing, show auth-gate prior to re-share confirmation by [@will-holley](https://github.com/promptfoo/promptfoo/pull/3706)  
- chore: email verification analytics by [@sklein12](https://github.com/promptfoo/promptfoo/pull/3708)  
- chore(cli): improves robustness of hasEvalBeenShared util by [@will-holley](https://github.com/promptfoo/promptfoo/pull/3709)  
- chore: easily remove plugins/strats from review page by [@typpo](https://github.com/promptfoo/promptfoo/pull/3711)  
- chore: bump the npm_and_yarn group with 2 updates by [@dependabot](https://github.com/promptfoo/promptfoo/pull/3714)  
- chore(cli): Health check API before running Redteam by [@will-holley](https://github.com/promptfoo/promptfoo/pull/3718)  
- chore: make strategies configurable where applicable by [@typpo](https://github.com/promptfoo/promptfoo/pull/3722)  
- chore: remove moderation assertions from foundation model redteam example by [@mldangelo](https://github.com/promptfoo/promptfoo/pull/3725)  
- chore(cli): Improve description of Redteam run command by [@will-holley](https://github.com/promptfoo/promptfoo/pull/3720)  
- chore: better parsing by [@MrFlounder](https://github.com/promptfoo/promptfoo/pull/3732)  
- docs: add owasp selection image by [@typpo](https://github.com/promptfoo/promptfoo/pull/3696)  
- docs: best-of-n documentation fixes by [@typpo](https://github.com/promptfoo/promptfoo/pull/3712)  
- perf(webui): Reduce memory usage of eval results by [@will-holley](https://github.com/promptfoo/promptfoo/pull/3678)  
- refactor: update export syntax for functions by [@mldangelo](https://github.com/promptfoo/promptfoo/pull/3734)  
- test: add unit test for src/providers/google/util.ts by [@gru-agent](https://github.com/promptfoo/promptfoo/pull/3705)  
- test: add unit test for src/redteam/commands/poison.ts by [@gru-agent](https://github.com/promptfoo/promptfoo/pull/3728)  

### Fixed

- fix(providers): output json rather than string from google live provider by [@abrayne](https://github.com/promptfoo/promptfoo/pull/3703)  
- fix(cli): Use correct url for sharing validation by [@will-holley](https://github.com/promptfoo/promptfoo/pull/3710)  
- fix(cli/redteam/poison): Write docs to the output dir by [@will-holley](https://github.com/promptfoo/promptfoo/pull/3726)  
- fix(evaluator): handle prompt rendering errors gracefully by [@mldangelo](https://github.com/promptfoo/promptfoo/pull/3729)  

### Documentation

- docs(sharing): add troubleshooting section for upload issues by [@mldangelo](https://github.com/promptfoo/promptfoo/pull/3699)  

## [0.110.0] - 2025-04-14

### Added

- feat(assertions): add GLEU metric (#3674)
- feat(providers): add Grok-3 support (#3663)
- feat(providers): add support for AWS Bedrock Knowledge Base (#3576)

### Changed

- fix: correct formatting issues (#3688)
- chore(webui): add X to report drawer (#3680)
- chore(share): improve error message on sharing (#3654)
- chore(redteam): implement reset button for strategies (#3684)
- chore(report): make eval output text expansion clearer (#3681)
- chore(report): make it clearer that plugins on the report can be clicked (#3683)
- chore(webui): change model to target in report view (#3646)
- chore(strategies): update Large preset strategies (#3675)
- chore(docker): update base images to Node.js 22 (#3666)
- chore(redteam): make audio strategy remote-only (#3618)
- chore(redteam): remove stale check for buildDate when fetching a config from cloud (#3658)
- docs: improve styles on nav buttons (#3637)
- docs: update user count to 75,000+ (#3662)
- refactor: change multimodal live to live (#3657)
- refactor(util): consolidate tool loading and rendering (#3642)
- test: add unit test for src/commands/auth.ts (#3652)

### Fixed

- fix(auth): remove deprecated login flow (#3650)
- fix(evals): implement sharing idempotence (#3653)
- fix(huggingface): disable var expansion for huggingface datasets to prevent array field expansion (#3687)
- fix(logger): resolve `[Object object]` empty string error (#3638)
- fix(providers): address scenario where type refers to function field rather than schema type (#3647)
- fix(providers): handle transformRequest for Raw HTTP (#3665)
- fix(providers): resolve Google Vertex AI output format (#3660)
- fix(providers): support gemini system_instruction prompt format (#3672)
- fix(share): add backward compatibility for '-y' flag (#3640)
- fix(share): ensure promptfoo share respects sharing config from promptfooconfig.yaml (#3668)
- fix(testCaseReader): make JSON test file parsing preserve test case structure (#3651)
- fix(webui): fix eval comparison mode filter (#3671)

### Dependencies

- chore(deps): bump @aws-sdk/client-bedrock-runtime from 3.784.0 to 3.785.0 (#3644)
- chore(deps): bump @aws-sdk/client-bedrock-runtime from 3.785.0 to 3.787.0 (#3670)
- chore(deps): bump openai from 4.92.1 to 4.93.0 (#3643)
- chore(deps): bump vite from 6.2.5 to 6.2.6 in the npm_and_yarn group (#3677)

### Documentation

- docs(nav): add lm security db to nav (#3690)
- docs(blog): add interactive blog on invisible Unicode threats (#3621)

## [0.109.1] - 2025-04-08

### Changed

- chore(schema): make extensions field nullable (#3611)
- chore(webui): add multi-turn tool discovery to UI (#3622)
- chore(scripts): ensure GitHub CLI is installed in preversion (#3614)
- refactor(share): improve formatting of cloud sharing instructions (#3628)
- refactor(tests): consolidate and reorganize test files (#3616)

### Fixed

- fix(assertions): handle both string and object outputs from llm-rubric providers (#3624)
- fix(assertions): fix google is-valid-function-call (#3625)
- fix(eval): handle providers array with file references to multiple providers (#3617)

### Dependencies

- chore(deps): bump @aws-sdk/client-bedrock-runtime from 3.782.0 to 3.784.0 (#3619)
- chore(deps): bump openai from 4.91.1 to 4.92.1 (#3620)
- chore(deps): update dependencies to resolve vulnerabilities (#3631)

### Documentation

- docs(contributing): add guidance on adding a new assertion (#3610)
- docs(enterprise): add enterprise documentation (#3596)
- docs(moderation): update moderation documentation for LlamaGuard 3 (#3630)
- docs(providers): clarify AWS Bedrock credential resolution order (#3633)
- docs(providers): improve Lambda Labs documentation (#3615)

### Tests

- test(providers): add unit test for src/providers/google/util.ts (#3626)

## [0.109.0] - 2025-04-08

### Added

- feat(eval): track assertion tokens in token usage (#3551)
- feat(plugins): add CCA plugin with documentation and grader (#3590)
- feat(providers): add Google valid function call support (#3605)
- feat(providers): add Lambda Labs integration (#3601)
- feat(webui): add pass rate column (#3580)

### Changed

- chore(api): prefix API routes with /api/v1/ (#3587)
- chore(evals): remove print option from evals data grid (#3595)
- chore(webui): update provider selector in create eval page (#3597)

### Fixed

- fix(dataset): resolve issue when generating a dataset without a `providers` key in configuration (#3603)
- fix(server): prevent server crash when unknown model is selected (#3593)

### Dependencies

- chore(deps): bump vite from 6.2.4 to 6.2.5 in the npm_and_yarn group (#3594)
- chore(deps): bump @aws-sdk/client-bedrock-runtime from 3.779.0 to 3.782.0 (#3592)

### Documentation

- docs(plugins): add llms.txt plugin and convert config to TypeScript (#3600)
- docs(plugins): remove duplicate plugins in list (#3599)
- docs(providers): add Llama 4 model details (#3598)
- docs(self-hosting): clarify configuration and sharing options (#3591)

## [0.108.0] - 2025-04-03

### Added

- feat(sharing): migrate sharing to promptfoo.app (#3572)
- feat(providers): add Google AI Studio tool use (#3564)
- feat(providers): add promptfoo model endpoint (#3534)
- feat(providers): implement Google Live mock stateful API (#3500)
- feat(redteam): add multi-turn tool discovery plugin (#3448)
- feat(dataset-generation): output generated datasets as CSV (#3573)

### Changed

- chore(redteam): add OWASP red team mappings (#3581)
- chore(webui): link URLs in metadata (#3569)
- chore(webui): use datagrids for Prompts, Datasets, and History (#3556)
- chore(build): split test and build jobs for faster CI workflow (#3586)
- chore: 0.108.0 (#3589)
- docs: add link to API reference (#3583)
- docs: add screenshot (#3582)
- docs: update docs around Google tools and rename multimodal live (#3578)
- refactor: rename vertexUtil to util and Google provider to AIS provider (#3567)
- test: add unit test for src/commands/generate/dataset.ts (#3575)

### Fixed

- fix(providers): make AIStudio & Live handle system prompts as thoroughly as vertex (#3588)
- fix(providers): enable Google to load tools from vars (#3579)
- fix(csv): update CSV docs and trim whitespace for keys in CSV test files (#3571)

### Dependencies

- chore(deps): bump @aws-sdk/client-bedrock-runtime from 3.778.0 to 3.779.0 (#3563)
- chore(deps): bump openai from 4.90.0 to 4.91.0 (#3562)
- chore(deps): bump openai from 4.91.0 to 4.91.1 (#3577)
- chore(deps): update jspdf and dompurify dependencies (#3585)
- chore(deps): update to vite 6 (#3584)

### Documentation

- docs(azure): add guidance on configuring DeepSeek models (#3559)

## [0.107.7] - 2025-04-01

### Added

- feat(evals): add evals index page (#3554)
- feat(guardrails): implement adaptive prompting guardrails (#3536)
- feat(prompts): add support for loading prompts from CSV files (#3542)
- feat(providers): load arbitrary files in nested configs in python provider (#3540)
- feat(redteam): add UnsafeBench plugin for testing unsafe image handling (#3422)

### Changed

- chore: fix type of Prompt to use omit (#3526)
- chore: hide navbar during report PDF generation (#3558)
- chore(dependencies): update package dependencies to latest versions (#3544)
- docs: add openapi reference page (#3550)
- docs: add foundation model guide (#3531)
- docs: rename guide (#3546)
- docs: update multi modal guide (#3547)
- refactor: improve google types (#3549)
- refactor: unify google apis (#3548)
- test: add unit test for src/python/pythonUtils.ts (#3508)
- chore: bump @aws-sdk/client-bedrock-runtime from 3.775.0 to 3.777.0 (#3521)
- chore: bump @aws-sdk/client-bedrock-runtime from 3.777.0 to 3.778.0 (#3541)
- chore: bump openai from 4.89.1 to 4.90.0 (#3520)
- chore: bump version 0.107.7 (#3560)
- chore: bump vite from 5.4.15 to 5.4.16 in the npm_and_yarn group (#3555)

### Fixed

- fix(assertions): include reason in python score threshold message (#3528)
- fix(assertions): log all reasons in g-eval (#3522)
- fix(datasets): add support for jsonl test cases (#3533)
- fix(http): template strings directly in url (#3525)
- fix(providers): add logging and fix custom python provider caching (#3507)
- fix(redteam): correct tool count (#3557)
- fix(webui): handle : characters better in metadata search (#3530)

### Documentation

- docs(azure-example): update assistant prompts and test cases (#3529)
- docs(red-team): add metadata to foundation models guide (#3532)
- docs(sagemaker): improve documentation (#3539)
- docs(troubleshooting): add guidance for better-sqlite version mismatch (#3537)

## [0.107.6] - 2025-03-28

### Added

- feat(providers): add support for Amazon SageMaker (#3413)

### Changed

- feat: litellm provider (#3517)
- fix: handle circular provider references (#3511)
- chore: bump openai from 4.89.0 to 4.89.1 (#3509)
- chore(blog): improve pagination and post grid UI (#3504)
- chore: add support for `apiKeyRequired` in openai provider (#3513)
- chore: bump version 0.107.6 (#3519)
- docs: owasp red teaming guide (#3101)

### Fixed

- fix(providers): support token counting for every major type of bedrock model  (#3506)
- fix(env): add override option to dotenv.config for --env-file support (#3502)

## [0.107.5] - 2025-03-26

### Added

- feat(csv): add CSV metadata column support with array values (#2709)

### Changed

- chore: add filepaths to debug output (#3464)
- chore: remove generate test cases button from UI (#3475)
- chore(content): update user statistics (#3460)
- chore(providers): add support and docs for gemini 2.5 pro to Google Chat Provider (#3485)
- chore(providers): support refusal and JSON schemas in openai responses api (#3456)
- chore(providers): update openai model costs and add missing models (#3454)
- chore(redteam): add a PlinyGrader to more accurately grade Pliny results (#3478)
- chore: bump @aws-sdk/client-bedrock-runtime from 3.758.0 to 3.772.0 (#3452)
- chore: bump @aws-sdk/client-bedrock-runtime from 3.772.0 to 3.774.0 (#3482)
- chore: bump @aws-sdk/client-bedrock-runtime from 3.774.0 to 3.775.0 (#3498)
- chore: bump openai from 4.88.0 to 4.89.0 (#3451)
- chore: bump version 0.107.5 (#3505)
- chore: bump vite from 5.4.14 to 5.4.15 in the npm_and_yarn group (#3483)
- docs: ensure consistent redteam flag usage in guides (#3477)
- docs: reduce size of profile pic (#3484)
- test: add unit test for src/app/src/pages/redteam/setup/components/strategies/utils.ts (#3495)
- test: add unit test for src/providers/openai/util.ts (#3455)

### Fixed

- fix(togetherai): ensure max_tokens is respected in configuration (#3468)
- fix(providers): handle malformed response in a21 (#3465)
- fix(csv): newlines in CSVs (#3459)
- fix(providers): simulated user bugs (#3463)
- fix(assertions): replace logical OR with nullish coalescing for thresholds (#3486)
- fix(redteam): filter out template variables in entity extraction (#3476)
- fix(redteam): type of ALL_STRATEGIES to be as const (#3494)

### Dependencies

- chore(deps): update dependencies to latest versions (#3453)

### Documentation

- docs(contributing): enhance contributing guide with additional details and formatting (#3457)
- docs(examples): improve instructions for running 4o vs. 4o mini example (#3474)
- docs(multilingual): improve multilingual strategy documentation (#3487)
- docs(readme): improve README formatting and add new sections (#3461)
- docs(security): add security policy (#3470)
- docs(site): add Faizan to team page (#3473)
- docs(site): add will to team page (#3472)

## [0.107.4] - 2025-03-20

### Added

- feat(providers): Added support for OpenAI Responses API (#3440)

### Changed

- chore(dependencies): Bumped OpenAI from 4.87.4 to 4.88.0 (#3436)
- chore(webui): Included error message in toast (#3437)
- chore(providers): Added o1-pro (#3438)
- chore(scripts): Specified repository for postversion PR creation (#3432)
- test: Added unit test for src/evaluatorHelpers.ts (#3430)

### Fixed

- fix(Dockerfile): Created .promptfoo directory in Dockerfile and removed initContainer (#3435)
- fix(providers): Fixed caching behavior for Azure assistants (#3443)
- fix(providers): Resolved Go provider CallApi redeclaration issue (#3414)
- fix(redteam): Added missing constants for RAG poisoning plugin (#3375)

### Documentation

- docs(blog): Added misinformation blog post (#3433)
- docs(examples): Added redteam-azure-assistant example (#3446)
- docs(redteam): Added guidance on purpose for image redteams (#3444)
- docs(redteam): Created guides section under red teaming (#3445)
- docs(site): Added responsible disclosure policy (#3434)

## [0.107.3] - 2025-03-19

### Changed

- chore(providers): improve Azure Assistant integration (#3424)
- chore(providers): add Google multimodal live function callbacks (#3421)
- refactor(providers): split Azure provider into multiple files and update model pricing (#3425)
- docs: add multi-modal redteam example (#3416)

### Dependencies

- chore(deps): bump openai from 4.87.3 to 4.87.4 (#3428)

## [0.107.2] - 2025-03-17

### Added

- feat(assertions): update factuality grading prompt to improve compatibility across many different providers (#3408)
- feat(providers): add support for OpenAI Realtime API (#3383)
- feat(providers): update default Anthropic providers to latest version (#3388)

### Changed

- chore(cli): set PROMPTFOO_INSECURE_SSL to true by default (#3397)
- chore(webui): add success filter mode (#3387)
- chore(webui): add more copying options in EvalOutputPromptDialog (#3379)
- chore(onboarding): update presets (#3411)
- chore(auth): improve login text formatting (#3389)
- chore(init): add fallback to 'main' branch for example fetching (#3417)
- chore(prompts): remove unused prompts from grading.ts (#3407)
- chore(redteam): update entity extraction prompt (#3405)
- refactor(providers): split Anthropic provider into modular components (#3406)

### Fixed

- fix(providers): update Bedrock output method signature (#3409)
- fix(redteam): correct strategyId for jailbreak (#3399)

### Dependencies

- chore(deps): update dependencies to latest stable versions (#3385)

### Documentation

- docs(blog): add data poisoning article (#2566)
- docs(examples): update Amazon Bedrock provider documentation (#3401)
- docs(guides): add documentation on testing guardrails (#3403)
- docs(guides): add more content on agent and RAG testing (#3412)
- docs(providers): update AWS Bedrock documentation with Nova details (#3395)
- docs(redteam): remove duplicate plugin entry (#3393)
- docs(redteam): update examples (#3394)
- docs(style): introduce a cursor rule for documentation and do some cleanup (#3404)

## [0.107.1] - 2025-03-14

### Changed

- chore: more copying options in EvalOutputPromptDialog (#3379)
- chore: add filter mode (#3387)
- chore(providers): update default Anthropic providers to latest version (#3388)
- chore(auth): improve login text formatting (#3389)
- chore: PROMPTFOO_INSECURE_SSL true by default (#3397)
- chore: bump version 0.107.1 (#3398)
- docs: update redteam examples  (#3394)

### Dependencies

- chore(deps): update dependencies to latest stable versions (#3385)

### Documentation

- docs(redteam): remove duplicate plugin entry (#3393)

## [0.107.0] - 2025-03-13

### Added

- feat(cli): Add model-scan command (#3323)
- feat(webui): Add metadata filtering in ResultsTable (#3368)
- feat(providers): Add multi-modal live sequential function calls (#3345)
- feat(server): Load dotenv file when starting server (#3321)
- feat(redteam): Add audio strategy (#3347)
- feat(redteam): Add convert to image strategy (#3342)
- feat(webui): Add download failed tests dialog (#3327)

### Changed

- chore(providers): Add Bedrock support for DeepSeek (#3363)
- chore(docs): Add Cursor AI rules for development workflow (#3326)
- chore(webui): Sync custom policies UI changes from promptfoo-cloud (#3257)
- chore(redteam): Make image jailbreak strategy runnable (#3361)
- chore(redteam): Add missing audio and image descriptions (#3372)
- chore(webui): Improve keyboard shortcut order in DownloadMenu (#3330)
- chore(error): Improve malformed target response error message (#3341)
- chore(prompts): Support j2 files (#3338)
- chore(providers): Add missing Bedrock models (#3362)
- chore(providers): Improve support for Azure reasoning models and update documentation (#3332)
- chore(providers): Integrate DeepSeek reasoning context into output (#3285)
- chore(providers): Support entire ProviderResponse output (#3343)
- chore(providers): Support multi-segment prompts in google:live provider (#3373)
- chore(redteam): Add fallback to harmful grader for specific ID patterns (#3366)
- chore(redteam): Add pluginId to plugin metadata (#3367)
- chore(redteam): Add strategyId metadata to test cases (#3365)
- chore(release): Bump version to 0.107.0 (#3378)
- chore(webui): Clean up YAML from download menu (#3328)
- chore(webui): Improve styling of table settings modal (#3329)
- chore(webui): Improve YAML editor component (#3325)
- chore(webui): Sort display metrics alphabetically in eval output cells (#3364)
- refactor(redteam): Remove harmCategory from harmful plugin vars (#3371)

### Fixed

- fix(evaluator): Merge test case metadata with provider response metadata (#3344)
- fix(redteam): Include assertion in remote grading result (#3349)
- fix(providers): Fix environment variable substitution in HTTP provider headers (#3335)
- fix(redteam): Update moderation flag default and adjust test case metadata (#3377)
- fix(share): Correct URL display when self-hosting (#3312)
- fix(webui): Fix missing plugins in report view (#3356)

### Dependencies

- chore(deps): Bump @azure/identity from 4.7.0 to 4.8.0 (#3352)
- chore(deps): Bump @babel/runtime from 7.26.7 to 7.26.10 in the npm_and_yarn group (#3348)
- chore(deps): Bump openai from 4.86.2 to 4.87.3 (#3353)
- chore(deps): Bump the npm_and_yarn group with 3 updates (#3336)
- chore(deps): Run `npm audit fix` (#3359)

### Documentation

- docs(blog): Add sensitive information disclosure post (#3350)
- docs(examples): Add foundation model redteam example (#3333)
- docs(scanner): Add model scanner documentation (#3322)

## [0.106.3] - 2025-03-07

### Added

- feat(redteam): Advanced redteam configurations from cloud provider (#3303)
- feat(redteam): Advanced redteam configurations from cloud provider (#3303)

### Changed

- chore: Bump version 0.106.3 (#3320)
- chore(providers): Add EU Nova models to Bedrock (#3318)

### Fixed

- fix(webui): Setting custom target ID (#3319)
- fix(providers): amazon nova outputs 

### Documentation

- docs(self-hosting): Add a note about PROMPTFOO_CONFIG_DIR (#3315)

## [0.106.2] - 2025-03-07

### Changed

- chore(providers): add claude 3.7 thinking support in bedrock (#3313)
- chore(providers): add `showThinking` option to anthropic and bedrock (#3316)
- chore: Update cloud provider prefix (#3311)

## [0.106.1] - 2025-03-06

### Added

- feat(providers): Google Multimodal Live provider by @abrayne in #3270
- feat(providers): add support for gpt-4o-audio-preview by @mldangelo in #3302
- feat(cloud): Fetch provider from cloud by @sklein12 in #3299
- feat(moderation): add Azure Content Safety API moderation by @MrFlounder in #3292

### Changed

- chore: bump version 0.106.1 by @MrFlounder in #3310
- chore(build): add pnpm support by @mldangelo in #3307
- chore(config): add fallback for eval without configuration by @mldangelo in #3279
- chore(config): enhance error message formatting by @mldangelo in #3306
- chore(dep): bump @anthropic-ai/sdk from 0.38.0 to 0.39.0 by @dependabot in #3269
- chore(dep): bump openai from 4.86.1 to 4.86.2 by @dependabot in #3305
- chore(providers): enable templating of Google API credentials by @mldangelo in #3283
- chore(providers): support for xai region by @typpo in #3281
- chore(scripts): remove unused and undocumented install script by @mldangelo in #3308
- chore(webui): set proper MIME types for JavaScript files by @mldangelo in #3271
- docs: more bedrock multimodal docs by @typpo in #3268
- docs: show remote status for plugins by @typpo in #3272
- docs: update azure moderation doc by @MrFlounder in #3309
- docs: improve JavaScript provider documentation by @mldangelo in #3301
- test: add unit test for src/globalConfig/accounts.ts by @gru-agent in #3254
- test: add unit test for src/providers/vertexUtil.ts by @gru-agent in #3278
- test: add unit test for src/util/cloud.ts by @gru-agent in #3300
- test: add unit test for src/providers/golangCompletion.ts by @gru-agent in #3276

### Fixed

- fix(providers): remove duplicate CallApi in golang completion by @MrFlounder in #3275
- fix(providers): support @smithy/node-http-handler ^4.0.0 by @aloisklink in #3288
- fix(config): env vars in promptfooconfig.yaml files are strings by @mldangelo in #3273
- fix(eval): honor evaluateOptions when config file is in a different directory by @mldangelo in #3287
- fix(providers): catch Vertex finish_reason errors correctly by @kieranmilan in #3277

## [0.106.0] - 2025-03-03

### Changed

- feat: base64 loader for images (#3262)
- feat: allow prompt functions to return config (#3239)
- fix: infinite rerender in provider editor (#3242)
- chore(providers): refactor OpenAI image provider to remove OpenAI Node SDK dependency (#3245)
- chore(providers): replace OpenAI moderation provider SDK with fetch (#3248)
- chore: Add Foundational Model Reports links to Resources menu and footer (#3250)
- chore: inference limit warning (#3253)
- chore: Fix an error in Google SpreadSheet(Authenticated) with a header without a value (#3255)
- chore: bump version 0.106.0 (#3267)
- test: add unit test for src/providers/openai/util.ts (#3241)

### Dependencies

- chore(deps): update dependencies to latest versions (#3247)

### Documentation

- docs(press): add new podcast to press page (#3252)

## [0.105.1] - 2025-02-28

### Added

- feat(providers): add support for execution of function/tool callbacks in Vertex provider (@abrayne) [#3215](https://github.com/promptfoo/promptfoo/pull/3215)

### Changed

- chore(cli): refactor share command (@mldangelo) [#3234](https://github.com/promptfoo/promptfoo/pull/3234)
- chore(providers): add support for GPT-4.5 OpenAI model (@mldangelo) [#3240](https://github.com/promptfoo/promptfoo/pull/3240)
- chore(providers): lazy load replicate provider (@typpo) [#3220](https://github.com/promptfoo/promptfoo/pull/3220)
- chore(providers): support inject vars in query params for raw requests for http provider (@sklein12) [#3233](https://github.com/promptfoo/promptfoo/pull/3233)
- chore(redteam): map RBAC-tagIds when pulling redteam configs from the cloud (@sklein12) [#3229](https://github.com/promptfoo/promptfoo/pull/3229)
- chore(webui): add reusable error boundary component (@mldangelo) [#3224](https://github.com/promptfoo/promptfoo/pull/3224)
- chore(webui): fix progress to history redirects (@mldangelo) [#3217](https://github.com/promptfoo/promptfoo/pull/3217)
- chore(webui): make datasets optional in history and prompts components (@mldangelo) [#3235](https://github.com/promptfoo/promptfoo/pull/3235)
- revert: "chore: Map RBAC-tagIds when pulling redteam configs from the cloud" (@sklein12) [#3231](https://github.com/promptfoo/promptfoo/pull/3231)
- docs: update Claude vs GPT comparison (@AISimplyExplained) [#3216](https://github.com/promptfoo/promptfoo/pull/3216)
- test: add unit test for src/app/src/pages/history/History.tsx (@gru-agent) [#3197](https://github.com/promptfoo/promptfoo/pull/3197)
- test: add unit test for src/providers/vertexUtil.ts (@gru-agent) [#3208](https://github.com/promptfoo/promptfoo/pull/3208)
- test: add unit test for src/server/server.ts (@gru-agent) [#3198](https://github.com/promptfoo/promptfoo/pull/3198)

### Dependencies

- chore(deps): bump @aws-sdk/client-bedrock-runtime from 3.751.0 to 3.755.0 (@dependabot) [#3213](https://github.com/promptfoo/promptfoo/pull/3213)
- chore(deps): bump version 0.105.1 (@mldangelo) [#3244](https://github.com/promptfoo/promptfoo/pull/3244)

### Documentation

- docs(command-line): update documentation with new commands and options (@mldangelo) [#3223](https://github.com/promptfoo/promptfoo/pull/3223)
- docs(vertex): enhance and update Vertex AI documentation (@mldangelo) [#3107](https://github.com/promptfoo/promptfoo/pull/3107)

### Tests

- test(history): remove obsolete History component tests (@mldangelo) [#3218](https://github.com/promptfoo/promptfoo/pull/3218)

## [0.105.0] - 2025-02-25

### Added

- feat(assertions): add custom assertion scoring functions (#3142)
- feat(providers): add Claude 3.7 (#3200)
- feat(providers): add Databricks provider (#3124)
- feat(providers): add support for multiple providers in single config file (#3156)
- feat(webui): add HTTPS option for raw request in redteam setup (#3149)

### Changed

- chore!(providers): remove direct provider exports in favor of loadApiProvider (#3183)
- chore(build): enable SWC for ts-node for faster dev server (#3126)
- chore(eval): add eval-id to --filter-failing and --filter-errors-only eval flags (#3174)
- chore(logging): replace console.error with logger.error (#3175)
- chore(providers): add support for Anthropic Claude 3.7 Sonnet model (#3202)
- chore(providers): add support for Claude on Vertex (#3209)
- chore(providers): update Claude 3.7 Sonnet configurations (#3199)
- chore(redteam): refactor HarmBench plugin (#3176)
- chore(release): bump version to 0.105.0 (#3210)
- chore(webui): add pagination to eval selector (#3189)
- chore(webui): add pagination to reports index frontend (#3190)
- chore(webui): add toggle for application vs model testing (#3194)
- chore(webui): enhance dataset dialog and table UI (#3154)
- chore(webui): improve external systems section styling (#3195)
- chore(webui): improve prompts page view (#3135)
- chore(webui): modernize UI components (#3150)
- chore(webui): refactor data loading in progress view for reusability (#3136)
- chore(webui): return detailed error messages from fetch (#3145)
- chore(webui): sync UI improvements from cloud (#3164)
- chore(webui): update outdated onboarding models (#3130)
- refactor(env): centralize environment variable schema (#3105)
- refactor(providers): extract provider registry to dedicated module (#3127)
- refactor(utils): separate database utilities from general utilities (#3184)
- refactor(webui): rename progress to history (#3196)

### Fixed

- fix(cli): fix list command for datasets (#3163)
- fix(cli): resolve issue where script.py:myFunc fails fs stat check with PROMPTFOO_STRICT_FILES=true (#3133)
- fix(env): ensure environment variables are properly merged and rendered in Nunjucks (#3134)
- fix(providers): update Go toolchain version to valid syntax (#3170)
- fix(providers): add JSON stringify for debug output in `http` provider (#3131)
- fix(providers): correct Gemini/OpenAI format conversion (#3206)
- fix(providers): handle OpenRouter empty content (#3205)
- fix(providers): properly classify API errors with ResultFailureReason.ERROR (#3141)
- fix(providers): remove content length header in HTTP provider (#3147)
- fix(site): resolve mobile responsiveness issues (#3201)
- fix(webui): improve dark mode colors (#3187)
- fix(webui): resolve share modal infinite loop (#3171)

### Dependencies

- chore(deps): bump @aws-sdk/client-bedrock-runtime from 3.744.0 to 3.749.0 (#3121)
- chore(deps): bump @aws-sdk/client-bedrock-runtime from 3.749.0 to 3.750.0 (#3128)
- chore(deps): bump @aws-sdk/client-bedrock-runtime from 3.750.0 to 3.751.0 (#3159)
- chore(deps): bump @azure/identity from 4.6.0 to 4.7.0 (#3160)
- chore(deps): bump openai from 4.85.0 to 4.85.1 (#3120)
- chore(deps): bump openai from 4.85.1 to 4.85.2 (#3161)
- chore(deps): bump openai from 4.85.2 to 4.85.3 (#3173)
- chore(deps): bump openai from 4.85.3 to 4.85.4 (#3192)
- chore(deps): update dependencies to latest versions (#3193)

### Documentation

- docs(vertex): add gemini-2.0-flash-001 fixes #3167 (#3168)
- docs(metrics): improve derived metrics documentation (#3157)
- docs(configuration): enhance CSV documentation with custom assertion example (#3158)
- docs(press): update press page with new content and resources (#3103)

### Tests

- test(routes): add unit test for src/server/routes/redteam.ts (#3181)

## [0.104.4] - 2025-02-17

### Added

- feat(redteam): add reasoning denial of service plugin (#3109)
- feat(providers): add support for tools in Vertex provider (#3077)

### Changed

- chore(providers): update replicate default moderation provider (#3097)
- chore(redteam): update grader prompt (#3092)
- chore(testCases): improve error message clarity in testCaseReader, clean up tests (#3108)
- chore(testCases): improve JSON field support in CSV test cases (#3102)
- chore(webui): add extension hooks support to red team configuration (#3067)
- chore(webui): display suggestion note (#3116)
- chore(webui): refine suggestion behavior (#3112)

### Fixed

- fix(providers): support nested directory structures in Go provider (#3118)

### Dependencies

- chore(deps): bump openai from 4.84.0 to 4.85.0 (#3095)
- chore(deps): bump version to 0.104.4 (#3119)

### Documentation

- docs(blog): add agent security blog post (#3072)
- docs(google-sheets): improve documentation clarity (#3104)

### Tests

- test(providers): add unit test for src/providers/openai/image.ts (#3086)
- test(redteam): add unit test for src/redteam/plugins/overreliance.ts (#3093)
- test(core): add unit test for src/table.ts (#3084)

## [0.104.3] - 2025-02-14

### Changed

- chore(release): bump version to 0.104.3 (#3091)
- refactor(prompts): consolidate prompt processing logic (#3081)
- refactor(utils): move utils to util (#3083)

### Fixed

- fix(testCaseReader): correctly process file:// URLs for YAML files (#3082)

## [0.104.2] - 2025-02-13

### Changed

- chore(providers): add extra_body support for Anthropic API (#3079)
- chore(webui): add pagination and show more/less controls to intent sections (#2955)
- chore(auth): sync email between config and login commands (#3062)
- chore: remove debug log (#3071)
- chore(testCases): add HuggingFace Hub token support for datasets (#3063)
- docs: document `NO_PROXY` environment variable (#3070)

### Fixed

- fix(providers): Anthropic API error handling for 413s (#3078)
- fix(redteam): correct foundation plugin collection expansion (#3073)

### Dependencies

- chore(deps): bump openai from 4.83.0 to 4.84.0 (#3075)
- chore(deps): bump version to 0.104.2 (#3080)

## [0.104.1] - 2025-02-11

### Added

- feat(test-cases): add support for loading dynamic test cases from Python and JavaScript/TypeScript files (#2993)
- feat(assertions): add `threshold` support for `llm-rubric` (#2999)
- feat(package): add guardrails in node package (#3034)

### Changed

- chore(assertions): improve parsing of llm-rubric outputs (#3021)
- chore(assertions): make JSON parsing less strict for matchers (#3002)
- chore(assertions): parse string scores in llm rubric outputs (#3037)
- chore(build): resolve CodeQL invalid Go toolchain version warning (#3022)
- chore(ci): remove unused nexe build workflow (#3014)
- chore(config): enhance email validation with zod schema (#3011)
- chore(config): handle empty config files gracefully (#3027)
- chore(download): include comment in download data (#3052)
- chore(eval): add redteamFinalPrompt to download menu (#3035)
- chore(harmful): refine grader logic for specific categories (#3054)
- chore(hooks): improve handling of absolute paths in hook/code import (#3060)
- chore(providers): add bedrock llama3.3 support (#3031)
- chore(providers): add fireworks provider (#3001)
- chore(providers): allow Alibaba API base URL override (#3040)
- chore(providers): correct golang behavior for prompts with quotes (#3026)
- chore(providers): expose `deleteFromCache` to evict cache keys after fetch by providers (#3009)
- chore(providers): handle edge case in openai chat completion provider (#3033)
- chore(providers): validate dynamic method call (#3023)
- chore(redteam): add --no-progress-bar support for redteam generate and run (#3043)
- chore(redteam): add support for job progress in RunEvalOptions (#3042)
- chore(redteam): enhance refusal detection (#3015)
- chore(redteam): improve progress plumbing changes (#3053)
- chore(redteam): purge signature auth from redteam config if disabled (#2995)
- chore(redteam): support progress callback in redteam run (#3049)
- chore(release): bump version 0.104.1 (#3061)
- chore(webui): add clear search buttons to search fields (#3048)
- chore(webui): color pass rates on a gradient (#2997)
- chore(webui): ensure extensions are serialized from config in getUnifiedConfig (#3050)
- chore(webui): ensure thumbs remain active after selection (#3059)
- chore(webui): improve column selector tooltip placement (#3005)
- chore(webui): move dropdown chevron to correct position (#3007)
- chore(webui): reorganize provider configurations (#3028)
- refactor(test): split test case loading from synthesis (#3004)
- docs: fix PromptFoo vs. Promptfoo capitalization (#3013)
- docs: update assert function context docs and examples (#3008)

### Fixed

- fix(providers): escape single quotes in golang provider (#3025)

### Dependencies

- chore(deps): bump @aws-sdk/client-bedrock-runtime from 3.741.0 to 3.743.0 (#3020)
- chore(deps): bump @aws-sdk/client-bedrock-runtime from 3.743.0 to 3.744.0 (#3038)
- chore(deps): bump esbuild from 0.24.2 to 0.25.0 (#3056)
- chore(deps): bump openai from 4.82.0 to 4.83.0 (#3019)
- chore(deps): bump vitest from 2.1.8 to 2.1.9 (#3018)
- chore(deps): update dependencies (#3032)
- chore(deps): update dependencies to latest versions (#3024)
- chore(deps): update vitest to resolve CVE issues (#3016)

### Tests

- test(unit): add test for src/redteam/sharedFrontend.ts (#3051)

## [0.104.0] - 2025-02-06

### Added

- feat(openai): Updated default grading provider to gpt-4o-2024-11-20 (#2987)
- feat(assertions): Added `.js` file support for `rubricPrompt` in `llm-rubric` assertion (#2972)
- feat(redteam): Added pandamonium strategy (#2920)
- feat(redteam): Added retry strategy for regression testing (#2924)
- feat(redteam): Added support for base64-encoded key strings in webui in addition to file paths and file upload (#2983)

### Changed

- chore(redteam): Improved RBAC grader (#2976)
- chore(redteam): Improved BOLA grader (#2982)
- chore(site): Added HTTP endpoint config generator link (#2957)
- chore(webui): Synced test target configuration key file UI with cloud (#2959)
- chore(docs): Changed Docusaurus default port (#2964)
- chore(redteam): Added foundation model plugin collection (#2967)
- chore(redteam): Cleaned up key validation code (#2992)
- chore(redteam): Sorted constants (#2988)
- chore(redteam): Sorted strategy list (#2989)
- chore(redteam): UI - Added new strategy presents and client-side session IDs (#2968)
- chore(share): Added confirmation step before generating public share link (#2921)
- chore(providers): Restructured OpenAI provider into modular files (#2953)
- chore: Fixed build due to duplicate import and cyclic dependency (#2969)
- chore(docusaurus): Added ability to override port via environment variable (#2986)
- test: Added unit test for src/assertions/utils.ts (#2974)
- test: Added unit test for src/redteam/plugins/rbac.ts (#2977)

### Fixed

- fix(redteam): Improved Crescendo strategy on refusals (#2979)
- fix(redteam): Added support for target delay in redteam setup UI (#2991)
- fix(redteam): Stringified guardrail headers (#2981)
- fix(redteam): Fixed harmbench plugin dataset pull location (#2963)

### Dependencies

- chore(deps): Bumped @aws-sdk/client-bedrock-runtime from 3.738.0 to 3.741.0 (#2973)
- chore(deps): Bumped version to 0.104.0 (#2994)
- chore(deps): Bumped vitest from 1.6.0 to 1.6.1 in /examples/jest-integration (#2978)

### Documentation

- docs(blog): DeepSeek tweaks (#2970)
- docs(blog): DeepSeek redteam (#2966)
- docs(cloud): Added service accounts (#2984)
- docs(guide): Added guide for doing evals with harmbench (#2943)
- docs(press): Added dedicated press page (#2990)
- docs(python): Updated Python provider docs to add guardrails usage example (#2962)

## [0.103.19] - 2025-02-02

### Added

- feat(redteam): Add a plugin to run redteams against the HarmBench dataset  (#2896)
- feat(redteam): add hex strategy (#2950)

### Changed

- chore(providers): add o3 mini as an option to OpenAI provider (#2940)
- chore(providers): migrate Groq to use OpenAI provider - add groq reasoning example (#2952)
- chore(providers): update openai api version to support o3 models (#2942)
- chore(redteam): reduce false positives in politics plugin (#2935)
- chore(docs): re-add plugin documentation to the example (#2939)
- chore(examples): Example of a very simple barebones eval with Harmbench (#2873)
- chore: Reduced watched files for nodemon (#2949)
- chore(redteam): use shared penalized phrase function in `iterativeTree (#2946)

### Dependencies

- chore(deps): bump various dependencies (#2941)

## [0.103.18] - 2025-01-31

### Added

- feat(providers): add Alibaba Model Studio provider (#2908)

### Changed

- fix: added tsx back to dependencies (#2923)
- fix: full rubricPrompt support for json/yaml filetypes (#2931)
- chore(grader): improve false positive detection for religion grader (#2909)
- chore(redteam): upgrade replicate moderation api to Llama Guard 3 (#2904)
- chore(webui): add preset collections for redteam plugins (#2853)
- chore: Move callEval outside of the function so we can re-use it  (#2897)
- chore: Save test case from EvalResult (#2902)
- chore: bump @aws-sdk/client-bedrock-runtime from 3.734.0 to 3.738.0 (#2906)
- chore: bump openai from 4.80.1 to 4.81.0 (#2905)
- chore: bump version 0.103.18 (#2932)
- chore: improvements to refusal detection (#2903)
- test: configure default globalConfig mock and logger mock (#2915)

### Fixed

- fix(generation): handle cases where vars is not an array (#2916)
- fix(providers): handle function expressions in transform response (#2917)
- fix(webui): improve dark mode syntax highlighting in HTTP request editor (#2911)
- fix(webui): improve spacing between Back and Next buttons (#2912)
- fix(webui): update Next button styling to support dark mode (#2898)

### Documentation

- docs(examples): update and clean up DeepSeek R1 example README (#2918)

## [0.103.17] - 2025-01-30

### Added

- feat(launcher): Add launcher page and Cloudflare deploy action (#2599)
- feat(providers): Add JFrog ML provider (#2872)

### Changed

- chore(build): Move dependencies to devDependencies (#2876)
- chore(redteam): Update grader SpecializedAdviceGrader (#2895)
- chore(redteam): Update graders: imitation, overreliance (#2882)
- chore(redteam): Update graders: politics and RBAC (#2878)
- chore(redteam): Update SQL injection and shell injection graders (#2870)
- chore(redteam): Remove RedTeamProvider response (#2899)
- chore(build): Bump version to 0.103.17 (#2900)
- docs: Fix broken transformVars example (#2887)
- test: Add unit test for src/providers/bedrockUtil.ts (#2879)
- test: Add unit test for src/redteam/plugins/shellInjection.ts (#2871)

### Fixed

- fix(assertions): Add valueFromScript support to contains, equals, and startsWith assertions (#2890)
- fix(golang-provider): Support internal package imports by preserving module structure (#2888)

### Dependencies

- chore(deps): Move tsx to dev dependencies (#2884)
- chore(deps): Update Drizzle dependencies (#2877)

### Documentation

- docs(providers): Fix syntax and formatting in examples (#2875)

## [0.103.16] - 2025-01-28

### Added

- feat(eval): Support reasoning effort and usage tokens (#2817)
- feat(providers): Add support for anthropic citations (#2854)
- feat(redteam): Add RAG Full Document Exfiltration plugin (#2820)
- feat(tests): Add support for loading tests from JSONL files (#2842)

### Changed

- chore(eval): Support reasoning field (#2867)
- chore(providers): Add common provider types for redteam providers (#2856)
- chore(providers): Update google provider with better support for latest gemini models (#2838)
- chore(redteam): Add redteam run analytics (#2852)
- chore(package): Bump version 0.103.16 (#2869)
- chore(package): Ensure correct branch name when incrementing package version (#2851)
- chore(package): Exclude test files from npm package (#2862)
- chore(package): Simplify files field in package.json (#2868)
- chore(dev): Upgrade development versions of Node.js to v22 and Python to 3.13 (#2340)

### Fixed

- fix(openrouter): Pass through `passthrough` (#2863)
- fix(redteam): Run strategies on intents (#2866)
- fix(sharing): Combine sharing configuration from multiple promptfooconfigs (#2855)

### Dependencies

- chore(deps): Remove unused dependencies (#2861)
- chore(deps): Update patch and minor dependency versions (#2860)

### Documentation

- docs(deepseek): Deepseek censorship article (#2864)
- docs(simulated-user): Improve simulated user example (#2865)

### Tests

- test(redteam): Add unit test for src/redteam/plugins/beavertails.ts (#2844)
- test(redteam): Add unit test for src/redteam/plugins/contracts.ts (#2845)

## [0.103.15] - 2025-01-28

### Changed

- chore(providers): Add Hyperbolic alias (#2826)
- chore(providers): Add Perplexity alias (#2836)
- chore(providers): Add Cloudera alias (#2823)
- chore(providers): Make Adaline a peer dependency (#2833)
- chore(providers): Support chatgpt-4o-latest alias in OpenAI provider (#2841)
- chore(providers): Handle empty content due to Azure content filter (#2822)
- chore(assertions): Add not-is-refusal assertion (#2840)
- chore(redteam): Add stack trace to generate/run errors (#2831)
- chore(redteam): Reduce science fiction jailbreaks (#2830)
- chore(redteam): Switch from stateless to stateful (#2839)
- docs: Update contributing guide and fix docs build break (#2849)
- docs: Add terms of service (#2821)
- docs: Clean up LocalAI title (#2824)
- docs: Minor updates to provider documentation sidebar order (#2827)
- docs: Update contributing guide with helpful links and update new release documentation (#2843)
- docs: Update documentation with new models and features (#2837)
- test: Add unit test for src/providers/portkey.ts (#2825)
- test: Add unit test for src/redteam/plugins/asciiSmuggling.ts (#2846)

### Dependencies

- chore(deps): Bump OpenAI from 4.80.0 to 4.80.1 (#2835)
- chore(deps): Bump version to 0.103.15 (#2850)

## [0.103.14] - 2025-01-24

### Added

- feat(redteam): add InsultsGrader for insult detection (#2814)

### Changed

- feat: ability to export to burp (#2807)
- feat: pull and set sessionIds in the request and response body (#2784)
- fix: use controlled accordion for signature auth (#2789)
- chore: bump @anthropic-ai/sdk from 0.33.1 to 0.35.0 (#2790)
- chore: bump openai from 4.79.1 to 4.79.4 (#2791)
- chore: improve specialized advice grader (#2793)
- chore: unsafe practices grader (#2796)
- chore: more harmful graders (#2797)
- chore: sort by priority strategies in report view (#2809)
- chore: add graders for drugs, illegal activities, cybercrime, radicalization (#2810)
- chore: burp docs, improvements, and ui (#2818)
- chore: bump @aws-sdk/client-bedrock-runtime from 3.731.1 to 3.734.0 (#2815)
- chore: add keyfile upload (#2787)
- test: add unit test for src/assertions/contextRelevance.ts (#2804)
- test: add unit test for src/assertions/geval.ts (#2803)
- test: add unit test for src/fetch.ts (#2781)
- test: add unit test for src/assertions/contextFaithfulness.ts (#2798)
- test: add unit test for src/assertions/answerRelevance.ts (#2799)
- test: add unit test for src/assertions/contextRecall.ts (#2800)
- test: add unit test for src/assertions/modelGradedClosedQa.ts (#2801)
- refactor(fetch): remove unnecessary debug log (#2806)

### Fixed

- fix(azure): handle 400 response for content filter errors (#2812)
- fix(ui): ensure that a default value of the signature data field is populated into the redteam config (#2788)
- fix(docs): random grammar fix for model-graded metrics (#2794)

### Dependencies

- chore(deps): update LLM provider dependencies (#2795)

### Documentation

- docs(config): add status page link to footer (#2811)

### Tests

- test(openai): move OpenAI provider tests to dedicated file (#2802)

## [0.103.13] - 2025-01-21

### Added

- feat(redteam): Add guardrail option to redteam ui & update transform response (#2688)

### Changed

- feat: http provider auth signature support (#2755)
- chore: improve http signature setup (#2779)
- chore(fetch): sanitize sensitive data in debug logs (#2778)
- chore(redteam): enhance logging and test count formatting (#2775)

### Fixed

- fix(fetch): correct TLS options for proxy settings (#2783)

### Dependencies

- chore(deps): bump vite from 5.4.11 to 5.4.12 in the npm_and_yarn group (#2777)
- chore(deps): bump vite from 5.4.9 to 5.4.14 in /examples/jest-integration in the npm_and_yarn group across 1 directory (#2776)

## [0.103.12] - 2025-01-21

### Changed

- chore(providers): Add DeepSeek provider alias (#2768)
- chore(types): Remove unused 'getSessionId' field from ApiProvider (#2765)
- chore(redteam): Add copyright violations grader (#2770)
- chore(redteam): Show plugin in strategy stats prompt/response examples (#2758)
- chore(redteam): Improve competitors grader (#2761)
- chore(lint): Resolve trailing whitespace issues in YAML file (#2767)
- test: Add unit test for src/providers/bam.ts (#2748)
- test: Add unit test for src/redteam/graders.ts (#2762)
- test: Add unit test for src/redteam/plugins/harmful/graders.ts (#2763)
- test: Add unit test for src/redteam/plugins/harmful/graders.ts (#2771)
- test: Add unit test for src/redteam/providers/crescendo/index.ts (#2749)
- test: Add mocks to reduce CI flakes and logs (#2774)

### Fixed

- fix(providers): Add support for tool_resources in OpenAI assistants (#2772)
- fix(providers): Do not set top_p, presence_penalty, or frequency_penalty by default in OpenAI providers (#2753)
- fix(providers): Handle serialization bug in defaultTest for provider overrides with self references (Groq) (#2760)
- fix(webui): Add error boundary to React Markdown component (#2756)
- fix(redteam): Add missing strategy tags (#2769)
- fix(redteam): Empty response is not a failure for red team (#2754)
- fix(redteam): Self-harm, graphic, sexual content, competitors false positives (#2759)

### Dependencies

- chore(deps): Bump @aws-sdk/client-bedrock-runtime from 3.730.0 to 3.731.1 (#2750)
- chore(deps): Bump openai from 4.78.1 to 4.79.1 (#2751)

## [0.103.11] - 2025-01-20

### Changed

- chore: update vars type definition in Test Case to support nested objects (#2738)
- chore(providers): add config.o1 flag for Azure o1 model support (#2710)
- chore(assertions): handle OpenAI tool call with content (#2741)
- chore(fetch): use undici to set global proxy dispatcher (#2737)
- chore(providers): update Groq documentation with latest models (#2733)
- chore(logger): expose additional logger methods (#2731)
- refactor: remove dynamic import for OpenAiChatCompletionProvider (#2739)
- refactor: remove async imports for third-party integrations (#2746)
- refactor: remove dynamic import for fetchWithProxy (#2742)
- build: create `dist/` using TypeScript's `"module": "Node16"` setting (#2686)
- revert: "build: create `dist/` using TypeScript's `"module": "Node16"` setting (#2686)" (#2747)
- docs: LangChain example (#2735)
- docs: resolve duplicate route warning on docs/providers (#2676)
- docs: update app details (#2734)
- test: add unit test for src/logger.ts (#2732)
- test: Add unit test for src/providers/openai.ts (#2700)
- test: Add unit test for src/providers/websocket.ts (#2658)
- test: Add unit test for src/redteam/strategies/crescendo.ts (#2679)
- test: Add unit test for src/redteam/strategies/gcg.ts (#2680)
- test: Add unit test for src/redteam/strategies/index.ts (#2682)
- test: Add unit test for src/util/exportToFile/index.ts (#2666)

### Fixed

- fix(webui): ensure nested variables are rendered correctly (#2736)
- fix(assertions): support JavaScript files in CSV assertions file:// protocol (#2723)
- fix(redteam): don't blow up when translation fails (#2740)

### Dependencies

- chore(deps): bump @aws-sdk/client-bedrock-runtime from 3.726.1 to 3.730.0 (#2727)
- chore(deps): bump @azure/identity from 4.5.0 to 4.6.0 (#2728)
- chore(deps): update Docusaurus version (#2730)

### Documentation

- docs(faq): enhance documentation on proxies and SSL certificates (#2725)

## [0.103.10] - 2025-01-16

### Added

- feat(moderation): Add guardrail checks and logging for moderation (#2624)
- feat(redteam): Add support for built-in guardrails (#2654)

### Changed

- fix: Don't throw in HTTP provider on non-2xx (#2689)
- fix: Eval description in `promptfoo list evals` (#2668)
- fix: Handle HTTP errors better (#2687)
- fix: Make back/next icons consistent (#2707)
- fix: Resolve defaultTest and test providers when called via Node (#2664)
- fix: WebUI should automatically refresh with new evals (#2672)
- chore: Add email to remote inference requests (#2647)
- chore: Add envar for max harmful tests per request (#2714)
- chore: Bump @aws-sdk/client-bedrock-runtime from 3.726.0 to 3.726.1 (#2641)
- chore: Bump groq-sdk from 0.11.0 to 0.12.0 (#2642)
- chore: Bump openai from 4.78.0 to 4.78.1 (#2643)
- chore: Check email status (#2651)
- chore: Organize advanced configurations UI (#2713)
- chore: Standardize ellipsize function across codebase (#2698)
- chore: Update unaligned timeout (#2696)
- chore(assertion): Update doc (#2705)
- chore(ci): Add shell format check to CI workflow (#2669)
- chore(cli): Update show command to default to most recent eval (#2718)
- chore(config): Clean up and comment unused configurations (#2646)
- chore(providers): Add error handling for request transforms in HTTP provider (#2697)
- chore(providers): Add validateStatus option to HTTP provider (#2691)
- chore(providers): Change default validateStatus to accept all HTTP status codes (#2712)
- chore(redteam): Add more abort checkpoints for redteam runs (#2717)
- chore(redteam): Enhance debug logging in iterative provider (#2695)
- chore(redteam): Improve HTTP transform configuration placeholders (#2702)
- chore(webui): Add configurable validateStatus to redteam HTTP target setup (#2706)
- docs: Add redirect for troubleshooting link (#2653)
- docs: Updated plugin table and harmful page (#2560)
- test: Add unit test for src/assertions/guardrail.ts (#2656)
- test: Add unit test for src/providers/promptfoo.ts (#2662)
- test: Add unit test for src/providers/simulatedUser.ts (#2670)
- test: Add unit test for src/providers/webhook.ts (#2661)
- test: Add unit test for src/redteam/plugins/indirectPromptInjection.ts (#2663)
- test: Add unit test for src/redteam/strategies/bestOfN.ts (#2677)
- test: Add unit test for src/redteam/strategies/likert.ts (#2681)
- test: Add unit test for src/utils/text.ts (#2701)
- test: Fix flaky test (#2715)
- test: Make share test more robust (#2716)
- test: Support randomizing test execution order (#2556)

### Fixed

- fix(ci): Resolve redteam integration test failure by setting author (#2667)
- fix(logging): Enforce single-argument type for logger methods (#2719)
- fix(providers): Lazy load @azure/identity (#2708)
- fix(redteam): Adjust divergent repetition plugin prompt formatting (#2639)
- fix(ui): Don't select a stateful/stateless setting if discrepancy exists between configured providers (#2650)
- fix(ui): Fix stateful/stateless setting for providers (#2649)
- fix(webui): Ensure user's selection of system statefulness is correctly persisted in config and UI (#2645)

### Documentation

- docs(links): Update Discord links to new invite (#2675)
- docs(strategy-table): Enhance grouping and ordering logic (#2640)

## [0.103.9] - 2025-01-13

### Added

- feat(tests): Import tests from JS/TS (#2635)
- feat(redteam): Add GCG strategy (#2637)
- feat(redteam): Add Likert-based jailbreak strategy (#2614)

### Changed

- chore(redteam): Catch errors during iterative attacks and continue (#2631)
- chore(redteam): GCG number config (#2638)
- chore(redteam): Wrap iterative providers in try/catch (#2630)
- chore(webui): Don't actually truncate vars because they are scrollable (#2636)

### Fixed

- fix(webui): Revert 49bdcba - restore TruncatedText for var display (#2634)

## [0.103.8] - 2025-01-11

### Changed

- fix: Running redteam from cloud (#2627)
- fix: redteam strategies (#2629)
- chore: show # plugins and strats selected (#2628)o/pull/2626

## [0.103.7] - 2025-01-10

### Changed

- chore(redteam): record iterative history in metadata (#2625)
- chore(redteam): integrate grader into goat for ASR improvement (#2612)
- chore(cli): make db migrations quieter (#2621)
- chore(providers): update Azure API version for Azure provider (#2611)
- chore: Revert "chore(redteam): expose redteam run command and auto-share remote results" (#2613)
- docs: owasp illustrations (#2615)
- docs: plugin and strategy graphics (#2610)

### Fixed

- fix(webui): add default background for image lightbox (#2616)
- fix(openrouter): pass through openrouter-specific options (#2620)

### Dependencies

- chore(deps): bump @aws-sdk/client-bedrock-runtime from 3.723.0 to 3.726.0 (#2618)
- chore(deps): bump groq-sdk from 0.10.0 to 0.11.0 (#2619)
- chore(deps): bump openai from 4.77.4 to 4.78.0 (#2617)

### Documentation

- docs(site): add vedant to the about page (#2622)
- docs(site): update grid breakpoints for better spacing of team members on about page (#2623)

## [0.103.6] - 2025-01-09

### Changed

- chore(examples): add image saving hook for DALL-E outputs in redteam-dalle (#2607)
- chore(redteam): expose redteam run command and auto-share remote results (#2609)
- chore(redteam): store attack prompt instead of rendered prompt in metadata (#2602)
- chore(workflows): add actionlint GitHub Action for workflow validation (#2604)
- chore(ci): updated yanked dependency and ruff format (#2608)

### Fixed

- fix(docker): correct string concatenation for BUILD_DATE in GitHub Actions (#2603)
- fix(providers): convert anthropic bedrock lone system messages to user messages for compatibility with model graded metrics (#2606)

### Documentation

- docs(caching): expand documentation on caching mechanisms (#2605)

## [0.103.5] - 2025-01-09

### Added

- feat(fetch): Add support for custom SSL certificates (#2591)

### Changed

- chore(assertions): Improve Python assertion configuration passing (#2583)
- chore(debug): Enhance logging for null/undefined template variables (#2588)
- chore(providers): Allow ability to set custom default embedding provider (#2587)
- chore(providers): Improve error handling in HTTP provider (#2593)
- chore(redteam): Add grader to crescendo to increase ASR (#2594)
- chore(webui): Add plugin category on the recently used cards (#2600)
- chore(webui): Highlight selected strats just like plugins (#2601)
- chore(webui): Replace initial prompt with last redteam prompt when it exists (#2598)
- chore(webui): Response parser -> response transform (#2584)

### Fixed

- fix(cli): filterMode `failures` should omit `errors` (#2590)
- fix(providers): Handle bad HTTP status code (#2589)
- fix(redteam): ascii-smuggling is a plugin, not a strategy (#2585)
- fix(redteam): Use OS-agnostic temp file (#2586)

### Dependencies

- chore(deps): Update dependencies to latest versions (#2597)

### Documentation

- docs(license): Update year and clarify licensing terms (#2596)
- docs(providers): Update overview table with new entries (#2592)

## [0.103.4] - 2025-01-08

### Added

- feat(cli): add --filter-errors-only parameter to `eval` (#2539)
- feat(providers): f5 provider placeholder (#2563)
- feat(assertions): add support for specifying function names in external assertions (#2548)

### Changed

- chore(providers): add support for the WATSONX_AI_AUTH_TYPE env (#2547)
- chore(providers): add debug logs to llama provider (#2569)
- chore(redteam): add debug to cyberseceval (#2549)
- chore(redteam): add english language cyberseceval (#2561)
- chore(redteam): adjust parameters for iterativeTree strategy (#2535)
- chore(redteam): improve dialog content for load example configuration (#2574)
- chore(redteam): improve grader in jailbreak:tree strategy (#2565)
- chore(redteam): improve iterative provider with test case grader (#2552)
- chore(redteam): improve tree node selection. Add metadata (#2538)
- chore(redteam): reduce iterative image provider refusals (#2578)
- chore(tests): improve misc test setup and teardown (#2579)
- chore(webui): enhance metadata expand/collapse handling (#2550)
- chore(webui): Add type for provider test response (#2567)
- chore(assertions): minor change to python assert example and revert provider to gpt4 mini (#2564)
- chore(webui): ensure provider overrides are displayed correctly (#2546)
- docs: improve dark mode styles on security page (#2562)
- docs: jailbreak blog post (#2575)
- docs: missing plugins (#2558)
- docs: updates to llm vulnerability types page (#2527)
- docs: updating typo for g-eval pages (#2568)
- docs: only show frameworks in compliance section (#2559)
- chore(docs): improve dark mode on redteam configuration  (#2553)
- chore(docs): sort plugins by pluginId (#2536)

### Fixed

- fix(assertions): ensure that Python assertions can reference the config as per the example given (#2551)

### Dependencies

- chore(deps): update dependencies to latest minor and patch versions (#2533)
- chore(deps): bump @aws-sdk/client-bedrock-runtime from 3.716.0 to 3.721.0 (#2532)
- chore(deps): bump @aws-sdk/client-bedrock-runtime from 3.721.0 to 3.723.0 (#2554)
- chore(deps): bump openai from 4.77.0 to 4.77.3 (#2544)
- chore(deps): update lock file to resolve dependency issues (#2545)
- chore(deps): update lock file to resolve yanked dependency (#2581)

### Documentation

- docs(blog): improve the usage instructions for jailbreak dalle post (#2576)
- docs(llm-vulnerability-scanner): improve dark mode styles (#2577)
- docs(styles): improve dark mode styles for index page (#2580)
- docs(troubleshooting): adjust sidebar order and update example version (#2557)

## [0.103.3] - 2025-01-03

### Added

- feat(redteam): add system prompt override plugin (#2524)

### Changed

- feat: cyberseceval plugin (#2523)
- chore(vertex): ability to override api version (#2529)
- chore: add more debug info to API health check (#2531)
- chore: switch cloud `run` to use --config param (#2520)
- docs: update owasp top 10 page (#2515)
- docs: misc improvements (#2525)

### Fixed

- fix(gemini): support gemini thinking model (#2526)
- fix(docs): correct broken link in blog post (#2522)
- fix(docs): conditionally enable gtag only in production (#2530)

### Documentation

- docs(blog): unbounded consumption (#2521)


