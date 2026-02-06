# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [0.120.23](https://github.com/promptfoo/promptfoo/compare/0.120.22...0.120.23) (2026-02-06)

### Bug Fixes

- **blobs:** restore cloud blob upload for shared evals ([#7484](https://github.com/promptfoo/promptfoo/issues/7484)) ([7eb1009](https://github.com/promptfoo/promptfoo/commit/7eb100939c07b0b414459682cdd057e024b39814))
- **deps:** update dependency @opencode-ai/sdk to ^1.1.48 ([#7499](https://github.com/promptfoo/promptfoo/issues/7499)) ([b081a54](https://github.com/promptfoo/promptfoo/commit/b081a54887bd4c8ff79cc81b305b8f10f21c2962))
- **deps:** update dependency commander to ^14.0.3 ([#7497](https://github.com/promptfoo/promptfoo/issues/7497)) ([1c8f67a](https://github.com/promptfoo/promptfoo/commit/1c8f67a7af72cd4bd8fa0d63b8dab261a2405a8b))
- **eval:** restore runtime vars when filtering tests for re-run ([#7071](https://github.com/promptfoo/promptfoo/issues/7071)) ([c53523c](https://github.com/promptfoo/promptfoo/commit/c53523c461d9a1b93ce03bcc149605746a9307f3))
- **redteam:** avoid undefined callApi with Python mischievous-user ([#7509](https://github.com/promptfoo/promptfoo/issues/7509)) ([395856c](https://github.com/promptfoo/promptfoo/commit/395856ca76e57d46c42efa2d8a389e788990bb5c))
- **redteam:** data exfil grader falls through to LLM rubric on no server-side hit ([#7516](https://github.com/promptfoo/promptfoo/issues/7516)) ([6fbd246](https://github.com/promptfoo/promptfoo/commit/6fbd246792ea00c6f135c4968fb8c8e5e0454673))
- **redteam:** include specific policy IDs in severity map ([#7492](https://github.com/promptfoo/promptfoo/issues/7492)) ([61935ee](https://github.com/promptfoo/promptfoo/commit/61935ee9ced0bd5a4675c2a59456b9e0abbe66c0))
- **redteam:** skip refusal check when output contains valid prompt markers ([#7524](https://github.com/promptfoo/promptfoo/issues/7524)) ([882f47e](https://github.com/promptfoo/promptfoo/commit/882f47e145181ae4cbaeac3ee05a39f625f88349))
- **redteam:** strip eval- prefix from dynamic page URLs ([#7496](https://github.com/promptfoo/promptfoo/issues/7496)) ([f467707](https://github.com/promptfoo/promptfoo/commit/f467707e15758113278610ed9a9fea54f8afba8c))

### Performance Improvements

- **redteam:** strip graderExamples from remote generation requests ([#7522](https://github.com/promptfoo/promptfoo/issues/7522)) ([d7df221](https://github.com/promptfoo/promptfoo/commit/d7df221b5857b2ca0c77256447c3bb9ec4572a2f))

## [0.120.22](https://github.com/promptfoo/promptfoo/compare/0.120.21...0.120.22) (2026-02-04)

### Features

- **redteam:** enable multilingual support for audio/video/image strategies ([#7485](https://github.com/promptfoo/promptfoo/issues/7485)) ([01b62ce](https://github.com/promptfoo/promptfoo/commit/01b62cee55c4c06edc510d9684a4696bbc62633b))

### Bug Fixes

- **app:** move rows useMemo after table declaration to fix build ([#7475](https://github.com/promptfoo/promptfoo/issues/7475)) ([d1c2a39](https://github.com/promptfoo/promptfoo/commit/d1c2a39d6729de3988cbc4c21f72126ca5e0a8c6))
- **app:** reduce payload to avoid RangeError ([#7436](https://github.com/promptfoo/promptfoo/issues/7436)) ([ff3d3d9](https://github.com/promptfoo/promptfoo/commit/ff3d3d9d31ebeb87c461db4443ce233e915d29d2))
- **app:** show all table rows when printing instead of just current page ([#7387](https://github.com/promptfoo/promptfoo/issues/7387)) ([ca50ce8](https://github.com/promptfoo/promptfoo/commit/ca50ce87c9ea59ac5d81a09430929f10ad92cb82))
- **cli:** improve error messages for missing config file ([#7464](https://github.com/promptfoo/promptfoo/issues/7464)) ([9189dbf](https://github.com/promptfoo/promptfoo/commit/9189dbf2f79d3c237615678c47ce41edefd585f8))
- **commands:** use streaming iteration in recalculatePromptMetrics to avoid OOM ([#7471](https://github.com/promptfoo/promptfoo/issues/7471)) ([1346f0a](https://github.com/promptfoo/promptfoo/commit/1346f0a130536427829ae451f66323a4a2a2bb3f))
- **deps:** override lodash-es to 4.17.23 to resolve prototype pollution ([#7474](https://github.com/promptfoo/promptfoo/issues/7474)) ([f8bbd45](https://github.com/promptfoo/promptfoo/commit/f8bbd45ad91bd0b389f2c4aa999999a0671abefd))
- **deps:** update dependency @anthropic-ai/sdk to ^0.72.0 ([#7460](https://github.com/promptfoo/promptfoo/issues/7460)) ([4bce247](https://github.com/promptfoo/promptfoo/commit/4bce247f1003ab38dbe3115913172b9c5b0b6275))
- **deps:** update dependency @anthropic-ai/sdk to ^0.72.1 ([#7472](https://github.com/promptfoo/promptfoo/issues/7472)) ([bc8be96](https://github.com/promptfoo/promptfoo/commit/bc8be969ddd782681779d7f7f0404be235113707))
- **deps:** update dependency ai to ^6.0.62 ([#7456](https://github.com/promptfoo/promptfoo/issues/7456)) ([cc259e9](https://github.com/promptfoo/promptfoo/commit/cc259e99a3960c74a1447241dccce42c0d64c91f))
- **deps:** update dependency fast-xml-parser to ^5.3.4 ([#7476](https://github.com/promptfoo/promptfoo/issues/7476)) ([29121d5](https://github.com/promptfoo/promptfoo/commit/29121d52c5dd36769c23867025e46281f420679d))
- **deps:** update dependency posthog-node to ~5.24.6 ([#7441](https://github.com/promptfoo/promptfoo/issues/7441)) ([9d2a59f](https://github.com/promptfoo/promptfoo/commit/9d2a59f662965c6d86d6f2acf63d00c9407edbae))
- **deps:** update dependency posthog-node to ~5.24.7 ([#7465](https://github.com/promptfoo/promptfoo/issues/7465)) ([b87fbd9](https://github.com/promptfoo/promptfoo/commit/b87fbd9e06c6b4532c1cd5a8d4fda36ccf7da5d7))
- export/table handling for falsy values ([#7440](https://github.com/promptfoo/promptfoo/issues/7440)) ([ec5b404](https://github.com/promptfoo/promptfoo/commit/ec5b404de0cadb2de27578c716e37e092dcdd860))

## [0.120.21](https://github.com/promptfoo/promptfoo/compare/0.120.20...0.120.21) (2026-02-03)

### Features

- **app:** add print styles to DataTable for light mode printing ([#7365](https://github.com/promptfoo/promptfoo/issues/7365)) ([167b27c](https://github.com/promptfoo/promptfoo/commit/167b27c4b9483173cebe6eb7b3467e72a723fd3f))
- **app:** improve HTTP endpoint request body editor ([#7438](https://github.com/promptfoo/promptfoo/issues/7438)) ([cfadb37](https://github.com/promptfoo/promptfoo/commit/cfadb3733c252114b5b15daf0f3a95809333b541))
- **providers:** add HuggingFace chat completion provider ([#7446](https://github.com/promptfoo/promptfoo/issues/7446)) ([cd709b7](https://github.com/promptfoo/promptfoo/commit/cd709b7db38fc396ccadce5e960e28019f0efd01))
- **providers:** add tools and tool choice transformations ([#7420](https://github.com/promptfoo/promptfoo/issues/7420)) ([c332cef](https://github.com/promptfoo/promptfoo/commit/c332cefd5dfc141d1f02ae4427509e82aeb1062e))
- **providers:** add xAI Grok Imagine video provider ([#7395](https://github.com/promptfoo/promptfoo/issues/7395)) ([8407969](https://github.com/promptfoo/promptfoo/commit/84079698c689628f5a7bd775befbc99f4529decc))
- **redteam:** Add indirect-web-pwn attack strategy ([#6973](https://github.com/promptfoo/promptfoo/issues/6973)) ([1065e71](https://github.com/promptfoo/promptfoo/commit/1065e711ddd96e53da500a20589914d53d94f157))

### Bug Fixes

- **app:** refresh history page when evals complete ([#7189](https://github.com/promptfoo/promptfoo/issues/7189)) ([31ac183](https://github.com/promptfoo/promptfoo/commit/31ac183deb8b09ea7bb657cd579304007515aa1a))
- **assertions:** resolve dynamic vars before passing to assertion functions ([#7374](https://github.com/promptfoo/promptfoo/issues/7374)) ([d3ad963](https://github.com/promptfoo/promptfoo/commit/d3ad963830002c3856a7f1a6ad719e74b8ab91c1))
- **ci:** replace raven-actions/actionlint with direct download ([#7373](https://github.com/promptfoo/promptfoo/issues/7373)) ([665f8d3](https://github.com/promptfoo/promptfoo/commit/665f8d344e8ed7b9127b0438e9b09bc460259fd0))
- **cli:** ensure process exits on SIGINT during view command ([#7390](https://github.com/promptfoo/promptfoo/issues/7390)) ([1a21ce2](https://github.com/promptfoo/promptfoo/commit/1a21ce267cbd61e5671a611884b53f5937ac44b5))
- **cli:** show zero pass/fail counts in `promptfoo show` ([#7427](https://github.com/promptfoo/promptfoo/issues/7427)) ([ecc2abc](https://github.com/promptfoo/promptfoo/commit/ecc2abc942c4697813a4acda763c877a34e9a0ab))
- **cli:** use npx commands in README when init run via npx ([#7377](https://github.com/promptfoo/promptfoo/issues/7377)) ([1c0504e](https://github.com/promptfoo/promptfoo/commit/1c0504e7bdd31e7aa6dde2f1c65e28b4cbcc372c))
- **deps:** lock file maintenance example dependencies ([#7406](https://github.com/promptfoo/promptfoo/issues/7406)) ([4f4807c](https://github.com/promptfoo/promptfoo/commit/4f4807ce20500ba35b0785729aa5d6de04cb9377))
- **deps:** run npm audit fix ([#7450](https://github.com/promptfoo/promptfoo/issues/7450)) ([3f9ac78](https://github.com/promptfoo/promptfoo/commit/3f9ac78f4740f4ce0cc52d3e7c66fe2240adcf2e))
- **deps:** update dependency @actions/core to ^2.0.3 ([#7415](https://github.com/promptfoo/promptfoo/issues/7415)) ([5f0e93f](https://github.com/promptfoo/promptfoo/commit/5f0e93f4337eb03546f470fe526afc15d86c5e14))
- **deps:** update dependency @actions/github to ^8.0.1 ([#7412](https://github.com/promptfoo/promptfoo/issues/7412)) ([052ba95](https://github.com/promptfoo/promptfoo/commit/052ba950240c25239bed8a364f2e628318b42f6b))
- **deps:** update dependency @actions/github to v8 ([#7402](https://github.com/promptfoo/promptfoo/issues/7402)) ([b805942](https://github.com/promptfoo/promptfoo/commit/b805942c7286eca0e42f851c5c1f4a2ced9dd037))
- **deps:** update dependency @apidevtools/json-schema-ref-parser to ^15.2.2 ([#7362](https://github.com/promptfoo/promptfoo/issues/7362)) ([7ac8a53](https://github.com/promptfoo/promptfoo/commit/7ac8a53913fad9101a5698976971495fc8e62618))
- **deps:** update dependency @opencode-ai/sdk to ^1.1.35 ([#7380](https://github.com/promptfoo/promptfoo/issues/7380)) ([632f64d](https://github.com/promptfoo/promptfoo/commit/632f64ddb11600b6b4bd66068548add9de902664))
- **deps:** update dependency @opencode-ai/sdk to ^1.1.36 ([#7389](https://github.com/promptfoo/promptfoo/issues/7389)) ([c23e90c](https://github.com/promptfoo/promptfoo/commit/c23e90cc951a94edcb25de8e0fdbf74a684d4769))
- **deps:** update dependency ai to ^6.0.50 ([#7399](https://github.com/promptfoo/promptfoo/issues/7399)) ([af3542d](https://github.com/promptfoo/promptfoo/commit/af3542d342403d2f9a8cb8de633188ea862e80a6))
- **deps:** update dependency ai to ^6.0.55 ([#7410](https://github.com/promptfoo/promptfoo/issues/7410)) ([890d6a7](https://github.com/promptfoo/promptfoo/commit/890d6a7bf4781e0ecfaf174516ca21619e53ad1c))
- **deps:** update dependency ai to ^6.0.56 ([#7417](https://github.com/promptfoo/promptfoo/issues/7417)) ([42d316f](https://github.com/promptfoo/promptfoo/commit/42d316f5d31141c11b2c913bff0315171d297598))
- **deps:** update dependency ai to ^6.0.57 ([#7421](https://github.com/promptfoo/promptfoo/issues/7421)) ([ca7972b](https://github.com/promptfoo/promptfoo/commit/ca7972bde61844e9fe595d23d2d1f588e309d19d))
- **deps:** update dependency ai to ^6.0.58 ([#7439](https://github.com/promptfoo/promptfoo/issues/7439)) ([2a05dbd](https://github.com/promptfoo/promptfoo/commit/2a05dbd1e9a2d8de6ed694280f1f51911cd9781e))
- **deps:** update dependency ai to ^6.0.59 ([#7448](https://github.com/promptfoo/promptfoo/issues/7448)) ([a5f17ed](https://github.com/promptfoo/promptfoo/commit/a5f17ed5702c086c83a49cbbf86cb369f29e5613))
- **deps:** update dependency ai to ^6.0.60 ([#7455](https://github.com/promptfoo/promptfoo/issues/7455)) ([ee7b28e](https://github.com/promptfoo/promptfoo/commit/ee7b28eb9f50de834fb9f1f062c21ddd34c67450))
- **deps:** update dependency lru-cache to ^11.2.5 ([#7400](https://github.com/promptfoo/promptfoo/issues/7400)) ([c193ebd](https://github.com/promptfoo/promptfoo/commit/c193ebd7f4a89d9d20b072107250bfeabf52dae7))
- **deps:** update dependency openai to ^6.17.0 ([#7449](https://github.com/promptfoo/promptfoo/issues/7449)) ([65e75eb](https://github.com/promptfoo/promptfoo/commit/65e75eb6be722a901c2bb6be76965d71c2f1e95f))
- **deps:** update dependency posthog-node to ~5.24.3 ([#7413](https://github.com/promptfoo/promptfoo/issues/7413)) ([f60d3e0](https://github.com/promptfoo/promptfoo/commit/f60d3e0f1820ad9a86e962a32f37cd7e492c4ef3))
- **deps:** update dependency swiper to ^12.1.0 ([#7442](https://github.com/promptfoo/promptfoo/issues/7442)) ([8b6af09](https://github.com/promptfoo/promptfoo/commit/8b6af09b44c88650ebc0e6ad4cde55b454551253))
- **deps:** update dependency undici ([#7422](https://github.com/promptfoo/promptfoo/issues/7422)) ([8ef17c6](https://github.com/promptfoo/promptfoo/commit/8ef17c63d74e4742d2a9cfe749fbdcd4dd53faae))
- **deps:** update dependency undici to ^7.19.1 ([#7368](https://github.com/promptfoo/promptfoo/issues/7368)) ([5a841d0](https://github.com/promptfoo/promptfoo/commit/5a841d0902c243f50bbc79d225244503566a3da3))
- **deps:** update example dependencies (major) ([#7404](https://github.com/promptfoo/promptfoo/issues/7404)) ([a46f8dd](https://github.com/promptfoo/promptfoo/commit/a46f8dda2a2a4919ed93ed63f49445698886adc3))
- **deps:** update openai packages ([#7435](https://github.com/promptfoo/promptfoo/issues/7435)) ([241a2fc](https://github.com/promptfoo/promptfoo/commit/241a2fced1a17201906dd605896cec0ae2ce8259))
- **deps:** update type definitions ([#7431](https://github.com/promptfoo/promptfoo/issues/7431)) ([9e5cddb](https://github.com/promptfoo/promptfoo/commit/9e5cddb9a645446cf8b8bcee528d923701d7dd32))
- g-eval prompt ambiguity ([#7397](https://github.com/promptfoo/promptfoo/issues/7397)) ([fb8d872](https://github.com/promptfoo/promptfoo/commit/fb8d872140b34b8c62bc99caccbdd0156ceb7037))
- Langfuse variable type conversion ([#7461](https://github.com/promptfoo/promptfoo/issues/7461)) ([755d38c](https://github.com/promptfoo/promptfoo/commit/755d38c3d4b564b6c39d05bcfd02821f7d14287b))
- prompt id hashing ([#6782](https://github.com/promptfoo/promptfoo/issues/6782)) ([18beb08](https://github.com/promptfoo/promptfoo/commit/18beb08b8749aab06d33e5c21503f25f1fe280fd))
- **redteam:** ensure provider cleanup on all exit paths ([#7407](https://github.com/promptfoo/promptfoo/issues/7407)) ([e1538fe](https://github.com/promptfoo/promptfoo/commit/e1538fe1e3c68d7b709247eef89712c285d2ac2e))
- **redteam:** improve Request Body editor UX and error handling ([#7319](https://github.com/promptfoo/promptfoo/issues/7319)) ([a1b4eec](https://github.com/promptfoo/promptfoo/commit/a1b4eecc6d464f6bdf88be636c850fd4d27cac6c))
- **redteam:** use word-boundary regex in isBasicRefusal to prevent false positives ([#7394](https://github.com/promptfoo/promptfoo/issues/7394)) ([2ad5692](https://github.com/promptfoo/promptfoo/commit/2ad569207365665b143f52dff93cd0552bad13b7))
- remove dupe eval row ids ([#7426](https://github.com/promptfoo/promptfoo/issues/7426)) ([4ba7fad](https://github.com/promptfoo/promptfoo/commit/4ba7fad28d3364eb542980335140c56f09d1a360))

## [0.120.20](https://github.com/promptfoo/promptfoo/compare/0.120.19...0.120.20) (2026-01-29)

### Features

- **redteam:** add email validation to generate command ([#7314](https://github.com/promptfoo/promptfoo/issues/7314)) ([4fffc3a](https://github.com/promptfoo/promptfoo/commit/4fffc3a2827cfadc9213f06167755fa880a2099d))

### Bug Fixes

- **deps:** update dependency @openai/agents to ^0.4.3 ([#7352](https://github.com/promptfoo/promptfoo/issues/7352)) ([7fbb175](https://github.com/promptfoo/promptfoo/commit/7fbb1750d9304ef65a94762934381de745c96f01))
- **deps:** update dependency posthog-node to ~5.23.0 ([#7249](https://github.com/promptfoo/promptfoo/issues/7249)) ([2126508](https://github.com/promptfoo/promptfoo/commit/21265087b3af10f627bb56838a772c2c8677b190))
- **deps:** update dependency posthog-node to ~5.24.2 ([#7357](https://github.com/promptfoo/promptfoo/issues/7357)) ([5c664a2](https://github.com/promptfoo/promptfoo/commit/5c664a2f902b4fa83a8093906088038059b842f2))
- **redteam:** add retry logic for multi-turn strategy generation ([#7342](https://github.com/promptfoo/promptfoo/issues/7342)) ([3e10268](https://github.com/promptfoo/promptfoo/commit/3e102682789c295c27c1a25dd89bfd687018b295))
- **redteam:** preserve provider config in browser flow ([#7358](https://github.com/promptfoo/promptfoo/issues/7358)) ([5941c43](https://github.com/promptfoo/promptfoo/commit/5941c432a342fe3c514e25e5efaec264b0d2f4f1))
- **scheduler:** preserve provider id() method when wrapping with rate… ([#7353](https://github.com/promptfoo/promptfoo/issues/7353)) ([eee32d4](https://github.com/promptfoo/promptfoo/commit/eee32d4756d56fda37e73c4253fd0fee7481650d))

## [0.120.19](https://github.com/promptfoo/promptfoo/compare/0.120.18...0.120.19) (2026-01-28)

### Features

- **app:** enhance DataTable with column alignment and styling improvements ([#7349](https://github.com/promptfoo/promptfoo/issues/7349)) ([8b8b122](https://github.com/promptfoo/promptfoo/commit/8b8b1223cef96257783caf69079976090db0062c))
- **app:** extend UI component interfaces for data-testid support ([#7339](https://github.com/promptfoo/promptfoo/issues/7339)) ([d9dc48a](https://github.com/promptfoo/promptfoo/commit/d9dc48a4866c1657ef7d4355deddd8f7ecc6dcaa))
- **webui:** Make severity cards colourful again ([#7346](https://github.com/promptfoo/promptfoo/issues/7346)) ([ba3c3db](https://github.com/promptfoo/promptfoo/commit/ba3c3db57d9968a85b2b7fcdd35ea61039df8934))

### Bug Fixes

- **deps:** update dependency @opencode-ai/sdk to ^1.1.33 ([#7327](https://github.com/promptfoo/promptfoo/issues/7327)) ([bc8ee96](https://github.com/promptfoo/promptfoo/commit/bc8ee96af4f424a25d3e66579205d717894f81a1))
- **deps:** update dependency @opencode-ai/sdk to ^1.1.34 ([#7332](https://github.com/promptfoo/promptfoo/issues/7332)) ([a9523d5](https://github.com/promptfoo/promptfoo/commit/a9523d51826d42c4d762ac0d414900c04b318cc4))
- **deps:** update dependency ai to ^6.0.49 ([#7341](https://github.com/promptfoo/promptfoo/issues/7341)) ([a957b98](https://github.com/promptfoo/promptfoo/commit/a957b98754982c60fc75fbdb61b6b32c03c81532))
- serialize Error objects properly in log context ([#7351](https://github.com/promptfoo/promptfoo/issues/7351)) ([584b283](https://github.com/promptfoo/promptfoo/commit/584b283134c8496ce2468003522aa13558bd4182))
- **share:** add adaptive chunk retry for large eval uploads ([#7335](https://github.com/promptfoo/promptfoo/issues/7335)) ([1f114da](https://github.com/promptfoo/promptfoo/commit/1f114da4b3a9d81e04a771471fcae6df84ba95fd))
- **webui:** Make chevron clickable for combobox ([#7347](https://github.com/promptfoo/promptfoo/issues/7347)) ([e7be12d](https://github.com/promptfoo/promptfoo/commit/e7be12d351f6b137f1964120277775ed384654ad))

## [0.120.18](https://github.com/promptfoo/promptfoo/compare/0.120.17...0.120.18) (2026-01-28)

### Features

- **eval:** support multiple --filter-metadata flags with AND logic ([#7317](https://github.com/promptfoo/promptfoo/issues/7317)) ([61d8d17](https://github.com/promptfoo/promptfoo/commit/61d8d174ee756881edac31dcad9861bb14530803))
- **providers:** add collaboration_mode support to OpenAI Codex SDK ([#7275](https://github.com/promptfoo/promptfoo/issues/7275)) ([a3e6d58](https://github.com/promptfoo/promptfoo/commit/a3e6d58d3580f0ea161646bc75967a86789ee4d7))
- **redteam:** add early CLI error for missing sharp dependency ([#7222](https://github.com/promptfoo/promptfoo/issues/7222)) ([f518b39](https://github.com/promptfoo/promptfoo/commit/f518b39637937a95c6f92a72f3870e26bec50077))
- **redteam:** informational level severity ([#7298](https://github.com/promptfoo/promptfoo/issues/7298)) ([4ce1327](https://github.com/promptfoo/promptfoo/commit/4ce1327dfab30c39079e9ad8fddd4f436427350b))
- **scheduler:** add adaptive rate limit scheduler ([#7262](https://github.com/promptfoo/promptfoo/issues/7262)) ([0f6da61](https://github.com/promptfoo/promptfoo/commit/0f6da6141819be36fb0f840f8e94f5cedd3a1739))
- **server:** add shared API types infrastructure with Zod schemas ([#7260](https://github.com/promptfoo/promptfoo/issues/7260)) ([f3a12d2](https://github.com/promptfoo/promptfoo/commit/f3a12d2b4e7f60d3dd997eca2916a5ff98a0fd09))
- **xai:** add websocketUrl override and expose function calls in voice provider ([#7217](https://github.com/promptfoo/promptfoo/issues/7217)) ([5865735](https://github.com/promptfoo/promptfoo/commit/5865735be1348d317bf793383a5bdf409aea2031))

### Bug Fixes

- **deps:** update dependency @modelcontextprotocol/sdk to ^1.25.3 ([#7268](https://github.com/promptfoo/promptfoo/issues/7268)) ([45e82e7](https://github.com/promptfoo/promptfoo/commit/45e82e73877de890a5848b3c86a1335b50324b7d))
- **deps:** update dependency @openai/agents to ^0.4.2 ([#7325](https://github.com/promptfoo/promptfoo/issues/7325)) ([d2ae2fd](https://github.com/promptfoo/promptfoo/commit/d2ae2fda6a33ae961c4f177a9fb2df953fadbeee))
- **deps:** update dependency @opencode-ai/sdk to ^1.1.26 ([#7248](https://github.com/promptfoo/promptfoo/issues/7248)) ([597abe0](https://github.com/promptfoo/promptfoo/commit/597abe079c5e665f7dad2c583cafd69a5bd9da18))
- **deps:** update dependency @opencode-ai/sdk to ^1.1.28 ([#7253](https://github.com/promptfoo/promptfoo/issues/7253)) ([d689b01](https://github.com/promptfoo/promptfoo/commit/d689b011497987a0faad07b8ad74b0f06070eecb))
- **deps:** update dependency @opencode-ai/sdk to ^1.1.31 ([#7289](https://github.com/promptfoo/promptfoo/issues/7289)) ([2c10b14](https://github.com/promptfoo/promptfoo/commit/2c10b14cfd3c10a1fb0e6054bd748c5fd7d0952c))
- **deps:** update dependency @opencode-ai/sdk to ^1.1.32 ([#7315](https://github.com/promptfoo/promptfoo/issues/7315)) ([01456ea](https://github.com/promptfoo/promptfoo/commit/01456eadf2a3621d4a7fc8c97bcb1952d81df491))
- **deps:** update dependency ai to ^6.0.45 ([#7277](https://github.com/promptfoo/promptfoo/issues/7277)) ([9d113d1](https://github.com/promptfoo/promptfoo/commit/9d113d15b5169fa2a88316b10dafc4e5b84b1a19))
- **deps:** update dependency ai to ^6.0.47 ([#7305](https://github.com/promptfoo/promptfoo/issues/7305)) ([dd9bef1](https://github.com/promptfoo/promptfoo/commit/dd9bef140956e89a9d9b0ae8424ce82eca72e485))
- **deps:** update dependency ai to ^6.0.48 ([#7307](https://github.com/promptfoo/promptfoo/issues/7307)) ([9f6e275](https://github.com/promptfoo/promptfoo/commit/9f6e2755dfb8db00d8c4097da0eff8e8a2d54306))
- **deps:** update dependency cors to ^2.8.6 ([#7306](https://github.com/promptfoo/promptfoo/issues/7306)) ([9f59e5b](https://github.com/promptfoo/promptfoo/commit/9f59e5be8ef95fcc6c3b4bed925d41030bc27d77))
- **deps:** update dependency keyv to ^5.6.0 ([#7269](https://github.com/promptfoo/promptfoo/issues/7269)) ([0135f8c](https://github.com/promptfoo/promptfoo/commit/0135f8c8b03aec40ef1d2a845e6ebcd8e6017a92))
- **deps:** update dependency lightningcss to ^1.31.0 ([#7251](https://github.com/promptfoo/promptfoo/issues/7251)) ([20e4ddb](https://github.com/promptfoo/promptfoo/commit/20e4ddb39ca6d6966d0107c069716e64d340394c))
- **deps:** update dependency lightningcss to ^1.31.1 ([#7270](https://github.com/promptfoo/promptfoo/issues/7270)) ([f41fc9e](https://github.com/promptfoo/promptfoo/commit/f41fc9e413671ef185b3e6e81b0adea154aeb7ea))
- **deps:** update dependency ora to ^9.1.0 ([#7271](https://github.com/promptfoo/promptfoo/issues/7271)) ([0d98bf6](https://github.com/promptfoo/promptfoo/commit/0d98bf6d6a0cedbb46007da0781fa27f55b9c8ae))
- **deps:** update dependency posthog-node to ~5.21.2 ([#7242](https://github.com/promptfoo/promptfoo/issues/7242)) ([8e8864c](https://github.com/promptfoo/promptfoo/commit/8e8864c85457cd3cea8080717a67a1da58ef59f8))
- **deps:** update dependency undici to ^7.19.0 ([#7291](https://github.com/promptfoo/promptfoo/issues/7291)) ([36a0c01](https://github.com/promptfoo/promptfoo/commit/36a0c0171e6536e2d67667ffaf157ebc0d65e849))
- **deps:** update dependency zod to ^4.3.6 ([#7316](https://github.com/promptfoo/promptfoo/issues/7316)) ([fe6a9fc](https://github.com/promptfoo/promptfoo/commit/fe6a9fcc7ef0cf7aafb7fe6d1e35075f4ea1886f))
- **deps:** update openai packages ([#7227](https://github.com/promptfoo/promptfoo/issues/7227)) ([8d59146](https://github.com/promptfoo/promptfoo/commit/8d59146f248e05650c58dcffe16398d1ec87ddb9))
- **deps:** update openai packages ([#7272](https://github.com/promptfoo/promptfoo/issues/7272)) ([0695134](https://github.com/promptfoo/promptfoo/commit/06951347a5349c00289b478685af83525d62000d))
- **deps:** update opentelemetry ([#7292](https://github.com/promptfoo/promptfoo/issues/7292)) ([0746c12](https://github.com/promptfoo/promptfoo/commit/0746c12a0fba0cf749ae20de542d15c94c8ceebc))
- **evaluator:** handle circular references in provider responses ([#7281](https://github.com/promptfoo/promptfoo/issues/7281)) ([cb14c83](https://github.com/promptfoo/promptfoo/commit/cb14c83da3e866419ba9a788d6fdfa1d7c504329))
- **providers:** kill Python process on worker ready timeout ([#7280](https://github.com/promptfoo/promptfoo/issues/7280)) ([4c4723e](https://github.com/promptfoo/promptfoo/commit/4c4723e3fb4e2456be3bc219dbcfef3818f3f58c))
- **providers:** make @huggingface/transformers an optional dependency ([#7261](https://github.com/promptfoo/promptfoo/issues/7261)) ([4cda786](https://github.com/promptfoo/promptfoo/commit/4cda7861054e73aa2d7c0df069cf73c673261173))
- **providers:** send temperature: 0 and max_tokens: 0 to API ([#7323](https://github.com/promptfoo/promptfoo/issues/7323)) ([646f0ea](https://github.com/promptfoo/promptfoo/commit/646f0eab81acfc63768fa494557f128aaaf32074))
- **redteam:** fix filter panel errors in Report component ([#7250](https://github.com/promptfoo/promptfoo/issues/7250)) ([45a3676](https://github.com/promptfoo/promptfoo/commit/45a367640e740a2a0382086aa2b40f83950d8e98))
- **redteam:** handle health check timeout to avoid blocking generation ([#7301](https://github.com/promptfoo/promptfoo/issues/7301)) ([9ba4040](https://github.com/promptfoo/promptfoo/commit/9ba4040b601a98c87ed9d6bc1c06b82b893a5372))
- **redteam:** make sharp availability tests deterministic ([#7232](https://github.com/promptfoo/promptfoo/issues/7232)) ([0fa9023](https://github.com/promptfoo/promptfoo/commit/0fa9023baa3df3437150de1a8478cd96f6833670))
- **redteam:** use defaultTest provider as fallback for attack generation ([#7236](https://github.com/promptfoo/promptfoo/issues/7236)) ([5ab746a](https://github.com/promptfoo/promptfoo/commit/5ab746ad69f36b67b97f032e2b7f2e0b4615e25b))
- **scheduler:** handle undefined error.message in isRateLimitError ([#7299](https://github.com/promptfoo/promptfoo/issues/7299)) ([b99108c](https://github.com/promptfoo/promptfoo/commit/b99108c7b625a9ce06ee55ccec90d7c40e051482))
- **webui:** Support password encrypted keys for PEM certs ([#7282](https://github.com/promptfoo/promptfoo/issues/7282)) ([2f8ee3c](https://github.com/promptfoo/promptfoo/commit/2f8ee3c223278abc50304fa7e37ef2491ac9e5c3))

## [0.120.17](https://github.com/promptfoo/promptfoo/compare/0.120.16...0.120.17) (2026-01-23)

### Features

- **redteam:** add telecom vertical red team plugins ([#7182](https://github.com/promptfoo/promptfoo/issues/7182)) ([678fd1e](https://github.com/promptfoo/promptfoo/commit/678fd1e9828aeece905f6d17984f3478846749ee))
- **redteam:** add VLSU compositional safety plugin ([#6855](https://github.com/promptfoo/promptfoo/issues/6855)) ([3e30cb0](https://github.com/promptfoo/promptfoo/commit/3e30cb0383991990177f3858cc19022334167974))
- **webui:** add user-rated filter to show only manually rated results ([#6193](https://github.com/promptfoo/promptfoo/issues/6193)) ([cbc59db](https://github.com/promptfoo/promptfoo/commit/cbc59dbbe9fd7c66e7b6b44bae9559e682f8ad9b))

### Bug Fixes

- **app:** fix tabs padding and hover state conflicts ([#7179](https://github.com/promptfoo/promptfoo/issues/7179)) ([7edf9af](https://github.com/promptfoo/promptfoo/commit/7edf9afef478d1223498b431acc12eb8fb062c82))
- **ci:** use gh pr diff for full reviews to avoid false positives ([#7192](https://github.com/promptfoo/promptfoo/issues/7192)) ([520f4cb](https://github.com/promptfoo/promptfoo/commit/520f4cb9491672b2ee67d1d4c93b83352f9d2d07))
- **deps:** update dependency @apidevtools/json-schema-ref-parser to ^15.2.1 ([#7193](https://github.com/promptfoo/promptfoo/issues/7193)) ([e1e5faa](https://github.com/promptfoo/promptfoo/commit/e1e5faa5363344a2b0234ae745f0f85fc8e007fd))
- **deps:** update dependency @openai/agents to ^0.3.9 ([#7183](https://github.com/promptfoo/promptfoo/issues/7183)) ([78cd5f4](https://github.com/promptfoo/promptfoo/commit/78cd5f4f235a32bc9c300338955b42193e1b0c95))
- **deps:** update dependency @opencode-ai/sdk to ^1.1.24 ([#7177](https://github.com/promptfoo/promptfoo/issues/7177)) ([a34f27f](https://github.com/promptfoo/promptfoo/commit/a34f27f82767ee7ef1d109ddb750bcb6e9ddbcc6))
- **deps:** update dependency @opencode-ai/sdk to ^1.1.25 ([#7180](https://github.com/promptfoo/promptfoo/issues/7180)) ([f960f63](https://github.com/promptfoo/promptfoo/commit/f960f63b3dd8aee3ca34960697fa5e27cb8b0b62))
- **deps:** update dependency better-sqlite3 to ^12.6.2 ([#7194](https://github.com/promptfoo/promptfoo/issues/7194)) ([2fca1e1](https://github.com/promptfoo/promptfoo/commit/2fca1e152201788ff9f9ec143baacab8b6d61b80))
- **deps:** update dependency posthog-node to ~5.21.1 ([#7178](https://github.com/promptfoo/promptfoo/issues/7178)) ([376b8a4](https://github.com/promptfoo/promptfoo/commit/376b8a4942a344f7f837956bd5aa6b32033ef38e))
- **export:** unify CSV exports between CLI and WebUI ([#6659](https://github.com/promptfoo/promptfoo/issues/6659)) ([a7080b6](https://github.com/promptfoo/promptfoo/commit/a7080b63aa7b7b40415b2877a33c5ae4e79530e3))
- **redteam:** fix policy loading and logging for inline vs reusable policies ([#7210](https://github.com/promptfoo/promptfoo/issues/7210)) ([b097386](https://github.com/promptfoo/promptfoo/commit/b0973865a3bc953425094db6d6bf2e0a728629d0))
- **redteam:** handle isRefusal in Crescendo before parsing JSON ([#7191](https://github.com/promptfoo/promptfoo/issues/7191)) ([d0c5857](https://github.com/promptfoo/promptfoo/commit/d0c5857984826f5a89de07ddfd704d2233b03157))
- **redteam:** use lenient provider matching for agentic strategies ([#7027](https://github.com/promptfoo/promptfoo/issues/7027)) ([552cb98](https://github.com/promptfoo/promptfoo/commit/552cb98d15a34f5a2686a6b2aed5b1badd6952ea))
- **retry:** prevent data loss when retry fails and add cloud sync ([#7164](https://github.com/promptfoo/promptfoo/issues/7164)) ([577c4d7](https://github.com/promptfoo/promptfoo/commit/577c4d7c2fd4d6dac1e5241e31873080cfd51cd0))
- **webui:** prevent external URL auto-loading from test variables ([#7076](https://github.com/promptfoo/promptfoo/issues/7076)) ([b7b5243](https://github.com/promptfoo/promptfoo/commit/b7b52436512198dfe63a02daa59b32f142cf5385))
- **webui:** prevent form submission during ime composition ([#7186](https://github.com/promptfoo/promptfoo/issues/7186)) ([2f3d37a](https://github.com/promptfoo/promptfoo/commit/2f3d37acae31521fe934c043d1824662c7fe1524))

## [0.120.16](https://github.com/promptfoo/promptfoo/compare/0.120.15...0.120.16) (2026-01-21)

### Features

- **config:** add per-test structured output support ([#6239](https://github.com/promptfoo/promptfoo/issues/6239)) ([4629892](https://github.com/promptfoo/promptfoo/commit/4629892c14c8df37d298229209a8a932d607de9f))
- **eval:** re-enable SIGINT graceful shutdown for eval pause/resume ([#7012](https://github.com/promptfoo/promptfoo/issues/7012)) ([06364ef](https://github.com/promptfoo/promptfoo/commit/06364ef85ebf0ffe0c5091d594aa91d704dea07a))
- **providers:** add AWS Bedrock video generation (Nova Reel + Luma Ray 2) ([#6889](https://github.com/promptfoo/promptfoo/issues/6889)) ([71cb200](https://github.com/promptfoo/promptfoo/commit/71cb2005e639ab45c20b875317d7ad21566beb34))
- **providers:** add enhanced parameters and chat support for WatsonX ([#6605](https://github.com/promptfoo/promptfoo/issues/6605)) ([6cbb5db](https://github.com/promptfoo/promptfoo/commit/6cbb5db7487640b8d2855998695e4bc45cf89843))
- **providers:** support dynamic prompt reporting ([#6843](https://github.com/promptfoo/promptfoo/issues/6843)) ([65a2dc7](https://github.com/promptfoo/promptfoo/commit/65a2dc79e4f3aa0b5adba466be39bdb93fcc8e4c))

### Bug Fixes

- **deps:** update dependency @opencode-ai/sdk to ^1.1.23 ([#7153](https://github.com/promptfoo/promptfoo/issues/7153)) ([b697ce7](https://github.com/promptfoo/promptfoo/commit/b697ce7bbcaf2fd89d172c5fdcfb217bcf466b8c))
- **redteam:** improve plugin logging and fix report aggregation ([#7150](https://github.com/promptfoo/promptfoo/issues/7150)) ([5736ff0](https://github.com/promptfoo/promptfoo/commit/5736ff0a8e07cc2bd3fd93320ef01e62356ed170))
- **redteam:** unique display IDs for policy plugins & accurate progress bar ([#7157](https://github.com/promptfoo/promptfoo/issues/7157)) ([5cbc027](https://github.com/promptfoo/promptfoo/commit/5cbc027ef063353bf667787536d1c1d62bcc399e))

## [0.120.15](https://github.com/promptfoo/promptfoo/compare/0.120.14...0.120.15) (2026-01-20)

### Features

- **app:** add NavigationSidebar component and enhance Tabs ([#7073](https://github.com/promptfoo/promptfoo/issues/7073)) ([55a3125](https://github.com/promptfoo/promptfoo/commit/55a3125e5627c2f1a4981744f536fde71b21a5de))
- **app:** add Storybook with stories for all UI components ([#7066](https://github.com/promptfoo/promptfoo/issues/7066)) ([53f51cf](https://github.com/promptfoo/promptfoo/commit/53f51cf79b9d584dbf1acf1e1142bbde3f1d215f))
- **app:** enhance Combobox with label and clearable props ([#7074](https://github.com/promptfoo/promptfoo/issues/7074)) ([53a47c5](https://github.com/promptfoo/promptfoo/commit/53a47c59b87135d68ff74a0cce8d788475118987))
- **app:** Improve alert component ([#7069](https://github.com/promptfoo/promptfoo/issues/7069)) ([8ee2bcb](https://github.com/promptfoo/promptfoo/commit/8ee2bcb8b53e7f55c562b128dcfa9f8997384ded))
- **code-scan:** fork PR support and comment-triggered scans ([#7038](https://github.com/promptfoo/promptfoo/issues/7038)) ([4eebb81](https://github.com/promptfoo/promptfoo/commit/4eebb8179b9c57ed4cb966d0f63cf2f8d3991096))
- **eval:** add providers filter on test cases ([#6872](https://github.com/promptfoo/promptfoo/issues/6872)) ([4d64d84](https://github.com/promptfoo/promptfoo/commit/4d64d84b8aed357b792834731d521de4913272ca))
- **eval:** add test-level prompts filter ([#6686](https://github.com/promptfoo/promptfoo/issues/6686)) ([895e1b4](https://github.com/promptfoo/promptfoo/commit/895e1b4a4ee683c3fccb2c02de9527574faba223))
- **eval:** surface metadata.sessionId as a variable column in tables and exports ([#7087](https://github.com/promptfoo/promptfoo/issues/7087)) ([736bddb](https://github.com/promptfoo/promptfoo/commit/736bddb911065806b8da8d7583adba395c3673aa))
- **evaluator:** add \_\_count variable for derived metrics averages ([#7092](https://github.com/promptfoo/promptfoo/issues/7092)) ([31ad6e6](https://github.com/promptfoo/promptfoo/commit/31ad6e60e607e24276aa7a8f62e9b497c2bc1a82))
- **providers:** add apiBaseUrl support to xAI Voice provider ([#7088](https://github.com/promptfoo/promptfoo/issues/7088)) ([a1d535a](https://github.com/promptfoo/promptfoo/commit/a1d535a32ba6231fb8593b6501600b21e7578468))
- **providers:** add native session endpoint support for HTTP provider ([#7133](https://github.com/promptfoo/promptfoo/issues/7133)) ([54c315b](https://github.com/promptfoo/promptfoo/commit/54c315b4d69e586aae173b7b91e0d6ff7cde59dc))
- **providers:** add Transformers.js provider for local inference ([#6661](https://github.com/promptfoo/promptfoo/issues/6661)) ([dd9b199](https://github.com/promptfoo/promptfoo/commit/dd9b199dea69e986888ac530896123c27edee4d2))
- **providers:** add Vercel AI gateway ([#7061](https://github.com/promptfoo/promptfoo/issues/7061)) ([f2a4c89](https://github.com/promptfoo/promptfoo/commit/f2a4c89da251c0ccb78605e82de20d162fd1e74e))
- **python:** propagate -j concurrency flag to worker pool ([#7065](https://github.com/promptfoo/promptfoo/issues/7065)) ([32ffdd5](https://github.com/promptfoo/promptfoo/commit/32ffdd5e9a0e05b0f6a2352cf87ba28e58edbbe3))
- **redteam:** add -d/--description flag to generate command ([#7148](https://github.com/promptfoo/promptfoo/issues/7148)) ([c305085](https://github.com/promptfoo/promptfoo/commit/c3050851bb8dc1abdfdffa62663b5b5c0d9659c1))
- **redteam:** add RAG source attribution plugin ([#7064](https://github.com/promptfoo/promptfoo/issues/7064)) ([3efe2a6](https://github.com/promptfoo/promptfoo/commit/3efe2a6cf300f185a29cb434d5e50a2a370d0466))
- **redteam:** stop scan early when plugins fail to generate test cases ([#7017](https://github.com/promptfoo/promptfoo/issues/7017)) ([49b856b](https://github.com/promptfoo/promptfoo/commit/49b856b4b7141e950b5c856b1608f7bf59819b4b))
- **webui:** Multi-input in redteam setup UI ([#6954](https://github.com/promptfoo/promptfoo/issues/6954)) ([3c45963](https://github.com/promptfoo/promptfoo/commit/3c459639147962cca65c63d8df0377ae0ba3a9cf))

### Bug Fixes

- **config:** resolve env variables from config env section in provider IDs ([#7093](https://github.com/promptfoo/promptfoo/issues/7093)) ([736f65a](https://github.com/promptfoo/promptfoo/commit/736f65a5d19fe355b58d2fee093514c4fe7ff7b8))
- **deps:** update dependency @apidevtools/json-schema-ref-parser to ^15.2.0 ([#7131](https://github.com/promptfoo/promptfoo/issues/7131)) ([a7ef170](https://github.com/promptfoo/promptfoo/commit/a7ef17014ad44d3642ba2f4a790ddf0df40d200c))
- **deps:** update dependency @openai/agents to ^0.3.8 ([#7123](https://github.com/promptfoo/promptfoo/issues/7123)) ([85a3c92](https://github.com/promptfoo/promptfoo/commit/85a3c921ec2db77e4866aedd3ca7e3087fa47f42))
- **deps:** update dependency @opencode-ai/sdk to ^1.1.20 ([#7124](https://github.com/promptfoo/promptfoo/issues/7124)) ([271ea58](https://github.com/promptfoo/promptfoo/commit/271ea58391df834ad349d0c366701f964402cac1))
- **deps:** update dependency @opencode-ai/sdk to ^1.1.21 ([#7132](https://github.com/promptfoo/promptfoo/issues/7132)) ([2430635](https://github.com/promptfoo/promptfoo/commit/24306359bba296bc304d17ffa90297106d7d350b))
- **deps:** update dependency ai to ^6.0.35 ([#7134](https://github.com/promptfoo/promptfoo/issues/7134)) ([eea0948](https://github.com/promptfoo/promptfoo/commit/eea0948f589bbba5fbe1b1c3b8096ae3ac22f76e))
- **deps:** update dependency ai to ^6.0.37 ([#7140](https://github.com/promptfoo/promptfoo/issues/7140)) ([c12c6c5](https://github.com/promptfoo/promptfoo/commit/c12c6c5efbb43d0508365a693087e51f72457cd6))
- **deps:** update dependency posthog-node to ^5.21.0 ([#7125](https://github.com/promptfoo/promptfoo/issues/7125)) ([8e36498](https://github.com/promptfoo/promptfoo/commit/8e36498c5bd9059f648ea28eeb16f5e05f38f162))
- **deps:** update opentelemetry ([#7036](https://github.com/promptfoo/promptfoo/issues/7036)) ([6755add](https://github.com/promptfoo/promptfoo/commit/6755add6cf209778f36fcb850dd747a58c19d7d1))
- **deps:** upgrade undici to 6.23.0 to address CVE-2026-22036 ([#7130](https://github.com/promptfoo/promptfoo/issues/7130)) ([ba5d75f](https://github.com/promptfoo/promptfoo/commit/ba5d75feeff58a086c60787a004e313a3132c7e6))
- **lint:** resolve biome formatting and unused variable issues ([#7116](https://github.com/promptfoo/promptfoo/issues/7116)) ([b27742c](https://github.com/promptfoo/promptfoo/commit/b27742ca7845853dc986ce49f2b9900adff17be4))
- **providers:** copy wrapper files to server directory for Docker builds ([#7142](https://github.com/promptfoo/promptfoo/issues/7142)) ([febfc6c](https://github.com/promptfoo/promptfoo/commit/febfc6cf40e01c5e132ff1d868e6829314f71f86))
- **providers:** handle undefined agentResponse in SimulatedUser ([#7103](https://github.com/promptfoo/promptfoo/issues/7103)) ([fcebdfe](https://github.com/promptfoo/promptfoo/commit/fcebdfe088eac2f3bfc4857d1455d13d5de8e050))
- **redteam:** apply strategy numTests as pre-generation limit ([#7080](https://github.com/promptfoo/promptfoo/issues/7080)) ([29c49ef](https://github.com/promptfoo/promptfoo/commit/29c49eff0404f1b2728829e9892ef6dee42d0c86))
- **redteam:** improve error handling for iterative grading failures (ENG-1342) ([#6981](https://github.com/promptfoo/promptfoo/issues/6981)) ([66f8770](https://github.com/promptfoo/promptfoo/commit/66f87708c8421694732ad6ea27f068fc5753ed0b))
- **redteam:** respect --grader CLI flag in iterative strategies ([#7100](https://github.com/promptfoo/promptfoo/issues/7100)) ([2115c8d](https://github.com/promptfoo/promptfoo/commit/2115c8d5300c4f3654a6b15a09295aab45c29b34))
- **schema:** replace z.intersection with object spread for TestCase options ([#7097](https://github.com/promptfoo/promptfoo/issues/7097)) ([2d296a1](https://github.com/promptfoo/promptfoo/commit/2d296a136061db3088567155b2060694342fc521))

## [0.120.14](https://github.com/promptfoo/promptfoo/compare/0.120.13...0.120.14) (2026-01-14)

### Features

- **redteam:** add numTests config option for strategy test capping ([#7030](https://github.com/promptfoo/promptfoo/issues/7030)) ([0ca5ded](https://github.com/promptfoo/promptfoo/commit/0ca5deda234c22482d43fd0a07f7855a444696ff))

### Bug Fixes

- **deps:** update @actions/github to v7 and fix workspace config ([#7037](https://github.com/promptfoo/promptfoo/issues/7037)) ([c6b2496](https://github.com/promptfoo/promptfoo/commit/c6b24967dd86e6fad1bb10c37f8d36e79fb0ca4f))
- **helm:** correct Docker registry domain from fghcr.io to ghcr.io ([#7056](https://github.com/promptfoo/promptfoo/issues/7056)) ([efe9460](https://github.com/promptfoo/promptfoo/commit/efe94607d349c5079d93401a489c59fbba1ca40c))

## [0.120.13](https://github.com/promptfoo/promptfoo/compare/0.120.12...0.120.13) (2026-01-13)

### Features

- **ui:** Add Ink-based interactive list UI foundation ([#7013](https://github.com/promptfoo/promptfoo/issues/7013)) ([84a2ac7](https://github.com/promptfoo/promptfoo/commit/84a2ac7b2f8697d4cdafd0f868778348e6211c0e))

### Bug Fixes

- **ui:** preserve exact getRowId values in DataTable row selection ([#7032](https://github.com/promptfoo/promptfoo/issues/7032)) ([e78f083](https://github.com/promptfoo/promptfoo/commit/e78f083ff06a366e14fbc0530151c788738c2fec))

## [0.120.12](https://github.com/promptfoo/promptfoo/compare/0.120.11...0.120.12) (2026-01-12)

### Features

- **app:** show provider config details on hover in eval results ([#6757](https://github.com/promptfoo/promptfoo/issues/6757)) ([c790f80](https://github.com/promptfoo/promptfoo/commit/c790f809a0baab2c186ea5be4a787229baad6d2d))
- **assertions:** add word-count assertion type ([#7028](https://github.com/promptfoo/promptfoo/issues/7028)) ([d21f7a0](https://github.com/promptfoo/promptfoo/commit/d21f7a09c3d1932ac3780a1e90bc51907dc586a1))
- **cli:** add logs command for viewing promptfoo log files ([#6621](https://github.com/promptfoo/promptfoo/issues/6621)) ([7ae03b4](https://github.com/promptfoo/promptfoo/commit/7ae03b493cf601721e44a93152687e2ab49210a2))
- **config:** support environment variables in file paths ([#6862](https://github.com/promptfoo/promptfoo/issues/6862)) ([bf2d801](https://github.com/promptfoo/promptfoo/commit/bf2d801b73bdf6ff31ad6824b76eb419a0ddae92))
- **mcp:** add server-side filtering to get_evaluation_details ([#7016](https://github.com/promptfoo/promptfoo/issues/7016)) ([36b5293](https://github.com/promptfoo/promptfoo/commit/36b5293111121506e51d2c96cad2e89dd4371d22))
- **providers:** add QuiverAI provider ([#6979](https://github.com/promptfoo/promptfoo/issues/6979)) ([5ec7345](https://github.com/promptfoo/promptfoo/commit/5ec7345639978131b339a8b8abe12a9d6c18ea75))
- **providers:** cloudflare ai gateway support ([#6966](https://github.com/promptfoo/promptfoo/issues/6966)) ([d53e276](https://github.com/promptfoo/promptfoo/commit/d53e276ef220afbbfd59a03a3b447f48386eed33))
- **providers:** integrate tracing in openai codex provider ([#6751](https://github.com/promptfoo/promptfoo/issues/6751)) ([7150824](https://github.com/promptfoo/promptfoo/commit/7150824cea700b1fb8adc5664f49e074e2d4fe4c))

### Bug Fixes

- allow custom function names in extension hooks to run for all hooks ([#6993](https://github.com/promptfoo/promptfoo/issues/6993)) ([695e4b3](https://github.com/promptfoo/promptfoo/commit/695e4b38549df918d376713d0905ef2fd39fe3af))
- **app:** prevent pagination bar from floating on short eval tables ([#7010](https://github.com/promptfoo/promptfoo/issues/7010)) ([a54d1a5](https://github.com/promptfoo/promptfoo/commit/a54d1a53a35324de1ecdcd1fedb79da7fe76403c))
- **app:** prevent sticky header jitter when scroll room is minimal ([#7026](https://github.com/promptfoo/promptfoo/issues/7026)) ([54347c1](https://github.com/promptfoo/promptfoo/commit/54347c1ce94d2ba7f82eb50f5ad3ad23b80299df))
- **mcp:** fix stdio server lifecycle and shutdown ([#7001](https://github.com/promptfoo/promptfoo/issues/7001)) ([c08c735](https://github.com/promptfoo/promptfoo/commit/c08c735a2754d85e6c029d14bcddb778e80b1b31))
- **mcp:** fix stdio server lifecycle and shutdown ([#7003](https://github.com/promptfoo/promptfoo/issues/7003)) ([1c35bbf](https://github.com/promptfoo/promptfoo/commit/1c35bbfb7500fb82a1609d9783d1300987362195))
- **providers:** consolidate response_format loading and fix Azure nested schema bug ([#6880](https://github.com/promptfoo/promptfoo/issues/6880)) ([2d35ff2](https://github.com/promptfoo/promptfoo/commit/2d35ff23a5af2fa32788a052d44bebe6589b3b17))
- **redteam:** batch update plugins in handleToggleAll to prevent infinite loop ([#6969](https://github.com/promptfoo/promptfoo/issues/6969)) ([2e6cbe0](https://github.com/promptfoo/promptfoo/commit/2e6cbe0fdff5bc6fab382edfe91d1cb9ca46a5e8))
- **test-cases:** fix xlsx/xls array format loading and sheet specifier syntax ([#6998](https://github.com/promptfoo/promptfoo/issues/6998)) ([d8e266c](https://github.com/promptfoo/promptfoo/commit/d8e266c205985a2185a1b614774d686cae710c0a))

## [0.120.11](https://github.com/promptfoo/promptfoo/compare/0.120.10...0.120.11) (2026-01-10)

### Features

- **app:** add Combobox component ([#6946](https://github.com/promptfoo/promptfoo/issues/6946)) ([a1fb9ed](https://github.com/promptfoo/promptfoo/commit/a1fb9ed64d49d4fc4cf58c96dfa89454eddc59d0))
- **codeScan:** add fork PR authentication support ([#6958](https://github.com/promptfoo/promptfoo/issues/6958)) ([9c0fee4](https://github.com/promptfoo/promptfoo/commit/9c0fee4904af3135492545802f6d3bb872a31651))
- **fetch:** add automatic retries for transient 5xx errors ([#6721](https://github.com/promptfoo/promptfoo/issues/6721)) ([eb0a608](https://github.com/promptfoo/promptfoo/commit/eb0a608fb0842ed9430d424ee99a9eecb9209cad))
- **model-audit:** add auto-sharing with --share and --no-share flags ([#6928](https://github.com/promptfoo/promptfoo/issues/6928)) ([d66fdbc](https://github.com/promptfoo/promptfoo/commit/d66fdbc5140b209356e7fb4a241b68e92645018b))
- **providers:** add OpenCode SDK v1.1.x feature support ([#6984](https://github.com/promptfoo/promptfoo/issues/6984)) ([42ba31b](https://github.com/promptfoo/promptfoo/commit/42ba31b14236d14d5a2bbe5585cda44108fcca5d))

### Bug Fixes

- **app:** improve prompt/response readability in risk category drawer ([#6871](https://github.com/promptfoo/promptfoo/issues/6871)) ([7b82477](https://github.com/promptfoo/promptfoo/commit/7b8247720f37fddcab7607faf71768dcf364ddde))
- **app:** show charts for meaningful uniform scores ([#6961](https://github.com/promptfoo/promptfoo/issues/6961)) ([ad75924](https://github.com/promptfoo/promptfoo/commit/ad75924f4bc61048cf0f03806241a52066ff365d))
- **app:** UI improvements and bug fixes for eval creator and data table ([#6968](https://github.com/promptfoo/promptfoo/issues/6968)) ([d31c632](https://github.com/promptfoo/promptfoo/commit/d31c6329018778c7c7b776bc05a917dd745411b6))
- **blobs:** store audio blobs locally and pass evalId for access control ([#6923](https://github.com/promptfoo/promptfoo/issues/6923)) ([112a08a](https://github.com/promptfoo/promptfoo/commit/112a08a8985277f7c24881aabd2977abe95e6d03))
- **ci:** add missing permissions for docker attestation workflow call ([#6985](https://github.com/promptfoo/promptfoo/issues/6985)) ([08d4779](https://github.com/promptfoo/promptfoo/commit/08d4779e33d27208442ec3125f13dfcaa93d0dd0))
- **ci:** prevent database migration race condition in Docker tests ([#6965](https://github.com/promptfoo/promptfoo/issues/6965)) ([bec6473](https://github.com/promptfoo/promptfoo/commit/bec647392bb2c05d70c3ba46416e97c63f7eeb17))
- **code-scan-action:** pass base branch to CLI for stacked PRs ([#6892](https://github.com/promptfoo/promptfoo/issues/6892)) ([642a409](https://github.com/promptfoo/promptfoo/commit/642a4095dc65e6e875625d5b8ce664a00f7f5835))
- **deps:** update dependency @modelcontextprotocol/sdk to ^1.25.2 ([#6976](https://github.com/promptfoo/promptfoo/issues/6976)) ([067d82b](https://github.com/promptfoo/promptfoo/commit/067d82bab50331c48b69ebb64468c323643bde93))
- **filter-providers:** Handle edge cases with null/empty provider IDs ([#6948](https://github.com/promptfoo/promptfoo/issues/6948)) ([1385760](https://github.com/promptfoo/promptfoo/commit/1385760957347bf85086d62447481fe090012799))
- Plugin Form State Management Errors ([#6967](https://github.com/promptfoo/promptfoo/issues/6967)) ([d33cc8a](https://github.com/promptfoo/promptfoo/commit/d33cc8ac323eba01609ee37951d635a725c0e38e))
- **providers:** await finalizeResponse to prevent race condition ([#6960](https://github.com/promptfoo/promptfoo/issues/6960)) ([faeed3f](https://github.com/promptfoo/promptfoo/commit/faeed3ffc9bc1d6e68e767d376fd4692162de676))
- **providers:** prevent race condition in Google Live finalizeResponse ([#6975](https://github.com/promptfoo/promptfoo/issues/6975)) ([fa26643](https://github.com/promptfoo/promptfoo/commit/fa266436f899c0114ba4e956f955749d8cc1dae4))
- **providers:** set cached flag on cache hits across 10 providers ([#6944](https://github.com/promptfoo/promptfoo/issues/6944)) ([202f192](https://github.com/promptfoo/promptfoo/commit/202f192f7bbaf935e939ca0e41ae71c2c95c79d4))
- show helpful error for unsupported Node.js versions ([#6995](https://github.com/promptfoo/promptfoo/issues/6995)) ([99a8a7f](https://github.com/promptfoo/promptfoo/commit/99a8a7ff8bef7d7457978b57d801b5681c7d3505))
- **test:** remove MUI imports from test files ([#6949](https://github.com/promptfoo/promptfoo/issues/6949)) ([806eff9](https://github.com/promptfoo/promptfoo/commit/806eff991a541a198b1a96688e03f44232ab5abd))

## [0.120.10](https://github.com/promptfoo/promptfoo/compare/0.120.9...0.120.10) (2026-01-06)

### Features

- **evaluator:** enrich error results with provider context and metadata ([#6913](https://github.com/promptfoo/promptfoo/issues/6913)) ([a004182](https://github.com/promptfoo/promptfoo/commit/a0041825b8149e94d25828a43b77787896ba8dc6))
- **providers:** add Azure AI Foundry video provider (Sora) ([#6890](https://github.com/promptfoo/promptfoo/issues/6890)) ([1479e74](https://github.com/promptfoo/promptfoo/commit/1479e7481a61476145e307d0b1a10994f6fc1e9d))
- **providers:** add Google Veo video generation provider ([#6707](https://github.com/promptfoo/promptfoo/issues/6707)) ([ec7de98](https://github.com/promptfoo/promptfoo/commit/ec7de9855b737a8051290525498a7a303ab735e0))
- **providers:** add OpenAI Sora video generation provider ([#6698](https://github.com/promptfoo/promptfoo/issues/6698)) ([a4589bb](https://github.com/promptfoo/promptfoo/commit/a4589bbf6cdea9333b87c5ac6e33a2b6b63a3992))
- **redteam:** Redteam with multiple inputs ([#6709](https://github.com/promptfoo/promptfoo/issues/6709)) ([3d8057f](https://github.com/promptfoo/promptfoo/commit/3d8057f009a10e1782b972345806bc0e53e70fa3))
- **webui:** remove MUI dependencies, complete migration to Radix/Tailwind ([#6868](https://github.com/promptfoo/promptfoo/issues/6868)) ([62ba798](https://github.com/promptfoo/promptfoo/commit/62ba79823d5262b0a06404ada1021fd21a8a6281))
- **webui:** show additional cell actions on hover + tooltip fix ([#6936](https://github.com/promptfoo/promptfoo/issues/6936)) ([81101f1](https://github.com/promptfoo/promptfoo/commit/81101f1d9b881d9393c6f51cdc5b39cb0d03e582))

### Bug Fixes

- **app:** add biome-ignore for useExhaustiveDependencies and fix one unused dependency ([#6907](https://github.com/promptfoo/promptfoo/issues/6907)) ([21d3e7b](https://github.com/promptfoo/promptfoo/commit/21d3e7b06e7d89757c533d547402cc14e9d34025))
- **app:** add cursor-pointer to interactive UI components ([#6945](https://github.com/promptfoo/promptfoo/issues/6945)) ([4e3de51](https://github.com/promptfoo/promptfoo/commit/4e3de51c4d6550ed394e6a1c41e164571606e761))
- **app:** fix ErrorBoundary dark mode styling ([#6893](https://github.com/promptfoo/promptfoo/issues/6893)) ([9c5d595](https://github.com/promptfoo/promptfoo/commit/9c5d595757f3dce72711b148ae17146e74d50d22))
- **app:** fix Tailwind CSS variable syntax and React infinite render loop ([#6908](https://github.com/promptfoo/promptfoo/issues/6908)) ([d60e222](https://github.com/promptfoo/promptfoo/commit/d60e2228e7c64e144459b9d97a024eb16ea46674))
- **app:** pointer cursor on eval setup steps ([#6897](https://github.com/promptfoo/promptfoo/issues/6897)) ([879e62c](https://github.com/promptfoo/promptfoo/commit/879e62ccba1c5022f63d07d58aa88479ba78d625))
- **app:** prevent duplicate fail reasons in eval results carousel ([#6916](https://github.com/promptfoo/promptfoo/issues/6916)) ([9ac7176](https://github.com/promptfoo/promptfoo/commit/9ac7176dd830d09bae5fafe7067adc460b930645))
- **app:** update banner z-index to render below navigation dropdowns ([#6887](https://github.com/promptfoo/promptfoo/issues/6887)) ([750afd7](https://github.com/promptfoo/promptfoo/commit/750afd7f70732d1eede5b8ad68a553209ca7830f))
- **ci:** add code-scan-action to CODEOWNERS ([#6894](https://github.com/promptfoo/promptfoo/issues/6894)) ([ee4aa3c](https://github.com/promptfoo/promptfoo/commit/ee4aa3cf9d6d3bbcf497b43472b1aa66b8d65439))
- **ci:** increase claude-review max-turns from 10 to 30 ([#6922](https://github.com/promptfoo/promptfoo/issues/6922)) ([c9b94d4](https://github.com/promptfoo/promptfoo/commit/c9b94d4f2553b34de420ebb900c6797793723a23))
- **cloud:** check PROMPTFOO_API_KEY env var in cloudConfig ([#6896](https://github.com/promptfoo/promptfoo/issues/6896)) ([6fea2fc](https://github.com/promptfoo/promptfoo/commit/6fea2fcca5c6c67bf1e9bb012d9347d67ab41191))
- **esm:** suppress spurious error logs during config file discovery ([#6891](https://github.com/promptfoo/promptfoo/issues/6891)) ([10214cc](https://github.com/promptfoo/promptfoo/commit/10214cc24a1c264b40aeab4eaed8ed61db5127ca))
- **evaluator:** respect provider-supplied latencyMs for cached responses ([#6911](https://github.com/promptfoo/promptfoo/issues/6911)) ([6cd5d39](https://github.com/promptfoo/promptfoo/commit/6cd5d3936774501629febac9fa9f8dc97f32b228))
- keep column widths synced when Render Markdown is turned on ([#6937](https://github.com/promptfoo/promptfoo/issues/6937)) ([8d60499](https://github.com/promptfoo/promptfoo/commit/8d604996c92218347e1e826d7fd9a558cb2063ed))
- **providers:** sanitize JSON Schema for Gemini MCP tool compatibility ([#6904](https://github.com/promptfoo/promptfoo/issues/6904)) ([fcda531](https://github.com/promptfoo/promptfoo/commit/fcda5318d6d5cd4aef1351d5e18df7458475b854))
- **providers:** skip delay on cache hit in Bedrock Converse provider ([#6930](https://github.com/promptfoo/promptfoo/issues/6930)) ([5a7f3cf](https://github.com/promptfoo/promptfoo/commit/5a7f3cf728e261fa6c326ae02e9b94d0253aab23))
- **redteam:** filter runtime vars and merge defaultTest.vars for accurate test matching ([#6810](https://github.com/promptfoo/promptfoo/issues/6810)) ([3ced621](https://github.com/promptfoo/promptfoo/commit/3ced621c88c84cc87905fa243d92c7bb106bd895))
- **redteam:** prevent nunjucks error on template syntax in attack prompts ([#6888](https://github.com/promptfoo/promptfoo/issues/6888)) ([ec6698d](https://github.com/promptfoo/promptfoo/commit/ec6698d027e32f8040bfc4f8ccfb5547df6f43a6))
- **server:** resolve update banner state bugs in version endpoint ([#6895](https://github.com/promptfoo/promptfoo/issues/6895)) ([18277f2](https://github.com/promptfoo/promptfoo/commit/18277f2b2f5b67ef8248fc590073d5fe6553bfa3))
- **test:** resolve flaky google live provider test ([#6886](https://github.com/promptfoo/promptfoo/issues/6886)) ([ac8f78f](https://github.com/promptfoo/promptfoo/commit/ac8f78ffc1e9039e2f84454a07a0f8c470ce12c0))
- **webui:** improve eval dialog tab styling ([#6920](https://github.com/promptfoo/promptfoo/issues/6920)) ([d38b01c](https://github.com/promptfoo/promptfoo/commit/d38b01c9d3989ddef3d7c05226153d061d875cb5))
- **webui:** Reports table navigation to report ([#6917](https://github.com/promptfoo/promptfoo/issues/6917)) ([2ae27ba](https://github.com/promptfoo/promptfoo/commit/2ae27ba488a100bc52cd4d354dbfea8e87b23968))

## [0.120.9](https://github.com/promptfoo/promptfoo/compare/0.120.8...0.120.9) (2025-12-30)

### Features

- **app:** add apiBaseUrl field to provider configuration UI ([#6884](https://github.com/promptfoo/promptfoo/issues/6884)) ([24440e4](https://github.com/promptfoo/promptfoo/commit/24440e46b3a2c07fc5efb32206808c49a5b643f5)) — @mldangelo
- **app:** add design system, navigation, model audit, and eval creator ([#6823](https://github.com/promptfoo/promptfoo/issues/6823)) ([c5c698b](https://github.com/promptfoo/promptfoo/commit/c5c698bc97b3927b023eff623b9b73d6fa9d5940)) — @faizanminhas
- **cli:** add wildcard support for prompt filters ([#6853](https://github.com/promptfoo/promptfoo/issues/6853)) ([cd5deba](https://github.com/promptfoo/promptfoo/commit/cd5deba396f08905704d69da05cea6919a696f41)) — @typpo
- **extensions:** add afterAll hook enhancement and --extension CLI flag ([#4760](https://github.com/promptfoo/promptfoo/issues/4760)) ([18eb910](https://github.com/promptfoo/promptfoo/commit/18eb9109249b799cce33f3e595f382003c787912)) — @mldangelo
- **lib:** add shareable URL support to Node.js evaluate() API ([#6839](https://github.com/promptfoo/promptfoo/issues/6839)) ([ecc7fa6](https://github.com/promptfoo/promptfoo/commit/ecc7fa6babbbaf1e9b2a99ba4852e6980e19a980)) — @mldangelo
- **logger:** add structured logging support for cloud integrations ([#6845](https://github.com/promptfoo/promptfoo/issues/6845)) ([4b7bd33](https://github.com/promptfoo/promptfoo/commit/4b7bd335bd0ce1d37ed039a9ce2644566820dc31)) — @mldangelo
- **mcp:** add OAuth authentication with proactive token refresh ([#6817](https://github.com/promptfoo/promptfoo/issues/6817)) ([bcd4db3](https://github.com/promptfoo/promptfoo/commit/bcd4db3fec98c0c2f40337eb0f7f317298d3a1e2)) — @jameshiester
- **providers:** add xAI Voice Agent API provider ([#6792](https://github.com/promptfoo/promptfoo/issues/6792)) ([1f366a5](https://github.com/promptfoo/promptfoo/commit/1f366a588a9a275f3c4195fb565a71669fabd2a2)) — @mldangelo
- **redteam:** add OWASP Top 10 for Agentic Applications ([#6694](https://github.com/promptfoo/promptfoo/issues/6694)) ([5fd44ca](https://github.com/promptfoo/promptfoo/commit/5fd44cacb368fafb3d1893ab93f30187c3faac82)) — @stefanoamorelli
- **redteam:** add retry strategy for failed test cases ([#6243](https://github.com/promptfoo/promptfoo/issues/6243)) ([e7228c8](https://github.com/promptfoo/promptfoo/commit/e7228c8345bdcea352728d064da864ad0cbb4762)) — @yash2998chhabria
- **redteam:** hydrate applicationDefinition when importing YAML configs ([#6542](https://github.com/promptfoo/promptfoo/issues/6542)) ([70b6d07](https://github.com/promptfoo/promptfoo/commit/70b6d071019bd74aefc17b976c40ba3b8964eef0)) — @mldangelo
- **redteam:** improve validate target output ([#6742](https://github.com/promptfoo/promptfoo/issues/6742)) ([664c5b9](https://github.com/promptfoo/promptfoo/commit/664c5b929618b161868e73a4317b5c679ae85719)) — @faizanminhas
- **redteam:** migrate reports and EvalOutputPromptDialog to design system ([#6831](https://github.com/promptfoo/promptfoo/issues/6831)) ([424ddfb](https://github.com/promptfoo/promptfoo/commit/424ddfbff2836968777bc02fb8e5a047dade5706)) — @faizanminhas
- **redteam:** migrate setup flow to design system ([#6838](https://github.com/promptfoo/promptfoo/issues/6838)) ([d296073](https://github.com/promptfoo/promptfoo/commit/d29607321f4e07b5de21c096cd9e2ef2fe59e9d4)) — @faizanminhas
- **redteam:** redesign risk categories ([#6876](https://github.com/promptfoo/promptfoo/issues/6876)) ([e29bc55](https://github.com/promptfoo/promptfoo/commit/e29bc55557010cb7e6790481f48226b81cb33fe1)) — @typpo

### Bug Fixes

- **app:** add compact markdown styling for eval table cells ([#6840](https://github.com/promptfoo/promptfoo/issues/6840)) ([ae9c4d0](https://github.com/promptfoo/promptfoo/commit/ae9c4d076c52402225a6ef0a1d4af69d5d27e3f5)) — @mldangelo
- **app:** fix accessibility issues and console warnings in new components ([#6859](https://github.com/promptfoo/promptfoo/issues/6859)) ([b3274d1](https://github.com/promptfoo/promptfoo/commit/b3274d11ca7863ef414b83679b2e94b4cb5958a6)) — @faizanminhas
- **app:** fix browser back button on evals results table ([#6832](https://github.com/promptfoo/promptfoo/issues/6832)) ([c4886bc](https://github.com/promptfoo/promptfoo/commit/c4886bcf63f1bdfb582e5474d2a52c0fef1f9887)) — @faizanminhas
- **app:** fix React 19 table header stale memoization on eval switch ([#6877](https://github.com/promptfoo/promptfoo/issues/6877)) ([6e8759d](https://github.com/promptfoo/promptfoo/commit/6e8759d111c8acaabedc5aca17d4685e5a4c0853)) — @faizanminhas
- **app:** improve DataTable pagination and performance ([#6858](https://github.com/promptfoo/promptfoo/issues/6858)) ([59301e3](https://github.com/promptfoo/promptfoo/commit/59301e35484acabfe3fa1c16c22e1da0aedaff75)) — @faizanminhas
- **app:** improve test cases table formatting in eval creator ([#6860](https://github.com/promptfoo/promptfoo/issues/6860)) ([25637e3](https://github.com/promptfoo/promptfoo/commit/25637e3d2056f7883a4e179f88061e4a37927e2e)) — @mldangelo
- **app:** preserve existing filters when changing column in DataTable ([#6837](https://github.com/promptfoo/promptfoo/issues/6837)) ([f7630e4](https://github.com/promptfoo/promptfoo/commit/f7630e42e023f336d91a8e7951e05cc85272659a)) — @faizanminhas
- **app:** prevent header value field collapse with long values ([#6830](https://github.com/promptfoo/promptfoo/issues/6830)) ([889f750](https://github.com/promptfoo/promptfoo/commit/889f750c733ccf2c51330493e679e3cc100ca3af)) — @mldangelo
- **app:** prevent icon overflow in results table cells ([#6807](https://github.com/promptfoo/promptfoo/issues/6807)) ([3af0a5e](https://github.com/promptfoo/promptfoo/commit/3af0a5e91211f5f9c2b708d7d39150b79abdf68d)) — @addelong
- **app:** prevent markdown re-render flickering in eval result cells ([#6847](https://github.com/promptfoo/promptfoo/issues/6847)) ([4439d70](https://github.com/promptfoo/promptfoo/commit/4439d70d7441b37c10df8574495727ee00e04fd3)) — @mldangelo
- **app:** remove underline from navbar dropdown items ([#6875](https://github.com/promptfoo/promptfoo/issues/6875)) ([891a96a](https://github.com/promptfoo/promptfoo/commit/891a96accf84e6cfd2283cc8e0ad0e0ae0b3bbac)) — @typpo
- **app:** resolve browser fs.readFileSync error by using direct imports ([#6861](https://github.com/promptfoo/promptfoo/issues/6861)) ([e47cb2a](https://github.com/promptfoo/promptfoo/commit/e47cb2aa505424107906abe7555cece1fb909c60)) — @mldangelo
- **app:** show toolbar when filters return no results ([#6827](https://github.com/promptfoo/promptfoo/issues/6827)) ([b53f832](https://github.com/promptfoo/promptfoo/commit/b53f8322de6787366bb898fd6e3bcab8779d7cc2)) — @faizanminhas
- **assertions:** render template variables in assertion metric field ([#6678](https://github.com/promptfoo/promptfoo/issues/6678)) ([3277310](https://github.com/promptfoo/promptfoo/commit/32773108be8aa2084418f8e5fcf7c9d79d67f981)) — @mldangelo
- **cli:** downgrade missing blob reference log level ([#6814](https://github.com/promptfoo/promptfoo/issues/6814)) ([c3b6326](https://github.com/promptfoo/promptfoo/commit/c3b63263faaf7fe349262626828932997b3db5a5)) — @addelong
- **cli:** respect prompts filter when providers loaded from file:// ([#6657](https://github.com/promptfoo/promptfoo/issues/6657)) ([d189e5c](https://github.com/promptfoo/promptfoo/commit/d189e5ca215bf4ef5f0dd64b847d35ef2f708907)) — @mldangelo
- **eval:** honor external abortSignal when timeoutMs is set ([#6850](https://github.com/promptfoo/promptfoo/issues/6850)) ([dd26762](https://github.com/promptfoo/promptfoo/commit/dd26762f774243d31d3837434d4fa08af3dff91d)) — @typpo
- **evaluator:** apply comparison results to pass/fail ([#6774](https://github.com/promptfoo/promptfoo/issues/6774)) ([f6add72](https://github.com/promptfoo/promptfoo/commit/f6add7200ce845be2bc90be4374fbc19f744616d)) — @typpo
- **http:** handle multipart/form-data and x-www-form-urlencoded in raw requests ([#6797](https://github.com/promptfoo/promptfoo/issues/6797)) ([8850ab2](https://github.com/promptfoo/promptfoo/commit/8850ab24dc4e1daf86168225b432ee17aae2799c)) — @MrFlounder
- **providers:** correctly extract provider IDs from file references ([#6848](https://github.com/promptfoo/promptfoo/issues/6848)) ([b088306](https://github.com/promptfoo/promptfoo/commit/b088306c2e5c986fb2d574f6fae44de98b64b427)) — @typpo
- **providers:** pass env overrides to template rendering ([#6785](https://github.com/promptfoo/promptfoo/issues/6785)) ([9b304bc](https://github.com/promptfoo/promptfoo/commit/9b304bc60c9d55cc2f251cd2e7d29dd0b33cb68f)) — @typpo
- **providers:** respect PROMPTFOO_PYTHON env var in Python providers ([#6829](https://github.com/promptfoo/promptfoo/issues/6829)) ([05e30da](https://github.com/promptfoo/promptfoo/commit/05e30dab7306a42a357715018f839c6ea52633f2)) — @mldangelo
- **redteam:** persist custom provider selection when changing tabs ([#6834](https://github.com/promptfoo/promptfoo/issues/6834)) ([d1efd11](https://github.com/promptfoo/promptfoo/commit/d1efd11da1cbe2615517d1f563d1e540b2e4cf16)) — @mldangelo
- **redteam:** reduce false positives in grader rubrics ([#6784](https://github.com/promptfoo/promptfoo/issues/6784)) ([54a552a](https://github.com/promptfoo/promptfoo/commit/54a552a68a98e203a0f492cef33969a32a33219a)) — @yash2998chhabria
- **util:** convert sync fs operations to async across util modules ([#6869](https://github.com/promptfoo/promptfoo/issues/6869)) ([55c9edb](https://github.com/promptfoo/promptfoo/commit/55c9edbbc1545a36feca9f60f49cf2680dd7f954)) — @mldangelo
- **yaml:** prevent URLs from being treated as comments ([#6854](https://github.com/promptfoo/promptfoo/issues/6854)) ([f85bf58](https://github.com/promptfoo/promptfoo/commit/f85bf58f8a7ef0b272cef5b8ed3218962a3d34bb)) — @typpo

### Performance Improvements

- **app:** eliminate crypto polyfill with native SubtleCrypto ([#6798](https://github.com/promptfoo/promptfoo/issues/6798)) ([c3e24ad](https://github.com/promptfoo/promptfoo/commit/c3e24ad8857f296713f935b826eb45cb8cb32ba8)) — @JustinBeckwith

### Tests

- convert flaky performance benchmark to smoke test ([#6856](https://github.com/promptfoo/promptfoo/issues/6856)) ([87b63db](https://github.com/promptfoo/promptfoo/commit/87b63db31fbf50f1f580c6ae2bc70e5cbd15ec2e)) — @mldangelo
- make Google Live provider test order-agnostic ([#6852](https://github.com/promptfoo/promptfoo/issues/6852)) ([7a8d1ff](https://github.com/promptfoo/promptfoo/commit/7a8d1ff36e210e722ad5792cedeab65d78d00f4c)) — @mldangelo

## [0.120.8](https://github.com/promptfoo/promptfoo/compare/0.120.7...0.120.8) (2025-12-21)

### Features

- **redteam:** add --description flag to redteam run command ([#6796](https://github.com/promptfoo/promptfoo/issues/6796)) ([95cc2ff](https://github.com/promptfoo/promptfoo/commit/95cc2ffe1075b00620647369beb9bb331af95858))
- **server:** add configurable base path support ([#6758](https://github.com/promptfoo/promptfoo/issues/6758)) ([9395a28](https://github.com/promptfoo/promptfoo/commit/9395a28766275ec6105bd86ee7ecee8979a1c4f4))

### Bug Fixes

- Entra id support in azure:responses provider ([#6794](https://github.com/promptfoo/promptfoo/issues/6794)) ([47e1db5](https://github.com/promptfoo/promptfoo/commit/47e1db552aabc3c61d38d7022de819d0f0eb5073))
- **redteam:** Add error handling to citation strategy ([#6735](https://github.com/promptfoo/promptfoo/issues/6735)) ([55ac248](https://github.com/promptfoo/promptfoo/commit/55ac248e51b37588230c959d11f9bbb2dd8b12b6))

## [0.120.7](https://github.com/promptfoo/promptfoo/compare/0.120.6...0.120.7) (2025-12-19)

### Features

- blob storage ([#6708](https://github.com/promptfoo/promptfoo/issues/6708)) ([73fcd51](https://github.com/promptfoo/promptfoo/commit/73fcd5183bfaa37b76326f21eaeaaaddee264bb9))

## [0.120.6](https://github.com/promptfoo/promptfoo/compare/0.120.5...0.120.6) (2025-12-19)

### Features

- **auth:** add interactive team selection during login ([#6760](https://github.com/promptfoo/promptfoo/issues/6760)) ([11c7037](https://github.com/promptfoo/promptfoo/commit/11c7037d229d0cfb335fc2e3419de6c210fec7bc))
- **bedrock:** configurable numberOfResults for Bedrock Knowledge Base ([#6738](https://github.com/promptfoo/promptfoo/issues/6738)) ([f8f0b8b](https://github.com/promptfoo/promptfoo/commit/f8f0b8bf647fc28c9256e01aa28c46f1b1a1cdeb))
- **grading:** store and display full grading prompt in UI ([#6736](https://github.com/promptfoo/promptfoo/issues/6736)) ([b38642a](https://github.com/promptfoo/promptfoo/commit/b38642a288f05721425f53c530d9a57a07d3a24a))
- **providers:** add Gemini 3 Flash Preview support with Vertex AI express mode ([#6739](https://github.com/promptfoo/promptfoo/issues/6739)) ([ad0dff5](https://github.com/promptfoo/promptfoo/commit/ad0dff5767cac47e780e759b3903bba04828192c))
- **providers:** adds support for OpenAI GPT Image 1.5 ([#6713](https://github.com/promptfoo/promptfoo/issues/6713)) ([4d96061](https://github.com/promptfoo/promptfoo/commit/4d960619ebe6d6615422506a7c2614e3deddde56))
- **redteam:** add contexts for testing different app states ([#6716](https://github.com/promptfoo/promptfoo/issues/6716)) ([55c0e3e](https://github.com/promptfoo/promptfoo/commit/55c0e3edaa4ec4e80530ac7253be56afa1f1b594))
- **redteam:** add tracing support to Hydra and IterativeMeta providers ([#6718](https://github.com/promptfoo/promptfoo/issues/6718)) ([54a66af](https://github.com/promptfoo/promptfoo/commit/54a66afd2f4669662e47b4bcb5d5a0ef1afd6241))
- **site:** add proof banner linking to code scanning blog post ([#6753](https://github.com/promptfoo/promptfoo/issues/6753)) ([3b104ae](https://github.com/promptfoo/promptfoo/commit/3b104ae3bda7924c8732d8ed4a21a8c400d1449e))
- **tracing:** add OpenTelemetry tracing integration with GenAI semantic conventions ([#6536](https://github.com/promptfoo/promptfoo/issues/6536)) ([784599f](https://github.com/promptfoo/promptfoo/commit/784599f17e52351046d8612503339103abd82c67))
- **webui:** display evaluation duration in web UI ([#6691](https://github.com/promptfoo/promptfoo/issues/6691)) ([762c16e](https://github.com/promptfoo/promptfoo/commit/762c16e12065c403136ad3fec49b4927176b896a))

### Bug Fixes

- **bedrock:** improve Knowledge Base provider backwards compatibility ([#6744](https://github.com/promptfoo/promptfoo/issues/6744)) ([7531d45](https://github.com/promptfoo/promptfoo/commit/7531d45115b008edd7ff416a19ec42f5d59814de))
- **ci:** use valid Vitest 4 reporter in Tusk workflow ([#6766](https://github.com/promptfoo/promptfoo/issues/6766)) ([53da876](https://github.com/promptfoo/promptfoo/commit/53da876fe5a693f353d350fb3294baa42b2e0782))
- **cli:** preserve evalId, createdAt, and author on import ([#6690](https://github.com/promptfoo/promptfoo/issues/6690)) ([f5445c1](https://github.com/promptfoo/promptfoo/commit/f5445c11d6c42ca2565a50343b1b0205dde19a88))
- **code-scan:** add null check to fix action build ([#6750](https://github.com/promptfoo/promptfoo/issues/6750)) ([1b8a1e3](https://github.com/promptfoo/promptfoo/commit/1b8a1e3da7bb63b582ee7d7b9d276180bace6f70))
- **code-scan:** ensure valid line numbers for github comments ([#6722](https://github.com/promptfoo/promptfoo/issues/6722)) ([40138ce](https://github.com/promptfoo/promptfoo/commit/40138cea62cd00515ea4b9c54ac93f50909a0f49))
- **providers:** add vars support to dynamic tool loading for Anthropic and Bedrock ([#6679](https://github.com/promptfoo/promptfoo/issues/6679)) ([accbfef](https://github.com/promptfoo/promptfoo/commit/accbfef2af4bd8927b85a9df373710188f1eab52))
- **python:** increase test timeout for worker integration tests ([#6754](https://github.com/promptfoo/promptfoo/issues/6754)) ([03f4cc9](https://github.com/promptfoo/promptfoo/commit/03f4cc95124e9ec2f50be582a0513b59470b748f))
- **redteam:** add missing prompt variable to policy grader rubric ([#6734](https://github.com/promptfoo/promptfoo/issues/6734)) ([d47008a](https://github.com/promptfoo/promptfoo/commit/d47008adfb1cded3be5c580bf438d7d61b2488ef))

## [0.120.5](https://github.com/promptfoo/promptfoo/compare/0.120.4...0.120.5) (2025-12-16)

### Features

- **cli:** support multiple --env-file flags ([#6622](https://github.com/promptfoo/promptfoo/issues/6622)) ([015f2df](https://github.com/promptfoo/promptfoo/commit/015f2dfb76be0710a2c98d87fe957060e18de162))
- **esm:** add resolvePackageEntryPoint for ESM-only packages ([#6586](https://github.com/promptfoo/promptfoo/issues/6586)) ([fbc0eca](https://github.com/promptfoo/promptfoo/commit/fbc0eca0e27ed03239bc87a9716fd8a1206307f9))
- **providers:** add gpt-image-1-mini support to OpenAI image provider ([#6603](https://github.com/promptfoo/promptfoo/issues/6603)) ([bedc616](https://github.com/promptfoo/promptfoo/commit/bedc616318bc82c25f700a0996e91ab84e3cc17b))
- **providers:** update OpenAI Codex SDK to v0.65.0 with new SDK options ([#6563](https://github.com/promptfoo/promptfoo/issues/6563)) ([fc19872](https://github.com/promptfoo/promptfoo/commit/fc1987250d49c0749205bc0c590327d0f5abc23a))
- **redteam:** ability to change plugin for strategy test case generation ([#6549](https://github.com/promptfoo/promptfoo/issues/6549)) ([ed8b268](https://github.com/promptfoo/promptfoo/commit/ed8b2681c32caacb576fea6298e9d0d9ac2c5b66))
- **redteam:** add OWASP API Security Top 10 example ([#6615](https://github.com/promptfoo/promptfoo/issues/6615)) ([8d383b5](https://github.com/promptfoo/promptfoo/commit/8d383b58306d3dbfd7b28d6dadec3c7cb836bcea))
- **redteam:** add tiered severity grading for SSRF plugin ([#6444](https://github.com/promptfoo/promptfoo/issues/6444)) ([1556df3](https://github.com/promptfoo/promptfoo/commit/1556df3b29dcb96014dac14f8181beaa33718796))
- **types:** add pluginId and strategyId to EvaluateTableOutput ([#6638](https://github.com/promptfoo/promptfoo/issues/6638)) ([9e2121b](https://github.com/promptfoo/promptfoo/commit/9e2121b60228e78fe293c3354399d7685d757d01))
- **webui:** improve model audit navigation and test coverage ([#5595](https://github.com/promptfoo/promptfoo/issues/5595)) ([55cb973](https://github.com/promptfoo/promptfoo/commit/55cb973d948f4b7b31974be3de6a0d8c1dabc423))
- **webui:** redesign Table Settings modal with compact two-column layout ([#6683](https://github.com/promptfoo/promptfoo/issues/6683)) ([4c0f3ef](https://github.com/promptfoo/promptfoo/commit/4c0f3efdd85b6731e9280c07e078a0bdf0d530a6))

### Bug Fixes

- **assertions:** handle variable declarations in single-line JavaScript assertions ([#6609](https://github.com/promptfoo/promptfoo/issues/6609)) ([f00cf71](https://github.com/promptfoo/promptfoo/commit/f00cf71a8878dc83fbca80ea8ca2d7fcc42814e5))
- **assertions:** improve error messages for malformed assertion configs ([#6600](https://github.com/promptfoo/promptfoo/issues/6600)) ([6afb4ca](https://github.com/promptfoo/promptfoo/commit/6afb4ca94f83c7e85e134ea7a31b1338c480e740))
- **ci:** trigger code scan when PR moves from draft to ready ([#6705](https://github.com/promptfoo/promptfoo/issues/6705)) ([790d6b5](https://github.com/promptfoo/promptfoo/commit/790d6b53a6d104ce793dd4d24fe78085b1a0a3ca))
- **cli:** filter providers before instantiation ([#6596](https://github.com/promptfoo/promptfoo/issues/6596)) ([2891658](https://github.com/promptfoo/promptfoo/commit/289165894656516544106a6abc51e09d3a968382))
- **cli:** Increased the number of characters for displaying test variables ([#5041](https://github.com/promptfoo/promptfoo/issues/5041)) ([70c4258](https://github.com/promptfoo/promptfoo/commit/70c4258299f2c3b3c71c6a234b83ccf6f48fe2f0))
- **deps:** update dependency @googleapis/sheets to v13 ([#6682](https://github.com/promptfoo/promptfoo/issues/6682)) ([b53f2d5](https://github.com/promptfoo/promptfoo/commit/b53f2d5e3901f1bf5bab0d824ce9333376a92415))
- **deps:** update dependency openai to ^6.10.0 ([#6641](https://github.com/promptfoo/promptfoo/issues/6641)) ([3637b6c](https://github.com/promptfoo/promptfoo/commit/3637b6c05d4390a3ba82ba323a32c21208a31e01))
- **deps:** update github actions to v2 (major) ([#6681](https://github.com/promptfoo/promptfoo/issues/6681)) ([a0434b5](https://github.com/promptfoo/promptfoo/commit/a0434b579bff8a2a3089649f6192e7fed6fbf870))
- **evaluator:** isolate \_conversation state between scenarios ([#6623](https://github.com/promptfoo/promptfoo/issues/6623)) ([6fb90c8](https://github.com/promptfoo/promptfoo/commit/6fb90c8c08999285d7e941470566dd2c1d6ffdcb))
- **geval:** enforce stricter output formatting in GEVAL prompts ([#6632](https://github.com/promptfoo/promptfoo/issues/6632)) ([9432bf7](https://github.com/promptfoo/promptfoo/commit/9432bf754908c55aa441a8fc01035b1b2a550341))
- improving error logging for GOAT ([#6486](https://github.com/promptfoo/promptfoo/issues/6486)) ([c0da862](https://github.com/promptfoo/promptfoo/commit/c0da86258d1f4d7afbc122385a523d62a114b428))
- **logger:** prevent "write after end" crash during shutdown ([#6625](https://github.com/promptfoo/promptfoo/issues/6625)) ([516aa2a](https://github.com/promptfoo/promptfoo/commit/516aa2ad9ca09b162bc28e839a0c96a1f00775aa))
- **mcp:** prevent HTTP server from shutting down immediately ([#6520](https://github.com/promptfoo/promptfoo/issues/6520)) ([f1f10c3](https://github.com/promptfoo/promptfoo/commit/f1f10c3819fd86478940641505ad0418312ec78a))
- Presentation of strategy demo modal ([#6675](https://github.com/promptfoo/promptfoo/issues/6675)) ([e1f5e68](https://github.com/promptfoo/promptfoo/commit/e1f5e680cc3967ccadaf9b7ed51d3b1bf6a2d8a0))
- **providers:** treat vertex MAX_TOKENS as success instead of error ([#6697](https://github.com/promptfoo/promptfoo/issues/6697)) ([b6cf509](https://github.com/promptfoo/promptfoo/commit/b6cf50961aea94ba0bfbe417e72aff3ab7339d0c))
- **redteam:** comprehensive token usage tracking across all providers ([#6619](https://github.com/promptfoo/promptfoo/issues/6619)) ([babd51c](https://github.com/promptfoo/promptfoo/commit/babd51c1760827d3777196d9e091d39f27b198bc))
- **redteam:** filter runtime vars and merge defaultTest.vars for accurate test matching ([#6706](https://github.com/promptfoo/promptfoo/issues/6706)) ([783961b](https://github.com/promptfoo/promptfoo/commit/783961b399523f29d4d2b986e167ec583643ccab))
- **redteam:** fix infinite loop in updatePlugins by comparing output vs state ([#6647](https://github.com/promptfoo/promptfoo/issues/6647)) ([28140c8](https://github.com/promptfoo/promptfoo/commit/28140c8b108f48c0a8f97b96db8a24f0538063a2))
- **redteam:** handle object output in TestCaseDialog ([#6672](https://github.com/promptfoo/promptfoo/issues/6672)) ([33ec0ea](https://github.com/promptfoo/promptfoo/commit/33ec0ea0574c53e476772745e8c53fd10bc48188))
- **redteam:** prevent infinite loop in Plugins page when selecting presets ([#6626](https://github.com/promptfoo/promptfoo/issues/6626)) ([25f3ea6](https://github.com/promptfoo/promptfoo/commit/25f3ea6b66fa50ca7d589573d9e9d846b29aa982))
- restore TypeScript type checking in CI ([#6652](https://github.com/promptfoo/promptfoo/issues/6652)) ([d0af689](https://github.com/promptfoo/promptfoo/commit/d0af689f5ac955467eed6583acba4c55c9f0e188))
- **server:** avoid redundant httpServer.close warning on shutdown ([#6646](https://github.com/promptfoo/promptfoo/issues/6646)) ([0975fc3](https://github.com/promptfoo/promptfoo/commit/0975fc3155b160a5e2df49e85a0c43f1fde08f04))
- **site:** remove homepage code box scrollbars ([#6668](https://github.com/promptfoo/promptfoo/issues/6668)) ([5ac8abc](https://github.com/promptfoo/promptfoo/commit/5ac8abcd40c1b618e97a104457a68a7d2a0b808b))
- **test:** make Python concurrency test environment-independent ([#6660](https://github.com/promptfoo/promptfoo/issues/6660)) ([645b6e2](https://github.com/promptfoo/promptfoo/commit/645b6e2560d7bcbf5b0c2ba7c24a4c3fde19c072))
- **util:** make transform.ts browser-compatible by splitting Node.js code ([#6642](https://github.com/promptfoo/promptfoo/issues/6642)) ([8fc1f12](https://github.com/promptfoo/promptfoo/commit/8fc1f12a82ae0edf79c710eb30305b9d7ebd9895))
- **webui:** include grading rubric in storedGraderResult for iterative, hydra, and custom strategies ([#6696](https://github.com/promptfoo/promptfoo/issues/6696)) ([933a752](https://github.com/promptfoo/promptfoo/commit/933a752c92de5e423bb98db6b0812b9bbd3872b4))

## [0.120.4](https://github.com/promptfoo/promptfoo/compare/0.120.3...0.120.4) (2025-12-11)

### Features

- **providers:** add ElevenLabs provider integration ([#6022](https://github.com/promptfoo/promptfoo/issues/6022)) ([8d54faa](https://github.com/promptfoo/promptfoo/commit/8d54faa1c240e28557b1eb652c358a3f8eb4b0a2))
- **providers:** add GPT-5.2 model support ([#6628](https://github.com/promptfoo/promptfoo/issues/6628)) ([b105980](https://github.com/promptfoo/promptfoo/commit/b105980f121d1b0ad8b0db95ff1d63e4d701f24d))
- **providers:** add OpenCode SDK provider ([#6423](https://github.com/promptfoo/promptfoo/issues/6423)) ([ef8f227](https://github.com/promptfoo/promptfoo/commit/ef8f227bced68ce9f507abec0b4010445fda61e4))
- **providers:** add streaming option for Vertex AI Model Armor support ([#6614](https://github.com/promptfoo/promptfoo/issues/6614)) ([aebd268](https://github.com/promptfoo/promptfoo/commit/aebd26879b87ca9a4a2a4e1d1e66bc22da6ff9fc))
- **redteam:** complete OWASP Agentic AI T1-T15 threat mapping ([#6458](https://github.com/promptfoo/promptfoo/issues/6458)) ([24e3c2b](https://github.com/promptfoo/promptfoo/commit/24e3c2bf5b0bedf519588aec2a5352a7aef42260))

### Bug Fixes

- **ci:** format CHANGELOG.md and improve release-please formatting step ([#6610](https://github.com/promptfoo/promptfoo/issues/6610)) ([b89977c](https://github.com/promptfoo/promptfoo/commit/b89977cc78bee7072a8168df3edf3e50cf4b4c5b))
- **deps:** update anthropic packages ([#6616](https://github.com/promptfoo/promptfoo/issues/6616)) ([645386b](https://github.com/promptfoo/promptfoo/commit/645386bf04b53bc980f53b0666bb75d34098c5f6))
- **providers:** add numRequests tracking to all provider tokenUsage objects ([#6612](https://github.com/promptfoo/promptfoo/issues/6612)) ([d35bf7c](https://github.com/promptfoo/promptfoo/commit/d35bf7c15deb2b360bcadc52c3d4753e335e7ed3))
- **providers:** update HuggingFace to use new inference API endpoint ([#6624](https://github.com/promptfoo/promptfoo/issues/6624)) ([57f118b](https://github.com/promptfoo/promptfoo/commit/57f118bc8c9d7aa48e6de1ace363d935b8de9f2e))
- **redteam:** preserve BestOfNProvider config through database serialization ([#6598](https://github.com/promptfoo/promptfoo/issues/6598)) ([92adeba](https://github.com/promptfoo/promptfoo/commit/92adeba581063a7fd5c545a3b2aa6f243a0f4881))

## [0.120.3](https://github.com/promptfoo/promptfoo/compare/0.120.2...0.120.3) (2025-12-10)

### Features

- **providers:** add multi-turn session persistence to browser provider ([#6585](https://github.com/promptfoo/promptfoo/issues/6585)) ([873241e](https://github.com/promptfoo/promptfoo/commit/873241ee0b5692edc74fcb33815b99adfab68a52))

### Bug Fixes

- **build:** exclude Nunjucks template fixture from TypeScript ([#6588](https://github.com/promptfoo/promptfoo/issues/6588)) ([6f02eec](https://github.com/promptfoo/promptfoo/commit/6f02eecda3d988da210c43027b3687fb561637f9))
- **ci:** resolve release workflow and devcontainer build failures ([#6589](https://github.com/promptfoo/promptfoo/issues/6589)) ([707ace0](https://github.com/promptfoo/promptfoo/commit/707ace0997279e8d5a9572aa8c48c20e03308992))
- **deps:** update dependency @anthropic-ai/sdk to ^0.71.1 ([#6594](https://github.com/promptfoo/promptfoo/issues/6594)) ([f11a097](https://github.com/promptfoo/promptfoo/commit/f11a097b7f53003dbd1170c0ef32388c81540a00))
- **deps:** update dependency @modelcontextprotocol/sdk to v1.24.3 ([#6590](https://github.com/promptfoo/promptfoo/issues/6590)) ([1bc4d27](https://github.com/promptfoo/promptfoo/commit/1bc4d27f1f9dc49bed95475331faed4fde1dbb20))
- **deps:** update dependency drizzle-orm to ^0.45.0 ([#6592](https://github.com/promptfoo/promptfoo/issues/6592)) ([1bac327](https://github.com/promptfoo/promptfoo/commit/1bac327fbce6e687f08779663adccf732366cb12))
- **deps:** update winston to v3.19.0 and simplify logger flush ([#6593](https://github.com/promptfoo/promptfoo/issues/6593)) ([f29926c](https://github.com/promptfoo/promptfoo/commit/f29926c36bfa33eaa3d39bc5d5ca355b47509705))
- **esm:** restore process.mainModule.require compatibility for inline transforms ([#6606](https://github.com/promptfoo/promptfoo/issues/6606)) ([765a26f](https://github.com/promptfoo/promptfoo/commit/765a26fc4fc41f0ddec814b9b7c04bbec954d8c7))
- **npm:** drop npm version requirement ([#6604](https://github.com/promptfoo/promptfoo/issues/6604)) ([a182bb2](https://github.com/promptfoo/promptfoo/commit/a182bb2d0e2a9af70cac5217b4806abf67f98966))

## [0.120.2](https://github.com/promptfoo/promptfoo/compare/0.120.1...0.120.2) (2025-12-09)

### Features

- **assertions:** tool calling f1 score ([#6548](https://github.com/promptfoo/promptfoo/issues/6548)) ([1327195](https://github.com/promptfoo/promptfoo/commit/13271958b5a48b7d26586daf5f06d98bcdf4d063))
- **providers:** add Amazon Nova 2 model support with reasoning capabilities ([#6531](https://github.com/promptfoo/promptfoo/issues/6531)) ([3a99c2b](https://github.com/promptfoo/promptfoo/commit/3a99c2b54598274d42f0f404694a0526aa57cec0))
- **providers:** add Llama 3.2 Vision support for Bedrock InvokeModel API ([#6555](https://github.com/promptfoo/promptfoo/issues/6555)) ([9b78f61](https://github.com/promptfoo/promptfoo/commit/9b78f61653ab7a1f4435299710e505c60c1dd474))
- **redteam:** add job persistence for browser-based evaluations ([#6529](https://github.com/promptfoo/promptfoo/issues/6529)) ([35f2e9f](https://github.com/promptfoo/promptfoo/commit/35f2e9f1a5b0c57c934c8f94d2ee5cdad27f844c))
- **redteam:** Adding authentication options for HTTP provider ([#6515](https://github.com/promptfoo/promptfoo/issues/6515)) ([df90497](https://github.com/promptfoo/promptfoo/commit/df90497fbfc688cef89a29b85d2dcd38755835b7))
- **tracing:** add protobuf support for OTLP trace ingestion ([#6540](https://github.com/promptfoo/promptfoo/issues/6540)) ([d83837e](https://github.com/promptfoo/promptfoo/commit/d83837efb0e2be44c3e84378206be435f003d6c1))

### Bug Fixes

- **assertions:** filter preamble text in context-recall parser ([#6566](https://github.com/promptfoo/promptfoo/issues/6566)) ([01e5bf0](https://github.com/promptfoo/promptfoo/commit/01e5bf021728a0e80daf5effdd97d539639e5775))
- **assertions:** improve is-sql error messages for whitelist violations ([#6565](https://github.com/promptfoo/promptfoo/issues/6565)) ([43bd7d6](https://github.com/promptfoo/promptfoo/commit/43bd7d6d7a0fa8dd546b365b77f96dc66e811bd8))
- **ci:** rename GitHub releases to remove v prefix ([#6574](https://github.com/promptfoo/promptfoo/issues/6574)) ([16a31eb](https://github.com/promptfoo/promptfoo/commit/16a31ebb639251db73053df938fd64baad4825cd))
- **cli:** show CLI UI during model scan by using temp file for JSON output ([#6524](https://github.com/promptfoo/promptfoo/issues/6524)) ([f50456b](https://github.com/promptfoo/promptfoo/commit/f50456b6d2cfef2c8f1989d26f6814c9633575a4))
- fix parsing empty contents for gemini providers ([#6580](https://github.com/promptfoo/promptfoo/issues/6580)) ([ddff9b9](https://github.com/promptfoo/promptfoo/commit/ddff9b9b49c9abebddae9127800a06d8507dd99d))
- making guardrails fall back to false when undefined to simplify configuring successful responses ([#6582](https://github.com/promptfoo/promptfoo/issues/6582)) ([ee698e4](https://github.com/promptfoo/promptfoo/commit/ee698e41003992af0623a6fa4f07f1688ccaf80a))
- **redteam:** fix prompt-injection strategy data.json loading in ESM build ([#6583](https://github.com/promptfoo/promptfoo/issues/6583)) ([ae373dc](https://github.com/promptfoo/promptfoo/commit/ae373dcf1c8e0f0b7e4a4978d339df0ab9b8f263))
- updating guardrail detection for vertex provider ([#6581](https://github.com/promptfoo/promptfoo/issues/6581)) ([3c10f64](https://github.com/promptfoo/promptfoo/commit/3c10f648bf709bf62d934f7090da9c8ea969948d))
- **webui:** add missing vitest imports to test files ([#6577](https://github.com/promptfoo/promptfoo/issues/6577)) ([8c2afa0](https://github.com/promptfoo/promptfoo/commit/8c2afa023db80a4926abb2ab80a8c03de108ebfe))
- **webui:** display provider errors in eval results fail reason carousel ([#6552](https://github.com/promptfoo/promptfoo/issues/6552)) ([b43f225](https://github.com/promptfoo/promptfoo/commit/b43f225ad07eefc9af7e3cae17bcd362dba4383f))
- **webui:** handle object outputs in eval prompt dialog ([#6556](https://github.com/promptfoo/promptfoo/issues/6556)) ([c2a3441](https://github.com/promptfoo/promptfoo/commit/c2a34418eb640c6c46ff2bc1cf5ff5ad954b0199))

## [0.120.1](https://github.com/promptfoo/promptfoo/compare/0.120.0...0.120.1) (2025-12-08)

### Features

- **providers:** update claude-agent-sdk to ^0.1.60 with betas and dontAsk support ([#6557](https://github.com/promptfoo/promptfoo/issues/6557)) ([cc3d857](https://github.com/promptfoo/promptfoo/commit/cc3d85763606facb615965ad9288c33650e01512))

### Bug Fixes

- **ci:** trigger Docker build from release-please workflow ([#6572](https://github.com/promptfoo/promptfoo/issues/6572)) ([6b17908](https://github.com/promptfoo/promptfoo/commit/6b17908e5875eb7baed1e66a4f6a650413ca9ef7))
- improved differentiation between parsing json and non-json chat messages ([#6568](https://github.com/promptfoo/promptfoo/issues/6568)) ([3776606](https://github.com/promptfoo/promptfoo/commit/377660659ac6cd52a58f3ee1cb687a5bbb2ece23))
- use correct drizzle migrations path for npm/npx installs ([#6573](https://github.com/promptfoo/promptfoo/issues/6573)) ([3e4fa81](https://github.com/promptfoo/promptfoo/commit/3e4fa814882e34d7606dd256e34789559213feca))

## [0.120.0](https://github.com/promptfoo/promptfoo/compare/0.119.14...0.120.0) (2025-12-08)

### Features

- **build:** migrate to ESM (ECMAScript Modules) ([#5594](https://github.com/promptfoo/promptfoo/issues/5594)) ([9cdf09b](https://github.com/promptfoo/promptfoo/commit/9cdf09b1c681454ed3fa047dee41a43fea48028a))
- **cli:** toggle debug log live ([#6517](https://github.com/promptfoo/promptfoo/issues/6517)) ([6beebce](https://github.com/promptfoo/promptfoo/commit/6beebce4134f0e0dfd54e7f14cf4b213abd9573c))
- **providers:** add Gemini native image generation support ([#6405](https://github.com/promptfoo/promptfoo/issues/6405)) ([13bc040](https://github.com/promptfoo/promptfoo/commit/13bc04000accebae4231d77997970528d207a377))
- **redteam:** add multi-modal layer strategy support for audio/image attacks ([#6472](https://github.com/promptfoo/promptfoo/issues/6472)) ([c0d7c1c](https://github.com/promptfoo/promptfoo/commit/c0d7c1c0aef2cc63957075c7f60829e77ee4741e))

### Bug Fixes

- **build:** add CommonJS fallback for .js files in ESM environment ([#6501](https://github.com/promptfoo/promptfoo/issues/6501)) ([ae39641](https://github.com/promptfoo/promptfoo/commit/ae39641d3db36d47aba72b39a0bc35290ca80d93))
- **assertions:** allow Nunjucks templates in JSON rubricPrompt files ([#6554](https://github.com/promptfoo/promptfoo/issues/6554)) ([7cdb1af](https://github.com/promptfoo/promptfoo/commit/7cdb1afae9bec1432bbcd898c583451e7cf0ac8f))
- **assertions:** resolve provider paths relative to config file location ([#6503](https://github.com/promptfoo/promptfoo/issues/6503)) ([61a77eb](https://github.com/promptfoo/promptfoo/commit/61a77eb5cfa3619bbcdb82eac89e20293f2d6cb8))
- **cli:** await modelaudit subprocess completion in scan-model command ([#6518](https://github.com/promptfoo/promptfoo/issues/6518)) ([fe19331](https://github.com/promptfoo/promptfoo/commit/fe19331acada496c3ea528c65c3b39066d97ca67))
- **cli:** resolve view command premature exit and eval hanging issues ([#6460](https://github.com/promptfoo/promptfoo/issues/6460)) ([d9e9814](https://github.com/promptfoo/promptfoo/commit/d9e9814ff3a21b5922794ea48b70d104e29b948c))
- **code-scan:** output valid JSON when no files to scan with --json flag ([#6496](https://github.com/promptfoo/promptfoo/issues/6496)) ([8c41fce](https://github.com/promptfoo/promptfoo/commit/8c41fceaff6474e7de919d73fc01c2cd80979cf9))
- **deps:** downgrade zod-validation-error for ESM compatibility ([#6471](https://github.com/promptfoo/promptfoo/issues/6471)) ([a39643a](https://github.com/promptfoo/promptfoo/commit/a39643ad94d4d9a804d3cec0a736e120b17d092d))
- **deps:** resolve Express CVE-2024-51999 vulnerability ([#6457](https://github.com/promptfoo/promptfoo/issues/6457)) ([c2ef1ad](https://github.com/promptfoo/promptfoo/commit/c2ef1ad64fc2a0f4b0bc6a76dac751733b52a77f))
- **deps:** update dependency @modelcontextprotocol/sdk to v1.24.0 [security] ([#6463](https://github.com/promptfoo/promptfoo/issues/6463)) ([cfdffff](https://github.com/promptfoo/promptfoo/commit/cfdfffff518e02c29cec705f93ebdc2e24a07901))
- **deps:** update jws to fix security vulnerability ([#6497](https://github.com/promptfoo/promptfoo/issues/6497)) ([28112f5](https://github.com/promptfoo/promptfoo/commit/28112f5fac826d6d32aaa80f82d291955ed42555))
- **eval:** correct share progress count to match actual results ([#6513](https://github.com/promptfoo/promptfoo/issues/6513)) ([ea4410c](https://github.com/promptfoo/promptfoo/commit/ea4410cdf5deea1af08a9e29688adbc6fbdb8909))
- **eval:** handle missing defaultTest in extension-api hooks ([#6504](https://github.com/promptfoo/promptfoo/issues/6504)) ([c0d111c](https://github.com/promptfoo/promptfoo/commit/c0d111c457ddbabf54cf5652b04fcbf2ce336838))
- **eval:** include provider in Google Sheets output column headers ([#6528](https://github.com/promptfoo/promptfoo/issues/6528)) ([ded540a](https://github.com/promptfoo/promptfoo/commit/ded540a97a10f78e4bc0aeb4b4c39248cdc06919))
- **cache:** fix initialization ([#6467](https://github.com/promptfoo/promptfoo/issues/6467)) ([df2ae94](https://github.com/promptfoo/promptfoo/commit/df2ae94cc967cd6fc3df4e0d170bdcb4702c2e53))
- **config:** handle setting maxConcurrency in config.yaml ([#6526](https://github.com/promptfoo/promptfoo/issues/6526)) ([5443171](https://github.com/promptfoo/promptfoo/commit/5443171ea0eec30215c56e83cce6378e482cd1e7))
- **providers:** fix Golang and Ruby wrappers ([#6506](https://github.com/promptfoo/promptfoo/issues/6506)) ([d429b00](https://github.com/promptfoo/promptfoo/commit/d429b005ff222c818d3946fc3108a7c8970abcb2))
- **providers:** handle Vertex AI global region endpoint ([#6570](https://github.com/promptfoo/promptfoo/issues/6570)) ([5d8a043](https://github.com/promptfoo/promptfoo/commit/5d8a0434e4e5d4f9d8b6e3a1c2f7e8d9a0b1c2d3))
- **http:** improve parsing of body in HTTP provider ([#6484](https://github.com/promptfoo/promptfoo/issues/6484)) ([7665f48](https://github.com/promptfoo/promptfoo/commit/7665f4857a06796b7558e9dfc50730523c47b801))
- **build:** migrate require() to ESM-compatible imports ([#6509](https://github.com/promptfoo/promptfoo/issues/6509)) ([7b30dda](https://github.com/promptfoo/promptfoo/commit/7b30dda3c362d2f3ffe768acd8450b3a25ee151d))
- **logger:** prevent Winston 'write after end' error during shutdown ([#6511](https://github.com/promptfoo/promptfoo/issues/6511)) ([a5ad5cb](https://github.com/promptfoo/promptfoo/commit/a5ad5cb3381e5ac3ae5c34640cf99915216490bf))
- **logger:** prevent write-after-end error in shutdown ([#6514](https://github.com/promptfoo/promptfoo/issues/6514)) ([c901d8d](https://github.com/promptfoo/promptfoo/commit/c901d8dcd6fa24201d99ede3ef2552c7fb91b945))
- **providers:** improve ChatKit multi-step workflow support ([#6425](https://github.com/promptfoo/promptfoo/issues/6425)) ([ceef623](https://github.com/promptfoo/promptfoo/commit/ceef623af0c48f864f13bd3b29e9c63acd83160c))
- **providers:** improve ChatKit response capture reliability ([#6482](https://github.com/promptfoo/promptfoo/issues/6482)) ([f251a03](https://github.com/promptfoo/promptfoo/commit/f251a03e3aad4ca0ee7b5030e9a94b66a1323dc1))
- **python:** fix provider path resolution ([#6465](https://github.com/promptfoo/promptfoo/issues/6465)) ([20b363e](https://github.com/promptfoo/promptfoo/commit/20b363e686002fd53d3fdb7b769481d1f49889a3))
- **python:** fix wrapper.py path resolution ([#6500](https://github.com/promptfoo/promptfoo/issues/6500)) ([f617ee5](https://github.com/promptfoo/promptfoo/commit/f617ee545248cd45e8eb7666470294b456984c21))
- **python:** replace deprecated asyncio.iscoroutinefunction with inspect.iscoroutinefunction ([#6551](https://github.com/promptfoo/promptfoo/issues/6551)) ([804d6c8](https://github.com/promptfoo/promptfoo/commit/804d6c83e1de5b167e341ebe43178a76f865cb46))
- **redteam:** handle missing strategy test cases ([#6485](https://github.com/promptfoo/promptfoo/issues/6485)) ([2ae2315](https://github.com/promptfoo/promptfoo/commit/2ae231518f1b93fc1f247d5b941940de2c8c9e10))
- **redteam:** propagate abort signals through agentic strategy providers ([#6412](https://github.com/promptfoo/promptfoo/issues/6412)) ([49b96e7](https://github.com/promptfoo/promptfoo/commit/49b96e7417eead8b880646b5bec0d6dc7c0641d6))
- **build:** fix require() module resolution ([#6468](https://github.com/promptfoo/promptfoo/issues/6468)) ([ea6b299](https://github.com/promptfoo/promptfoo/commit/ea6b2995ecdc94e970dcabbc95fe6aa5a0e94bf5))
- **cli:** use npm environment variables for version detection ([#6479](https://github.com/promptfoo/promptfoo/issues/6479)) ([2a88aab](https://github.com/promptfoo/promptfoo/commit/2a88aab8a4a1f7e97dc851f58aa9a103bc09981f))
- **server:** resolve drizzle migrations path for cloud bundled context ([#6522](https://github.com/promptfoo/promptfoo/issues/6522)) ([6d2ff39](https://github.com/promptfoo/promptfoo/commit/6d2ff395d9b10db9b87dc9cba5263b5d053c10fd))

### Performance Improvements

- **build:** parallelize build steps and use esbuild minifier ([#6494](https://github.com/promptfoo/promptfoo/issues/6494)) ([8b41b40](https://github.com/promptfoo/promptfoo/commit/8b41b40034c6025d83eb1b351da63a61928b13d5))

### Reverts

- "fix(deps): update dependency jsdom to v27" ([#6449](https://github.com/promptfoo/promptfoo/issues/6449)) ([1cd29ad](https://github.com/promptfoo/promptfoo/commit/1cd29ad68cf93ab3c7c40a75212ac6f4ca56bcbf))

### Documentation

- **site:** display correct blog post dates regardless of user timezone ([#6534](https://github.com/promptfoo/promptfoo/issues/6534)) ([3401ca1](https://github.com/promptfoo/promptfoo/commit/3401ca15c373f332dc33f955744b0a2191c414c9))
- **site:** fix responsive logo containers ([#6470](https://github.com/promptfoo/promptfoo/issues/6470)) ([a94cef9](https://github.com/promptfoo/promptfoo/commit/a94cef98af50dcf15c503bc055b98100f83a286c))
- **site:** update Tabs Fakier GitHub profile URL ([#6527](https://github.com/promptfoo/promptfoo/issues/6527)) ([d7959c6](https://github.com/promptfoo/promptfoo/commit/d7959c61153646184a558990f3c62e1dcfe70f74))

### Miscellaneous Chores

- **ci:** enforce npm version to prevent lockfile incompatibility ([#6483](https://github.com/promptfoo/promptfoo/issues/6483)) ([ab0cccc](https://github.com/promptfoo/promptfoo/commit/ab0cccc166e803b64b4a87353f318f0e20a363c3))
- **ci:** remove packageManager to allow pnpm/yarn ([#6512](https://github.com/promptfoo/promptfoo/issues/6512)) ([9b49e36](https://github.com/promptfoo/promptfoo/commit/9b49e360f8f0418b7230442f1f97cb25fd2c2243))
- **ci:** update latest Docker tag on releases ([#6477](https://github.com/promptfoo/promptfoo/issues/6477)) ([d213e33](https://github.com/promptfoo/promptfoo/commit/d213e33e10cce5bb3dc1165eec52e5657d221925))
- **deps:** update dependency @apidevtools/json-schema-ref-parser to v15 ([#6336](https://github.com/promptfoo/promptfoo/issues/6336)) ([614aa66](https://github.com/promptfoo/promptfoo/commit/614aa66d224e1333d4a736c0d25ec71a232875e9))
- **deps:** update dependency @modelcontextprotocol/sdk to v1.23.0 ([#6441](https://github.com/promptfoo/promptfoo/issues/6441)) ([878682f](https://github.com/promptfoo/promptfoo/commit/878682f8a731f4173a82a29828d611e7ebe79b79))
- **deps:** update dependency @modelcontextprotocol/sdk to v1.24.1 ([#6558](https://github.com/promptfoo/promptfoo/issues/6558)) ([d532aa2](https://github.com/promptfoo/promptfoo/commit/d532aa2dbf6c1151c75038950f975b832053df8f))
- **deps:** update dependency @modelcontextprotocol/sdk to v1.24.2 ([#6567](https://github.com/promptfoo/promptfoo/issues/6567)) ([f87f11b](https://github.com/promptfoo/promptfoo/commit/f87f11b3690ffb1eedebd4a7f4bd7cac3c9ef013))
- **deps:** update dependency better-sqlite3 to v12.5.0 ([#6488](https://github.com/promptfoo/promptfoo/issues/6488)) ([1689562](https://github.com/promptfoo/promptfoo/commit/1689562deb77e324d1942fe47d14090fddd2cdb1))
- **deps:** update dependency chalk to v5 ([#6310](https://github.com/promptfoo/promptfoo/issues/6310)) ([cb2bfb4](https://github.com/promptfoo/promptfoo/commit/cb2bfb463c38ad4cd798b67cd14aef4dcec0a21a))
- **deps:** update dependency chokidar to v5 ([#6442](https://github.com/promptfoo/promptfoo/issues/6442)) ([6faa86b](https://github.com/promptfoo/promptfoo/commit/6faa86b98f129708d1d90c8cf17e0473fc1936b6))
- **deps:** update dependency debounce to v3 ([#6445](https://github.com/promptfoo/promptfoo/issues/6445)) ([df4606f](https://github.com/promptfoo/promptfoo/commit/df4606fa260c4017e75848deb16add7b9b17e3de))
- **deps:** update dependency jsdom to v27 ([#6446](https://github.com/promptfoo/promptfoo/issues/6446)) ([f7b5828](https://github.com/promptfoo/promptfoo/commit/f7b5828a736471dbdfe1e50a4765fabbc4182a6f))
- **deps:** update dependency ora to v9 ([#6447](https://github.com/promptfoo/promptfoo/issues/6447)) ([e618896](https://github.com/promptfoo/promptfoo/commit/e618896ea7bedb70a0e490e2458426112dc860cc))
- **deps:** update dependency swiper to v12 ([#6448](https://github.com/promptfoo/promptfoo/issues/6448)) ([2b7569b](https://github.com/promptfoo/promptfoo/commit/2b7569b2b6794e7630e2a427c0d059cc21b056da))
- **deps:** update dependency uuid to v13 ([#6452](https://github.com/promptfoo/promptfoo/issues/6452)) ([9d6c21f](https://github.com/promptfoo/promptfoo/commit/9d6c21fc412dfe7623e1bf9d2b860a7e85302666))
- **deps:** update dependency zod-validation-error to v5 ([#6455](https://github.com/promptfoo/promptfoo/issues/6455)) ([4c72b13](https://github.com/promptfoo/promptfoo/commit/4c72b13b0b559e07e8ce08e832613d697e2684bc))
- **examples:** add JS loader for cyberseceval test cases ([#6505](https://github.com/promptfoo/promptfoo/issues/6505)) ([b3d4a85](https://github.com/promptfoo/promptfoo/commit/b3d4a85fd1c84f9f7b41443d55c1111a0d3fe692))
- replace TypeScript enums with const objects ([#6428](https://github.com/promptfoo/promptfoo/issues/6428)) ([ae2b609](https://github.com/promptfoo/promptfoo/commit/ae2b609fe593d63f4b7ca51fb55f6822a44b0ce6))

## [0.119.14](https://github.com/promptfoo/promptfoo/compare/0.119.13...0.119.14) (2025-12-01)

### Features

- Add web search assertion type ([#5111](https://github.com/promptfoo/promptfoo/issues/5111)) ([11c01cc](https://github.com/promptfoo/promptfoo/commit/11c01cc637efd6867a1e99e44bc8633d324ac66a))
- **examples:** add Strands Agents SDK example ([#6384](https://github.com/promptfoo/promptfoo/issues/6384)) ([28c3d58](https://github.com/promptfoo/promptfoo/commit/28c3d584f2f820de40a17e641aaf95809cf51e82))
- **providers:** add AWS Bedrock Converse API provider ([#6348](https://github.com/promptfoo/promptfoo/issues/6348)) ([8ab3f96](https://github.com/promptfoo/promptfoo/commit/8ab3f96f36eb054ba833206f463014a0f3aedc92))
- **providers:** add Claude Agent SDK plugin support ([#6377](https://github.com/promptfoo/promptfoo/issues/6377)) ([d3e67f5](https://github.com/promptfoo/promptfoo/commit/d3e67f5409af88abc1723c23c3f799cdac47de69))
- **providers:** add comprehensive Azure model support ([#6375](https://github.com/promptfoo/promptfoo/issues/6375)) ([2e53c08](https://github.com/promptfoo/promptfoo/commit/2e53c084b6a0f95b1f1f5ec1869bcba4bb961657))
- **providers:** add Google Cloud Model Armor support to Vertex AI ([#6365](https://github.com/promptfoo/promptfoo/issues/6365)) ([0d1641b](https://github.com/promptfoo/promptfoo/commit/0d1641bb3699dcc36e66273c7105ba0b33f0b58d))
- **providers:** add Groq reasoning models, Responses API, and built-in tools support ([#6231](https://github.com/promptfoo/promptfoo/issues/6231)) ([7cbddd0](https://github.com/promptfoo/promptfoo/commit/7cbddd0ee2fcce983654e07550a6a673b23e2291))
- **providers:** add missing Claude Agent SDK options ([#6389](https://github.com/promptfoo/promptfoo/issues/6389)) ([d0d227c](https://github.com/promptfoo/promptfoo/commit/d0d227cc627c048efbfe44e224d6394d2ca5311e))
- **providers:** add OpenAI ChatKit provider ([#6406](https://github.com/promptfoo/promptfoo/issues/6406)) ([433ac65](https://github.com/promptfoo/promptfoo/commit/433ac65589bf758901ed5388fec1a5e460d27c2d))
- **providers:** add OpenAI Codex SDK provider ([#6321](https://github.com/promptfoo/promptfoo/issues/6321)) ([cc45c0f](https://github.com/promptfoo/promptfoo/commit/cc45c0fbe16814743dba09ba897c13c3687163d1))
- **providers:** add verbosity and isReasoningModel config to azure:responses ([#6382](https://github.com/promptfoo/promptfoo/issues/6382)) ([e99b8a8](https://github.com/promptfoo/promptfoo/commit/e99b8a84ab4dbe8d0ffd9352a5176d9aaaaf0f36))
- **providers:** add xAI Responses API with Agent Tools support ([#6386](https://github.com/promptfoo/promptfoo/issues/6386)) ([fad0fc8](https://github.com/promptfoo/promptfoo/commit/fad0fc893dfd62579e80fce7db3d0127c3b4e6b1))
- **redteam:** update VLGuard to use original MIT-licensed dataset ([#5809](https://github.com/promptfoo/promptfoo/issues/5809)) ([dbabbaf](https://github.com/promptfoo/promptfoo/commit/dbabbaf1a4366ca6e5881fe2b30ecfd5aec4174f))
- Share trace data to promptfoo cloud ([ce251ae](https://github.com/promptfoo/promptfoo/commit/ce251ae5cb16d9f65cf98d89c7ba4ea91778e3c4))
- vs code red team extension ([#6396](https://github.com/promptfoo/promptfoo/issues/6396)) ([406dc61](https://github.com/promptfoo/promptfoo/commit/406dc61c6f122e720283108aefeafbb21a6386a3))

### Bug Fixes

- **ci:** restore original tag format for GitHub releases ([#6402](https://github.com/promptfoo/promptfoo/issues/6402)) ([e49e5b8](https://github.com/promptfoo/promptfoo/commit/e49e5b80574b8f12a066ee834e160eacb3cd03f5))
- **cli:** resolve eval command hanging by adding missing await calls ([#6422](https://github.com/promptfoo/promptfoo/issues/6422)) ([137231a](https://github.com/promptfoo/promptfoo/commit/137231a775259d37c5173606f6414851198cfcb2))
- **deps:** replace xlsx with read-excel-file to fix high severity vulnerability ([#6357](https://github.com/promptfoo/promptfoo/issues/6357)) ([e6e2b98](https://github.com/promptfoo/promptfoo/commit/e6e2b980d71f662258e50832b4967f20de1b0585))
- **deps:** update node-forge to 1.3.2 to fix security vulnerability ([#6395](https://github.com/promptfoo/promptfoo/issues/6395)) ([2b96ee2](https://github.com/promptfoo/promptfoo/commit/2b96ee2caa17237317a5a8c70798af4677d8a7d4))
- **evals:** do not truncate image responses in eval ([#6391](https://github.com/promptfoo/promptfoo/issues/6391)) ([d6fb07c](https://github.com/promptfoo/promptfoo/commit/d6fb07c1c45c2c8dce9f79812ab7d1f834af0e38))
- **mcp:** pass timeout configuration to MCP SDK calls ([#6394](https://github.com/promptfoo/promptfoo/issues/6394)) ([d05da44](https://github.com/promptfoo/promptfoo/commit/d05da44d2c33d2f7956c4b5b16a04a8304580c4b))
- **modelaudit:** track scanner version and re-scan on version changes ([#6361](https://github.com/promptfoo/promptfoo/issues/6361)) ([f0e8065](https://github.com/promptfoo/promptfoo/commit/f0e80654b1b1a2d48f7f8ac92fdc73e2786767a5))
- preserve all file:// references in vars context for runtime loading ([#6393](https://github.com/promptfoo/promptfoo/issues/6393)) ([55c553c](https://github.com/promptfoo/promptfoo/commit/55c553caf348ff4837bd8f0b28b0aed7374b7ff6))
- prevent Node.js from hanging when importing promptfoo as a library ([#6351](https://github.com/promptfoo/promptfoo/issues/6351)) ([af857a3](https://github.com/promptfoo/promptfoo/commit/af857a3ed37e06d357d85c550b4fa3bf63b5d991))
- **providers:** fix ChatKit echo behavior and concurrency issues ([#6420](https://github.com/promptfoo/promptfoo/issues/6420)) ([04df4a8](https://github.com/promptfoo/promptfoo/commit/04df4a8b730eeb82589a3ff743f95c7279a58fa3))
- **site:** add truncation marker to blog post ([#6392](https://github.com/promptfoo/promptfoo/issues/6392)) ([900fac2](https://github.com/promptfoo/promptfoo/commit/900fac28dda24001038d4b5a979a59cefdbd9271))
- **webui:** resolve Vitest timing issues causing test timeouts ([#6356](https://github.com/promptfoo/promptfoo/issues/6356)) ([353ab11](https://github.com/promptfoo/promptfoo/commit/353ab1183431c98ec2a625d0c8fb3e5a70cba408))

## [0.119.13](https://github.com/promptfoo/promptfoo/compare/promptfoo-v0.119.12...promptfoo-v0.119.13) (2025-11-25)

### Features

- ecommerce plugin pack ([#6168](https://github.com/promptfoo/promptfoo/issues/6168)) ([152b1ff](https://github.com/promptfoo/promptfoo/commit/152b1ff3f3fdb6ca43a0a5718d463757f63a1814))

### Bug Fixes

- **deps:** bump posthog-node from 5.13.2 to 5.14.0 for sha1-hulud mitigation ([6a44eda](https://github.com/promptfoo/promptfoo/commit/6a44eda819f48273230853cc8692b821f8db14a0))

## [0.119.12](https://github.com/promptfoo/promptfoo/compare/promptfoo-v0.119.11...promptfoo-v0.119.12) (2025-11-24)

### Features

- feat(redteam): add ecommerce plugin pack with 4 security testing plugins (#6168)

* changelog automation and validation ([#6252](https://github.com/promptfoo/promptfoo/issues/6252)) ([ee74c4a](https://github.com/promptfoo/promptfoo/commit/ee74c4ae7dc01c35dd52d835a19188f06a334a1a))
* **providers:** add Anthropic structured outputs support ([#6226](https://github.com/promptfoo/promptfoo/issues/6226)) ([1b1b9d2](https://github.com/promptfoo/promptfoo/commit/1b1b9d274559a5ae7cefba1de0c6a732a3d6cbf0))
* **providers:** add Claude Opus 4.5 model support ([#6339](https://github.com/promptfoo/promptfoo/issues/6339)) ([65f855d](https://github.com/promptfoo/promptfoo/commit/65f855d57a2d3e0a663ad86260308f899c375dd6))
* **providers:** add Claude Opus 4.5 support for Anthropic, Google Vertex AI, and AWS Bedrock ([#6340](https://github.com/promptfoo/promptfoo/issues/6340)) ([95780cb](https://github.com/promptfoo/promptfoo/commit/95780cb32270ec7cca86e5722e204cae321942b5))
* **providers:** add metadata extraction for OpenAI Responses API ([#6267](https://github.com/promptfoo/promptfoo/issues/6267)) ([f252f33](https://github.com/promptfoo/promptfoo/commit/f252f330f1faed5b8d46f8b32010c81d5f92edf7))
* **server:** add server-side provider list customization ([#6124](https://github.com/promptfoo/promptfoo/issues/6124)) ([fdb792a](https://github.com/promptfoo/promptfoo/commit/fdb792a2d1908007786571d54a8d7f66fb54940c))
* **util:** add support for loading tool definitions from Python/JavaScript files ([#6272](https://github.com/promptfoo/promptfoo/issues/6272)) ([41377d0](https://github.com/promptfoo/promptfoo/commit/41377d04d01b8b7abd9955619d29a77c2a8914d5))

### Bug Fixes

- add data URL support for vision models with local images ([#5725](https://github.com/promptfoo/promptfoo/issues/5725)) ([17442a8](https://github.com/promptfoo/promptfoo/commit/17442a85f230668a430076141492c777ecca4995))
- **assertions:** use script output for file:// references in all assertion types ([#6253](https://github.com/promptfoo/promptfoo/issues/6253)) ([246dcd8](https://github.com/promptfoo/promptfoo/commit/246dcd8642803772ef53ab0b3c6ef471c7bee815))
- **cli:** restore commandLineOptions support + fix cloud auto-sharing ([#6190](https://github.com/promptfoo/promptfoo/issues/6190)) ([6df071f](https://github.com/promptfoo/promptfoo/commit/6df071f1373ceb6b1c31fb096a2e0c673cc8918c))
- **code-scan:** remove redundant PR comment when no issues found ([#6317](https://github.com/promptfoo/promptfoo/issues/6317)) ([2a6e38c](https://github.com/promptfoo/promptfoo/commit/2a6e38c4e210c5bc6b1358fa5d4c48c82c3bec78))
- **codeScan:** exit with code 0 when no files to scan ([#6316](https://github.com/promptfoo/promptfoo/issues/6316)) ([78e5c52](https://github.com/promptfoo/promptfoo/commit/78e5c526ee4ef240419eac2e8e51142b9f538ad6))
- **logging:** implement PROMPTFOO_LOG_DIR environment variable ([#6179](https://github.com/promptfoo/promptfoo/issues/6179)) ([f3db2d9](https://github.com/promptfoo/promptfoo/commit/f3db2d9421fe72cbd19efde4e888fb016c3c256d))
- **providers:** propagate agent errors in simulated-user provider ([#6251](https://github.com/promptfoo/promptfoo/issues/6251)) ([2378f71](https://github.com/promptfoo/promptfoo/commit/2378f71bcb06ee39e09f9243051ceea77af1b3a9))
- **providers:** support function providers in defaultTest.options.provider and assertions ([#6174](https://github.com/promptfoo/promptfoo/issues/6174)) ([601f173](https://github.com/promptfoo/promptfoo/commit/601f1730cd83c858aaf845d7aadd69069d2395c4))
- **webui:** prevent horizontal scrolling in metadata table ([#6178](https://github.com/promptfoo/promptfoo/issues/6178)) ([5d36d8d](https://github.com/promptfoo/promptfoo/commit/5d36d8d2ff836914f596892b2fc41a80e5b7804e))

## [Unreleased]

### ⚠️ BREAKING CHANGES

- feat(esm)!: migrate from CommonJS to ESM (ECMAScript Modules) (#5594)
  - **Custom providers**: `.js` files are now treated as ESM by default. If your custom provider uses CommonJS syntax (`require`/`module.exports`), either:
    1. Rename the file to `.cjs` extension, OR
    2. Convert to ESM syntax (`import`/`export`)
  - **Library consumers**: The library now exports both ESM and CJS formats. ESM is the default for `import`, CJS is available via `require('promptfoo')`.
  - **No action needed** if you only use promptfoo via CLI with YAML configs

### Added

- feat(providers): add Claude Agent SDK plugin support - enables loading local plugins via `plugins` config
- feat(providers): add Claude Opus 4.5 support across Anthropic (claude-opus-4-5-20251101, claude-opus-4-5-latest), Google Vertex AI (claude-opus-4-5@20251101), and AWS Bedrock (anthropic.claude-opus-4-5-20251101-v1:0 for all regions) with $5/MTok input and $25/MTok output pricing; includes comprehensive documentation updates, advanced coding example demonstrating bug diagnosis and tradeoff analysis, updated provider examples, and cost calculation tests
- feat(util): add support for loading tool definitions from Python/JavaScript files - providers now support dynamic tool generation using `file://tools.py:get_tools` and `file://tools.js:get_tools` syntax, enabling runtime tool definitions based on environment, config, or external APIs (#6272)
- feat(server): add server-side provider list customization via ui-providers.yaml - enables organizations to define custom provider lists that appear in eval creator and redteam setup UIs; when ui-providers.yaml exists, replaces default ~600 providers with organization-specific options for simplified workflow and security control (#6124)
- feat(providers): add Anthropic structured outputs support with JSON schema outputs via `output_format` parameter and strict tool use via `strict: true` in tool definitions - ensures schema-compliant responses with automatic beta header handling, external file loading, variable rendering, and JSON parsing for Claude Sonnet 4.5 and Claude Opus 4.1 (#6226)
- feat(webui): add custom policy generation to red team setup (#6181)
- feat(webui): add strategy test generation to red team setup (#6005)
- feat(webui): add visibility button for PFX passphrase field in red team target configuration (#6258)
- feat: Share trace data to promptfoo cloud (#6290)

### Changed

- feat(esm): add helpful error messages for CommonJS files loaded as ESM - when a .js file using require/module.exports fails to load, users now see actionable guidance explaining the ESM migration and how to fix their files (#5594)
- feat(cli): add automatic changelog update on version bump with comprehensive error handling (#6252)
- feat(ci): add JavaScript-based changelog validator replacing bash script for PR number and Unreleased section enforcement (#6252)
- feat(providers): add metadata extraction for OpenAI Responses API - extract responseId and model to metadata for debugging and response tracking (#6267)
- refactor(webui): remove useImperativeHandle from ProviderConfigEditor - replace imperative ref API with onValidationRequest callback pattern for better React 19 compatibility and more idiomatic component design (#6328)
- refactor(webui): ports custom policy generation to cloud (#6461)

### Fixed

- fix(code-scan): remove redundant extra PR comment when no vulnerabilities are found (#6317)
- fix(code-scan): exit with code 0 when no files to scan instead of failing - handles cases where no files are changed, all files are filtered by denylist/size/binary detection, or no patches are found (#6316)
- fix(providers): add universal data URL support for vision models with edge case handling - automatically converts file:// image inputs to data URLs with transparent provider-specific handling (OpenAI/Azure/Ollama use native data URLs, Anthropic/Google extract base64); includes shared dataUrl utility for RFC 2397 parsing, charset/parameter support, whitespace trimming, small image support (≥20 chars), and comprehensive documentation (#5725)
- fix(util): add recursive array processing for tool loading - arrays of file:// tool references now processed correctly with Promise.all() and auto-flattening (#6272)
- fix(webui): prevent horizontal scrolling in metadata table by adding fixed table layout with explicit column widths and proper word-breaking for long content (#6178)
- fix(providers): maintain backwards compatibility for annotations in raw provider responses (#6267)
- fix(cli): restore commandLineOptions support for generateSuggestions, table, and write options (#6190)
- fix(cli): enable auto-sharing when cloud is enabled by not defaulting config.sharing to false - when sharing is unset in config, it now correctly falls through to cloud auto-share behavior instead of defaulting to disabled (#6190)
- fix(providers): propagate agent errors in simulated-user provider - fixes issue where errors from sendMessageToAgent() were silently ignored, causing false-positive test results when the target provider fails (#6251)
- fix(providers): support function providers in defaultTest.options.provider and assertions (#6174)
- fix(assertions): use file-based script output for all assertion types with `file://` references (#6200)
- fix(cli): respect PROMPTFOO_LOG_DIR environment variable for custom log directory location (#6179)

### Documentation

- docs(providers): add comprehensive Anthropic structured outputs documentation covering JSON outputs (`output_format`) and strict tool use (`strict: true`), including usage examples, schema limitations, and feature compatibility (#6226)

### Tests

- test(examples): add structured outputs example demonstrating JSON schema-based responses and strict tool use for Anthropic provider (#6226)
- test(examples): update tool-use example to include strict mode configuration for Anthropic provider (#6226)
- test(examples): enhance structured-outputs-config example to demonstrate multi-provider structured outputs with OpenAI and Anthropic, showcasing syntax differences between providers (#6226)
- test(scripts): add 59 tests for changelog automation scripts covering validation and version update functionality (#6252)

### Dependencies

- fix(deps): bump posthog-node from 5.13.2 to 5.14.0 for sha1-hulud supply-chain attack mitigation (#6349) by @Devdha

## [0.119.11] - 2025-11-23

### Changed

- refactor(webui): adopt React 19 ref-as-prop pattern - removed forwardRef wrapper from QuickFilter component in EvalsDataGrid (#6327)

### Fixed

- fix(redteam): respect excludeTargetOutputFromAgenticAttackGeneration in hydra and meta strategies to prevent target output leaks when organization privacy setting is enabled (#6320)
- fix(redteam): prevent template evaluation of adversarial security payloads when using custom Python providers — adds `skipRenderVars` parameter to `renderPrompt()` to allow SSTI, XSS, and other attack payloads to pass through unmodified to custom providers for proper red team testing instead of causing template rendering errors (#6240)

### Dependencies

- revert: "fix(deps): update dependency @apidevtools/json-schema-ref-parser to v15" (#6300)

## [0.119.10] - 2025-11-23

### Changed

- refactor(webui): migrate to React 19 patterns (#6319)
- chore(webui): replace emoji icons with Material-UI IconButton components in evaluation results page — action icons now display circular hover effects, color-coded active states (green for pass, red for fail), always-visible icons for better discoverability, and full accessibility support with aria-pressed and aria-label attributes (#6318)
- chore: Revert "chore(deps): upgrade cache-manager from v4 to v7" (#6311)
- chore(lint): enforce explicit /index imports in directory paths to prepare for ESM migration (#6263)
- chore(deps): configure Renovate to track all package.json files (#6282)
- chore(webui): improve UI treatment for domain-specific risks in red team setup (#6269)
- chore(deps): re-generate lock file (#6249)
- ci(github): add code scan action (#6261)
- chore: Update Strategy presets (#6275)

### Fixed

- fix(providers): fix LiteLLM provider API key authentication — reverts to inline authentication check to properly handle providers with `apiKeyRequired: false` and fixes Authorization header to be omitted (instead of sending "Bearer undefined") when no API key is set, resolving "API key is not set" error when using LITELLM_API_KEY environment variable (#6322)
- fix(webui): fix Basic strategy checkbox behavior in red team setup — unchecking Basic now correctly adds `enabled: false` instead of removing the strategy, matching documented behavior at [Basic strategy docs](https://www.promptfoo.dev/docs/red-team/strategies/basic/) (#6313)
- fix(code-scan): prevent "start line must precede end line" GitHub API error by ensuring start_line is only set when it differs from line - fixes single-line comment highlighting in PR reviews (#6314)
- fix(app): Test generation tooltips remain visible after dialog is rendered (#6309)
- fix(auth): allow CI environments to authenticate with Promptfoo Cloud using API keys — unblocks `jailbreak:meta` strategy in GitHub Actions by recognizing API key auth regardless of CI status (#6273)
- fix(webui): allow thumbs up/down ratings to toggle off and remove manual grading when clicked again (#6260)
- fix(python): resolve Windows path compatibility issues in Python provider protocol - changed delimiter from `:` to `|` to avoid conflicts with Windows drive letters (C:, D:, etc.), fixing ENOENT errors and timeouts in Python provider on Windows (#6262)

### Documentation

- docs(site): fix broken OpenAI config options link (#6277)
- docs(readme): update readme with code scanning (#6268)
- docs(site): rewrite web viewer page (#6264)
- docs(site): fix duplicate in sidebar (#6259)

### Dependencies

- fix(deps): update dependency better-sqlite3 to v12.4.6 (#6323)
- chore(deps): update @biomejs/biome and all platform-specific CLI packages to 2.3.7 (#6307)
- chore(deps): update vitest monorepo to v4 (major) (#6299)
- chore(deps): update material-ui monorepo to v8 (major) (#6298)
- chore(deps): update dependency whatwg-url to v15 (#6297)
- chore(deps): update dependency recharts to v3 (#6294)
- chore(deps): update dependency react-markdown to v10 (#6293)
- chore(deps): update dependency react-is to v19 (#6292)
- chore(deps): update dependency react-error-boundary to v6 (#6291)
- chore(deps): update dependency gaxios to v7 (#6288)
- chore(deps): drop unused uuid types package (#6287)
- chore(deps): update dependency framer-motion to v12 (#6286)
- chore(deps): update dependency @types/uuid to v11 (#6285)
- chore(deps): update dependency esbuild to v0.27.0 (#6283)
- chore(deps): upgrade http-z to v8 and @swc/core to v1.15.3 (#6281)
- chore(deps): update dependencies in 12 example projects (#6280)
- chore(deps): upgrade glob to v13 and mathjs to v15 (#6279)
- chore(deps): update 67 minor and patch dependencies across all workspaces (#6278)
- chore(deps): bump langchain-core from 0.3.78 to 0.3.80 in /examples/redteam-langchain in the pip group (#6270)
- chore(deps): bump @aws-sdk/client-bedrock-runtime from 3.933.0 to 3.934.0 (#6254)
- chore(deps): bump @anthropic-ai/sdk from 0.69.0 to 0.70.0 (#6255)

## [0.119.9] - 2025-11-20

### Added

- feat(webui): add custom policy generation to red team setup (#6181)
- feat(webui): add strategy test generation to red team setup (#6005)
- feat(webui): add visibility button for PFX passphrase field in red team target configuration (#6258)

### Fixed

- fix(cli): add missing Authorization header in `validate target` command to fix 403 Forbidden error when calling agent helper endpoint (#6274)
- fix(providers): support function providers in defaultTest.options.provider and assertions (#6174)

## [0.119.8] - 2025-11-18

### Added

- feat(plugins): organize domain-specific risks into vertical suites (#6215)
- feat(providers): add Gemini 3 Pro support with thinking configuration (#6241)

### Fixed

- fix(code-scan): in `code-scans run`, don't log anything to stdout except json results when --json is used—fixes GitHub action (#6248)
- fix(code-scan): update default API host to https://api.promptfoo.app to fix websocket connection issues (#6247)

## [0.119.7] - 2025-11-17

### Added

- feat(assertions): add dot product and euclidean distance metrics for similarity assertion - use `similar:dot` and `similar:euclidean` assertion types to match production vector database metrics and support different similarity use cases (#6202)
- feat(webui): expose Hydra strategy configuration (max turns and stateful toggle) in red team setup UI (#6165)
- feat(providers): add GPT-5.1 model support including gpt-5.1, gpt-5.1-mini, gpt-5.1-nano, and gpt-5.1-codex with new 'none' reasoning mode for low-latency interactions and configurable verbosity control (#6208)
- feat(redteam): allow configuring `redteam.frameworks` to limit compliance frameworks surfaced in reports and commands (#6170)
- feat(webui): add layer strategy configuration UI in red team setup with per-step plugin targeting (#6180)
- feat(app): Metadata value autocomplete eval filter (#6176)
- feat(webui): display both total and filtered metrics simultaneously when filters are active, showing "X/Y filtered, Z total" format in evaluation results table for better visibility into filtered vs unfiltered data (#5969)
- feat(app): eval results filters permalinking (#6196)

### Changed

- chore(ci): synchronize package-lock.json to resolve npm ci failures (#6195)
- chore(ci): increase webui test timeout to 8 minutes in GitHub Actions workflow to prevent CI timeouts (#6201)
- chore(redteam): update foundation model report redteam config to use newer redteam strategies (#6216)

### Fixed

- fix: exclude source maps from npm package to reduce bundle size by ~22MB (#6235)
- fix(redteam): exclude cyberseceval and beavertails static dataset plugins from iterative strategies to prevent wasted compute and silent grading failures during Hydra/Meta/Tree iterations (#6230)
- fix(mcp): allow colons in eval ID validation for get_evaluation_details tool - fixes rejection of valid eval IDs returned by list_evaluations (e.g., eval-8h1-2025-11-15T14:17:18) by updating regex to accept ISO timestamp format (#6222)
- fix(site): fix missing background color on safari api reference search modal (#6218)
- fix(redteam): don't set default 'en' language when no language is configured - prevents unnecessary language modifiers from being passed to meta agent and other iterative strategies, keeping prompts focused on actual task without implied translation requirements (#6214)
- fix(app): aligning risk scores with documentation (#6212)
- fix(webui): fix duplicate React key warning in DefaultTestVariables component by implementing counter-based unique ID generation (#6201)
- fix(providers): correctly handle reasoning field in OpenAI-compatible models like gpt-oss-20b, extracting both reasoning and content instead of only reasoning (#6062)
- fix(samples): downlevel pem dependency to supported version
- fix(deps): remove unused dependency on @libsql/client
- fix(redteam): store rendered grading rubric in assertion.value for agentic strategies to display in UI Value column (#6125)

### Tests

- test(webui): suppress expected test error logs (109+ occurrences across parsing errors, API errors, context provider errors) and React/MUI warnings (act() warnings, DOM nesting, prop types) in setupTests.ts and vite.config.ts (#6201)

### Dependencies

- chore(deps): upgrade to React 19 (#6229)
- chore(deps): upgrade @googleapis/sheets from 9.8.0 to 12.0.0 (#6227)
- chore(deps): bump openai from 6.8.1 to 6.9.0 (#6208)

## [0.119.6] - 2025-11-12

### Documentation

- docs(providers): update Vertex AI documentation - removed deprecated models (PaLM/Bison, Claude 3 Opus, Claude 3.5 Sonnet v2), added Claude Sonnet 4.5, added missing Gemini 2.0 models, reorganized model listings by generation (Gemini 2.5/2.0/1.5, Claude 4/3, Llama 4/3.3/3.2/3.1), marked Preview/Experimental models, removed temporal language to make docs evergreen (#3169)

### Changed

- chore(site): remove Koala analytics and migrate Google tracking to Docusaurus built-in gtag configuration with multiple tracking IDs (G-3TS8QLZQ93, G-3YM29CN26E, AW-17347444171) (#6169)
- chore(webui): order 'plugins' before 'steps' in layer strategy YAML to match documentation examples (#6180)

### Fixed

- fix(webui): prevent infinite loop in StrategyConfigDialog useEffect - fixes vitest tests hanging by using stable empty array references for default parameters (#6203)
- fix(webui): require configuration for layer strategy before allowing navigation in red team setup - layer strategy now shows red border and blocks Next button until steps array is configured, similar to plugins requiring configuration
- fix(webui): filter hidden metadata keys from metadata filter dropdown - ensures consistent filtering of 'citations' and '\_promptfooFileMetadata' keys across MetadataPanel, EvalOutputPromptDialog, and metadata filter dropdown (#6177)
- fix(cli): format object and array variables with pretty-printed JSON in console table and HTML outputs for improved readability (#6175)
- fix(cli): only show error counter when >0
- fix(redteam): respect redteam.provider configuration for local grading - fixes issue where configuring a local provider (e.g., ollama:llama3.2) still sent grading requests to remote API instead of using the configured provider (#5959)
- fix: Reverts #6142 (#6189)

### Documentation

- docs(redteam): document Hydra configuration options for max turns, backtracking, and stateful operation (#6165)

## [0.119.5] - 2025-11-10

### Added

- feat(test-cases): add support for Excel files (.xlsx, .xls) as test case sources with optional xlsx dependency and sheet selection syntax (file.xlsx#SheetName or file.xlsx#2) (#4841)
- feat(providers): add OpenAI audio transcription support for whisper-1, gpt-4o-transcribe, gpt-4o-mini-transcribe, and gpt-4o-transcribe-diarize models with speaker identification, timestamp granularities, and per-minute cost tracking (#5957)
- feat(webui): display rendered assertion values with substituted variables in Evaluation tab instead of raw templates, improving readability for assertions with Nunjucks variables and loops (#5988)
- feat(prompts): add executable prompt scripts - use any script/binary to dynamically generate prompts via `exec:` prefix or auto-detection for common extensions (.sh, .bash, .rb, .pl); scripts receive context as JSON (#5329)
- feat(providers): add variable templating support for initialMessages in simulated-user provider, enabling template reuse across test cases with Nunjucks variables (#6143)
- feat(redteam): add `jailbreak:hydra` strategy - multi-turn conversational adversarial agent that learns from target responses and shares learnings across tests in the same scan for improved attack success rates (#6151)
- feat(providers): add missing Alibaba Cloud models - qwen3-vl-flash, qwen3-asr-flash-realtime, qwen3-vl-32b/8b (thinking/instruct), text-embedding-v4 (#6118)
- feat(eval): add 'not_equals' operator for plugin filters (#6155)

### Fixed

- fix(webui): correct multi-target filtering in red team report - statistics now properly filter by selected target instead of showing aggregated data across all targets; replaced modal with Select dropdown for clearer UX (#4251)
- fix(providers): auto-detect reasoning models by deployment name in Azure provider - now recognizes o1, o3, o4, and gpt-5 models and automatically uses `max_completion_tokens` instead of `max_tokens` (#6154)
- fix(prompts): fix basePath resolution for executable prompts with `exec:` prefix - relative paths now resolve correctly (5308c5d)
- fix(prompts): convert sync fs operations to async in executable prompt processor for better performance (5308c5d)
- fix(test-cases): improve xlsx error handling to avoid double-wrapping validation errors, provide clearer error messages for file not found, empty sheets, and invalid data (#4841)
- fix(docs): update xlsx documentation to use consistent version (0.18.5) and correct anchor links (#4841)
- fix(assertions): fix runtime variables not working in custom rubricPrompt for factuality and model-graded-closedqa assertions (#5340)
- fix(openai): fix timeouts on gpt-5-pro models by extending automatic timeout to 10 minutes (#6147)
- fix(deps): add @vitest/coverage-v8@3.2.4 to app workspace to match vitest version and fix coverage reporting "Cannot read properties of undefined (reading 'reportsDirectory')" error
- fix(deps): fix test coverage reporting errors (#6122)
- fix(cli): honor `commandLineOptions` from config file for `maxConcurrency`, `repeat`, `delay`, `cache`, `progressBar`, `generateSuggestions`, `table`, `share`, and `write` — previously ignored in favor of defaults (#6142)

### Changed

- chore(ci): make staging redteam test non-blocking to prevent intermittent API timeouts from failing CI runs (#6159)
- refactor(redteam): update risk score thresholds to match CVSS v3.x/v4.0 standards (Critical: 9.0-10.0, High: 7.0-8.9, Medium: 4.0-6.9, Low: 0.1-3.9) (#6132)
- chore(server): change traces fetch log to debug level (#6152)
- chore(redteam): rename `gradingGuidance` to `graderGuidance` for consistency with `graderExamples` - `gradingGuidance` still works as a deprecated alias for backward compatibility (#6128)

### Documentation

- docs(cli): document `promptfoo view --no` flag in command-line docs (#6067)
- docs(site): add blog post on Anthropic threat intelligence covering PROMPTFLUX and PROMPTSTEAL (first observed LLM-querying malware by Google), AI-orchestrated extortion campaigns, three categories of AI-assisted attacks (operator/builder/enabler), operational security implications, and practical Promptfoo testing examples for AI system exploitation risks (#5583)
- docs(site): re-add adaptive guardrails documentation covering enterprise feature for generating target-specific security policies from red team findings, including architecture, API integration, use cases, troubleshooting, and comparison to AWS Bedrock/Azure AI Content Safety (#5955)
- docs(guides): add comprehensive Portkey integration guide covering prompt management, multi-model testing across 1600+ providers, red-teaming workflows, and production deployment strategies by @ladyofcode (#5730)

### Tests

- test(webui): fix act() warnings and clean up test output by wrapping 16 tests in act(), removing 22 unnecessary console suppression patterns, and reducing setupTests.ts from 95 to 37 lines (#6199)
- test(providers): add test coverage for auto-detection of reasoning models by deployment name in Azure provider (#6154)
- test(assertions): add comprehensive test coverage for rendered assertion value metadata including variable substitution, loops, static text handling, and UI display fallback priority (#6145)

### Dependencies

- chore(deps): update 76 packages to latest minor and patch versions across all workspaces (#6139)

## [0.119.4] - 2025-11-06

### Added

- feat(cli): add `code-scans run` command for scanning code changes for LLM security vulnerabilities including prompt injection, PII exposure, and excessive agency - uses AI agents to trace data flows, analyze vulnerabilities across batches, and suggest fixes with configurable severity thresholds (see https://promptfoo.com/docs/code-scanning/ for more details) (#6121)
- feat(github-action): add Code Scan GitHub Action for automated PR security scanning with GitHub App OIDC authentication or manual API token setup; automatically posts review comments with severity levels and suggested fixes (see https://promptfoo.com/docs/code-scanning/ for more details) (#6121)
- feat(webui): add confirmation dialog and smart navigation for delete eval with improved UX (Material-UI dialog, next→previous→home navigation, loading states, toast notifications) (#6113)
- feat(redteam): pass policy text to intent extraction for custom policy tests, enabling more accurate and self-contained testing objectives that include specific policy requirements (#6116)
- feat(redteam): add timestamp context to all grading rubrics for time-aware evaluation and temporal context in security assessments (#6110)
- feat(model-audit): add revision tracking, content hash generation, and deduplication for model scans to prevent re-scanning unchanged models (saving ~99% time and bandwidth); add `--stream` flag to delete downloaded files immediately after scan ([#6058](https://github.com/promptfoo/promptfoo/pull/6058))
- feat(redteam): add FERPA compliance plugin (#6130)

### Fixed

- fix(redteam): dynamically update crescendo system prompt with currentRound and successFlag each iteration instead of rendering once with stale values (#6133)
- fix(examples): change Zod schema from `.optional()` to `.default('')` for OpenAI Agents SDK compatibility (#6114)
- fix(redteam): pass all gradingContext properties to rubric templates to fix categoryGuidance rendering errors in BeavertailsGrader (#6111)
- fix(webui): custom policy name consistency (#6123)
- fix(docker): resolve @swc/core SIGSEGV on Alpine Linux by upgrading to 1.15.0 and aligning base image with Node 24 (#6127)

## [0.119.2] - 2025-11-03

### Added

- feat(integrations): add Microsoft SharePoint dataset support with certificate-based authentication for importing CSV files (#6080)
- feat(providers): add `initialMessages` support to simulated-user provider for starting conversations from specific states, with support for loading from JSON/YAML files via `file://` syntax (#6090)
- feat(providers): add local config override support for cloud providers - merge local configuration with cloud provider settings for per-eval customization while keeping API keys centralized (#6100)
- feat(providers): add linkedTargetId validation with comprehensive error messages (#6053)
- feat(redteam): add `gradingGuidance` config option for plugin-specific grading rules to reduce false positives by allowing per-plugin evaluation context (#6108)
- feat(webui): add Grading Guidance field to plugin configuration dialogs in open-source UI (#6108)
- feat(webui): add eval copy functionality to duplicate evaluations with all results, configuration, and relationships via UI menu (#6079)
- feat(redteam): add pharmacy plugins (controlled substance compliance, dosage calculation, drug interaction) and insurance plugins (coverage discrimination, network misinformation, PHI disclosure) (#6064)
- feat(redteam): add goal-misalignment plugin for detecting Goodhart's Law vulnerabilities (#6045)
- feat(webui): add jailbreak:meta strategy configuration UI in red team setup with numIterations parameter (#6086)
- feat(redteam): expand OWASP Agentic preset to cover 8/10 threats with 20 plugins; add 'owasp:agentic:redteam' alias for easy selection (#6099)
- feat(redteam): display specific subcategory metrics for harmful plugins (e.g., "Copyright Violations", "Child Exploitation") instead of generic "Harmful" label, enabling granular vulnerability tracking and analysis (#6134)

### Changed

- chore(examples): update openai-agents-basic example from weather to D&D dungeon master with gpt-5-mini, comprehensive D&D 5e tools (dice rolling, character stats, inventory), and maxTurns increased to 20 (#6114)
- refactor(redteam): Prevent early (evaluator-based) exits in Jailbreak, Crescendo, and Custom Strategies (#6047)
- chore(webui): expand language options to 486 ISO 639-2 languages with support for all 687 ISO codes (639-1, 639-2/T, 639-2/B) in red team run settings (#6069)
- chore(app): larger eval selector dialog (#6063)
- refactor(app): Adds useApplyFilterFromMetric hook (#6095)
- refactor(cli): extract duplicated organization context display logic into shared utility function to fix dynamic import issue and improve code maintainability (#6070)

### Fixed

- fix(redteam): max concurrency run options override scan template settings (#6102)
- fix(python): use REQUEST_TIMEOUT_MS for consistent timeout behavior across providers (300s default, previously 120s) (#6098)
- fix(providers): selective env var rendering in provider config with full Nunjucks filter support (preserves runtime variables for per-test customization) (#6091)
- fix(core): handle Nunjucks template variables in URL sanitization to prevent parsing errors when sharing evals; add unit tests covering sanitizer behavior for Nunjucks template URLs (#6089)
- fix(app): Fixes the metric is defined filter (#6082)
- fix(providers): fix Python worker ENOENT errors by ensuring error responses are written before completion signal, improving error messages with function suggestions and fuzzy matching, and removing premature function validation to support embeddings-only and classification-only providers (#6073)
- fix(redteam): improve image strategy text wrapping to handle long lines and prevent overflow (#6066)
- fix(webui): handle plugin generation when target URL is not set (#6055)
- fix(evaluator): force uncached provider calls for repeat iterations (#6043)

### Tests

- test(examples): add 9 D&D test scenarios for openai-agents-basic (combat, stats, inventory, scenes, saves, crits, edge cases, short rest, magic item) (#6114)
- test(providers): add coverage for simulated-user initialMessages (vars/config precedence, file:// loading from JSON/YAML, validation, conversation flow when ending with user role) (#6090)
- test(redteam): add comprehensive tests for `gradingGuidance` feature and `graderExamples` flow-through, including full integration regression tests (#6108)
- test(webui): add tests for gradingGuidance UI in PluginConfigDialog and CustomIntentPluginSection (#6108)
- test(providers): add Python worker regression tests for ENOENT prevention, helpful error messages with function name suggestions, and embeddings-only provider support without call_api function (#6073)

### Documentation

- docs(examples): update openai-agents-basic README for D&D theme with tracing setup and example interactions; shorten openai-agents.md provider documentation (#6114)
- docs(python): update timeout documentation with REQUEST_TIMEOUT_MS environment variable and add retry logic example for handling rate limits (#6098)
- docs(redteam): add comprehensive documentation for `jailbreak:meta` strategy including usage guide, comparison with other jailbreak strategies, and integration into strategy tables (#6088)
- docs(site): add remediation reports documentation (#6083)
- docs(site): add custom strategy to the strategies reference table (#6081)
- docs(site): pricing page updates (#6068)
- docs(site): clarify remote inference in Community edition (#6065)

### Dependencies

- chore(deps): bump the github-actions group with 4 updates (#6092)
- chore(deps): bump @aws-sdk/client-bedrock-runtime from 3.920.0 to 3.921.0 (#6075)
- chore(deps): bump @aws-sdk/client-bedrock-runtime from 3.919.0 to 3.920.0 (#6060)

### Fixed

- fix(redteam): enable layer strategy with multilingual language support; plugins now generate tests in multiple languages even when layer strategy is present (#6084)
- fix(redteam): reduce multilingual deprecation logging noise by moving from warn to debug level (#6084)

## [0.119.1] - 2025-10-29

### Changed

- chore(redteam): categorize `jailbreak:meta` under agentic strategies and mark as remote-only for correct UI grouping and Cloud behavior (#6049)
- chore(redteam): improve support for custom policy metric names that should include strategy suffix (#6048)

### Fixed

- fix(providers): render environment variables in provider config at load time (#6007)
- fix(redteam): validate custom strategy strategyText requirement to prevent confusing errors during test execution (#6046)
- fix(init): include helpful error message and cleanup any directories created when example download fails (#6051)
- fix(providers): removing axios as a runtime dependency in google live provider (#6050)
- fix(csv): handle primitive values directly in red team CSV export to avoid double-quoting strings (#6040)
- fix(csv): fix column count mismatch in red team CSV export when rows have multiple outputs (#6040)
- fix(internals): propagate originalProvider context to all model-graded assertions (#5973)

### Dependencies

- chore(deps): bump better-sqlite3 from 11.10.0 to 12.4.1 for Node.js v24 support (#6052) by @cdolek-twilio
- chore(deps): update Biome version with force-include patterns (`!!`) for faster local linting/CI by @sklein12 (#6042)

## [0.119.0] - 2025-10-27

### Added

- feat(webui): filtering eval results by metric values w/ numeric operators (e.g. EQ, GT, LTE, etc.) (#6011)
- feat(providers): add Python provider persistence for 10-100x performance improvement with persistent worker pools (#5968)
- feat(providers): add OpenAI Agents SDK integration with support for agents, tools, handoffs, and OTLP tracing (#6009)
- feat(providers): add function calling/tool support for Ollama chat provider (#5977)
- feat(providers): add support for Claude Haiku 4.5 (#5937)
- feat(redteam): add `jailbreak:meta` strategy with intelligent meta-agent that builds dynamic attack taxonomy and learns from full attempt history (#6021)
- feat(redteam): add COPPA plugin (#5997)
- feat(redteam): add GDPR preset mappings for red team testing (#5986)
- feat(redteam): add modifiers support to iterative strategies (#5972)
- feat(redteam): add authoritative markup injection strategy (#5961)
- feat(redteam): add wordplay plugin (#5889)
- feat(redteam): add pluginId, strategyId, sessionId, and sessionIds to metadata columns in CSV export (#6016)
- feat(redteam): add subcategory filtering to BeaverTails plugin (a70372f)
- feat(redteam): Add Simba Red Team Agent Strategy (#5795)
- feat(webui): persist inline-defined custom policy names (#5990)
- feat(webui): show target response to generated red team plugin test case (#5869)
- feat(cli): log all errors in a log file and message to the console (#5992)
- feat(cli): add errors to eval progress bar (#5942)
- feat(cache): preserve and display latency measurements when provider responses are cached (#5978)

### Changed

- chore(internals): custom policy type def (#6037)
- chore(changelog): organize and improve Unreleased section with consistent scoping and formatting (#6024)
- refactor(redteam): migrate multilingual from per-strategy config to global language configuration; plugins now generate tests directly in target languages without post-generation translation (#5984)
- chore(cli): show telemetryDisabled/telemetryDebug in `promptfoo debug` output (#6015)
- chore(cli): improve error handling and error logging (#5930)
- chore(cli): revert "feat: Improved error handling in CLI and error logging" (#5939)
- chore(webui): add label column to prompts table (#6002)
- chore(webui): gray out strategies requiring remote generation when disabled (#5985)
- chore(webui): gray out remote plugins when remote generation is disabled (#5970)
- chore(webui): improve test transform modal editor (#5962)
- chore(webui): add readOnly prop to EvalOutputPromptDialog (#5952)
- refactor(webui): organize red team plugins page into tabs with separate components (#5865)
- chore(redteam): remove "LLM Risk Assessment" prefix (#6004)
- chore(redteam): add top-level redteam telemetry events (#5951)
- refactor(webui): reduce unnecessary API health requests (#5979)
- chore(api): export GUARDRAIL_BLOCKED_REASON constant for external use (#5956)
- chore(providers): add rendered request headers to http provider debug output (#5950)
- refactor(transforms): refactor transform code to avoid 'require' (#5943)
- refactor(transforms): refactor createRequest/ResponseTransform functions into separate module (#5925)
- chore(examples): consolidate Ollama examples into unified directory (#5977)
- chore(deps): move dependencies to optional instead of peer (#5948)
- chore(deps): move `natural` to optional dependency (#5946)
- chore(redteam): improve GOAT and Crescendo error logs with additional error details for easier debugging (#6036)

### Fixed

- fix(providers): revert eager template rendering that broke runtime variable substitution (5423f80)
- fix(providers): support environment variables in provider config while preserving runtime variable templates
- fix(providers): improve Python provider reliability with automatic python3/python detection, worker cleanup, request count tracking, and reduced logging noise (#6034)
- fix(providers): simulated-user and mischievous-user now respect assistant system prompts in multi-turn conversations (#6020)
- fix(providers): improve MCP tool schema transformation for OpenAI compatibility (#5965)
- fix(providers): sessionId now properly stored in metadata for providers that use server side generated sessionIds (#6016)
- fix(redteam): don't test session management if target is not stateful (#5989)
- fix(redteam): improve crescendo prompt example alignment with actual objective statements to increase accuracy (#5964)
- fix(redteam): fewer duplicate errors for invalid strategy and plugin ids (#5954)
- fix(fetch): use consistent units in retry counter log messages - now shows attempt count vs total attempts (#6017)
- fix(fetch): include error details in final error message when rate limited (#6019)
- fix(webui): pass extensions config when running eval from UI (#6006)
- fix(webui): in red team setup, reset config button hidden by version banner (#5896)
- fix(webui): sync selected plugins to global config in red team setup UI (#5991)
- fix(webui): HTTP test agent (#6033)
- fix(webui): reset red team strategy config dialog when switching strategies (#6035)

### Dependencies

- chore(deps): bump @aws-sdk/client-bedrock-runtime from 3.914.0 to 3.916.0 (#6008)
- chore(deps): bump @aws-sdk/client-bedrock-runtime from 3.913.0 to 3.914.0 (#5996)
- chore(deps): bump pypdf from 6.0.0 to 6.1.3 in /examples/rag-full (#5998)
- chore(deps): bump @aws-sdk/client-bedrock-runtime from 3.911.0 to 3.913.0 (#5975)
- chore(deps): bump @aws-sdk/client-bedrock-runtime from 3.910.0 to 3.911.0 (#5945)
- chore(deps): bump @anthropic-ai/sdk from 0.65.0 to 0.66.0 (#5944)

### Documentation

- docs(model-audit): improve accuracy and clarity of ModelAudit documentation (#6023)
- docs(contributing): add changelog and GitHub Actions enforcement (#6012)
- docs(redteam): add global language configuration section to red team configuration docs; remove multilingual strategy documentation (#5984)
- docs(providers): add OpenAI Agents provider documentation and example (#6009)
- docs(providers): update AWS Bedrock model access documentation (#5953)
- docs(providers): fix apiKey environment variable syntax across provider docs and examples (#6018)
- docs(providers): add echo provider examples for evaluating logged production outputs (#5941)
- docs(blog): add blog post on RLVR (Reinforcement Learning with Verifiable Rewards) (#5987)
- docs(site): configuring inference (#5983)
- docs(site): update about page (#5971)
- docs(site): add export formats (#5958)
- docs(site): September release notes (#5712)
- docs(site): add red-team claude guidelines (616844d)
- docs(site): remove duplicate links (5aea733)
- docs(examples): add example demonstrating conversation session id management using hooks (#5940)

### Tests

- test(server): add comprehensive unit tests for POST /providers/test route (#6031)
- test(providers): fix flaky latencyMs assertions in TrueFoundry provider tests (#6026)
- test(providers): add unit test verifying assistant system prompt inclusion for simulated-user provider (#6020)
- test(providers): add comprehensive tests for OpenAI Agents provider, loader, and tracing (#6009)
- test(redteam): update strategy and frontend tests for global language configuration migration (#5984)
- test(redteam): remove redteam constants mocks from unit tests (#6010)
- test(webui): add tests for evaluation UI components and hooks (#5981)

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
- chore: bump version 0.118.15 (#5909)

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
- chore: bump version 0.118.13 (#5873)

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
- docs(contributing): add CLAUDE.md context files for Claude Code (#5819)
- docs(blog): safety benchmark blog post (#5781)
- docs(providers): update IBM WatsonX model list (#5838)
- docs(contributing): add warning against using commit --amend and force push (#5840)
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
- chore: bump version 0.118.11 (#5784)
- chore: Add docstrings to `feat/add-latency-to-csv` (#5772)

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

- feat(webui): populate metadata filter keys in results dropdown (#5584)

### Fixed

- fix: improve iterative judge parsing (#5691)
- fix(cli): prevent promptfoo CLI from hanging after commands complete (#5698)
- fix(dev): suppress noisy health check logs during local startup (#5667)
- fix(prompts): tune prompt set to reduce model refusals (#5689)

### Changed

- chore: bump version 0.118.8 (#5699)

### Documentation

- docs(site): publish August release notes (#5625)
- docs(site): document `linkedTargetId` usage for custom provider linking (#5684)

## [0.118.7] - 2025-09-22

### Added

- feat(webui): connect login page to promptfoo auth system (#5685)
- feat: ability to retry errors from cli (#5647)

### Changed

- chore(webui): add 404 page (#5687)
- refactor(webui): Vulnerability Report Table Improvements (#5638)
- chore: bump version 0.118.7 (#5695)
- chore: bump openai from 5.21.0 to 5.22.0 (#5694)
- chore: bump @aws-sdk/client-bedrock-runtime from 3.891.0 to 3.893.0 (#5693)

## [0.118.6] - 2025-09-18

### Tests

- test: network isolation for tests (#5673)

### Dependencies

- chore(deps): upgrade Vite to v7 and fix browser compatibility issues (#5681)

### Documentation

- docs(site): clarify webhook issue meaning (#5679)
- docs(examples): add HTTP provider streaming example (#5648)
- docs(blog): add autonomy and agency in AI article (#5512)

### Added

- feat(redteam): support threshold in custom plugin configuration (#5644)
- feat: upgrade Material UI from v6 to v7 (#5669)
- feat(redteam): Adds support for `metric` field on custom plugins (#5656)
- feat: migrate from MUI Grid to Grid2 across all components (#5578)
- feat: report filters (#5634)
- feat: Add string array support for context-based assertions (#5631)

### Changed

- chore: Exclude node modules and build/dist from biome (#5641)
- chore: improvements to framework compliance cards (#5642)
- chore: improve design of eval download dialog (#5622)
- chore: bump @aws-sdk/client-bedrock-runtime from 3.888.0 to 3.890.0 (#5636)
- chore: bump @aws-sdk/client-bedrock-runtime from 3.890.0 to 3.891.0 (#5649)
- chore: bump openai from 5.20.3 to 5.21.0 (#5651)
- chore: update redteam small model to gpt-4.1-mini-2025-04-14 (#5645)
- chore: reduce coloration on Report View Test Suites table (#5643)
- chore: bump version 0.118.6 (#5655)
- chore(webui): minor style tweaks to datagrid pages for consistency (#5686)
- chore: persistent header on report view (#5678)
- chore(webui): fix z-index on version update banner (#5677)
- refactor(webui): Reports table UX Improvements (#5637)
- ci: revert temporarily disable redteam multi-lingual strategy in integration tests (#5658)
- ci: temporarily disable redteam multi-lingual strategy in integration tests (#5639)
- refactor(redteam): remove dead code and optimize page meta handling (#5672)
- chore: remove accidentally committed site/package-lock.json (#5688)
- chore: Allow overwriting the logger (#5663)
- chore: Update names in workflow (#5659)
- chore: update dependencies to latest compatible versions (#5627)
- chore(internals): Improves support for defining LLM-Rubric assertion threshold in CSV test cases (#5389)

### Fixed

- fix(webui): Filtering eval results on severity (#5632)
- fix(tests): correct TypeScript errors in test files (#5683)
- fix(webui): unify page layout styles (#5682)
- fix: trace visualization circular dependency (#5676)
- fix(webui): re-enable sharing button by default (#5675)
- fix: apply prettier formatting to blog post (#5670)
- fix: Remove global fetch patch (#5665)
- fix(webui): Include description column, if defined, in CSV export of eval results (#5654)
- fix(redteam): add robust fallbacks, partial retries, dedupe, safer logs to multilingual strategy (#5652)
- fix: handle dynamic imports without eval (#5630)
- fix: Catch exception when no vertex projectId is found (#5640)
- fix: spacing on report view (#5646)
- fix: plugin counts flickering (#5635)

## [0.118.5] - 2025-09-16

### Tests

- test: Unit tests for feat: upload csv for custom policies (#5629)
- test: Unit tests for chore: organize EvalOutputPromptDialog and change it to a drawer (#5628)

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
- docs(site): add August 2025 release highlights (#5518)

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

### Added

- feat: migrate MUI Grid to Grid2 across all components (#5435)
- feat: Add open source red team limits (#5230)

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
- chore: bump version 0.118.2 (#5457)

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
- chore: bump version 0.118.1 (#5418)

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
- fix(internals): defaultTest.provider doesn't override (#5348)

## [0.117.9] - 2025-08-22

### Added

- feat(ollama): support for `think` and passthrough parameters (#5341)
- feat: Persist model audit scans (#5308)
- feat: add support for Claude Opus 4.1 (#5183)
- feat: support file:// in http provider `body` (#5321)

### Fixed

- fix(ui): prevent header dropdown collapse on hover (#5355)
- fix(webui): Apply metric filters to eval results via url search params (#5332)
- fix: loaders on all pages (#5339)
- fix(internals): Pass `vars.output` and `vars.rubric` to LLM rubric grading call (#5315)
- fix: resolve TypeScript errors in test files (7992892)
- fix: validation for no target label set (#5318)

### Changed

- chore(webui): add navigation in redteam report from severity table to vulnerabilities table filtered by severity (#5320)
- chore: dropdown menu design consistency (#5328)
- chore: fix build (#5326)
- chore: recursively resolve file:// references in json and yaml prompts (#5215)
- chore(modelAudit): defer auth to modelaudit via environment variable (#5296)
- chore: more share debug info on error (#5266)
- chore: add stack trace to redteam error in web runner (#5319)
- chore: copy for Review page (e957b5c)
- chore: explain why things are disabled on the targets page (#5312)

### Dependencies

- chore: bump @aws-sdk/client-bedrock-runtime from 3.864.0 to 3.872.0 (#5323)
- chore: bump openai from 5.13.1 to 5.15.0 (#5345)
- chore(deps): run npm audit fix dependencies (#5343)
- chore: bump openai from 5.12.2 to 5.13.1 (#5314)

### Documentation

- docs(site): add truncation marker to top-5-open-source-ai-red-teaming-tools-2025 blog post (#5351)
- docs: add writing for promptfoo guidelines to sidebar (#5277)
- docs(site): describe llm-rubric default grading providers (#5350)
- docs: og image updates (#5324)
- docs: red team data flow (#5325)
- docs: modelaudit updates (#5322)
- docs(site): Add GitHub Actions caching optimization tip (#5301)

### Tests

- test: Unit tests for fix: loaders on all pages (#5347)

## [0.117.8] - 2025-08-20

### Tests

- test: Unit tests for fix: loaders on all pages (#5347)

### Fixed

- fix(ui): prevent header dropdown collapse on hover (#5355)
- fix: audit fix dependencies (#5343)
- fix: loaders on all pages (#5339)
- fix(webui): Apply metric filters to eval results via url search params (#5332)
- fix: validation for no target label set (#5318)
- fix(internals): Pass `vars.output` and `vars.rubric` to LLM rubric grading call (#5315)

### Documentation

- docs(site): describe llm-rubric default grading providers (#5350)
- docs: red team data flow (#5325)
- docs: og image updates (#5324)
- docs: modelaudit updates (#5322)
- docs(site): Add GitHub Actions caching optimization tip (#5301)
- docs(site): correct author attribution (#5297)
- docs: add writing for promptfoo guidelines to sidebar (#5277)
- docs(site): add truncation marker to top-5-open-source-ai-red-teaming-tools-2025 blog post (#5351)
- docs(site): update security quiz questions and answers for prompt injection blog (#5302)

### Added

- feat(redteam): make unblock call optional for multi-turn strategies (#5292)
- feat(ollama): support for `think` and passthrough parameters (#5341)
- feat: support file:// in http provider `body` (#5321)
- feat: Persist model audit scans (#5308)
- feat: add support for Claude Opus 4.1 (#5183)

### Changed

- fix: add lru-cache dependency (#5309)
- chore: many plugins and strategies selected warning (#5306)
- chore: add max max concurrency to generate (#5305)
- chore: bump version 0.117.8 (#5311)
- ci: add depcheck (#5310)
- chore: fix build (#5326)
- chore(webui): add navigation in redteam report from severity table to vulnerabilities table filtered by severity (#5320)
- chore: explain why things are disabled on the targets page (#5312)
- chore: bump version 0.117.9 (#5356)
- chore: bump openai from 5.13.1 to 5.15.0 (#5345)
- chore: dropdown menu design consistency (#5328)
- chore: bump @aws-sdk/client-bedrock-runtime from 3.864.0 to 3.872.0 (#5323)
- chore: add stack trace to redteam error in web runner (#5319)
- chore: bump openai from 5.12.2 to 5.13.1 (#5314)
- chore(modelAudit): defer auth to modelaudit via environment variable (#5296)
- chore: more share debug info on error (#5266)
- chore: recursively resolve file:// references in json and yaml prompts (#5215)

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
- chore(csv): improve \_\_metadata warning message and test coverage (#4842)
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

### Tests

- test: add unit test for src/commands/export.ts (#4889)
- test: add unit test for src/commands/upgrade.ts (#4874)
- test: add unit test for src/main.ts (#4873)
- test: add unit test for src/models/eval.ts (#4868)
- test: add unit test for src/assertions/contextRecall.ts (#4859)
- test: add unit test for src/assertions/contextFaithfulness.ts (#4858)
- test: add unit test for src/assertions/contextRelevance.ts (#4857)
- test: add unit test for src/util/xlsx.ts (#4843)
- test: add unit test for src/commands/eval.ts (#4824)

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

### Tests

- test: add unit test for src/redteam/types.ts (#4795)

### Added

- feat(redteam): add support for custom multi-turn strategy by @MrFlounder in #4783
- feat(redteam): expose generate function in redteam namespace by @mldangelo in #4793

### Changed

- chore: bump version 0.116.4 by @MrFlounder in #4805
- chore: rename strategy name from playbook to custom by @MrFlounder in #4798
- refactor: inline MEMORY_POISONING_PLUGIN_ID constant by @mldangelo in #4794
- docs: add doc for custom strategy by @MrFlounder in #4802
- docs: modular configuration management by @typpo in #4763
- refactor: move MULTI_MODAL_STRATEGIES constant (#4801)

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

### Tests

- test: add unit test for src/redteam/providers/advNoise.ts (#4716)
- test: add unit test for src/redteam/strategies/advNoise.ts (#4715)
- test: add unit test for src/redteam/strategies/index.ts (#4714)
- test: add unit test for src/redteam/constants/strategies.ts (#4713)
- test: add unit test for src/providers/openai/image.ts (#4706)
- test: add unit test for src/providers/openai/util.ts (#4705)
- test: add unit test for src/providers/openai/completion.ts (#4703)

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

### Tests

- test: add unit test for src/providers/browser.ts (#4687)
- test: add unit test for src/migrate.ts (#4685)
- test: add unit test for src/commands/debug.ts (#4684)
- test: add unit test for src/esm.ts (#4682)
- test: add unit test for src/constants.ts (#4657)
- test: add comprehensive test coverage for SageMaker provider (#4646)
- test: add unit test for src/providers/shared.ts (#4643)
- test: add unit test for src/redteam/constants/plugins.ts (#4642)
- test: add unit test for src/assertions/counterfactual.ts (#4629)

### Changed

- feat: opentelemetry tracing support (#4600)
- chore: bump version 0.115.4 (#4635)
- chore: remove invariant (#4633)
- chore: update Tusk test runner workflow (#4627)\*
- docs: prevent copy button from overlapping screenshot overlay (#4632)

## [0.115.3] - 2025-06-24

### Tests

- test: add unit test for src/models/eval.ts (#4624)

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

### Tests

- test: add unit test for src/redteam/sharedFrontend.ts (#4608)
- test: add unit test for src/redteam/types.ts (#4607)
- test: add unit test for src/redteam/providers/simulatedUser.ts (#4584)
- test: add unit test for src/redteam/strategies/index.ts (#4583)
- test: add unit test for src/providers/hyperbolic/chat.ts (#4578)
- test: add unit test for src/providers/hyperbolic/image.ts (#4577)
- test: add unit test for src/providers/hyperbolic/audio.ts (#4576)
- test: add unit test for src/redteam/strategies/counterfactual.ts (#4548)
- test: add unit test for src/redteam/strategies/index.ts (#4547)
- test: add unit test for src/redteam/constants/strategies.ts (#4545)
- test: add unit test for src/telemetry.ts (#4543)

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
- chore(docs): fix link to careers page (#4506)
- chore: bump @anthropic-ai/sdk from 0.53.0 to 0.54.0 (#4441)

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
- docs(site): move discovery docs under _Tools_ ([#4408](https://github.com/promptfoo/promptfoo/pull/4408)) by **@typpo**
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
- test: add unit test for src/util/tokenUsage.ts (#4472)
- test: add unit test for src/redteam/extraction/purpose.ts (#4446)
- test: add unit test for src/providers/defaults.ts (#4438)
- test: add unit test for src/providers/mistral.ts (#4437)
- test: add unit test for src/database/index.ts (#4436)
- test: add unit test for src/redteam/plugins/medical/medicalIncorrectKnowledge.ts (#4430)
- test: add unit test for src/redteam/plugins/medical/medicalSycophancy.ts (#4429)
- test: add unit test for src/redteam/plugins/medical/medicalAnchoringBias.ts (#4428)
- test: add unit test for src/redteam/plugins/medical/medicalPrioritizationError.ts (#4427)
- test: add unit test for src/redteam/plugins/medical/medicalHallucination.ts (#4426)
- test: add unit test for src/redteam/plugins/financial/financialComplianceViolation.ts (#4422)
- test: add unit test for src/redteam/plugins/financial/financialDataLeakage.ts (#4421)
- test: add unit test for src/redteam/plugins/financial/financialCalculationError.ts (#4420)
- test: add unit test for src/redteam/plugins/financial/financialSycophancy.ts (#4419)
- test: add unit test for src/redteam/plugins/financial/financialHallucination.ts (#4418)
- test: add unit test for src/redteam/graders.ts (#4417)

## [0.114.7] - 2025-06-06

### Tests

- test: add unit test for src/assertions/python.ts (#4406)
- test: add unit test for src/redteam/plugins/agentic/memoryPoisoning.ts (#4389)
- test: add unit test for src/redteam/plugins/harmful/graders.ts (#4384)
- test: add unit test for src/redteam/graders.ts (#4383)
- test: add unit test for src/server/server.ts (#4380)
- test: add unit test for src/redteam/constants/metadata.ts (#4376)
- test: add unit test for src/redteam/constants/plugins.ts (#4375)
- test: add unit test for src/redteam/constants/frameworks.ts (#4374)
- test: add unit test for src/redteam/constants/strategies.ts (#4373)
- test: add unit test for src/redteam/providers/goat.ts (#4371)

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
- test: add unit test for src/redteam/plugins/eu-ai-act/deepfakeDisclosure.ts (#4342)
- test: add unit test for src/redteam/plugins/eu-ai-act/biometricEmotion.ts (#4341)
- test: add unit test for src/redteam/plugins/eu-ai-act/datasetShift.ts (#4340)
- test: add unit test for src/redteam/plugins/eu-ai-act/lawenforcementBiometricId.ts (#4339)
- test: add unit test for src/redteam/plugins/eu-ai-act/lawenforcementPredictivePolicing.ts (#4338)
- test: add unit test for src/redteam/plugins/eu-ai-act/biometricInference.ts (#4337)
- test: add unit test for src/redteam/plugins/eu-ai-act/explainability.ts (#4336)
- test: add unit test for src/redteam/plugins/eu-ai-act/identityAiDisclosure.ts (#4335)
- test: add unit test for src/redteam/plugins/policy.ts (#4325)
- test: add unit test for src/envars.ts (#4323)

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
- fix: improve logging when inheriting from OpenAiChatCompletionProvider (#4110)

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
- test: add unit test for src/redteam/strategies/mathPrompt.ts (#4316)
- test: add unit test for src/validators/redteam.ts (#4311)
- test: add unit test for src/redteam/plugins/shellInjection.ts (#4305)

## [0.114.3] - 2025-06-02

### Tests

- test: add unit test for src/envars.ts (#4299)

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

### Tests

- test: add unit test for src/redteam/strategies/index.ts (#4267)
- test: add unit test for src/redteam/constants.ts (#4266)
- test: add unit test for src/redteam/types.ts (#4245)
- test: add unit test for src/redteam/util.ts (#4234)
- test: add unit test for src/validators/redteam.ts (#4227)
- test: add unit test for src/redteam/plugins/bola.ts (#4226)
- test: add unit test for src/redteam/plugins/bfla.ts (#4225)
- test: add unit test for src/redteam/providers/goat.ts (#4223)
- test: add unit test for src/util/readline.ts (#4220)

### Added

- feat(redteam): Off-Topic Plugin (#4168)
- feat(redteam): Set a goal for attacks (#4217)

### Changed

- fix: fix border radius on purpose example (#4229)
- fix: resolve env variables in renderVarsInObject (issue #4143) (#4231)
- fix: Check if body is good json before sending warning (#4239)
- chore: bump version 0.114.2 (#4241)
- chore(redteam): handle null goal (#4232)

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
- chore(redteam): add harmful plugin preset to redteam setup ui (#4132)
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
- docs(site): scroll to top when using (#4162)
- docs(site): document missing redteam plugins (#4169)
- docs(site): restore scroll-to-top behavior on page navigation (#4176)

## [0.113.4] - 2025-05-26

### Tests

- test: add unit test for src/commands/canary.ts (#4193)
- test: add unit test for src/canary/index.ts (#4192)
- test: add unit test for src/assertions/sql.ts (#4185)
- test: re-enable sql assertion edge cases (#4184)
- test: add unit test for src/redteam/plugins/intent.ts (#4179)
- test: add unit test for src/redteam/graders.ts (#4173)
- test: add unit test for src/providers/xai/chat.ts (#4172)
- test: add unit test for src/redteam/plugins/offTopic.ts (#4171)
- test: add unit test for src/providers/xai/image.ts (#4170)
- test: add unit test for src/redteam/graders.ts (#4166)
- test: add unit test for src/providers/xai.ts (#4163)
- test: add unit test for src/redteam/constants.ts (#4161)

### Changed

- feat: Server-side pagination, filtering and search for eval results table (#4054)
- feat: add score to pass/fail in CSV and add json download (#4153)
- fix: Run red team from UI without email (#4158)
- chore: bump version 0.113.4 (#4160)
- refactor: unify React import style (#4177)
- refactor: organize xai providers into dedicated folder (#4167)
- refactor: organize bedrock providers into dedicated folder (#4165)

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
- chore(cli/redteam/discover): Small improvements (#4117)

### Dependencies

- chore(deps): update peer dependencies to latest versions (#4125)

## [0.113.1] - 2025-05-21

### Tests

- test: add unit test for src/redteam/plugins/intent.ts (#4114)

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

### Tests

- test: add unit test for src/assertions/llmRubric.ts (#4096)
- test: add unit test for src/telemetry.ts (#4094)

## [0.112.9] - 2025-05-20

### Fixed

- fix: target purpose not making it into redteam config (#4097)

### Changed

- chore: Remove deprecated sharing setups (#4082)
- chore: add vision grading example (#4090)

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

### Tests

- test: add unit test for src/redteam/constants.ts (#4076)
- test: add unit test for src/redteam/strategies/multilingual.ts (#4060)
- test: add unit test for src/redteam/index.ts (#4057)
- test: add unit test for src/providers/openai/util.ts (#4042)
- test: add unit test for src/redteam/providers/offTopic.ts (#4028)
- test: add unit test for src/redteam/plugins/offTopic.ts (#4027)
- test: add unit test for src/redteam/constants.ts (#4026)
- test: add unit test for src/redteam/constants.ts (#4019)

### Added

- feat(redteam): add MCP plugin (#3989)
- feat(redteam): Target Purpose Discovery (#3907)

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
- chore(redteam): add feature flag for purpose discovery agent (#4040)
- chore(cli/redteam/discover): Sets default turn count to 5 (#4035)

### Fixed

- fix(redteam): remove duplicate Datasets section in Plugins component (#4022)
- fix(cli): Discovery bugs (#4032)
- fix: dont bomb redteam if discovery fails (#4029)

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

### Tests

- test: add unit test for src/redteam/constants.ts (#3995)
- test: add unit test for src/redteam/plugins/mcp.ts (#3994)

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

### Tests

- test: add unit test for src/redteam/constants.ts (#3963)
- test: add unit test for src/commands/view.ts (#3928)
- test: add unit test for src/redteam/commands/setup.ts (#3923)
- test: add unit test for src/constants.ts (#3922)
- test: add unit test for src/redteam/commands/report.ts (#3921)
- test: add unit test for src/redteam/types.ts (#3912)

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

### Tests

- test: add unit test for src/util/convertEvalResultsToTable.ts (#3876)
- test: add unit test for src/models/evalResult.ts (#3875)
- test: add unit test for src/types/index.ts (#3874)

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

### Tests

- test: add unit test for src/redteam/constants.ts (#3860)

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

### Tests

- test: add unit test for src/share.ts (#3840)

### Changed

- chore: set telemetry key (#3838)
- chore: improve chunking (#3846)
- chore: bump version 0.112.1 (#3847)

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

### Tests

- test: add unit test for src/providers/mcp/client.ts (#3835)
- test: add unit test for src/providers/mcp/transform.ts (#3834)
- test: add unit test for src/redteam/strategies/simpleVideo.ts (#3822)
- test: add unit test for src/redteam/strategies/index.ts (#3821)
- test: add unit test for src/providers/cerebras.ts (#3819)
- test: add unit test for src/redteam/strategies/otherEncodings.ts (#3817)
- test: add unit test for src/redteam/strategies/index.ts (#3816)
- test: add unit test for src/redteam/strategies/homoglyph.ts (#3812)
- test: add unit test for src/util/file.ts (#3806)
- test: add unit test for src/envars.ts (#3788)

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

### Tests

- test: add unit test for src/providers/defaults.ts (#3757)

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
- feat(openai): add support for o4-mini reasoning model (#3727)

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
- chore: bump version 0.110.1 (#3739)
- refactor: update export syntax for functions (#3734)

### Fixed

- fix(providers): output json rather than string from google live provider by [@abrayne](https://github.com/promptfoo/promptfoo/pull/3703)
- fix(cli): Use correct url for sharing validation by [@will-holley](https://github.com/promptfoo/promptfoo/pull/3710)
- fix(cli/redteam/poison): Write docs to the output dir by [@will-holley](https://github.com/promptfoo/promptfoo/pull/3726)
- fix(evaluator): handle prompt rendering errors gracefully by [@mldangelo](https://github.com/promptfoo/promptfoo/pull/3729)
- fix: stricter test for null or undefined in transform response (#3730)
- fix(evaluator): handle prompt rendering errors gracefully (#3729)

### Documentation

- docs(sharing): add troubleshooting section for upload issues by [@mldangelo](https://github.com/promptfoo/promptfoo/pull/3699)

## [0.110.0] - 2025-04-14

### Tests

- test: add unit test for src/redteam/commands/poison.ts (#3728)
- test: add unit test for src/providers/google/util.ts (#3705)
- test: add unit test for src/app/src/pages/eval/components/TableSettings/hooks/useSettingsState.ts (#3679)

### Added

- feat(assertions): add GLEU metric (#3674)
- feat(providers): add Grok-3 support (#3663)
- feat(providers): add support for AWS Bedrock Knowledge Base (#3576)
- feat(openai): add support for GPT-4.1 model (#3698)
- feat: Change pass rate to ASR and add export (#3694)

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
- chore: easily remove plugins/strats from review page (#3711)
- perf(webui): Reduce memory usage of eval results (#3678)
- chore: bump version 0.110.0 (#3692)
- chore: better parsing (#3732)
- chore: remove moderation assertions from foundation model redteam example (#3725)
- chore: make strategies configurable where applicable (#3722)
- chore(cli): Improve description of Redteam run command (#3720)
- chore(cli): Health check API before running Redteam (#3718)
- chore: bump the npm_and_yarn group with 2 updates (#3714)
- chore(cli): improves robustness of hasEvalBeenShared util (#3709)
- chore: email verification analytics (#3708)
- chore(cli): When sharing, show auth-gate prior to re-share confirmation (#3706)
- chore: bump openai from 4.93.0 to 4.94.0 (#3702)
- chore: expand frameworks section (#3700)
- chore: rename owasp plugin presets (#3695)
- chore(dependencies): update dependencies to latest versions (#3693)

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
- fix(cli/redteam/poison): Write docs to the output dir (#3726)
- fix: settings positioning in strategies view (#3723)
- fix(cli): Use correct url for sharing validation (#3710)
- fix: google is valid function call allow property_ordering field in tool schema (#3704)
- fix(providers): output json rather than string from google live provider (#3703)
- fix: Update prompt extraction to work in more scenarios without providing a prompt (#3697)

### Dependencies

- chore(deps): bump @aws-sdk/client-bedrock-runtime from 3.784.0 to 3.785.0 (#3644)
- chore(deps): bump @aws-sdk/client-bedrock-runtime from 3.785.0 to 3.787.0 (#3670)
- chore(deps): bump openai from 4.92.1 to 4.93.0 (#3643)
- chore(deps): bump vite from 6.2.5 to 6.2.6 in the npm_and_yarn group (#3677)

### Documentation

- docs(nav): add lm security db to nav (#3690)
- docs(blog): add interactive blog on invisible Unicode threats (#3621)
- docs: best-of-n documentation fixes (#3712)
- docs(self-hosting): update self-hosting instructions (#3701)
- docs(sharing): add troubleshooting section for upload issues (#3699)
- docs: add owasp selection image (#3696)

## [0.109.1] - 2025-04-08

### Added

- feat: Eval sharing idempotence (#3608)

### Changed

- chore(schema): make extensions field nullable (#3611)
- chore(webui): add multi-turn tool discovery to UI (#3622)
- chore(scripts): ensure GitHub CLI is installed in preversion (#3614)
- refactor(share): improve formatting of cloud sharing instructions (#3628)
- refactor(tests): consolidate and reorganize test files (#3616)
- chore: bump version 0.109.1 (#3634)
- chore: bump version 0.109.0 (#3613)

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
- test: add unit test for src/commands/share.ts (#3641)
- test: add unit test for src/app/src/pages/eval/components/store.ts (#3635)
- test: add unit test for src/types/index.ts (#3612)

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

### Tests

- test: add unit test for src/providers/lambdalabs.ts (#3602)

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
- Revert "docs(azure): add guidance on configuring DeepSeek models" (#3561)

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

### Tests

- test: add unit test for src/models/eval.ts (#3553)
- test: add unit test for src/prompts/processors/csv.ts (#3543)
- test: add unit test for src/providers/promptfooModel.ts (#3535)

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

- fix(providers): support token counting for every major type of bedrock model (#3506)
- fix(env): add override option to dotenv.config for --env-file support (#3502)

## [0.107.5] - 2025-03-26

### Tests

- test: add unit test for src/providers/openai/index.ts (#3514)
- test: add unit test for src/models/evalResult.ts (#3512)

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

### Tests

- test: add unit test for src/assertions/similar.ts (#3490)
- test: add unit test for src/assertions/rouge.ts (#3489)
- test: add unit test for src/assertions/levenshtein.ts (#3488)
- test: add unit test for src/redteam/graders.ts (#3479)
- test: add unit test for src/logger.ts (#3467)
- test: add unit test for src/redteam/providers/toolDiscoveryMulti.ts (#3450)
- test: add unit test for src/redteam/graders.ts (#3449)
- test: add unit test for src/providers/openai/util.ts (#3441)

### Added

- feat(providers): Added support for OpenAI Responses API (#3440)

### Changed

- chore(dependencies): Bumped OpenAI from 4.87.4 to 4.88.0 (#3436)
- chore(webui): Included error message in toast (#3437)
- chore(providers): Added o1-pro (#3438)
- chore(scripts): Specified repository for postversion PR creation (#3432)
- test: Added unit test for src/evaluatorHelpers.ts (#3430)
- chore: bump version 0.107.4 (#3447)

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

### Tests

- test: add unit test for src/providers/azure/util.ts (#3427)
- test: add unit test for src/providers/azure/warnings.ts (#3426)

### Changed

- chore(providers): improve Azure Assistant integration (#3424)
- chore(providers): add Google multimodal live function callbacks (#3421)
- refactor(providers): split Azure provider into multiple files and update model pricing (#3425)
- docs: add multi-modal redteam example (#3416)
- chore: bump version 0.107.3 (#3431)

### Dependencies

- chore(deps): bump openai from 4.87.3 to 4.87.4 (#3428)

## [0.107.2] - 2025-03-17

### Tests

- test: add unit test for src/redteam/graders.ts (#3423)
- test: add unit test for src/providers/golangCompletion.ts (#3415)

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
- chore: bump version 0.107.2 (#3419)
- revert: "fix(workflow): temporarily disable redteam-custom-enterprise-server job" (#3418)

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

### Tests

- test: add unit test for src/redteam/strategies/iterative.ts (#3400)

### Fixed

- fix(workflow): temporarily disable redteam-custom-enterprise-server job (#3410)

### Changed

- chore: more copying options in EvalOutputPromptDialog (#3379)
- chore: add filter mode (#3387)
- chore(providers): update default Anthropic providers to latest version (#3388)
- chore(auth): improve login text formatting (#3389)
- chore: PROMPTFOO_INSECURE_SSL true by default (#3397)
- chore: bump version 0.107.1 (#3398)
- docs: update redteam examples (#3394)

### Dependencies

- chore(deps): update dependencies to latest stable versions (#3385)

### Documentation

- docs(redteam): remove duplicate plugin entry (#3393)

## [0.107.0] - 2025-03-13

### Tests

- test: add unit test for src/globalConfig/cloud.ts (#3391)
- test: add unit test for src/providers/openai/util.ts (#3384)
- test: add unit test for src/redteam/graders.ts (#3382)

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
- chore: bump version 0.106.2 (#3317)

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

### Tests

- test: add unit test for src/providers/azure/moderation.ts (#3298)
- test: add unit test for src/providers/defaults.ts (#3297)
- test: add unit test for src/providers/defaults.ts (#3294)

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

### Tests

- test: add unit test for src/providers/google.ts (#3284)
- test: add unit test for src/types/index.ts (#3274)

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
- docs: adds deprecation notice for PaLM models (#3172)

### Tests

- test(providers): add unit test for src/providers/openai/image.ts (#3086)
- test(redteam): add unit test for src/redteam/plugins/overreliance.ts (#3093)
- test(core): add unit test for src/table.ts (#3084)
- test: add unit test for src/types/index.ts (#3177)
- test: add unit test for src/types/index.ts (#3144)
- test: add unit test for src/assertions/assertionsResult.ts (#3143)

## [0.104.3] - 2025-02-14

### Tests

- test: add unit test for src/providers/replicate.ts (#3098)

### Changed

- chore(release): bump version to 0.104.3 (#3091)
- refactor(prompts): consolidate prompt processing logic (#3081)
- refactor(utils): move utils to util (#3083)

### Fixed

- fix(testCaseReader): correctly process file:// URLs for YAML files (#3082)

## [0.104.2] - 2025-02-13

### Tests

- test: add unit test for src/validators/redteam.ts (#3074)

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

### Documentation

- docs: improve getting started guide (#3065)

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
- test: add unit test for src/integrations/huggingfaceDatasets.ts (#3064)

## [0.104.0] - 2025-02-06

### Tests

- test: add unit test for src/redteam/util.ts (#3017)

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

### Tests

- test: add unit test for src/redteam/strategies/hex.ts (#2951)

### Added

- feat(redteam): Add a plugin to run redteams against the HarmBench dataset (#2896)
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
- chore: bump version 0.103.19 (#2954)

### Dependencies

- chore(deps): bump various dependencies (#2941)

## [0.103.18] - 2025-01-31

### Tests

- test: add unit test for src/redteam/constants.ts (#2928)
- test: add unit test for src/redteam/strategies/retry.ts (#2927)

### Added

- feat(providers): add Alibaba Model Studio provider (#2908)

### Changed

- fix: added tsx back to dependencies (#2923)
- fix: full rubricPrompt support for json/yaml filetypes (#2931)
- chore(grader): improve false positive detection for religion grader (#2909)
- chore(redteam): upgrade replicate moderation api to Llama Guard 3 (#2904)
- chore(webui): add preset collections for redteam plugins (#2853)
- chore: Move callEval outside of the function so we can re-use it (#2897)
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
- fix: broken docs build (#2937)

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
- test: add unit test for src/providers.ts (#2874)
- test: add unit test for src/redteam/providers/iterative.ts (#2858)
- test: add unit test for src/types/index.ts (#2857)

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
- test: add unit test for src/providers/adaline.gateway.ts (#2834)

## [0.103.13] - 2025-01-21

### Tests

- test: add unit test for src/types/providers.ts (#2766)
- test: add unit test for src/redteam/plugins/competitors.ts (#2764)

### Added

- feat(redteam): Add guardrail option to redteam ui & update transform response (#2688)
- feat: Share chunked results (#2632)

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

### Tests

- test: Add unit test for src/redteam/sharedFrontend.ts (#2690)

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
- chore(providers): automate watsonx provider to fetch model costs dynamically (#2703)
- Revert "test: Add unit test for src/redteam/sharedFrontend.ts" (#2721)

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

### Tests

- test: Add unit test for src/providers.ts (#2671)
- test: Add unit test for src/globalConfig/accounts.ts (#2652)

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
- chore(site): add bio and photo of new team member (#2626)

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
- chore(docs): improve dark mode on redteam configuration (#2553)
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
- docs(redteam): update configuration.md (#2543)

## [0.103.2] - 2024-12-31

### Changed

- feat: run redteam from cloud config (#2503)
- feat: divergent repetition plugin (#2517)
- docs: guardrails ui (#2518)
- feat: granular envars for memory control (#2509)
- fix: use `default` when importing cjs module (#2506)
- docs: readme overhaul (#2502)
- chore(redteam): make numIterations configurable for iterative strategy (#2511)
- chore(webui): enhance styling and responsiveness for StrategyStats component (#2485)
- chore(providers): make number of retry attempts configurable for HTTP provider (#2512)
- chore(providers): add configurable retry attempts for AWS Bedrock. Improve error handling (#2514)
- chore(redteam): handle empty and refusal responses (#2516)
- docs: divergent repetition to plugins table (#2519)

### Fixed

- fix(moderation): handle empty output to avoid false positives (#2508)
- fix(fetch): correct retries logic to ensure at least one attempt (#2513)

## [0.103.1] - 2024-12-24

### Changed

- fix: send config purpose when running in web ui (#2504)
- fix: include `sharing` in generated redteam config (#2505)
- docs: g-eval docs (#2501)

## [0.103.0] - 2024-12-23

### Added

- feat(eval): Add sheet identifier to Google Sheets URL for saving eval results (#2348)
- feat(eval): Add support for Hugging Face datasets (#2497)
- feat(redteam): Ability to set the number of test cases per plugin (#2480)
- feat(redteam): Beavertails plugin (#2500)
- feat(redteam): Best-of-n jailbreak (#2495)
- feat(redteam): Dedicated custom input section (#2493)
- feat(redteam): Harmful:cybercrime:malicious-code (#2481)
- feat(redteam): Recently used plugins (#2488)
- feat(redteam): Support `intent` sequences (#2487)

### Changed

- chore(redteam): Add "View Probes" button (#2492)
- chore(redteam): Enhance metadata tracking for iterative provider (#2482)
- chore(redteam): Improve scoring in iterative providers (#2486)
- chore(redteam): Record stateless telemetry (#2477)
- chore(examples): Revert redteam-ollama example to previous version (#2499)
- docs: Cyberseceval (#2494)
- docs: Plugins overview (#2448)
- docs: Strategy overview (#2449)

### Fixed

- fix(redteam): Ability to set custom target (#2483)
- fix(redteam): Apply delay to redteam providers (#2498)
- fix(redteam): Scroll to top when changing tabs (#2484)
- fix(redteam): State management for raw HTTP requests (#2491)

### Dependencies

- chore(deps): Bump @aws-sdk/client-bedrock-runtime from 3.714.0 to 3.716.0 (#2479)

### Documentation

- docs(providers): Add new providers to documentation (#2496)

## [0.102.4] - 2024-12-20

### Changed

- feat: add G-Eval assertion (#2436)
- feat: ability to set delay from webui (#2474)
- fix: resolve circular reference issue in groq provider (#2475)
- chore: placeholder for ied (#2478)

### Fixed

- fix(provider): ensure system prompt is formatted correctly for amazon nova models (#2476)

### Documentation

- docs(red-team): update default strategy documentation (#2473)

## [0.102.3] - 2024-12-19

### Changed

- feat: pliny plugin (#2469)
- feat: meth plugin (#2470)

### Fixed

- fix(redteam): resolve prompt rendering issue in goat provider (#2472)

### Dependencies

- chore(deps): update dependencies to latest versions (#2442)

## [0.102.2] - 2024-12-19

### Added

- feat(eval): Add metadata filtering to `promptfoo eval` (#2460)
- feat(redteam): Implement `basic` strategy to skip strategy-less tests (#2461)
- feat(redteam): Show messages for multi-turn providers (#2454)
- feat(webui): Add search bar for reports (#2458)

### Changed

- chore(providers): Add new OpenAI O1 model versions (#2450)
- chore(ci): Handle fork PRs without secrets correctly (#2443)
- chore(ci): Update Node.js 22.x matrix configuration (#2444)
- chore(ci): Move workflow assets to .github/assets (#2445)
- chore(redteam): Update target handling for model-based strategies (#2466)
- docs: Update RAG red team details (#2459)

### Fixed

- fix(providers): Fix O1 model detection (#2455)
- fix(redteam): Handle invalid message from GOAT (#2462)
- fix(redteam): Handle null target model responses in GOAT and improve safeJsonStringify (#2465)
- fix(redteam): Improve logging and message handling in Crescendo and GOAT providers (#2467)
- fix(redteam): Properly write target response to iterative (#2447)
- fix(redteam): Skip iterative turn on refusal (#2464)

### Dependencies

- chore(deps): Bump @anthropic-ai/sdk from 0.32.1 to 0.33.1 (#2451)
- chore(deps): Bump @aws-sdk/client-bedrock-runtime from 3.712.0 to 3.714.0 (#2446)
- chore(deps): Bump openai from 4.76.3 to 4.77.0 (#2452)

## [0.102.1] - 2024-12-17

### Added

- feat(redteam): ability to upload intents from csv (#2424)
- feat(redteam): switch to rag example (#2432)

### Changed

- chore(cli): address punycode deprecation warning for Node.js 22 (#2440)
- chore(redteam): format extraction prompts as chat messages (#2429)
- chore(redteam): integration tests (#2413)
- chore(redteam): move plugin collections out of plugin type (#2435)
- chore(redteam): raise timeout on unaligned provider to 60s (#2434)
- chore(redteam): update owasp mappings (#2316)
- chore(redteam): update plugin and strategy display names and descriptions (#2387)
- chore(redteam): minor styling improvements to TestTargetConfiguration (#2430)
- chore(redteam): remove horizontal scroll from redteam setup tabs (#2420)

### Fixed

- fix(redteam): add support for entity merging in config (#2433)
- fix(redteam): combine strategy configs for chained strategies (#2415)
- fix(redteam): don't fall back if entity and purpose extraction fails (#2428)
- fix(redteam): integration test (#2431)
- fix(redteam): make cross-session-leak not default (#2427)
- fix(redteam): remove duplicate `intent` plugin (#2426)
- fix(redteam): dark mode in test targets ui (#2425)
- fix(redteam): resolve invalid DOM nesting of ul elements in Strategies component (#2421)
- fix(evaluator): handle circular references during error logging (#2441)

### Dependencies

- chore(deps): bump @aws-sdk/client-bedrock-runtime from 3.709.0 to 3.712.0 (#2418)
- chore(deps): bump groq-sdk from 0.9.0 to 0.9.1 (#2416)
- chore(deps): bump openai from 4.76.2 to 4.76.3 (#2417)

## [0.102.0] - 2024-12-16

### Added

- feat(redteam): add api healthcheck to redteam generate (#2398)

### Changed

- feat: add raw HTTP request support to Targets UI (#2407)
- feat: add HTTP provider configuration generator (#2409)
- feat: generate http config button (#2411)
- feat: run redteam in web ui (#2025)
- fix: exit codes and tests (#2414)
- docs: add docs for model-graded metrics (#2406)

## [0.101.2] - 2024-12-14

### Added

- feat(webui): implement cloud API health check functionality (#2397)
- feat(webui): redteam attack flow chart (#2389)
- feat(webui): strategy stats drawer (#2388)
- feat(webui): Filter Results view by errors (#2394)

### Changed

- revert: refactor(evaluator): enhance variable resolution and prompt rendering (#2386)
- chore(docker): add version info to docker build (#2401)
- chore(docs): Update README.md (#2391)

### Fixed

- fix(redteam): improve error message for plugin validation (#2395)
- fix(redteam): improve redteam strategy validation with detailed error messages (#2396)
- fix(webui): hide "show failures" checkbox on 1-column evals (#2393)

### Dependencies

- chore(deps): bump openai from 4.76.1 to 4.76.2 (#2390)

## [0.101.1] - 2024-12-13

### Added

- feat(eval): Separate errors from assert failures (#2214)
- feat(eval): Support more than one multi-turn conversation in the same eval with conversationId metadata field (#2360)
- feat: chunk results during share to handle large evals (#2381)

### Changed

- fix: use safeJsonStringify (#2385)
- chore(evaluator): Enhance variable resolution and prompt rendering (#2380)
- chore(ci): Remove outdated package-lock.json after enabling workspaces in package.json (#2377)
- chore(examples): Add Ollama red team example from blog post (#2374)
- Revert "feat: chunk results during share to handle large evals" (#2399)

### Fixed

- fix(cli): Fix punycode deprecation warning (#2384)
- fix(cli): Re-enable validation warning for invalid dereferenced configs (#2373)
- fix(prompts): Restore behavior that delays YAML parsing until after variable substitution (#2383)
- fix(redteam): Support file:// protocol for custom plugins (#2376)
- fix(webui): Use injectVar in redteam report view (#2366)

### Documentation

- docs(configuration): Add documentation for shared variables in tests (#2379)

## [0.101.0] - 2024-12-12

### Added

- feat(eval): Separate errors from assert failures (#2214)
- feat(eval): Support more than one multi-turn conversation in the same eval with conversationId metadata field (#2360)

### Changed

- chore(evaluator): Enhance variable resolution and prompt rendering (#2380)
- chore(ci): Remove outdated package-lock.json after enabling workspaces in package.json (#2377)
- chore(examples): Add Ollama red team example from blog post (#2374)

### Fixed

- fix(cli): Fix punycode deprecation warning (#2384)
- fix(cli): Re-enable validation warning for invalid dereferenced configs (#2373)
- fix(prompts): Restore behavior that delays YAML parsing until after variable substitution (#2383)
- fix(redteam): Support file:// protocol for custom plugins (#2376)
- fix(webui): Use injectVar in redteam report view (#2366)

### Documentation

- docs(configuration): Add documentation for shared variables in tests (#2379)

## [0.100.6] - 2024-12-11

### Changed

- chore: clean up invariant references (#2367)
- chore: invariant (#2363)
- chore(examples): add YAML schema and descriptions to config files (#2358)
- chore(providers): add debugs and make provider invariants more detailed (#2365)
- chore(redteam): add better error logging for multilingual (#2347)
- chore(redteam): add getRemoteGenerationUrl mocks to redteam tests (#2349)
- chore(redteam): Better error messaging for composite jailbreaks (#2372)
- chore(redteam): fix composite jailbreak docs (#2370)
- chore(redteam): respect --delay with redteam providers (#2369)
- chore(webui): add "save YAML" option to Save Config dialog (#2356)
- chore(webui): enhance redteam preset cards layout and styling (#2353)

### Fixed

- fix(providers): add regional model support to Bedrock (#2354)
- fix(webui): redteam setup UI should support request body objects (#2355)
- fix(providers): use Replicate moderation provider when OpenAI key not present (#2346)

### Dependencies

- chore(deps): bump @aws-sdk/client-bedrock-runtime from 3.706.0 to 3.709.0 (#2362)
- chore(deps): bump openai from 4.76.0 to 4.76.1 (#2361)
- chore(deps): update dependencies (#2350)

### Documentation

- docs(blog): new post on the EU AI Act (#2357)
- docs(redteam): Update documentation to suggest a detailed purpose (#2345)
- docs(troubleshooting): replace auto-generated index with custom overview (#2352)

## [0.100.5] - 2024-12-09

### Changed

- feat: Show current redteam and save state by @sklein12 in [#2336](https://github.com/promptfoo/promptfoo/pull/2336)
- fix: Our task API responds with a JSON object by @sklein12 in [#2337](https://github.com/promptfoo/promptfoo/pull/2337)
- fix: Attempt to fix metrics after share to self-hosted by @GICodeWarrior in [#2338](https://github.com/promptfoo/promptfoo/pull/2338)
- fix: Merge `defaultTest.vars` before applying `transformVars` by @mldangelo in [#2339](https://github.com/promptfoo/promptfoo/pull/2339)
- fix: Catch errors on purpose extraction and continue by @sklein12 in [#2344](https://github.com/promptfoo/promptfoo/pull/2344)
- chore: Allow overriding default and redteam providers globally by @sklein12 in [#2333](https://github.com/promptfoo/promptfoo/pull/2333)
- chore(providers): Align `transformRequest` with `transformResponse` behavior by @mldangelo in [#2334](https://github.com/promptfoo/promptfoo/pull/2334)
- chore: Update Node.js to v20.18.1 by @mldangelo in [#2342](https://github.com/promptfoo/promptfoo/pull/2342)
- chore: Add support for multiple Google Sheets in `promptfooconfig` by @mldangelo in [#2343](https://github.com/promptfoo/promptfoo/pull/2343)

## [0.100.4] - 2024-12-08

### Changed

- feat: "try example" in target configuration (#2335)
- chore(webui): add a reset config button (#2328)
- chore(redteam): add comments and schema to generated yaml (#2329)
- chore(webui): add select all/none for all plugins (#2326)
- chore: automate CITATION.cff version bump. Sort npm scripts (#2320)
- docs: Fix docs to reflect non-root docker user (#2324)

### Fixed

- fix(cli): recommend npx if necessary (#2325)
- fix(providers): use prompt config for structured outputs in azure (#2331)
- fix(redteam): Use cloud api for remote harmful generation (#2323)
- fix(webui): redteam bug where purpose was using old state (#2330)
- fix(webui): redteam config persist between refreshes (#2327)

### Dependencies

- chore(deps): bump openai from 4.75.0 to 4.76.0 (#2321)

## [0.100.3] - 2024-12-06

### Changed

- chore(providers): improve JSON schema support for openai azure (#2318)

### Dependencies

- chore(deps): bump the npm_and_yarn group with 2 updates (#2317)

### Documentation

- docs(aws-bedrock): add Nova model documentation and update examples (#2319)
- docs(multilingual): add language code references (#2311)

## [0.100.2] - 2024-12-06

### Added

- feat: multiline editor for http request body (#2314) by @typpo

### Fixed

- fix(redteam): Do not fail crescendo if the provider sends the wrong response (#2315) by @sklein12
- fix: remove log line (c539341)

## [0.100.1] - 2024-12-05

### Added

- feat(redteam): Multilingual generates test cases across all strats (#2313) by @sklein12

### Fixed

- fix(redteam): preserve assertion types in multilingual strategy (#2312) by @mldangelo

### Changed

- chore(redteam): Improve purpose output (779a8d4)
- chore: re-reorder target setup page (7dd11ae)
- chore: copy (158d841)
- ci: increase Docker workflow timeout to 60 minutes (414db79)

### Dependencies

- chore(deps): update multiple package dependencies (#2308) by @mldangelo

### Documentation

- docs: fix multilingual (e78e77d)

## [0.100.0] - 2024-12-05

### Added

- feat(providers): Add Amazon Nova models to Bedrock provider (#2300)
- feat(providers): Support TypeScript custom providers (#2285)
- feat(providers): Add transformRequest to HTTP provider. Rename responseParser to transformResponse (#2228)
- feat(cli): Add configurable CSV delimiter support (#2294)
- feat(redteam): Load `intents` plugin from file (#2283)
- feat(webui): Ability to configure strategies in redteam setup (#2304)
- feat(webui): Ability to upload YAML file to setup view (#2297)
- feat(webui): Column selector (#2288)

### Changed

- chore(webui): Add YAML preview and strategies to redteamReview page (#2305)
- chore(prompts): TypeScript for prompt functions (#2287)
- chore(webui): Display # selected plugins in accordion text (#2298)
- chore(redteam): Remote generation if logged into cloud (#2286)
- chore(cli): Write `promptfoo-errors.log` on error (#2303)
- chore(cli): Improve error message when attempting to share incomplete eval (#2301)
- chore(redteam): Fix stateless warning (#2282)
- chore(redteam): Plugin page UX (#2299)
- chore(webui): Display average cost alongside total (#2274)
- chore(webui): Remove prompt from redteam setup purpose page (#2295)
- docs: Guide on LangChain PromptTemplates (#2235)

### Fixed

- fix(redteam): Do not store config hash if redteam generation failed (#2296)
- fix(webui): Minor bugs in redteam config UI (#2278)
- fix(cli): Replace process.exitCode with process.exit calls in share command (#2307)

### Dependencies

- chore(deps): Bump @aws-sdk/client-bedrock-runtime from 3.699.0 to 3.704.0 (#2279)
- chore(deps): Bump @aws-sdk/client-bedrock-runtime from 3.704.0 to 3.705.0 (#2290)
- chore(deps): Bump groq-sdk from 0.8.0 to 0.9.0 (#2291)
- chore(deps): Bump openai from 4.73.1 to 4.74.0 (#2280)
- chore(deps): Bump openai from 4.74.0 to 4.75.0 (#2289)

### Documentation

- docs(examples): Add redteam chatbot example (#2306)

## [0.99.1] - 2024-12-02

### Changed

- chore(docs): update --config YAML file references to match actual behavior (#2170)
- chore(providers): add \*-latest models for Anthropic (#2262)
- chore(providers): remove optional chaining in goat provider (#2253)
- chore(redteam): ability to override severity (#2260)
- chore(redteam): improve hijacking grader (#2251)
- chore(redteam): improve overreliance grader (#2246)
- chore(redteam): improve politics grader (#2258)
- chore(redteam): move harmful specialized advice plugin to unaligned provider (#2239)
- chore(redteam): move misinformation plugin from aligned to unaligned provider (#2232)
- chore(redteam): shell injection grader improvement (25%) (#2277)
- chore(redteam): update policy grader (#2244)
- chore(site): improve architecture diagram dark mode (#2254)
- chore(site): move careers link (#2242)
- chore(tests): remove console.error debug statement (#2275)
- chore(types): add Zod schema for assertion types (#2276)
- chore(webui): ability to set image min/max height (#2268)
- chore(webui): add metric column in assertions table (#2238)
- chore(webui): add pointer cursor to report view (#2272)
- chore(webui): add support for custom targets to redteam setup (#2215)
- chore(webui): combine assertion context to eval output comment dialog (#2240)
- chore(webui): improve back and next buttons for purpose/targets pages (#2269)
- chore(webui): minor improvements to redteam setup strategy and plugin selection (#2247)
- chore(webui): only show action buttons for the currently hovered cell, rather than both cells for that row (#2270)
- chore(webui): preserve whitespace in TableCommentDialog (#2237)
- chore(webui): prevent dialog from popping up repeatedly when component rerenders (#2273)
- chore(webui): remove local dashboard (#2261)
- chore(webui): select all/none in redteam setup plugins view (#2241)
- docs: GitLab integration (#2234)

### Fixed

- fix(cli): improve debugging for fetchWithRetries (#2233)
- fix(cli): refuse to share incomplete evals (#2259)
- fix(webui): support sorting on pass/fail count & raw score (#2271)
- fix(redteam): stringify non-string target provider responses in goat (#2252)

### Dependencies

- chore(deps): bump openai from 4.73.0 to 4.73.1 (#2243)
- chore(deps): sync dependency versions with promptfoo cloud (#2256)
- chore(deps): update dependencies (#2257)
- chore(deps): update lock file for yanked dependency (#2250)

## [0.99.0] - 2024-11-25

### Added

- feat(cli): `promptfoo debug` command (#2220)
- feat(eval): Read variables from PDF (#2218)
- feat(providers): Add `sequence` provider (#2217)
- feat(redteam): Citation strategy (#2223)
- feat(redteam): Composite jailbreak strategy (#2227)
- feat(redteam): Ability to limit strategies to specific plugins (#2222)

### Changed

- chore(redteam): Attempt to reuse existing server for redteam init (#2210)
- chore(redteam): Naive GOAT error handling (#2213)
- chore(redteam): Improve competitors plugin and grading (#2208)

### Fixed

- fix(eval): CSV BOM parsing (#2230)
- fix(redteam): Add missing entities field to redteam schema (#2226)
- fix(redteam): Ensure numTests is properly inherited in config for all plugin types (#2229)
- fix(redteam): Strip prompt asterisks (#2212)
- fix(redteam): Validate plugins before starting (#2219)

### Dependencies

- chore(deps): Bump @aws-sdk/client-bedrock-runtime from 3.696.0 to 3.699.0 (#2231)

### Documentation

- docs(redteam): Ollama redteam blog (#2221)
- docs(redteam): Add troubleshooting documentation (#2211)

## [0.98.0] - 2024-11-22

### Added

- feat(providers): Maintain session-id in HTTP provider (#2101)
- feat(redteam): Add custom strategy (#2166)
- feat(webui): Add CSV download to report view (#2168)
- feat(webui): Add image preview lightbox for base64 image strings (#2194)

### Changed

- chore(providers): Add GPT-4-0-2024-11-20 to supported models (#2203)
- chore(providers): Add support for UUID in transformVars (#2204)
- chore(cli): Display help for invalid args (#2196)
- chore(redteam): Add `promptfoo redteam setup` (#2172)
- chore(redteam): Init now opens web setup UI (#2191)
- chore(redteam): Update purpose UI to capture better information (#2180)
- chore(redteam): Instrument redteam setup (#2193)
- chore(redteam): Remove OpenAI key requirement in onboarding (#2187)
- chore(redteam): Remove overreliance from default (#2201)
- chore(redteam): Remove redundant harmful plugin when all subcategories are selected (#2206)
- chore(redteam): Reorganize plugins in setup (#2173)
- chore(redteam): Session parsing in UI (#2192)
- chore(redteam): Update docs for multi-turn strategies (#2182)
- chore(redteam): Update redteam init instructions (#2190)
- chore(redteam): Wrap more system purpose tags (#2202)
- chore(redteam): Wrap purposes in <Purpose> tags (#2175)

### Fixed

- fix(prompts): Parse YAML files into JSON before Nunjucks template render (#2205)
- fix(providers): Handle more response parser failures in HTTP provider (#2200)
- fix(redteam): Attempt to fix undefined redteam testcase bug (#2186)
- fix(redteam): Debug access plugin grader improvement (#2178)
- fix(redteam): Handle missing prompts in indirect prompt injection setup (#2199)
- fix(redteam): Pass isRedteam from eval database model (#2171)
- fix(webui): Handle division by zero cases in CustomMetrics component (#2195)

### Dependencies

- chore(deps): Bump @aws-sdk/client-bedrock-runtime from 3.693.0 to 3.696.0 (#2176)
- chore(deps): Update dependencies - resolve lock file issue (#2179)
- chore(deps): Update dependencies (#2169)

### Documentation

- docs(examples): Add F-score example (#2198)
- docs(examples): Modernize image classification example (#2197)
- docs(site): Add red team Hugging Face model guide (#2181)
- docs(site): Use `https` id with `url` config (#2189)

## [0.97.0] - 2024-11-18

### Added

- feat(azure): adding AzureCliCredential as a fallback authentication option (#2149)

### Changed

- feat: report shows % framework compliance as progress bar (#2160)
- feat: support for grader fewshot examples (#2162)
- feat: add support for bedrock guardrails (#2163)
- fix: crescendo feedback (#2145)
- fix: handle null test cases in strategy generation (#2146)
- refactor(redteam): extract parseGeneratedPrompts from redteam base class (#2155)
- refactor(redteam): modularize and simplify harmful plugin (#2154)
- chore: bump @aws-sdk/client-bedrock-runtime from 3.691.0 to 3.693.0 (#2147)
- chore: bump @eslint/plugin-kit from 0.2.0 to 0.2.3 in the npm_and_yarn group (#2151)
- chore: track token usage for redteam providers (#2150)
- chore(providers): misc harmful completion provider enhancements (#2153)
- chore: display strategy used in report view (#2156)
- chore: open result details in report view (#2159)
- chore: add # requests to token usage (#2158)
- chore: set redteamFinalPrompt in goat provider (#2161)
- chore(redteam): refactor harmful plugin into aligned and unaligned modules (#2164)
- chore(redteam): refactor unaligned inference API response handling (#2167)

### Fixed

- fix(share): update eval author to logged-in user when sharing (#2165)

## [0.96.2] - 2024-11-14

### Added

- feat(redteam): redteam fewshot overrides (#2138)
- feat(cli): make README.md file during onboarding init flow optional (#2054)

### Changed

- feat: helm chart for self hosted (#2003)

### Fixed

- fix(cli): remove validation warning on yaml files (#2137)
- fix(providers): handle system messages correctly for bedrock Claude models (#2141)
- fix(redteam): Config for all strategies (#2126)
- fix(webui): potential divide by 0s (#2135)
- fix(webui): restore token usage display (#2143)

### Dependencies

- chore(deps): clean up plugin action params (#2139)
- chore(deps): bump @aws-sdk/client-bedrock-runtime from 3.687.0 to 3.691.0 (#2140)
- chore(deps): update dependencies (#2133)

## [0.96.1] - 2024-11-12

### Added

- feat(ui): Respect max text length in Markdown cells (#2109)

### Changed

- chore(assertions): split assertions into separate modules (#2116)\* chore(blog): update API endpoint to canonical domain by @mldangelo in https://github.com/promptfoo/promptfoo/pull/2119
- chore(cli): add promptfoo version header to all requests (#2121)
- chore(redteam): allow goat to be used stateless or not (#2102)
- chore(redteam): Break out Prompt Metrics Types (#2120)
- chore(redteam): re-organize report categories (#2127)
- chore(docs): Fix AWS default region to match documentation (#2117)

### Fixed

- fix(cli): validate config after dereferencing (#2129)
- fix(providers): handle system messages correctly in anthropic parseMessages (#2128)

### Dependencies

- chore(deps): bump groq-sdk from 0.7.0 to 0.8.0 (#2131)
- chore(deps): update multiple dependencies (#2118)

## [0.96.0] - 2024-11-10

### Added

- feat(redteam): intent plugin (#2072)
- feat(redteam): rag poisoning plugin (#2078)
- feat(cli): --filter-sample on eval to randomly sample (#2115)
- feat(providers): azure default provider (#2107)
- feat(assertions): BLEU score (#2081)

### Changed

- chore(assertions): refactor JSON assertions (#2098)
- chore(assertions): split assertions into separate files (#2089)
- chore(cli): add --ids-only to list commands (#2076)
- chore(cli): lazily init csv assertion regex (#2111)
- chore(cli): validate json, yaml, js configs on load (#2114)
- chore(lint): format lint (#2082)
- chore(providers): add envar support for azure auth (#2106)
- chore(providers): add support for Claude 3.5 Haiku model (#2066)
- chore(providers): add support for external response_format in azure openai (#2092)
- chore(providers): azureopenai -> azure (#2113)
- chore(providers): Support AWS sessionToken and profile for authentication (#2085)
- chore(redteam): improve rbac grader (#2067)
- chore(redteam): pass context and options to target in iterativeTree provider (#2093)
- chore(redteam): Use purpose in graders (#2077)
- chore(webui): prevent unnecessary state resets in plugin configuration in redteam ui (#2071)
- chore: add yaml config validation tests (#2070)
- chore(docs): goat-blog demo component usability improvements (#2095)
- docs: use "provider" key in python prompt function (#2103)
- docs: add GOAT blog post (#2068)
- chore(blog): update API endpoint to canonical domain (#2119)

### Fixed

- fix(cli): keep eval id on `import` (#2112)
- fix(providers): portkey provider and headers (#2088)
- fix(redteam): provide target context (#2090)
- fix(providers): ensure consistent message parsing for Anthropic Claude Vision (#2069)
- fix(redteam): make remote generation URL dynamic to support dotenv loading (#2086)

### Dependencies

- chore(deps): bump @anthropic-ai/sdk from 0.31.0 to 0.32.0 (#2074)
- chore(deps): bump @anthropic-ai/sdk from 0.32.0 to 0.32.1 (#2083)
- chore(deps): bump @aws-sdk/client-bedrock-runtime from 3.686.0 to 3.687.0 (#2104)
- chore(deps): bump openai from 4.70.2 to 4.71.0 (#2073)
- chore(deps): bump openai from 4.71.0 to 4.71.1 (#2087)

## [0.95.0] - 2024-11-04

### Added

- **feat(redteam):** goat (#2006)
- **feat(webui):** add support for file providers in eval creation view via file upload by @mldangelo in https://github.com/promptfoo/promptfoo/pull/2055
- feat(webui): add support for file providers in eval creation view via file upload (#2055)

### Changed

- **feat:** save and load configs (#2044)
- **feat:** index page for report view (#2048)
- **fix:** competitors grader (#2042)
- **fix:** llm rubric markup (#2043)
- **fix:** OOM on large evals (#2049)
- **chore:** migrate rag-full example to langchain 0.3.0 (#2041)
- **chore:** add some loaders to webui pages (#2050)
- **chore(providers):** add bedrock regional inference profile IDs (#2058)
- **chore(webui):** optimize custom policy handling (#2061)
- **chore:** bump @anthropic-ai/sdk from 0.30.1 to 0.31.0 (#2062)
- **chore:** bump openai from 4.69.0 to 4.70.2 (#2063)

### Fixed

- **fix(webui):** preserve target label when switching target types (#2060)

### Dependencies

- **chore(deps):** bump langchain from 0.2.10 to 0.3.0 in /examples/rag-full (#2040)
- **chore(deps):** bump openai from 4.68.4 to 4.69.0 (#2045)
- **chore(deps):** update patch and minor dependencies (#2064)

## [0.94.6] - 2024-10-30

### Added

- feat(webui): make table header sticky (#2001)

### Changed

- feat: `promptfoo auth whoami` (#2034)
- fix: minor redteam run fixes (#2033)
- fix: report issue counts (#2037)
- fix: Integration backlink to portkey docs (#2039)
- chore: add provider to assertion function context (#2036)
- chore: add `--verbose` to redteam run (#2032)
- chore(deps-dev): bump @aws-sdk/client-bedrock-runtime from 3.679.0 to 3.682.0 (#2038)

### Dependencies

- chore(deps): bump elliptic from 6.5.7 to 6.6.0 in /src/app (#2031)
- chore(deps): bump langchain from 0.1.14 to 0.3.0 in /examples/langchain-python (#2035)

## [0.94.5] - 2024-10-28

### Changed

- fix: bump version on fetch cache key (#2029)
- fix: support browser back/forward in redteam setup (#2022)
- chore: improve ui for plugin configs (#2024)
- chore(webui): improve redteam plugin configuration UI (#2028)
- chore: Add Missing Statuses to Risk Categories (#2030)

### Fixed

- fix(ci): add disk space cleanup steps to prevent runner failures (#2018)
- fix(redteam): auto-extract injectVar from prompt template in redteam image provider (#2021)
- fix(providers): adjust bedrock anthropic default temperature (#2027)
- fix(webui): hide redteam setup dialog after seen (#2023)

### Documentation

- docs(provider): fix dalle-3 provider name (#2020)

## [0.94.4] - 2024-10-27

### Added

- **Feature:** Add simulated user provider ([#2014](https://github.com/promptfoo/promptfoo/pull/2014) by [@typpo](https://github.com/typpo))

### Changed

- **Fix:** Handle basic auth credentials in fetch requests ([#2013](https://github.com/promptfoo/promptfoo/pull/2013) by [@mldangelo](https://github.com/mldangelo))
- **Chore:** Add configuration option to disable template environment variables ([#2017](https://github.com/promptfoo/promptfoo/pull/2017) by [@mldangelo](https://github.com/mldangelo))
- **Chore (Redteam):** Improve onboarding CLI plugin configuration handling ([#2015](https://github.com/promptfoo/promptfoo/pull/2015) by [@mldangelo](https://github.com/mldangelo))

## [0.94.3] - 2024-10-26

### Changed

- feat: package import support improvements (#1995)
- feat: add adaline gateway provider (#1980)
- fix: template creation for `promptfoo init` and `promptfoo redteam init`
- chore(providers): merge prompt and provider config in azure (#2011)

## [0.94.2] - 2024-10-25

### Added

- feat(browser): `optional` arg on `click` commands (#1997)

### Changed

- feat: add browser support in redteam setup (#1998)
- fix: test case descriptions (#2000)
- fix: Http Provider parser (#1994)
- chore: save user consent when logged in via webui (#1999)
- chore: Constants are lower case (#2007)
- style(eslint): add sort-keys rule and sort type constituents (#2008)
- chore(redteam): alphabetize and normalize ordering of constants (#2002)
- revert: style(eslint): add sort-keys rule and sort type constituents (#2009)

## [0.94.1] - 2024-10-24

### Added

- **feat(schema):** Add YAML schema validation to config files by [@mldangelo](https://github.com/mldangelo) in [#1990](https://github.com/promptfoo/promptfoo/pull/1990)

### Changed

- **chore:** Don't run Docker as root by [@typpo](https://github.com/typpo) in [#1884](https://github.com/promptfoo/promptfoo/pull/1884)
- **chore(webui):** Move Snackbar out of component for reuse by [@sklein12](https://github.com/sklein12) in [#1989](https://github.com/promptfoo/promptfoo/pull/1989)
- **chore(redteam):** Send version to remote endpoint by [@typpo](https://github.com/typpo) in [#1982](https://github.com/promptfoo/promptfoo/pull/1982)
- **refactor(tests):** Reorganize test files into subdirectories by [@mldangelo](https://github.com/mldangelo) in [#1984](https://github.com/promptfoo/promptfoo/pull/1984)
- site: additional landing page (#1996)

### Fixed

- **fix(providers):** Better OpenAI rate limit handling by [@typpo](https://github.com/typpo) in [#1981](https://github.com/promptfoo/promptfoo/pull/1981)
- **fix(providers):** Refusals are not failures by [@typpo](https://github.com/typpo) in [#1991](https://github.com/promptfoo/promptfoo/pull/1991)
- **fix(redteam):** Better error handling in strategies by [@typpo](https://github.com/typpo) in [#1983](https://github.com/promptfoo/promptfoo/pull/1983)
- **fix(redteam):** Better error on remote plugins when remote is disabled by [@typpo](https://github.com/typpo) in [#1979](https://github.com/promptfoo/promptfoo/pull/1979)
- fix: prompt validation (#1993)

### Dependencies

- **chore(deps):** Bump @aws-sdk/client-bedrock-runtime from 3.677.0 to 3.678.0 by [@dependabot](https://github.com/dependabot) in [#1987](https://github.com/promptfoo/promptfoo/pull/1987)
- **chore(deps):** Bump @anthropic-ai/sdk from 0.30.0 to 0.30.1 by [@dependabot](https://github.com/dependabot) in [#1986](https://github.com/promptfoo/promptfoo/pull/1986)
- **chore(deps):** Bump OpenAI from 4.68.2 to 4.68.4 by [@dependabot](https://github.com/dependabot) in [#1985](https://github.com/promptfoo/promptfoo/pull/1985)

## [0.94.0] - 2024-10-23

### Added

- feat(providers): add support for `github` provider (#1927)
- feat(providers): add support for xAI (Grok) provider (#1967)
- feat(providers): Update HTTP Provider to support any type of request (#1920)
- feat(prompts): add context to python and javascript prompts (#1974)
- feat(webui): add ability to update eval author (#1951)
- feat(webui): add login page (#1964)
- feat(webui): add support for displaying base64-encoded images (#1937)
- feat(cli): allow referencing specific gsheet (#1942)
- feat(redteam): show passes and fails in report drawer (#1972)

### Changed

- chore(cli): disable database logging by default (#1953)
- chore(cli): move db migrations up (#1975)
- chore(cli): replace node-fetch with native fetch API (#1968)
- chore(cli): warn on unsupported test format (#1945)
- chore(providers): support AWS credentials in config file for bedrock provider (#1936)
- chore(providers): support response_format in prompt config in openai provider (#1966)
- chore(providers): update Claude 3.5 model version (#1973)
- chore(providers): update implementation of togetherAI provider (#1934)
- chore(redteam): Add redteam descriptions and display names (#1962)
- chore(redteam): Better typing for the new constants (#1965)
- chore(redteam): fix typing issue, don't return in route (#1933)
- chore(redteam): move all redteam constants to one spot (#1952)
- chore(redteam): remove providers from db (#1955)
- chore(redteam): update providers to id by id or label (#1924)
- chore(redteam): Use Provider Label as Unique ID for redteam targets (#1938)
- chore(webui): add user email management endpoints (#1949)
- chore(webui): create dedicated eval router (#1948)
- chore(webui): expose redteam init ui in navigation dropdown menu (#1926)
- chore(webui): improve max text length slider (#1939)
- chore(webui): optimize Material-UI imports for better tree-shaking (#1928)
- chore(webui): optionally record anonymous telemetry (#1940)
- chore(webui): resolve fast refresh warning by separating useToast hook (#1941)
- refactor(assertions): move utility functions to separate file (#1944)
- chore: add citation generation script and update CITATION.cff (#1914)

### Fixed

- fix(cli): add metadata to EvaluateResult model (#1978)
- fix(cli): check for python3 alias (#1971)
- fix(cli): cli properly watches all types of configs (#1929)
- fix(cli): resolve deep copy issue when using grader cli arg (#1943)
- fix(eval): set author from getUserEmail when creating Eval (#1950)
- fix(providers): improve Gemini format coercion and add tests (#1925)
- fix(providers): maybeCoerceToGeminiFormat in palm provider - parse system_instruction (#1947)

### Dependencies

- chore(deps): bump aiohttp from 3.9.5 to 3.10.2 in /examples/rag-full (#1959)
- chore(deps): bump certifi from 2023.11.17 to 2024.7.4 in /examples/python-provider (#1958)
- chore(deps): bump idna from 3.6 to 3.7 in /examples/python-provider (#1957)
- chore(deps): bump rollup from 4.21.3 to 4.24.0 in /src/app (#1961)
- chore(deps): bump starlette from 0.37.2 to 0.40.0 in /examples/rag-full (#1956)
- chore(deps): bump vite from 5.3.3 to 5.4.9 in /examples/jest-integration (#1960)
- chore(deps): migrate drizzle (#1922)
- chore(deps): update dependencies (#1913)

### Documentation

- docs(blog): adding fuzzing post (#1921)

## [0.93.3] - 2024-10-17

### Added

- **feat(assertions):** Support array of files in assertion values by [@danpe](https://github.com/promptfoo/promptfoo/pull/1897)
- **feat(redteam):** Math-prompt strategy by [@AISimplyExplained](https://github.com/promptfoo/promptfoo/pull/1907)
- feat(redteam): math-prompt strategy (#1907)
- feat: add watsonx bearer token auth and display model cost (#1904)
- feat: support array of files in assertion values (#1897)

### Changed

- **chore(providers):** Add WatsonX bearer token auth and display model cost by [@gprem09](https://github.com/promptfoo/promptfoo/pull/1904)
- **chore(redteam):** Rename math-prompt strategy and update docs by [@mldangelo](https://github.com/promptfoo/promptfoo/pull/1912)
- **chore(webui):** Redesign navigation and dark mode components by [@mldangelo](https://github.com/promptfoo/promptfoo/pull/1903)
- **chore(ci):** Correct GitHub Actions syntax for secret access by [@mldangelo](https://github.com/promptfoo/promptfoo/pull/1911)
- **chore(ci):** Fix Docker build by [@sklein12](https://github.com/promptfoo/promptfoo/pull/1910)
- **chore(ci):** Test eval share for hosted container by [@sklein12](https://github.com/promptfoo/promptfoo/pull/1908)
- **chore(ci):** Test sharing to cloud by [@sklein12](https://github.com/promptfoo/promptfoo/pull/1909)
- chore: fix docker build (#1910)
- chore(redteam): rename math-prompt strategy and update docs (#1912)
- chore: Test sharing to cloud (#1909)
- chore: Test eval share for hosted container (#1908)

### Fixed

- **fix(webui):** Navigating directly to an eval by [@sklein12](https://github.com/promptfoo/promptfoo/pull/1905)
- fix(providers): lazy load watsonx dependencies (#1977)
- fix(ci): correct GitHub Actions syntax for secret access (#1911)
- fix: Navigating directly to an eval (#1905)

### Documentation

- **docs(redteam):** Add documentation for Custom and PII plugins by [@mldangelo](https://github.com/promptfoo/promptfoo/pull/1892)

## [0.93.2] - 2024-10-16

### Fixed

- fix: sharing to hosted (#1902)
- fix: update cloud share URL path from 'results' to 'eval' (#1901)
- fix: gemini chat formatting (#1900)

### Documentation

- docs(redteam): add documentation for Custom and PII plugins (#1892)

### Changed

- **fix:** update cloud share URL path from 'results' to 'eval' by [@mldangelo](https://github.com/promptfoo/promptfoo/pull/1901)
- **fix:** gemini chat formatting by [@typpo](https://github.com/promptfoo/promptfoo/pull/1900)
- **fix:** sharing to hosted by [@sklein12](https://github.com/promptfoo/promptfoo/pull/1902)
- **chore:** add `--filter-targets` to `redteam run` by [@typpo](https://github.com/promptfoo/promptfoo/pull/1893)
- **chore:** warn users about unknown arguments after 'eval' command by [@mldangelo](https://github.com/promptfoo/promptfoo/pull/1898)
- chore(webui): redesign navigation and dark mode components (#1903)
- chore(cli): warn users about unknown arguments after 'eval' command (#1898)
- chore: add `--filter-targets` to `redteam run` (#1893)

### Dependencies

- **chore(deps):** bump `@anthropic-ai/sdk` from 0.29.0 to 0.29.1 by [@dependabot](https://github.com/promptfoo/promptfoo/pull/1894)
- chore(deps): bump @anthropic-ai/sdk from 0.29.0 to 0.29.1 (#1894)

## [0.93.1] - 2024-10-15

### Fixed

- fix: Delete all evals broken (#1891)

### Added

- feat: Redteam http target tester (#1883)

### Changed

- **feat:** Crisp chat on certain pages by [@typpo](https://github.com/promptfoo/promptfoo/pull/1880)
- **feat:** Redteam HTTP target tester by [@sklein12](https://github.com/promptfoo/promptfoo/pull/1883)
- **fix:** Do not use default config when config is explicitly set by [@typpo](https://github.com/promptfoo/promptfoo/pull/1878)
- **fix:** Delete all evals broken by [@sklein12](https://github.com/promptfoo/promptfoo/pull/1891)
- **docs:** Add RAG architecture blog post by [@vsauter](https://github.com/promptfoo/promptfoo/pull/1886)
- **refactor(webui):** Move dashboard to redteam directory by [@mldangelo](https://github.com/promptfoo/promptfoo/pull/1890)
- refactor(webui): move dashboard to redteam directory (#1890)

## [0.93.0] - 2024-10-14

### Documentation

- docs: add rag architecture blog post (#1886)

### Added

- feat(cli): add example download functionality to init command (#1875)
- feat(redteam): introduce experimental redteam setup ui (#1872)
- feat(providers): watsonx provider (#1869)
- feat(providers): node package provider (#1855)
- feat: crisp chat on certain pages (#1880)

### Changed

- chore(webui): show tools in report view (#1871)

### Fixed

- fix(cli): only set redteam on combined configs when necessary (#1879)
- fix(cli): disable remote grading with rubric prompt override (#1877)
- fix(webui): rendering evals (#1881)
- fix: do not use default config when config is explicitly set (#1878)

## [0.92.3] - 2024-10-12

### Changed

- fix: request correct structure in prompt (#1851)
- fix: Only persist custom API url in local storage if it's set through the UI (#1854)
- fix: equality failure message (#1868)
- fix: don't always persist providers (#1870)
- feat: env variable to host pf at a different url path then base (#1853)
- chore(redteam): improve custom plugin definition and validation (#1860)
- chore: move skip logic to generate (#1834)
- chore: add `--filter-targets` alias (#1863)
- chore: Cloud sharing with new format (#1840)

### Fixed

- fix(webui): resolve undefined version display in InfoModal (#1856)

### Dependencies

- chore(deps-dev): bump @aws-sdk/client-bedrock-runtime from 3.667.0 to 3.668.0 (#1857)
- chore(deps-dev): bump @aws-sdk/client-bedrock-runtime from 3.668.0 to 3.669.0 (#1865)

## [0.92.2] - 2024-10-09

### Changed

- **ci(tests)**: Separate unit and integration tests in CI pipeline by [@mldangelo](https://github.com/mldangelo) in [#1849](https://github.com/promptfoo/promptfoo/pull/1849)
  - Bump `@aws-sdk/client-bedrock-runtime` from 3.666.0 to 3.667.0 by [@dependabot](https://github.com/dependabot) in [#1845](https://github.com/promptfoo/promptfoo/pull/1845)
  - Bump `@anthropic-ai/sdk` from 0.28.0 to 0.29.0 by [@dependabot](https://github.com/dependabot) in [#1846](https://github.com/promptfoo/promptfoo/pull/1846)
  - Bump `openai` from 4.67.2 to 4.67.3 by [@dependabot](https://github.com/dependabot) in [#1844](https://github.com/promptfoo/promptfoo/pull/1844)

### Fixed

- **fix(providers)**: Dynamically import FAL-AI serverless client by [@mldangelo](https://github.com/mldangelo) in [#1850](https://github.com/promptfoo/promptfoo/pull/1850)

### Dependencies

- **chore(deps)**:

## [0.92.1] - 2024-10-08

### Added

- **feat(providers):** Add support for an optional `responseSchema` file to Google Gemini by [@aud](https://github.com/promptfoo/promptfoo/pull/1839)
- feat(providers): Add support for an optional `responseSchema` file to google gemini (#1839)

### Changed

- **fix:** count could be off if there was a test that wasn't recorded by [@sklein12](https://github.com/promptfoo/promptfoo/pull/1841)
- **fix:** support relative paths by [@sklein12](https://github.com/promptfoo/promptfoo/pull/1842)
- **fix:** Prompt ordering on tables by [@sklein12](https://github.com/promptfoo/promptfoo/pull/1843)
- **chore:** delete empty file by [@sklein12](https://github.com/promptfoo/promptfoo/pull/1829)
- **chore:** rename tables by [@sklein12](https://github.com/promptfoo/promptfoo/pull/1831)
- chore(deps-dev): bump @aws-sdk/client-bedrock-runtime from 3.665.0 to 3.666.0 (#1836)

### Fixed

- **fix(provider):** fal prompt config overrides by [@drochetti](https://github.com/promptfoo/promptfoo/pull/1835)
- fix: Prompt ordering on tables (#1843)
- fix: support relative paths (#1842)
- fix: count could be off if there was a test that wasn't recorded (#1841)

### Dependencies

- **chore(deps):** bump openai from 4.67.1 to 4.67.2 by [@dependabot](https://github.com/promptfoo/promptfoo/pull/1837)
- **chore(deps-dev):** bump @aws-sdk/client-bedrock-runtime from 3.665.0 to 3.666.0 by [@dependabot](https://github.com/promptfoo/promptfoo/pull/1836)
- chore(deps): bump openai from 4.67.1 to 4.67.2 (#1837)

### Documentation

- **docs(contributing):** expand guide for adding new providers by [@mldangelo](https://github.com/promptfoo/promptfoo/pull/1833)

## [0.92.0] - 2024-10-07

### Fixed

- fix(provider): fal prompt config overrides (#1835)

### Documentation

- docs(contributing): expand guide for adding new providers (#1833)

### Changed

- Normalize eval results in db (#1776)
- foundation model blog post (#1823)
- site: custom blog index page (#1824)
- chore(build): allow-composite-ts (#1825)
- chore(cli): improve validation for extension hooks (#1827)
- chore: rename tables (#1831)
- chore: delete empty file (#1829)

## [0.91.3] - 2024-10-04

### Added

- feat(redteam): add religion plugin (#1822)
- feat(provider-fal): allow prompt config overrides (#1815)
- feat: remove in memory table (#1820)

## [0.91.2] - 2024-10-04

### Added

- feat(cli): Add input validation to eval command (@mldangelo #1810)
- feat(cli): Add real-time logging for Python script execution (@mldangelo #1818)
- feat(providers): Add support for setting cookies in `browser` provider (@typpo #1809)

### Changed

- chore(ci): Move integration tests to separate job in GitHub Actions workflow (@mldangelo #1821)
- chore(providers): Add support for file-based response parser for HTTP provider (@mldangelo #1808)
- chore(providers): Improve error message for browser provider missing imports (67c5fed2 @typpo)
- chore(redteam): Update to specific GPT-4 model (0be9c87f @mldangelo)
- chore(site): Update intro cal.com link (ff36972e @typpo)
- chore(webui): Remove 'use client' directives from React components (bc6f4214 @mldangelo)
- docs: Add Streamlit application in browser documentation (855e80f4 @typpo)
- docs: Escape tag in documentation (9c3ae83b @typpo)
- docs: Remove responseparser from quickstart (fe17b837 @typpo)
- docs: Remove responseParser from redteam template (feda3c60 @typpo)
- docs: Update test case reference documentation (d7c7a507 @mldangelo)
- docs: Update to use `redteam run` and `redteam report` (@typpo #1814)

### Fixed

- fix(redteam): Resolve cross-session templating issues (@typpo #1811)
- fix(webui): Ensure weight is not 0 (@sklein12 #1817)

### Dependencies

- chore(deps-dev): Bump @aws-sdk/client-bedrock-runtime from 3.658.1 to 3.662.0 (@dependabot #1805)
- chore(deps-dev): Bump @aws-sdk/client-bedrock-runtime from 3.663.0 to 3.664.0 (@dependabot #1819)
- chore(deps): Bump openai from 4.66.1 to 4.67.0 (@dependabot #1804)
- chore(deps): Bump replicate from 0.34.0 to 0.34.1 (@dependabot #1806)
- chore(deps): Update dependencies (ec37ca4e @mldangelo)

## [0.91.1] - 2024-10-01

### Changed

- feat: prompts as python classmethods (#1799)

### Fixed

- fix(redteam): read redteam config during redteam eval command (#1803)

### Documentation

- docs(custom-api): update documentation and improve typing (#1802)

## [0.91.0] - 2024-10-01

### Added

- feat(cli): ask for email on public share by @typpo in #1798
- feat(cli): support input transforms by @MrFlounder in #1704
- feat(redteam): add `redteam run` command by @typpo in #1791
- feat(webui): new Chart type on the eval page of web UI by @YingjiaLiu99 in #1147

### Changed

- fix: calc the same prompt id everywhere by @sklein12 in #1795
- docs: add troubleshooting section for timeouts by @mldangelo
- docs: fix indentation by @typpo
- docs: provider index by @mldangelo in #1792
- docs: update ts-config example README with tsx loader options by @mldangelo
- site: misc redteam guide clarifications by @typpo
- chore(cli): reorganize command structure and add program name by @mldangelo
- chore(cli): simplify node version check by @mldangelo in #1794
- chore(openai): use omni moderation by default by @typpo in #1797
- chore(providers): add support for special chars in browser provider by @typpo in #1790
- chore(providers): render provider label using Nunjucks by @mldangelo in #1789
- chore(providers): warn on unknown provider types by @mldangelo in #1787
- chore(redteam): include package version in redteam run hash by @typpo in 6d2d0c65
- chore(redteam): rename and export base classes by @mldangelo in #1801
- chore(redteam): serverside generation for indirect-prompt-injection by @mldangelo
- chore(redteam): update adversarial generation to specific gpt-4o model by @typpo in 1f397f62
- chore(cli): reorganize command structure and add program name by @mldangelo in 66781927

### Fixed

- fix(build): remove ts-config path aliases until compilation works correctly by @sklein12 in #1796
- fix(cli): don't ask for email when sharing in ci or without tty by @typpo
- fix(package): use provider prompt map when running via Node package by @vsauter in #1788
- fix(redteam): don't include entities if list is empty by @typpo
- fix(redteam): OWASP aliases by @typpo in #1765

### Dependencies

- chore(deps): bump openai from 4.65.0 to 4.66.1 by @dependabot in #1800
- chore(deps): update dependencies by @mldangelo

## [0.90.3] - 2024-09-27

### Changed

- fix: browser provider ignores cert errors by @ianw_github in 9fcc9f5974d919291456292e187fba1b1bacb3e2

## [0.90.2] - 2024-09-27

### Changed

- **feat:** Add fal.ai provider by [@drochetti](https://github.com/drochetti) in [#1778](https://github.com/promptfoo/promptfoo/pull/1778)
- **feat:** Add install script for pre-built binary installation by [@mldangelo](https://github.com/mldangelo) in [#1755](https://github.com/promptfoo/promptfoo/pull/1755)
- **fix:** Improve JSON parser handling for multiple braces by [@typpo](https://github.com/typpo) in [#1766](https://github.com/promptfoo/promptfoo/pull/1766)
- **refactor(eval):** Reorganize and improve eval command options by [@mldangelo](https://github.com/mldangelo) in [#1762](https://github.com/promptfoo/promptfoo/pull/1762)
- **chore(bedrock):** Improve support for LLAMA3.1 and LLAMA3.2 model configurations by [@mldangelo](https://github.com/mldangelo) in [#1777](https://github.com/promptfoo/promptfoo/pull/1777)
- **chore(config):** Simplify config loading by [@mldangelo](https://github.com/mldangelo) in [#1779](https://github.com/promptfoo/promptfoo/pull/1779)
- **chore(redteam):** Move select plugins for server-side generation by [@mldangelo](https://github.com/mldangelo) in [#1783](https://github.com/promptfoo/promptfoo/pull/1783)
- **ci(nexe-build):** Add ARM64 support for nexe builds by [@mldangelo](https://github.com/mldangelo) in [#1780](https://github.com/promptfoo/promptfoo/pull/1780)
- **ci(nexe-build):** Update runner selection for macOS and add Windows file extension by [@mldangelo](https://github.com/mldangelo) in [#1784](https://github.com/promptfoo/promptfoo/pull/1784)

### Fixed

- **fix(providers):** Correct data types for `responseParser` in HTTP provider by [@typpo](https://github.com/typpo) in [#1764](https://github.com/promptfoo/promptfoo/pull/1764)

### Dependencies

- **chore(deps-dev):** Bump `@aws-sdk/client-bedrock-runtime` from 3.658.0 to 3.658.1 by [@dependabot](https://github.com/dependabot) in [#1769](https://github.com/promptfoo/promptfoo/pull/1769)
- **chore(deps):** Bump `replicate` from 0.33.0 to 0.34.0 by [@dependabot](https://github.com/dependabot) in [#1767](https://github.com/promptfoo/promptfoo/pull/1767)
- **chore(deps):** Bump `openai` from 4.63.0 to 4.64.0 by [@dependabot](https://github.com/dependabot) in [#1768](https://github.com/promptfoo/promptfoo/pull/1768)

## [0.90.1] - 2024-09-26

### Changed

- **chore(providers):** Updated Bedrock integration to support Llama 3.2 models. [#1763](https://github.com/promptfoo/promptfoo/pull/1763) by [@aristsakpinis93](https://github.com/aristsakpinis93)
- **chore:** Added support for config objects in JavaScript and Python assertions. [#1729](https://github.com/promptfoo/promptfoo/pull/1729) by [@vedantr](https://github.com/vedantr)
- **fix:** Improved prompts handling per provider. [#1757](https://github.com/promptfoo/promptfoo/pull/1757) by [@typpo](https://github.com/typpo)
- **fix:** Updated `--no-interactive` description and added it to the documentation. [#1761](https://github.com/promptfoo/promptfoo/pull/1761) by [@kentyman23](https://github.com/kentyman23)
- site: adding blog post for Prompt Airlines (#1774)

### Dependencies

- **chore(deps-dev):** Bumped `@aws-sdk/client-bedrock-runtime` from 3.654.0 to 3.658.0. [#1758](https://github.com/promptfoo/promptfoo/pull/1758) by [@dependabot](https://github.com/dependabot)

## [0.90.0] - 2024-09-24

### Changed

- cli: Added 'pf' as an alias for the 'promptfoo' command (@mldangelo, #1745)
- providers(bedrock): Added support for AI21 Jamba Models and Meta Llama 3.1 Models (@mldangelo, #1753)
- providers(python): Added support for file:// syntax for Python providers (@mldangelo, #1748)
- providers(http): Added support for raw requests (@typpo, #1749)
- cli: implement cloud Login functionality for private sharing (@sklein12, #1719)
- cli(redteam): aliased 'eval' in redteam namespace and prioritized redteam.yaml over promptfooconfig.yaml (@typpo, #1664)
- providers(http): Added templating support for provider URLs (@mldangelo, #1747)
- cli: read config files from directory paths (@andretran, #1721)
- Added PROMPTFOO_EXPERIMENTAL environment variable (@typpo)
- Simplified redteam consent process (@typpo)
- Improved input handling for login prompts (@mldangelo)
- Updated dependencies (@mldangelo)
- webui: fix route to edit eval description(@sklein12, #1754)
- cli: prevent logging of empty output paths (@mldangelo)
- Added raw HTTP request example (@typpo)
- Updated documentation to prefer prebuilt versions (@sklein12, #1752)
- Triggered release step in nexe build for tagged branches (@mldangelo)
- Updated release token in GitHub Actions workflow (@mldangelo)
- Added continue-on-error to nexe-build job (@mldangelo)

## [0.89.4] - 2024-09-23

### Added

- feat(webui): display suggestions (#1739)

### Changed

- feat: headless browser provider (#1736)
- feat: suggestions (#1723)
- feat: improvements to http and websocket providers (#1732)
- fix: empty state for webui (#1727)
- chore: add costs for OpenAI model "gpt-4o-2024-08-06" (#1728)
- fix: catch errors when creating share url (#1726)https://github.com/promptfoo/promptfoo/pull/1725
- fix: add missing outputPath (#1734)
- fix: output path when PROMPTFOO_LIGHTWEIGHT_RESULTS is set (#1737)
- chore: Move share action to server (#1743)
- docs: Update documentation for Tree-based Jailbreaks Strategy by @vingiarrusso in

### Fixed

- fix(prompts): add handling for function prompt (#1724)

## [0.89.3] - 2024-09-20

### Changed

- **Bug Fixes:**
  - Improved sanitization of generations ([#1713](https://github.com/promptfoo/promptfoo/pull/1713) by [@typpo](https://github.com/typpo))
  - Reverted config changes to resolve prompt file bug ([#1722](https://github.com/promptfoo/promptfoo/pull/1722) by [@mldangelo](https://github.com/mldangelo))
- **Docs**
  - Added more information to the enterprise page ([#1714](https://github.com/promptfoo/promptfoo/pull/1714) by [@typpo](https://github.com/typpo))
  - Updated the about page ([#1715](https://github.com/promptfoo/promptfoo/pull/1715) by [@typpo](https://github.com/typpo))
  - Minor landing page updates ([#1718](https://github.com/promptfoo/promptfoo/pull/1718) by [@typpo](https://github.com/typpo))
- Update documentation for Tree-based Jailbreaks Strategy (#1725)

## [0.89.2] - 2024-09-18

### Changed

- **Dependencies**: Updated project dependencies (@mldangelo)
- **Website**: Added truncate functionality to the site (@typpo)
- Fixed Node cache dependency issue (@typpo)
- Improved nexe build workflow artifact handling in CI pipeline (@mldangelo)
- Bumped version to 0.89.2 (@typpo)
-

## [0.89.1] - 2024-09-18

### Added

- **feat(provider/openai)**: support loading `response_format` from a file by [@albertlieyingadrian](https://github.com/albertlieyingadrian) in [#1711](https://github.com/promptfoo/promptfoo/pull/1711)
- **feat(matchers)**: add external file loader for LLM rubric by [@albertlieyingadrian](https://github.com/albertlieyingadrian) in [#1698](https://github.com/promptfoo/promptfoo/pull/1698)

### Changed

- **feat**: Redteam dashboard by [@typpo](https://github.com/typpo) in [#1709](https://github.com/promptfoo/promptfoo/pull/1709)
- **feat**: add WebSocket provider by [@typpo](https://github.com/typpo) in [#1712](https://github.com/promptfoo/promptfoo/pull/1712)
- **docs**: GPT vs O1 guide by [@typpo](https://github.com/typpo) in [#1703](https://github.com/promptfoo/promptfoo/pull/1703)

### Dependencies

- **chore(deps)**: bump `openai` from `4.61.1` to `4.62.0` by [@dependabot](https://github.com/dependabot) in [#1706](https://github.com/promptfoo/promptfoo/pull/1706)
- **chore(deps)**: bump `@azure/openai-assistants` from `1.0.0-beta.5` to `1.0.0-beta.6` by [@dependabot](https://github.com/dependabot) in [#1707](https://github.com/promptfoo/promptfoo/pull/1707)

## [0.89.0] - 2024-09-17

### Added

- feat(util): add nunjucks template support for file path (#1688) by @albertlieyingadrian
- feat(redteam): top level targets, plugins, strategies (#1689) by @typpo

### Changed

- feat: Migrate NextUI to a React App (#1637) by @sklein12
- feat: add golang provider (#1693) by @typpo
- feat: make config `prompts` optional (#1694) by @typpo
- chore(redteam): plumb scores per plugin and strategy (#1684) by @typpo
- chore(redteam): redteam init indent plugins and strategies by @typpo
- chore(redteam): redteam onboarding updates (#1695) by @typpo
- chore(redteam): update some framework mappings by @typpo
- refactor(csv): improve assertion parsing and add warning for single underscore usage (#1692) by @mldangelo
- docs: improve Python provider example with stub LLM function by @mldangelo

### Fixed

- fix(python): change PythonShell mode to binary to fix unicode encoding issues (#1671) by @mldangelo
- fix(python): check --version for executable path validation (#1690) by @mldangelo
- fix(providers): Mistral Error Reporting (#1691) by @GICodeWarrior

### Dependencies

- chore(deps): bump openai from 4.61.0 to 4.61.1 (#1696) by @dependabot
- chore(deps): remove nexe dev dependency by @mldangelo
- chore(deps): update eslint and related packages by @mldangelo

## [0.88.0] - 2024-09-16

### Dependencies

- chore(deps): bump replicate from 0.32.1 to 0.33.0 (#1682)

### Added

- feat(webui): display custom namedScores (#1669)

### Changed

- **Added** `--env-path` as an alias for the `--env-file` option in CLI (@mldangelo)
- **Introduced** `PROMPTFOO_LIGHTWEIGHT_RESULTS` environment variable to optimize result storage (@typpo)
- **Added** `validatePythonPath` function and improved error handling for Python scripts (@mldangelo)
- **Displayed** custom named scores in the Web UI (@khp)
- **Improved** support for structured outputs in the OpenAI provider (@mldangelo)
- **Added** OpenAI Assistant's token usage statistics (@albertlieyingadrian)
- **Added** pricing information for Azure OpenAI models (@mldangelo)
- **Improved** API URL formatting for Azure OpenAI provider (@mldangelo)
- **Fixed** prompt normalization when reading configurations (@mldangelo)
- **Resolved** Docker image issues by adding Python, ensuring the `next` output directory exists, and disabling telemetry (@mldangelo)
- **Improved** message parsing for the Anthropic provider (@mldangelo)
- **Fixed** error in loading externally defined OpenAI function calls (@mldangelo)
- **Corrected** latency assertion error for zero milliseconds latency (@albertlieyingadrian)
- **Added** a new Red Team introduction and case studies to the documentation (@typpo)
- **Updated** model references and default LLM models in the documentation (@mldangelo)
- **Fixed** typos and broken image links in the documentation (@mldangelo, @typpo)
- **Refactored** Red Team commands and types to improve code organization (@mldangelo)
- **Moved** `evaluateOptions` initialization to `evalCommand` (@mldangelo)
- **Centralized** cost calculation logic in providers (@mldangelo)
- ci: improve nexe build workflow and caching (#1683)
- chore(providers): add pricing information for Azure OpenAI models (#1681)

### Tests

- **Added** support for `file://` prefix for local file paths in the `tests:` field in configuration (@mldangelo)

## [0.87.1] - 2024-09-12

### Fixed

- fix(docker): add Python to Docker image and verify in CI (#1677)
- fix(assertions): fix latencyMs comparison with undefined to allow 0 ms latency (#1668)
- fix(providers): improve parseMessages function for anthropic (#1666)
- fix(dockerfile): ensure next out directory exists and disable next telemetry (#1665)
- fix: normalize prompts when reading configs (#1659)

### Added

- feat(python): add validatePythonPath function and improve error handling (#1670)
- feat(cli): accept '--env-path' as an alias for '--env-file' option (#1654)
- feat: PROMPTFOO_LIGHTWEIGHT_RESULTS envar (#1450)

### Documentation

- docs: red team intro (#1662)
- docs: update model references from gpt-3.5-turbo to gpt-4o-mini (#1655)

### Changed

- **Add OpenAI `o1` pricing** by [@typpo](https://github.com/typpo) in [#1649](https://github.com/promptfoo/promptfoo/pull/1649)
- **Add support for OpenAI `o1` max completion tokens** by [@mldangelo](https://github.com/mldangelo) in [#1650](https://github.com/promptfoo/promptfoo/pull/1650)
- **Share link issue when self-hosting** by [@typpo](https://github.com/typpo) in [#1647](https://github.com/promptfoo/promptfoo/pull/1647)
- **Fix OpenAI function tool callbacks handling** by [@mldangelo](https://github.com/mldangelo) in [#1648](https://github.com/promptfoo/promptfoo/pull/1648)
- **Fix broken anchor links** by [@mldangelo](https://github.com/mldangelo) in [#1645](https://github.com/promptfoo/promptfoo/pull/1645)
- **Add documentation for Echo provider** by [@mldangelo](https://github.com/mldangelo) in [#1646](https://github.com/promptfoo/promptfoo/pull/1646)
- ci: add push trigger to docker workflow (#1678)
- refactor(providers): centralize cost calculation logic (#1679)
- refactor: move evaluateOptions initialization to evalCommand (#1674)
- refactor(redteam): move redteam types to src/redteam/types (#1653)
- refactor(redteam): move redteam commands to src/redteam/commands (#1652)
- chore(providers): improve API URL formatting for Azure OpenAI provider (#1672)
- chore(providers): add openai assistant's token usage (#1661)
- chore(openai): improve support for structured outputs (#1656)
- chore: support file:// prefix for local file paths in `tests:` field in config (#1651)

## [0.87.0] - 2024-09-12

### Changed

- feat: remote strategy execution (#1592)
- fix: run db migrations first thing in cli (#1638)
- chore: add --remote to `eval` (#1639)
- chore: ability to record when feature is used (#1643)
- site: intro and image updates (#1636)

### Dependencies

- chore(deps-dev): bump @aws-sdk/client-bedrock-runtime from 3.649.0 to 3.650.0 (#1640)
- chore(deps): bump openai from 4.58.2 to 4.59.0 (#1641)

## [0.86.1] - 2024-09-11

### Changed

- feat: cross-session leak plugin (#1631)
- fix: quickswitcher (#1635)

## [0.86.0] - 2024-09-11

### Changed

- **feat**: Added MITRE Atlas plugin aliases by [@typpo](https://github.com/typpo) in [#1629](https://github.com/promptfoo/promptfoo/pull/1629)
- **chore**: Removed the NextAPI by [@sklein12](https://github.com/sklein12) in [#1599](https://github.com/promptfoo/promptfoo/pull/1599)
- **fix**: Improved rate limiting handling by [@sinedied](https://github.com/sinedied) in [#1633](https://github.com/promptfoo/promptfoo/pull/1633)
- **fix**: Ensured `name:value` pairs are unique, rather than just names, for tags by [@sklein12](https://github.com/sklein12) in [#1621](https://github.com/promptfoo/promptfoo/pull/1621)
- **chore**: Fixed paths for `ts-node` by [@sklein12](https://github.com/sklein12) in [#1628](https://github.com/promptfoo/promptfoo/pull/1628)
- **chore**: Standardized paths by [@sklein12](https://github.com/sklein12) in [#1627](https://github.com/promptfoo/promptfoo/pull/1627)

### Dependencies

- **chore(deps-dev)**: Bumped `@aws-sdk/client-bedrock-runtime` from 3.645.0 to 3.649.0 by [@dependabot](https://github.com/dependabot) in [#1632](https://github.com/promptfoo/promptfoo/pull/1632)
- **chore(deps)**: Bumped `@anthropic-ai/sdk` from 0.27.2 to 0.27.3 by [@dependabot](https://github.com/dependabot) in [#1625](https://github.com/promptfoo/promptfoo/pull/1625)
- **chore(deps)**: Bumped `openai` from 4.58.1 to 4.58.2 by [@dependabot](https://github.com/dependabot) in [#1624](https://github.com/promptfoo/promptfoo/pull/1624)

## [0.85.2] - 2024-09-10

### Changed

- feat: compliance status in redteam reports (#1619)
- fix: prompt parsing (#1620)

## [0.85.1] - 2024-09-09

### Changed

- feat: add support for markdown prompts (#1616)
- fix: Indirect Prompt Injection missing purpose and will only generate… (#1618)

### Dependencies

- chore(deps): bump openai from 4.58.0 to 4.58.1 (#1617)

## [0.85.0] - 2024-09-06

### Added

- **feat(mistral):** Update chat models and add embedding provider by @mldangelo in [#1614](https://github.com/promptfoo/promptfoo/pull/1614)
- **feat(templates):** Allow Nunjucks templating in grader context by @mldangelo in [#1606](https://github.com/promptfoo/promptfoo/pull/1606)
- **feat(redteam):** Add remote generation for multilingual strategy by @mldangelo in [#1603](https://github.com/promptfoo/promptfoo/pull/1603)
- **feat(redteam):** ASCII smuggling plugin by @typpo in [#1602](https://github.com/promptfoo/promptfoo/pull/1602)
- **feat(redteam):** More direct prompt injections by @typpo in [#1600](https://github.com/promptfoo/promptfoo/pull/1600)
- **feat(redteam):** Prompt injections for all test cases by @typpo in [commit 28605413](https://github.com/promptfoo/promptfoo/commit/28605413)

### Changed

- **refactor:** Improve project initialization and error handling by @mldangelo in [#1591](https://github.com/promptfoo/promptfoo/pull/1591)
- **chore:** Warn if API keys are not present when running `promptfoo init` by @cristiancavalli in [#1577](https://github.com/promptfoo/promptfoo/pull/1577)
- **chore:** Add info to contains-all and icontains-all error by @typpo in [#1596](https://github.com/promptfoo/promptfoo/pull/1596)
- **chore(redteam):** Export graders by @sklein12 in [#1593](https://github.com/promptfoo/promptfoo/pull/1593)
- **chore(redteam):** Export prompt generators by @sklein12 in [#1583](https://github.com/promptfoo/promptfoo/pull/1583)
- **docs:** Add information on loading scenarios from external files by @mldangelo in [commit ddcc6e59](https://github.com/promptfoo/promptfoo/commit/ddcc6e59)

### Fixed

- **fix(redteam):** Correct metric name for misinfo/pii/etc plugins by @typpo in [#1605](https://github.com/promptfoo/promptfoo/pull/1605)
- **fix(redteam):** Remove quotes and numbered results from generated prompts by @typpo in [#1601](https://github.com/promptfoo/promptfoo/pull/1601)
- **fix(redteam):** Move purpose to the right place in redteam template by @typpo in [commit 00b2ed1c](https://github.com/promptfoo/promptfoo/commit/00b2ed1c)

### Dependencies

- **chore(deps):** Bump openai from 4.57.3 to 4.58.0 by @dependabot in [#1608](https://github.com/promptfoo/promptfoo/pull/1608)
- **chore(deps):** Bump openai from 4.57.2 to 4.57.3 by @dependabot in [#1594](https://github.com/promptfoo/promptfoo/pull/1594)

### Documentation

- **docs(redteam):** Red team introduction by @typpo in [commit ba5fe14c](https://github.com/promptfoo/promptfoo/commit/ba5fe14c) and [commit 60624456](https://github.com/promptfoo/promptfoo/commit/60624456)
- **docs(redteam):** Minor redteam update by @typpo in [commit 7cad8da5](https://github.com/promptfoo/promptfoo/commit/7cad8da5)

### Tests

- **test(redteam):** Enhance nested quotes handling in parseGeneratedPrompts by @mldangelo in [commit 36f6464a](https://github.com/promptfoo/promptfoo/commit/36f6464a)

## [0.84.1] - 2024-09-04

### Changed

- fix: json parsing infinite loop (#1590)
- fix: add cache and timeout to remote grading (#1589)

## [0.84.0] - 2024-09-04

### Changed

- Support for remote `llm-rubric` (@typpo in #1585)
- Resolve foreign key constraint in `deleteAllEvals` (@mldangelo in #1581)
- Don't set OpenAI chat completion `seed=0` by default (@Sasja in #1580)
- Improve strategy JSON parsing (@typpo in #1587)
- Multilingual strategy now uses redteam provider (@typpo in #1586)
- Handle redteam remote generation error (@typpo)
- Redteam refusals are not failures for Vertex AI (@typpo)
- Reorganize redteam exports and add Strategies (@mldangelo in #1588)
- Update OpenAI config documentation (@mldangelo)
- Improve Azure environment variables and configuration documentation (@mldangelo)
- Bump dependencies and devDependencies (@mldangelo)
- Set `stream: false` in Ollama provider (@typpo, #1568)
- Bump openai from 4.57.0 to 4.57.1 (@dependabot in #1579)
- Regenerate JSON schema based on type change (@mldangelo)
- Synchronize EnvOverrides in types and validators (@mldangelo)

## [0.83.2] - 2024-09-03

### Added

- feat: add --remote to redteam generate (#1576)

## [0.83.1] - 2024-09-03

## [0.83.0] - 2024-09-03

### Changed

- feat: add onboarding flow for http endpoint (#1572)
- feat: remote generation on the cli (#1570)
- docs: update YAML syntax for prompts and providers arrays (#1574)

## [0.82.0] - 2024-09-02

### Added

- feat(redteam): add remote generation for purpose and entities by @mldangelo

### Changed

- feat: add `delay` option for redteam generate and refactor plugins by @typpo
- fix: validate all plugins before running any by @typpo
- fix: remove indirect prompt injection `config.systemPrompt` dependency by @typpo
- fix: show all strategies on report by @typpo
- fix: bfla grading by @typpo
- chore: simplify redteam types by @typpo
- chore: move redteam command locations by @typpo
- chore: defaults for redteam plugins/strategies by @typpo
- chore: clean up some redteam onboarding questions by @typpo
- chore: export redteam plugins by @typpo
- chore: rename envar by @typpo
- chore: add `PROMPTFOO_NO_REDTEAM_MODERATION` envar by @typpo
- chore(redteam): add progress bar to multilingual strategy by @mldangelo
- chore(redteam): export extraction functions by @mldangelo
- chore(docker): install peer dependencies during build by @mldangelo
- docs: update file paths to use file:// prefix by @mldangelo
- chore: clean up some redteam onboarding questions (#1569)
- chore: defaults for redteam plugins/strategies (#1521)

### Dependencies

- chore(deps-dev): bump @aws-sdk/client-bedrock-runtime from 3.637.0 to 3.642.0 by @dependabot
- chore(deps): bump replicate from 0.32.0 to 0.32.1 by @dependabot
- chore(deps): bump openai from 4.56.1 to 4.57.0 by @dependabot
- chore(deps): bump the github-actions group with 2 updates by @dependabot

## [0.81.5] - 2024-08-30

### Dependencies

- chore(deps): bump the github-actions group with 2 updates (#1566)
- chore(deps): bump replicate from 0.32.0 to 0.32.1 (#1559)
- chore(deps): bump openai from 4.56.1 to 4.57.0 (#1558)

### Fixed

- fix: remove indirect prompt injection `config.systemPrompt` dependency (#1562)
- fix: validate all plugins before running any (#1561)

### Added

- feat: add `delay` option for redteam generate and refactor plugins (#1564)
- feat(redteam): add remote generation for purpose and entities (#1555)

### Changed

- feat: global `env` var in templates (#1553)
- fix: harmful grader (#1554)
- chore: include createdAt in getStandaloneEvals (#1550)
- chore: write eval tags to database and add migration (#1551)
- style: enforce object shorthand rule (#1557)
- chore: move redteam command locations (#1565)
- chore: simplify redteam types (#1563)
- chore(deps-dev): bump @aws-sdk/client-bedrock-runtime from 3.637.0 to 3.642.0 (#1560)

## [0.81.4] - 2024-08-29

### Changed

- **fix:** redteam progress bar by @typpo in [#1548](https://github.com/promptfoo/promptfoo/pull/1548)
- **fix:** redteam grading should use defaultTest by @typpo in [#1549](https://github.com/promptfoo/promptfoo/pull/1549)
- **refactor:** move extractJsonObjects to json utility module by @mldangelo in [#1539](https://github.com/promptfoo/promptfoo/pull/1539)

### Fixed

- **fix(redteam):** fix modifier handling in PluginBase by @mldangelo in [#1538](https://github.com/promptfoo/promptfoo/pull/1538)
- **fix(testCases):** improve test case generation with retry logic by @mldangelo in [#1544](https://github.com/promptfoo/promptfoo/pull/1544)
- **fix(docker):** link peer dependencies in Docker build by @mldangelo in [#1545](https://github.com/promptfoo/promptfoo/pull/1545)
- **fix(devcontainer):** simplify and standardize development environment by @mldangelo in [#1547](https://github.com/promptfoo/promptfoo/pull/1547)

### Dependencies

- **chore(deps):** update dependencies by @mldangelo in [#1540](https://github.com/promptfoo/promptfoo/pull/1540)
- **chore(deps):** bump @anthropic-ai/sdk from 0.27.0 to 0.27.1 by @dependabot in [#1541](https://github.com/promptfoo/promptfoo/pull/1541)
- **chore(deps):** bump openai from 4.56.0 to 4.56.1 by @dependabot in [#1542](https://github.com/promptfoo/promptfoo/pull/1542)

## [0.81.3] - 2024-08-28

### Changed

- fix: use redteam provider in extractions (#1536)
- feat: Indirect prompt injection plugin (#1518)
- feat: add support for tags property in config (#1526)
- feat: ability to reference external files in plugin config (#1530)
- feat: custom redteam plugins (#1529)
- fix: remove failure messages from output (#1531)
- fix: reduce pii false positives (#1532)
- fix: Addtl Pii false positives (#1533)
- fix: RBAC plugin false positives (#1534)
- fix: redteam providers should be overriddeable (#1516)
- fix: dont use openai moderation if key not present (#1535)

### Fixed

- fix(redteam): update logic for json only response format in default provider (#1537)

## [0.81.2] - 2024-08-27

### Changed

- fix: use redteam provider in extractions (#1536)
- feat: Indirect prompt injection plugin (#1518)
- feat: add support for tags property in config (#1526)
- feat: ability to reference external files in plugin config (#1530)
- feat: custom redteam plugins (#1529)
- fix: remove failure messages from output (#1531)
- fix: reduce pii false positives (#1532)
- fix: Addtl Pii false positives (#1533)
- fix: RBAC plugin false positives (#1534)
- fix: redteam providers should be overriddeable (#1516)
- fix: dont use openai moderation if key not present (#1535)

## [0.81.1] - 2024-08-27

### Changed

- feat: Indirect prompt injection plugin (#1518)
- feat: add support for `tags` property in config (#1526)
- feat: ability to reference external files in plugin config (#1530)
- feat: custom redteam plugins (#1529)
- fix: remove failure messages from output (#1531)
- fix: reduce pii false positives (#1532)
- fix: Addtl Pii false positives (#1533)
- fix: RBAC plugin false positives (#1534)
- fix: redteam providers should be overriddeable (#1516)
- fix: dont use openai moderation if key not present (#1535)
- chore: Set jest command line setting for jest extension (#1527)

## [0.81.0] - 2024-08-26

### Added

- feat(report): performance by strategy (#1524)
- feat(ai21): Add AI21 Labs provider (#1514)
- feat(docker): add Python runtime to final image (#1519)
- feat(anthropic): add support for create message headers (prompt caching) (#1503)

### Changed

- feat: report view sidebar for previewing test failures (#1522)
- chore: add plugin/strategy descriptions (#1520)
- chore: add `promptfoo redteam plugins` command to list plugins (#1523)
- chore: clear cache status messages (#1517)

### Fixed

- fix(scriptCompletionProvider): handle UTF-8 encoding in script output (#1515)
- fix(config): support loading scenarios and tests from external files (#331)

### Dependencies

- chore(deps-dev): bump @aws-sdk/client-bedrock-runtime from 3.635.0 to 3.637.0 (#1513)

## [0.80.3] - 2024-08-22

### Changed

- **Add Support for Embeddings API (Cohere)**: Added support for the embeddings API. [#1502](https://github.com/promptfoo/promptfoo/pull/1502) by @typpo
- **Improve Download Menu**: Enhanced the web UI by improving the download menu, adding an option to download human eval test cases, and adding tests. [#1500](https://github.com/promptfoo/promptfoo/pull/1500) by @mldangelo
- **Python IPC Encoding**: Resolved an issue by ensuring that Python IPC uses UTF-8 encoding. [#1511](https://github.com/promptfoo/promptfoo/pull/1511) by @typpo
- **Dependencies**:
  - Bumped `@anthropic-ai/sdk` from `0.26.1` to `0.27.0`. [#1507](https://github.com/promptfoo/promptfoo/pull/1507) by @dependabot
  - Upgraded Docusaurus to version `3.5.2`. [#1512](https://github.com/promptfoo/promptfoo/pull/1512) by @mldangelo

## [0.80.2] - 2024-08-22

### Changed

- fix: remove prompt-extraction from base plugins (#1505)

## [0.80.1] - 2024-08-21

### Added

- feat(redteam): improve test generation and reporting (#1481)
- feat(eval)!: remove interactive providers option (#1487)

### Changed

- refactor(harmful): improve test generation and deduplication (#1480)
- fix: hosted load shared eval (#1482)
- fix: Generate correct url for hosted shared evals (#1484)
- feat: multilingual strategy (#1483)
- chore(eslint): add and configure eslint-plugin-unicorn (#1489)
- fix: include vars in python provider cache key (#1493)
- fix: Including prompt extraction broke redteam generation (#1494)
- fix: floating point comparisons in matchers (#1486)
- site: enterprise breakdown (#1495)
- fix: Prompt setup during redteam generation (#1496)
- fix: hardcoded injectVars in harmful plugin (#1498)
- site: enterprise blog post (#1497)

### Fixed

- fix(assertions): update error messages for context-relevance and context-faithfulness (#1485)

### Dependencies

- chore(deps-dev): bump @aws-sdk/client-bedrock-runtime from 3.632.0 to 3.635.0 (#1490)

## [0.80.0] - 2024-08-21

### Changed

- **Multilingual Strategy**: Added multilingual strategy by @typpo in [#1483](https://github.com/promptfoo/promptfoo/pull/1483)
- **Redteam**: Improved test generation and reporting by @mldangelo in [#1481](https://github.com/promptfoo/promptfoo/pull/1481)
- **Evaluation**: Removed interactive providers option by @mldangelo in [#1487](https://github.com/promptfoo/promptfoo/pull/1487)
- **Hosted Load**: Fixed hosted load shared eval by @sklein12 in [#1482](https://github.com/promptfoo/promptfoo/pull/1482)
- **Shared Evals**: Generated correct URL for hosted shared evals by @sklein12 in [#1484](https://github.com/promptfoo/promptfoo/pull/1484)
- **Assertions**: Updated error messages for context-relevance and context-faithfulness by @mldangelo in [#1485](https://github.com/promptfoo/promptfoo/pull/1485)
- **Python Provider**: Included vars in Python provider cache key by @typpo in [#1493](https://github.com/promptfoo/promptfoo/pull/1493)
- **Prompt Extraction**: Fixed prompt extraction during redteam generation by @sklein12 in [#1494](https://github.com/promptfoo/promptfoo/pull/1494)
- **Matchers**: Fixed floating point comparisons in matchers by @typpo in [#1486](https://github.com/promptfoo/promptfoo/pull/1486)
- **Redteam Generation**: Fixed prompt setup during redteam generation by @sklein12 in [#1496](https://github.com/promptfoo/promptfoo/pull/1496)
- **Harmful Tests**: Improved test generation and deduplication by @mldangelo in [#1480](https://github.com/promptfoo/promptfoo/pull/1480)
- **ESLint**: Added and configured eslint-plugin-unicorn by @mldangelo in [#1489](https://github.com/promptfoo/promptfoo/pull/1489)
- **Dependencies**: Bumped @aws-sdk/client-bedrock-runtime from 3.632.0 to 3.635.0 by @dependabot in [#1490](https://github.com/promptfoo/promptfoo/pull/1490)
- **Crescendo**: Crescendo now uses gpt-4o-mini instead of gpt-4o by @typpo
- **Environment Variables**: Added GROQ_API_KEY and alphabetized 3rd party environment variables by @mldangelo
- **Enterprise Breakdown**: Added enterprise breakdown by @typpo in [#1495](https://github.com/promptfoo/promptfoo/pull/1495)

## [0.79.0] - 2024-08-20

### Added

- feat(groq): integrate native Groq SDK and update documentation by @mldangelo in #1479
- feat(redteam): support multiple policies in redteam config by @mldangelo in #1470
- feat(redteam): handle graceful exit on Ctrl+C during initialization by @mldangelo

### Changed

- feat: Prompt Extraction Redteam Plugin by @sklein12 in #1471
- feat: nexe build artifacts by @typpo in #1472
- fix: expand supported config file extensions by @mldangelo in #1473
- fix: onboarding.ts should assume context.py by @typpo
- fix: typo in onboarding example by @typpo
- fix: reduce false positives in `policy` and `sql-injection` by @typpo
- docs: remove references to optional Supabase environment variables by @mldangelo in #1474
- docs: owasp llm top 10 updates by @typpo
- test: mock logger in util test suite by @mldangelo
- chore(workflow): change release trigger type from 'published' to 'created' in Docker workflow, remove pull request and push triggers by @mldangelo
- chore(webui): update plugin display names by @typpo
- chore: refine pass rate threshold logging by @mldangelo
- ci: upload artifact by @typpo

### Fixed

- fix(devcontainer): improve Docker setup for development environment by @mldangelo
- fix(devcontainer): update Dockerfile.dev for Node.js development by @mldangelo
- fix(webui): truncate floating point scores by @typpo

### Dependencies

- chore(deps): update dependencies by @mldangelo in #1478
- chore(deps): update dependencies including @swc/core, esbuild, @anthropic-ai/sdk, and openai by @mldangelo

### Tests

- test(config): run tests over example promptfoo configs by @mldangelo in #1475

## [0.78.3] - 2024-08-19

### Added

- feat(redteam): add base path to CLI state for redteam generate by @mldangelo in [#1464](https://github.com/promptfoo/promptfoo/pull/1464)
- feat(eval): add global pass rate threshold by @mldangelo in [#1443](https://github.com/promptfoo/promptfoo/pull/1443)

### Changed

- chore: check config.redteam instead of config.metadata.redteam by @mldangelo in [#1463](https://github.com/promptfoo/promptfoo/pull/1463)
- chore: Add vscode settings for prettier formatting by @sklein12 in [#1469](https://github.com/promptfoo/promptfoo/pull/1469)
- build: add defaults for supabase environment variables by @sklein12 in [#1468](https://github.com/promptfoo/promptfoo/pull/1468)
- fix: smarter caching in exec provider by @typpo in [#1467](https://github.com/promptfoo/promptfoo/pull/1467)
- docs: display consistent instructions for npx vs npm vs brew by @typpo in [#1465](https://github.com/promptfoo/promptfoo/pull/1465)

### Dependencies

- chore(deps): bump openai from 4.55.9 to 4.56.0 by @dependabot in [#1466](https://github.com/promptfoo/promptfoo/pull/1466)
- chore(deps): replace rouge with js-rouge by @QuarkNerd in [#1420](https://github.com/promptfoo/promptfoo/pull/1420)

## [0.78.2] - 2024-08-18

### Changed

- feat: multi-turn jailbreak (#1459)
- feat: plugin aliases for owasp, nist (#1410)
- refactor(redteam): aliase `generate redteam` to `redteam generate`. (#1461)
- chore: strongly typed envars (#1452)
- chore: further simplify redteam onboarding (#1462)
- docs: strategies (#1460)

## [0.78.1] - 2024-08-16

### Changed

- **feat:** Helicone integration by @maamalama in [#1434](https://github.com/promptfoo/promptfoo/pull/1434)
- **fix:** is-sql assertion `databaseType` not `database` by @typpo in [#1451](https://github.com/promptfoo/promptfoo/pull/1451)
- **chore:** Use temporary file for Python interprocess communication by @enkoder in [#1447](https://github.com/promptfoo/promptfoo/pull/1447)
- **chore:** Redteam onboarding updates by @typpo in [#1453](https://github.com/promptfoo/promptfoo/pull/1453)
- **site:** Add blog post by @typpo in [#1444](https://github.com/promptfoo/promptfoo/pull/1444)

### Fixed

- **fix(redteam):** Improve iterative tree-based red team attack provider by @mldangelo in [#1458](https://github.com/promptfoo/promptfoo/pull/1458)

### Dependencies

- **chore(deps):** Update various dependencies by @mldangelo in [#1442](https://github.com/promptfoo/promptfoo/pull/1442)
- **chore(deps):** Bump `@aws-sdk/client-bedrock-runtime` from 3.629.0 to 3.631.0 by @dependabot in [#1448](https://github.com/promptfoo/promptfoo/pull/1448)
- **chore(deps):** Bump `@aws-sdk/client-bedrock-runtime` from 3.631.0 to 3.632.0 by @dependabot in [#1455](https://github.com/promptfoo/promptfoo/pull/1455)
- **chore(deps):** Bump `@anthropic-ai/sdk` from 0.25.2 to 0.26.0 by @dependabot in [#1449](https://github.com/promptfoo/promptfoo/pull/1449)
- **chore(deps):** Bump `@anthropic-ai/sdk` from 0.26.0 to 0.26.1 by @dependabot in [#1456](https://github.com/promptfoo/promptfoo/pull/1456)
- **chore(deps):** Bump `openai` from 4.55.7 to 4.55.9 by @dependabot in [#1457](https://github.com/promptfoo/promptfoo/pull/1457)

## [0.78.0] - 2024-08-14

### Changed

- **Web UI**: Added ability to choose prompt/provider column in report view by @typpo in [#1426](https://github.com/promptfoo/promptfoo/pull/1426)
- **Eval**: Support loading scenarios and tests from external files by @mldangelo in [#1432](https://github.com/promptfoo/promptfoo/pull/1432)
- **Redteam**: Added language support for generated tests by @mldangelo in [#1433](https://github.com/promptfoo/promptfoo/pull/1433)
- **Transform**: Support custom function names in file transforms by @mldangelo in [#1435](https://github.com/promptfoo/promptfoo/pull/1435)
- **Extension Hook API**: Introduced extension hook API by @aantn in [#1249](https://github.com/promptfoo/promptfoo/pull/1249)
- **Report**: Hide unused plugins in report by @typpo in [#1425](https://github.com/promptfoo/promptfoo/pull/1425)
- **Memory**: Optimize memory usage in `listPreviousResults` by not loading all results into memory by @typpo in [#1439](https://github.com/promptfoo/promptfoo/pull/1439)
- **TypeScript**: Added TypeScript `promptfooconfig` example by @mldangelo in [#1427](https://github.com/promptfoo/promptfoo/pull/1427)
- **Tests**: Moved `evaluatorHelpers` tests to a separate file by @mldangelo in [#1437](https://github.com/promptfoo/promptfoo/pull/1437)
- **Dev**: Bumped `@aws-sdk/client-bedrock-runtime` from 3.624.0 to 3.629.0 by @dependabot in [#1428](https://github.com/promptfoo/promptfoo/pull/1428)
- **SDK**: Bumped `@anthropic-ai/sdk` from 0.25.1 to 0.25.2 by @dependabot in [#1429](https://github.com/promptfoo/promptfoo/pull/1429)
- **SDK**: Bumped `openai` from 4.55.4 to 4.55.7 by @dependabot in [#1436](https://github.com/promptfoo/promptfoo/pull/1436)

## [0.77.0] - 2024-08-12

### Added

- feat(assertions): add option to disable AJV strict mode (#1415)

### Changed

- feat: ssrf plugin (#1411)
- feat: `basic` strategy to represent raw payloads only (#1417)
- refactor: transform function (#1423)
- fix: suppress docker lint (#1412)
- fix: update eslint config and resolve unused variable warnings (#1413)
- fix: handle retries for harmful generations (#1422)
- docs: add plugin documentation (#1421)

### Fixed

- fix(redteam): plugins respect config-level numTest (#1409)

### Dependencies

- chore(deps): bump openai from 4.55.3 to 4.55.4 (#1418)

### Documentation

- docs(faq): expand and restructure FAQ content (#1416)

## [0.76.1] - 2024-08-11

## [0.76.0] - 2024-08-10

### Changed

- feat: add `delete eval latest` and `delete eval all` (#1383)
- feat: bfla and bofa plugins (#1406)
- feat: Support loading tools from multiple files (#1384)
- feat: `promptfoo eval --description` override (#1399)
- feat: add `default` strategy and remove `--add-strategies` (#1401)
- feat: assume unrecognized openai models are chat models (#1404)
- feat: excessive agency grader looks at tools (#1403)
- fix: dont check SSL certs (#1396)
- fix: reduce rbac and moderation false positives (#1400)
- fix: `redteam` property was not read in config (#1407)
- fix: Do not ignored derived metrics (#1381)
- fix: add indexes for sqlite (#1382)

### Fixed

- fix(types): allow boolean values in VarsSchema (#1386)

### Dependencies

- chore(deps-dev): bump @aws-sdk/client-bedrock-runtime from 3.623.0 to 3.624.0 (#1379)
- chore(deps): bump openai from 4.54.0 to 4.55.0 (#1387)
- chore(deps): bump openai from 4.55.0 to 4.55.1 (#1392)
- chore(deps): bump @anthropic-ai/sdk from 0.25.0 to 0.25.1 (#1397)
- chore(deps): bump openai from 4.55.1 to 4.55.3 (#1398)

## [0.75.2] - 2024-08-06

### Added

- feat: ability to attach configs to prompts (#1391)

### Changed

- fix: Update "Edit Comment" dialog background for the dark mode (#1374)
- fix: undefined var in hallucination template (#1375)
- fix: restore harmCategory var (#1380)

## [0.75.1] - 2024-08-05

### Changed

- fix: temporarily disable nunjucks strict mode by @typpo

### Dependencies

- chore(deps): update dependencies (#1373)

## [0.75.0] - 2024-08-05

### Added

- feat(webui): Download report as PDF by @typpo in #1348
- feat(redteam): Add custom policy plugin by @mldangelo in #1346
- feat(config): Add writePromptfooConfig function and orderKeys utility by @mldangelo in #1360
- feat(redteam): Add purpose and entities to defaultTest metadata by @mldangelo in #1359
- feat(webui): Show metadata in details dialog by @typpo in #1362
- feat(redteam): Add some simple requested strategies by @typpo in #1364

### Changed

- feat: Implement defaultTest metadata in tests and scenarios by @mldangelo in #1361
- feat!: Add `default` plugin collection and remove --add-plugins by @typpo in #1369
- fix: Moderation assert and iterative provider handle output objects by @typpo in #1353
- fix: Improve PII grader by @typpo in #1354
- fix: Improve RBAC grading by @typpo in #1347
- fix: Make graders set assertion value by @typpo in #1355
- fix: Allow falsy provider response outputs by @typpo in #1356
- fix: Improve entity extraction and enable for PII by @typpo in #1358
- fix: Do not dereference external tool files by @typpo in #1357
- fix: Google sheets output by @typpo in #1367
- docs: How to red team RAG applications by @typpo in #1368
- refactor(redteam): Consolidate graders and plugins by @mldangelo in #1370
- chore(redteam): Collect user consent for harmful generation by @typpo in #1365

### Dependencies

- chore(deps): Bump openai from 4.53.2 to 4.54.0 by @dependabot in #1349
- chore(deps-dev): Bump @aws-sdk/client-bedrock-runtime from 3.622.0 to 3.623.0 by @dependabot in #1372

## [0.74.0] - 2024-08-01

### Changed

- **feat**: Split types vs validators for prompts, providers, and redteam [#1325](https://github.com/promptfoo/promptfoo/pull/1325) by [@typpo](https://github.com/typpo)
- **feat**: Load provider `tools` and `functions` from external file [#1342](https://github.com/promptfoo/promptfoo/pull/1342) by [@typpo](https://github.com/typpo)
- **fix**: Show gray icon when there are no tests in report [#1335](https://github.com/promptfoo/promptfoo/pull/1335) by [@typpo](https://github.com/typpo)
- **fix**: numTests calculation for previous evals [#1336](https://github.com/promptfoo/promptfoo/pull/1336) by [@onyck](https://github.com/onyck)
- **fix**: Only show the number of tests actually run in the eval [#1338](https://github.com/promptfoo/promptfoo/pull/1338) by [@typpo](https://github.com/typpo)
- **fix**: better-sqlite3 in arm64 docker image [#1344](https://github.com/promptfoo/promptfoo/pull/1344) by [@cmrfrd](https://github.com/cmrfrd)
- **fix**: Correct positive example in DEFAULT_GRADING_PROMPT [#1337](https://github.com/promptfoo/promptfoo/pull/1337) by [@tbuckley](https://github.com/tbuckley)
- **chore**: Integrate red team evaluation into promptfoo init [#1334](https://github.com/promptfoo/promptfoo/pull/1334) by [@mldangelo](https://github.com/mldangelo)
- **chore**: Enforce consistent type imports [#1341](https://github.com/promptfoo/promptfoo/pull/1341) by [@mldangelo](https://github.com/mldangelo)
- **refactor(redteam)**: Update plugin architecture and improve error handling [#1343](https://github.com/promptfoo/promptfoo/pull/1343) by [@mldangelo](https://github.com/mldangelo)
- **docs**: Expand installation instructions in README and docs [#1345](https://github.com/promptfoo/promptfoo/pull/1345) by [@mldangelo](https://github.com/mldangelo)

### Dependencies

- **chore(deps)**: Bump @azure/identity from 4.4.0 to 4.4.1 [#1340](https://github.com/promptfoo/promptfoo/pull/1340) by [@dependabot](https://github.com/dependabot)
- **chore(deps)**: Bump the github-actions group with 3 updates [#1339](https://github.com/promptfoo/promptfoo/pull/1339) by [@dependabot](https://github.com/dependabot)

## [0.73.9] - 2024-07-30

### Dependencies

- chore(deps): update dev dependencies and minor package versions (#1331)
- chore(deps): bump @anthropic-ai/sdk from 0.24.3 to 0.25.0 (#1326)

### Fixed

- fix: chain provider and test transform (#1316)

### Added

- feat: handle rate limits in generic fetch path (#1324)

### Changed

- **Features:**
  - feat: handle rate limits in generic fetch path by @typpo in https://github.com/promptfoo/promptfoo/pull/1324
- **Fixes:**
  - fix: show default vars in table by @typpo in https://github.com/promptfoo/promptfoo/pull/1306
  - fix: chain provider and test transform by @fvdnabee in https://github.com/promptfoo/promptfoo/pull/1316
- **Refactors:**
  - refactor(redteam): extract entity and purpose logic, update imitation plugin by @mldangelo in https://github.com/promptfoo/promptfoo/pull/1301
- **Chores:**
  - chore(deps): bump openai from 4.53.1 to 4.53.2 by @dependabot in https://github.com/promptfoo/promptfoo/pull/1314
  - chore: set page titles by @typpo in https://github.com/promptfoo/promptfoo/pull/1315
  - chore: add devcontainer setup by @cmrfrd in https://github.com/promptfoo/promptfoo/pull/1317
  - chore(webui): persist column selection in evals view by @mldangelo in https://github.com/promptfoo/promptfoo/pull/1302
  - chore(redteam): allow multiple provider selection by @mldangelo in https://github.com/promptfoo/promptfoo/pull/1319
  - chore(deps): bump @anthropic-ai/sdk from 0.24.3 to 0.25.0 by @dependabot in https://github.com/promptfoo/promptfoo/pull/1326
  - chore(deps-dev): bump @aws-sdk/client-bedrock-runtime from 3.620.0 to 3.620.1 by @dependabot in https://github.com/promptfoo/promptfoo/pull/1327
  - chore(deps): update dev dependencies and minor package versions by @mldangelo in https://github.com/promptfoo/promptfoo/pull/1331
- **CI/CD:**
  - ci: add assets generation job and update json schema by @mldangelo in https://github.com/promptfoo/promptfoo/pull/1321
  - docs: add CITATION.cff file by @mldangelo in https://github.com/promptfoo/promptfoo/pull/1322
  - docs: update examples and docs to use gpt-4o and gpt-4o-mini models by @mldangelo in https://github.com/promptfoo/promptfoo/pull/1323
- chore(deps-dev): bump @aws-sdk/client-bedrock-runtime from 3.620.0 to 3.620.1 (#1327)

### Documentation

- **Documentation:**

## [0.73.8] - 2024-07-29

### Dependencies

- chore(deps): bump openai from 4.53.1 to 4.53.2 (#1314)

### Documentation

- docs: update examples and docs to use gpt-4o and gpt-4o-mini models (#1323)
- docs: add CITATION.cff file (#1322)

### Added

- feat(webui): tooltip with provider config on hover (#1312)

### Changed

- feat: Imitation redteam plugin (#1163)
- fix: report cached tokens from assertions (#1299)
- fix: trim model-graded-closedqa response (#1309)
- refactor(utils): move transform logic to separate file (#1310)
- chore(cli): add option to strip auth info from shared URLs (#1304)
- chore: set page titles (#1315)
- chore(webui): persist column selection in evals view (#1302)
- ci: add assets generation job and update json schema (#1321)
- refactor(redteam): extract entity and purpose logic, update imitation plugin (#1301)
- chore(redteam): allow multiple provider selection (#1319)
- chore: add devcontainer setup (#1317)

### Fixed

- fix(webui): make it easier to select text without toggling cell (#1295)
- fix(docker): add sqlite-dev to runtime dependencies (#1297)
- fix(redteam): update CompetitorsGrader rubric (#1298)
- fix(redteam): improve plugin and strategy selection UI (#1300)
- fix(redteam): decrease false positives in hallucination grader (#1305)
- fix(redteam): misc fixes in grading and calculations (#1313)
- fix: show default vars in table (#1306)

## [0.73.7] - 2024-07-26

### Changed

- **Standalone graders for redteam** by [@typpo](https://github.com/typpo) in [#1256](https://github.com/promptfoo/promptfoo/pull/1256)
- **Punycode deprecation warning on node 22** by [@typpo](https://github.com/typpo) in [#1287](https://github.com/promptfoo/promptfoo/pull/1287)
- **Improve iterative providers and update provider API interface to pass original prompt** by [@mldangelo](https://github.com/mldangelo) in [#1293](https://github.com/promptfoo/promptfoo/pull/1293)
- **Add issue templates** by [@typpo](https://github.com/typpo) in [#1288](https://github.com/promptfoo/promptfoo/pull/1288)
- **Support TS files for prompts providers and assertions** by [@benasher44](https://github.com/benasher44) in [#1286](https://github.com/promptfoo/promptfoo/pull/1286)
- **Update dependencies** by [@mldangelo](https://github.com/mldangelo) in [#1292](https://github.com/promptfoo/promptfoo/pull/1292)
- **Move circular dependency check to style-check job** by [@mldangelo](https://github.com/mldangelo) in [#1291](https://github.com/promptfoo/promptfoo/pull/1291)
- **Add examples for embedding and classification providers** by [@Luca-Hackl](https://github.com/Luca-Hackl) in [#1296](https://github.com/promptfoo/promptfoo/pull/1296)

## [0.73.6] - 2024-07-25

### Added

- feat(ci): add Docker image publishing to GitHub Container Registry (#1263)
- feat(webui): add yaml upload button (#1264)

### Changed

- docs: fix javascript configuration guide variable example (#1268)
- site(careers): update application instructions and preferences (#1270)
- chore(python): enhance documentation, tests, formatting, and CI (#1282)
- fix: treat .cjs and .mjs files as javascript vars (#1267)
- fix: add xml tags for better delineation in `llm-rubric`, reduce `harmful` plugin false positives (#1269)
- fix: improve handling of json objects in http provider (#1274)
- fix: support provider json filepath (#1279)
- chore(ci): implement multi-arch Docker image build and push (#1266)
- chore(docker): add multi-arch image description (#1271)
- chore(eslint): add new linter rules and improve code quality (#1277)
- chore: move types files (#1278)
- refactor(redteam): rename strategies and improve type safety (#1275)
- ci: re-enable Node 22.x in CI matrix (#1272)
- chore: support loading .{,m,c}ts promptfooconfig files (#1284)

### Dependencies

- chore(deps): update ajv-formats from 2.1.1 to 3.0.1 (#1276)
- chore(deps): update @swc/core to version 1.7.1 (#1285)

## [0.73.5] - 2024-07-24

### Added

- **feat(cli):** Add the ability to share a specific eval by [@typpo](https://github.com/promptfoo/promptfoo/pull/1250)
- **feat(webui):** Hide long metrics lists by [@typpo](https://github.com/promptfoo/promptfoo/pull/1262)
- feat(webui): hide long metrics lists (#1262)
- feat: ability to share a specific eval (#1250)

### Changed

- **fix:** Resolve node-fetch TypeScript errors by [@mldangelo](https://github.com/promptfoo/promptfoo/pull/1254)
- **fix:** Correct color error in local `checkNodeVersion` test by [@mldangelo](https://github.com/promptfoo/promptfoo/pull/1255)
- **fix:** Multiple Docker fixes by [@typpo](https://github.com/promptfoo/promptfoo/pull/1257)
- **fix:** Improve `--add-strategies` validation error messages by [@typpo](https://github.com/promptfoo/promptfoo/pull/1260)
- **chore:** Warn when a variable is named `assert` by [@typpo](https://github.com/promptfoo/promptfoo/pull/1259)
- **chore:** Update Llama examples and add support for chat-formatted prompts in Replicate by [@typpo](https://github.com/promptfoo/promptfoo/pull/1261)
- chore: update llama examples and add support for chat formatted prompts in Replicate (#1261)
- chore: warn when a var is named assert (#1259)

### Fixed

- **fix(redteam):** Allow arbitrary `injectVar` name for redteam providers by [@mldangelo](https://github.com/promptfoo/promptfoo/pull/1253)
- fix: make --add-strategies validation have useful error (#1260)
- fix: multiple docker fixes (#1257)
- fix: color error in local checkNodeVersion test (#1255)
- fix: resolve node-fetch typescript errors (#1254)
- fix(redteam): allow arbitrary injectVar name for redteam providers (#1253)

## [0.73.4] - 2024-07-24

### Changed

- **schema**: Update config schema for strategies by @mldangelo in [#1244](https://github.com/promptfoo/promptfoo/pull/1244)
- **defaultTest**: Fix scenario assert merging by @onyck in [#1251](https://github.com/promptfoo/promptfoo/pull/1251)
- **webui**: Handle port already in use error by @mldangelo in [#1246](https://github.com/promptfoo/promptfoo/pull/1246)
- **webui**: Update provider list in `ProviderSelector` and add tests by @mldangelo in [#1245](https://github.com/promptfoo/promptfoo/pull/1245)
- **site**: Add blog post by @typpo in [#1247](https://github.com/promptfoo/promptfoo/pull/1247)
- **site**: Improve navigation and consistency by @mldangelo in [#1248](https://github.com/promptfoo/promptfoo/pull/1248)
- **site**: Add careers page by @mldangelo in [#1222](https://github.com/promptfoo/promptfoo/pull/1222)
- **docs**: Full RAG example by @typpo in [#1228](https://github.com/promptfoo/promptfoo/pull/1228)

## [0.73.3] - 2024-07-23

### Changed

- **WebUI:** Make eval switcher more obvious by @typpo in [#1232](https://github.com/promptfoo/promptfoo/pull/1232)
- **Redteam:** Add iterative tree provider and strategy by @mldangelo in [#1238](https://github.com/promptfoo/promptfoo/pull/1238)
- Improve `CallApiFunctionSchema`/`ProviderFunction` type by @aloisklink in [#1235](https://github.com/promptfoo/promptfoo/pull/1235)
- **Redteam:** CLI nits, plugins, provider functionality, and documentation by @mldangelo in [#1231](https://github.com/promptfoo/promptfoo/pull/1231)
- **Redteam:** PII false positives by @typpo in [#1233](https://github.com/promptfoo/promptfoo/pull/1233)
- **Redteam:** `--add-strategies` flag didn't work by @typpo in [#1234](https://github.com/promptfoo/promptfoo/pull/1234)
- Cleanup logging and fix nextui TS error by @mldangelo in [#1243](https://github.com/promptfoo/promptfoo/pull/1243)
- **CI:** Add registry URL to npm publish workflow by @mldangelo in [#1241](https://github.com/promptfoo/promptfoo/pull/1241)
- Remove redundant chalk invocations by @mldangelo in [#1240](https://github.com/promptfoo/promptfoo/pull/1240)
- Update dependencies by @mldangelo in [#1242](https://github.com/promptfoo/promptfoo/pull/1242)
- Update some images by @typpo in [#1236](https://github.com/promptfoo/promptfoo/pull/1236)
- More image updates by @typpo in [#1237](https://github.com/promptfoo/promptfoo/pull/1237)
- Update capitalization of Promptfoo and fix site deprecation warning by @mldangelo in [#1239](https://github.com/promptfoo/promptfoo/pull/1239)

## [0.73.2] - 2024-07-23

### Changed

- fix: add support for anthropic bedrock tools (#1229)
- chore(redteam): add a warning for no openai key set (#1230)

## [0.73.1] - 2024-07-22

### Changed

- fix: dont try to parse yaml content on load (#1226)

## [0.73.0] - 2024-07-22

### Added

- feat(redteam): add 4 new basic plugins (#1201)
- feat(redteam): improve test generation logic and add batching by @mldangelo in
- feat(redteam): settings dialog (#1215)https://github.com/promptfoo/promptfoo/pull/1208
- feat(redteam): introduce redteam section for promptfooconfig.yaml (#1192)

### Changed

- fix: gpt-4o-mini price (#1218)
- chore(openai): update model list (#1219)
- test: improve type safety and resolve TypeScript errors (#1216)
- refactor: resolve circular dependencies and improve code organization (#1212)
- docs: fix broken links (#1211)
- site: image updates and bugfixes (#1217)
- site: improve human readability of validator errors (#1221)
- site: yaml/json config validator for promptfoo configs (#1207)

### Fixed

- fix(validator): fix errors in default example (#1220)
- fix(webui): misc fixes and improvements to webui visuals (#1213)
- fix(redteam): mismatched categories and better overall scoring (#1214)
- fix(gemini): improve error handling (#1193)

### Dependencies

- chore(deps): update multiple dependencies to latest minor and patch versions (#1210)

## [0.72.2] - 2024-07-19

### Documentation

- docs: add guide for comparing GPT-4o vs GPT-4o-mini (#1200)

### Added

- **feat(openai):** add GPT-4o-mini models by [@mldangelo](https://github.com/promptfoo/promptfoo/pull/1196)
- feat(redteam): improve test generation logic and add batching (#1208)

### Changed

- **feat:** add schema validation to `promptfooconfig.yaml` by [@mldangelo](https://github.com/promptfoo/promptfoo/pull/1185)
- **fix:** base path for custom filter resolution by [@onyck](https://github.com/promptfoo/promptfoo/pull/1198)
- **chore(redteam):** refactor PII categories and improve plugin handling by [@mldangelo](https://github.com/promptfoo/promptfoo/pull/1191)
- **build(deps-dev):** bump `@aws-sdk/client-bedrock-runtime` from 3.614.0 to 3.616.0 by [@dependabot](https://github.com/promptfoo/promptfoo/pull/1203)
- **docs:** add guide for comparing GPT-4o vs GPT-4o-mini by [@mldangelo](https://github.com/promptfoo/promptfoo/pull/1200)
- **site:** contact page by [@typpo](https://github.com/promptfoo/promptfoo/pull/1190)
- **site:** newsletter form by [@typpo](https://github.com/promptfoo/promptfoo/pull/1194)
- **site:** miscellaneous images and improvements by [@typpo](https://github.com/promptfoo/promptfoo/pull/1199)
- build(deps-dev): bump @aws-sdk/client-bedrock-runtime from 3.614.0 to 3.616.0 (#1203)
- site: misc images and improvements (#1199)

### Fixed

- **fix(webui):** eval ID not being properly set by [@typpo](https://github.com/promptfoo/promptfoo/pull/1195)
- **fix(Dockerfile):** install curl for healthcheck by [@orange-anjou](https://github.com/promptfoo/promptfoo/pull/1204)
- fix(Dockerfile): install curl for healthcheck (#1204)
- fix: base path for custom filter resolution (#1198)

### Tests

- **test(webui):** add unit tests for `InfoModal` component by [@mldangelo](https://github.com/promptfoo/promptfoo/pull/1187)

## [0.72.1] - 2024-07-18

### Tests

- test(webui): add unit tests for InfoModal component (#1187)

### Fixed

- fix(webui): eval id not being properly set (#1195)

### Added

- feat(openai): add gpt-4o-mini models (#1196)
- feat: add schema validation to promptfooconfig.yaml (#1185)

### Changed

- Fix: Consider model name when caching Bedrock responses by @fvdnabee in [#1181](https://github.com/promptfoo/promptfoo/pull/1181)
- Fix: Parsing of the model name tag in Ollama embeddings provider by @minamijoyo in [#1189](https://github.com/promptfoo/promptfoo/pull/1189)
- Refactor (redteam): Simplify CLI command structure and update provider options by @mldangelo in [#1174](https://github.com/promptfoo/promptfoo/pull/1174)
- Refactor (types): Convert interfaces to Zod schemas by @mldangelo in [#1178](https://github.com/promptfoo/promptfoo/pull/1178)
- Refactor (redteam): Improve type safety and simplify code structure by @mldangelo in [#1175](https://github.com/promptfoo/promptfoo/pull/1175)
- Chore (redteam): Another injection by @typpo in [#1173](https://github.com/promptfoo/promptfoo/pull/1173)
- Chore (deps): Upgrade inquirer to v10 by @mldangelo in [#1176](https://github.com/promptfoo/promptfoo/pull/1176)
- Chore (redteam): Update CLI for test case generation by @mldangelo in [#1177](https://github.com/promptfoo/promptfoo/pull/1177)
- Chore: Include hostname in share confirmation by @typpo in [#1183](https://github.com/promptfoo/promptfoo/pull/1183)
- Build (deps-dev): Bump @azure/identity from 4.3.0 to 4.4.0 by @dependabot in [#1180](https://github.com/promptfoo/promptfoo/pull/1180)
- chore(redteam): refactor PII categories and improve plugin handling (#1191)
- site: newsletter form (#1194)
- site: contact page (#1190)

## [0.72.0] - 2024-07-17

### Added

- feat(webui): add about component with helpful links (#1149)
- feat(webui): Ability to compare evals (#1148)

### Changed

- feat: manual input provider (#1168)
- chore(mistral): add codestral-mamba (#1170)
- chore: static imports for iterative providers (#1169)

### Fixed

- fix(webui): dark mode toggle (#1171)
- fix(redteam): set harmCategory label for harmful tests (#1172)

## [0.71.1] - 2024-07-15

### Added

- feat(redteam): specify the default number of test cases to generate per plugin (#1154)

### Changed

- feat: add image classification example and xml assertions (#1153)

### Fixed

- fix(redteam): fix dynamic import paths (#1162)

## [0.71.0] - 2024-07-15

### Changed

- **Eval picker for web UI** by [@typpo](https://github.com/typpo) in [#1143](https://github.com/promptfoo/promptfoo/pull/1143)
- **Update default model providers to Claude 3.5** by [@mldangelo](https://github.com/mldangelo) in [#1157](https://github.com/promptfoo/promptfoo/pull/1157)
- **Allow provider customization for dataset generation** by [@mldangelo](https://github.com/mldangelo) in [#1158](https://github.com/promptfoo/promptfoo/pull/1158)
- **Predict Redteam injectVars** by [@mldangelo](https://github.com/mldangelo) in [#1141](https://github.com/promptfoo/promptfoo/pull/1141)
- **Fix JSON prompt escaping in HTTP provider and add LM Studio example** by [@mldangelo](https://github.com/mldangelo) in [#1156](https://github.com/promptfoo/promptfoo/pull/1156)
- **Fix poor performing harmful test generation** by [@mldangelo](https://github.com/mldangelo) in [#1124](https://github.com/promptfoo/promptfoo/pull/1124)
- **Update overreliance grading prompt** by [@mldangelo](https://github.com/mldangelo) in [#1146](https://github.com/promptfoo/promptfoo/pull/1146)
- **Move multiple variables warning to before progress bar** by [@typpo](https://github.com/typpo) in [#1160](https://github.com/promptfoo/promptfoo/pull/1160)
- **Add contributing guide** by [@mldangelo](https://github.com/mldangelo) in [#1150](https://github.com/promptfoo/promptfoo/pull/1150)
- **Refactor and optimize injection and iterative methods** by [@mldangelo](https://github.com/mldangelo) in [#1138](https://github.com/promptfoo/promptfoo/pull/1138)
- **Update plugin base class to support multiple assertions** by [@mldangelo](https://github.com/mldangelo) in [#1139](https://github.com/promptfoo/promptfoo/pull/1139)
- **Structural refactor, abstract plugin and method actions** by [@mldangelo](https://github.com/mldangelo) in [#1140](https://github.com/promptfoo/promptfoo/pull/1140)
- **Move CLI commands into individual files** by [@mldangelo](https://github.com/mldangelo) in [#1155](https://github.com/promptfoo/promptfoo/pull/1155)
- **Update Jest linter rules** by [@mldangelo](https://github.com/mldangelo) in [#1161](https://github.com/promptfoo/promptfoo/pull/1161)
- **Bump openai from 4.52.4 to 4.52.5** by [@dependabot](https://github.com/dependabot) in [#1137](https://github.com/promptfoo/promptfoo/pull/1137)
- **Bump @aws-sdk/client-bedrock-runtime from 3.613.0 to 3.614.0** by [@dependabot](https://github.com/dependabot) in [#1136](https://github.com/promptfoo/promptfoo/pull/1136)
- **Bump openai from 4.52.5 to 4.52.7** by [@dependabot](https://github.com/dependabot) in [#1142](https://github.com/promptfoo/promptfoo/pull/1142)
- **Update documentation and MUI dependencies** by [@mldangelo](https://github.com/mldangelo) in [#1152](https://github.com/promptfoo/promptfoo/pull/1152)
- **Update Drizzle dependencies and configuration** by [@mldangelo](https://github.com/mldangelo) in [#1151](https://github.com/promptfoo/promptfoo/pull/1151)
- **Bump dependencies with patch and minor version updates** by [@mldangelo](https://github.com/mldangelo) in [#1159](https://github.com/promptfoo/promptfoo/pull/1159)

## [0.70.1] - 2024-07-11

### Changed

- **provider**: put provider in outer loop to reduce model swap by @typpo in [#1132](https://github.com/promptfoo/promptfoo/pull/1132)
- **evaluator**: ensure unique prompt handling with labeled and unlabeled providers by @mldangelo in [#1134](https://github.com/promptfoo/promptfoo/pull/1134)
- **eval**: validate --output file extension before running eval by @mldangelo in [#1135](https://github.com/promptfoo/promptfoo/pull/1135)
- **deps-dev**: bump @aws-sdk/client-bedrock-runtime from 3.609.0 to 3.613.0 by @dependabot in [#1126](https://github.com/promptfoo/promptfoo/pull/1126)
- fix pythonCompletion test by @mldangelo in [#1133](https://github.com/promptfoo/promptfoo/pull/1133)

## [0.70.0] - 2024-07-10

### Changed

- feat: Add `promptfoo redteam init` command (#1122)
- chore: refactor eval and generate commands out of main.ts (#1121)
- build(deps): bump openai from 4.52.3 to 4.52.4 (#1118)
- refactor(redteam): relocate harmful and pii plugins from legacy directory (#1123)
- refactor(redteam): Migrate harmful test generators to plugin-based architecture (#1116)

### Fixed

- fix(redteam): use final prompt in moderation instead of original (#1117)

## [0.69.2] - 2024-07-08

### Changed

- feat: add support for nested grading results (#1101)
- fix: issue that caused harmful prompts to not save (#1112)
- fix: resolve relative paths for prompts (#1110)
- ci: compress images in PRs (#1108)
- site: landing page updates (#1096)

## [0.69.1] - 2024-07-06

### Changed

- **feat**: Add Zod schema validation for providers in `promptfooconfig` by @mldangelo in [#1102](https://github.com/promptfoo/promptfoo/pull/1102)
- **fix**: Re-add provider context in prompt functions by @mldangelo in [#1106](https://github.com/promptfoo/promptfoo/pull/1106)
- **fix**: Add missing `gpt-4-turbo-2024-04-09` by @aloisklink in [#1100](https://github.com/promptfoo/promptfoo/pull/1100)
- **chore**: Update minor and patch versions of several packages by @mldangelo in [#1107](https://github.com/promptfoo/promptfoo/pull/1107)
- **chore**: Format Python code and add check job to GitHub Actions workflow by @mldangelo in [#1105](https://github.com/promptfoo/promptfoo/pull/1105)
- **chore**: Bump version to 0.69.1 by @mldangelo
- **docs**: Add example and configuration guide for using `llama.cpp` by @mldangelo in [#1104](https://github.com/promptfoo/promptfoo/pull/1104)
- **docs**: Add Vitest integration guide by @mldangelo in [#1103](https://github.com/promptfoo/promptfoo/pull/1103)

## [0.69.0] - 2024-07-05

### Added

- feat(redteam): `extra-jailbreak` plugin that applies jailbreak to all probes (#1085)
- feat(webui): show metrics as % in column header (#1087)
- feat: add support for PROMPTFOO_AUTHOR environment variable (#1099)

### Changed

- feat: `llm-rubric` uses tools API for model-grading anthropic evals (#1079)
- feat: `--filter-providers` eval option (#1089)
- feat: add `author` field to evals (#1045)
- fix: improper path resolution for file:// prefixes (#1094)
- chore(webui): small changes to styling (#1088)
- docs: guide on how to do sandboxed evals on generated code (#1097)
- build(deps): bump replicate from 0.30.2 to 0.31.0 (#1090)

### Fixed

- fix(webui): Ability to toggle visibility of description column (#1095)

## [0.68.3] - 2024-07-04

### Tests

- test: fix assertion result mock pollution (#1086)

### Fixed

- fix: browser error on eval page with derived metrics that results when a score is null (#1093)
- fix(prompts): treat non-existent files as prompt strings (#1084)
- fix: remove test mutation for classifer and select-best assertion types (#1083)

### Added

- feat(openai): support for attachments for openai assistants (#1080)

### Changed

- **Features:**
  - Added support for attachments in OpenAI assistants by [@typpo](https://github.com/promptfoo/promptfoo/pull/1080)
- **Fixes:**
  - Removed test mutation for classifier and select-best assertion types by [@typpo](https://github.com/promptfoo/promptfoo/pull/1083)
  - Treated non-existent files as prompt strings by [@typpo](https://github.com/promptfoo/promptfoo/pull/1084)
  - Fixed assertion result mock pollution by [@mldangelo](https://github.com/promptfoo/promptfoo/pull/1086)
- **Dependencies:**
  - Bumped `openai` from 4.52.2 to 4.52.3 by [@dependabot](https://github.com/promptfoo/promptfoo/pull/1073)
  - Bumped `@aws-sdk/client-bedrock-runtime` from 3.606.0 to 3.609.0 by [@dependabot](https://github.com/promptfoo/promptfoo/pull/1072)

## [0.68.2] - 2024-07-03

### Changed

- build(deps): bump openai from 4.52.2 to 4.52.3 (#1073)
- build(deps-dev): bump @aws-sdk/client-bedrock-runtime from 3.606.0 to 3.609.0 (#1072)

### Added

- feat(webui): add scenarios to test suite configuration in yaml editor (#1071)

## [0.68.1] - 2024-07-02

### Fixed

- fix: resolve issues with relative prompt paths (#1066)
- fix: handle replicate ids without version (#1059)

### Added

- feat: support calling specific function from python provider (#1053)

### Changed

- **feat:** Support calling specific function from Python provider by [@typpo](https://github.com/promptfoo/promptfoo/pull/1053)
- **fix:** Resolve issues with relative prompt paths by [@mldangelo](https://github.com/promptfoo/promptfoo/pull/1066)
- **fix:** Handle replicate IDs without version by [@typpo](https://github.com/promptfoo/promptfoo/pull/1059)
- **build(deps):** Bump `@anthropic-ai/sdk` from 0.24.2 to 0.24.3 by [@dependabot](https://github.com/promptfoo/promptfoo/pull/1062)
- build(deps): bump @anthropic-ai/sdk from 0.24.2 to 0.24.3 (#1062)

## [0.68.0] - 2024-07-01

### Documentation

- docs: dalle jailbreak blog post (#1052)

### Added

- feat(webui): Add support for markdown tables and other extras by @typpo in [#1042](https://github.com/promptfoo/promptfoo/pull/1042)

### Changed

- feat: support for image model redteaming by @typpo in [#1051](https://github.com/promptfoo/promptfoo/pull/1051)
- feat: prompt syntax for bedrock llama3 by @fvdnabee in [#1038](https://github.com/promptfoo/promptfoo/pull/1038)
- fix: http provider returns the correct response format by @typpo in [#1027](https://github.com/promptfoo/promptfoo/pull/1027)
- fix: handle when stdout columns are not set by @typpo in [#1029](https://github.com/promptfoo/promptfoo/pull/1029)
- fix: support additional models via AWS Bedrock and update documentation by @mldangelo in [#1034](https://github.com/promptfoo/promptfoo/pull/1034)
- fix: handle imported single test case by @typpo in [#1041](https://github.com/promptfoo/promptfoo/pull/1041)
- fix: dereference promptfoo test files by @fvdnabee in [#1035](https://github.com/promptfoo/promptfoo/pull/1035)
- chore: expose runAssertion and runAssertions to node package by @typpo in [#1026](https://github.com/promptfoo/promptfoo/pull/1026)
- chore: add Node.js version check to ensure compatibility by @mldangelo in [#1030](https://github.com/promptfoo/promptfoo/pull/1030)
- chore: enable '@typescript-eslint/no-use-before-define' linter rule by @mldangelo in [#1043](https://github.com/promptfoo/promptfoo/pull/1043)
- docs: fix broken documentation links by @mldangelo in [#1033](https://github.com/promptfoo/promptfoo/pull/1033)
- docs: update anthropic.md by @Codeshark-NET in [#1036](https://github.com/promptfoo/promptfoo/pull/1036)
- ci: add GitHub Action for automatic version tagging by @mldangelo in [#1046](https://github.com/promptfoo/promptfoo/pull/1046)
- ci: npm publish workflow by @typpo in [#1044](https://github.com/promptfoo/promptfoo/pull/1044)
- build(deps): bump openai from 4.52.1 to 4.52.2 by @dependabot in [#1057](https://github.com/promptfoo/promptfoo/pull/1057)
- build(deps): bump @anthropic-ai/sdk from 0.24.1 to 0.24.2 by @dependabot in [#1056](https://github.com/promptfoo/promptfoo/pull/1056)
- build(deps-dev): bump @aws-sdk/client-bedrock-runtime from 3.602.0 to 3.606.0 by @dependabot in [#1055](https://github.com/promptfoo/promptfoo/pull/1055)
- build(deps): bump docker/setup-buildx-action from 2 to 3 in the github-actions group by @dependabot in [#1054](https://github.com/promptfoo/promptfoo/pull/1054)

## [0.67.0] - 2024-06-27

### Added

- feat(bedrock): add proxy support for AWS SDK (#1021)
- feat(redteam): Expose modified prompt for iterative jailbreaks (#1024)
- feat: replicate image provider (#1049)

### Changed

- feat: add support for gemini embeddings via vertex (#1004)
- feat: normalize prompt input formats, introduce single responsibility handlers, improve test coverage, and fix minor bugs (#994)
- fix: more robust json extraction for llm-rubric (#1019)
- build(deps): bump openai from 4.52.0 to 4.52.1 (#1015)
- build(deps): bump @anthropic-ai/sdk from 0.24.0 to 0.24.1 (#1016)
- chore: sort imports (#1006)
- chore: switch to smaller googleapis dependency (#1009)
- chore: add config telemetry (#1005)
- docs: update GitHub urls to reflect promptfoo github org repository location (#1011)
- docs: fix incorrect yaml ref in guide (#1018)

## [0.66.0] - 2024-06-24

### Changed

- `config get/set` commands, ability for users to set their email by [@typpo](https://github.com/typpo) in [#971](https://github.com/promptfoo/promptfoo/pull/971)
- **webui**: Download as CSV by [@typpo](https://github.com/typpo) in [#1000](https://github.com/promptfoo/promptfoo/pull/1000)
- Add support for Gemini default grader if credentials are present by [@typpo](https://github.com/typpo) in [#998](https://github.com/promptfoo/promptfoo/pull/998)
- **redteam**: Allow arbitrary providers by [@mldangelo](https://github.com/mldangelo) in [#1002](https://github.com/promptfoo/promptfoo/pull/1002)
- Derived metrics by [@typpo](https://github.com/typpo) in [#985](https://github.com/promptfoo/promptfoo/pull/985)
- Python provider can import modules with same name as built-ins by [@typpo](https://github.com/typpo) in [#989](https://github.com/promptfoo/promptfoo/pull/989)
- Include error text in all cases by [@typpo](https://github.com/typpo) in [#990](https://github.com/promptfoo/promptfoo/pull/990)
- Ensure tests inside scenarios are filtered by filter patterns by [@mldangelo](https://github.com/mldangelo) in [#996](https://github.com/promptfoo/promptfoo/pull/996)
- Anthropic message API support for env vars by [@typpo](https://github.com/typpo) in [#997](https://github.com/promptfoo/promptfoo/pull/997)
- Add build documentation workflow and fix typos by [@mldangelo](https://github.com/mldangelo) in [#993](https://github.com/promptfoo/promptfoo/pull/993)
- Block network calls in tests by [@typpo](https://github.com/typpo) in [#972](https://github.com/promptfoo/promptfoo/pull/972)
- Export `AnthropicMessagesProvider` from providers by [@greysteil](https://github.com/greysteil) in [#975](https://github.com/promptfoo/promptfoo/pull/975)
- Add Claude 3.5 sonnet pricing by [@typpo](https://github.com/typpo) in [#976](https://github.com/promptfoo/promptfoo/pull/976)
- Pass `tool_choice` to Anthropic when set in config by [@greysteil](https://github.com/greysteil) in [#977](https://github.com/promptfoo/promptfoo/pull/977)
- Fixed according to Ollama API specifications by [@keishidev](https://github.com/keishidev) in [#981](https://github.com/promptfoo/promptfoo/pull/981)
- Add Dependabot config and update provider dependencies by [@mldangelo](https://github.com/mldangelo) in [#984](https://github.com/promptfoo/promptfoo/pull/984)
- Don't commit `.env` to Git by [@will-holley](https://github.com/will-holley) in [#991](https://github.com/promptfoo/promptfoo/pull/991)
- Update Docker base image to Node 20, improve self-hosting documentation, and add CI action for Docker build by [@mldangelo](https://github.com/mldangelo) in [#995](https://github.com/promptfoo/promptfoo/pull/995)
- Allow variable cells to scroll instead of exploding the table height by [@grrowl](https://github.com/grrowl) in [#973](https://github.com/promptfoo/promptfoo/pull/973)

## [0.65.2] - 2024-06-20

### Documentation

- docs: update claude vs gpt guide with claude 3.5 (#986)

### Added

- feat(redteam): make it easier to add non default plugins (#958)

### Changed

- feat: contains-sql assert (#964)
- fix: handle absolute paths for js providers (#966)
- fix: label not showing problem when using eval with config option (#928)
- fix: should return the whole message if the OpenAI return the content and the function call/tools at the same time. (#968)
- fix: label support for js prompts (#970)
- docs: Add CLI delete command to docs (#959)
- docs: text to sql validation guide (#962)

### Fixed

- fix(redteam): wire ui to plugins (#965)
- fix(redteam): reduce overreliance, excessive-agency false positive rates (#963)

## [0.65.1] - 2024-06-18

### Changed

- chore(docs): add shell syntax highlighting and fix typos (#953)
- chore(dependencies): update package dependencies (#952)
- Revert "feat(cli): add tests for CLI commands and fix version flag bug" (#967)

### Fixed

- fix: handle case where returned python result is null (#957)
- fix(webui): handle empty fail reasons and null componentResults (#956)

### Added

- feat(cli): add tests for CLI commands and fix version flag bug (#954)
- feat(eslint): integrate eslint-plugin-jest and configure rules (#951)
- feat: add eslint-plugin-unused-imports and remove unused imports (#949)
- feat: assertion type: is-sql (#926)

## [0.65.0] - 2024-06-17

### Added

- feat(webui): show pass/fail toggle (#938)
- feat(webui): carousel for multiple failure reasons (#939)
- feat(webui): clicking metric pills filters by nonzero only (#941)
- feat(redteam): political statements (#944)
- feat(redteam): indicate performance with moderation filter (#933)

### Changed

- feat: add hf to onboarding flow (#947)
- feat: add support for `promptfoo export latest` (#948)
- fix: serialize each item in `vars` when its type is a string (#823) (#943)
- chore(webui): split ResultsTable into separate files (#942)

### Fixed

- fix(redteam): more aggressive contract testing (#946)

### Dependencies

- chore(deps): update dependencies without breaking changes (#937)

## [0.64.0] - 2024-06-15

### Added

- feat(redteam): add unintended contracts test (#934)
- feat(anthropic): support tool use (#932)

### Changed

- feat: export `promptfoo.cache` to node package (#923)
- feat: add Voyage AI embeddings provider (#931)
- feat: Add more Portkey header provider options and create headers automatically (#909)
- fix: handle openai chat-style messages better in `moderation` assert (#930)
- ci: add next.js build caching (#908)
- chore(docs): update installation and GitHub Actions guides (#935)
- chore(dependencies): bump LLM providers in package.json (#936)

### Fixed

- fix(bedrock): support cohere embeddings (#924)

### Dependencies

- chore(deps): bump braces from 3.0.2 to 3.0.3 (#918)

## [0.63.2] - 2024-06-10

### Added

- feat: report view for redteam evals (#920)

### Fixed

- fix(bedrock): default value for configs (#917)
- fix: prevent assertions from being modified as they run (#929)

## [0.63.1] - 2024-06-10

### Fixed

- fix(vertex): correct handling of system instruction (#911)
- fix(bedrock): support for llama, cohere command and command-r, mistral (#915)

## [0.63.0] - 2024-06-09

### Added

- feat(bedrock): Add support for mistral, llama, cohere (#885)
- feat(ollama): add OLLAMA_API_KEY to support authentication (#883)
- feat(redteam): add test for competitor recommendations (#877)
- feat(webui): Show the number of passes and failures (#888)
- feat(webui): show manual grading record in test details view (#906)
- feat(webui): use indexeddb instead of localstorage (#905)

### Changed

- feat: ability to set test case metric from csv (#889)
- feat: interactive onboarding (#886)
- feat: support `threshold` param from csv (#903)
- feat: support array of values for `similar` assertion (#895)
- fix: Prompt variable reads unprocessed spaces on both sides (#887)
- fix: windows node 22 flake (#907)
- [fix: ci passing despite failing build (](https://github.com/promptfoo/promptfoo/commit/ce6090be5d70fbe71c6da0a5ec1a73253a9d8a0e)https://github.com/promptfoo/promptfoo/pull/876[)](https://github.com/promptfoo/promptfoo/commit/ce6090be5d70fbe71c6da0a5ec1a73253a9d8a0e)
- [fix: incorrect migrations path in docker build](https://github.com/promptfoo/promptfoo/commit/6a1eef4e4b006b32de9ce6e5e2d7c0bd3b9fa95a) https://github.com/promptfoo/promptfoo/issues/861
- chore(ci): add `workflow_dispatch` trigger (#897)
- chore: add more gemini models (#894)
- chore: introduce eslint (#904)
- chore: switch to SWC for faster Jest tests (#899)
- chore: update to prettier 3 (#901)
- [chore(openai): add tool_choice required type](https://github.com/promptfoo/promptfoo/commit/e97ce63221b0e06f7e03f46c466da36c5b713017)

### Fixed

- fix(vertex): support var templating in system instruction (#902)
- [fix(webui): display latency when available](https://github.com/promptfoo/promptfoo/commit/bb335efbe9e8d6b23526c837402787a1cbba9969)

### Dependencies

- chore(deps): update most dependencies to latest stable versions (#898)

## [0.62.1] - 2024-06-06

### Added

- feat(webui): Ability to suppress browser open on `promptfoo view` (#881)
- feat(anthropic): add support for base url (#850)
- feat(openai): Support function/tool callbacks (#830)
- feat(vertex/gemini): add support for toolConfig and systemInstruction (#841)
- feat(webui): Ability to filter to highlighted cells (#852)
- feat(webui): ability to click to filter metric (#849)
- feat(webui): add copy and highlight cell actions (#847)

### Changed

- fix: migrate database before writing results (#882)
- chore: upgrade default graders to gpt-4o (#848)
- ci: Introduce jest test coverage reports (#868)
- ci: add support for node 22, remove support for node 16 (#836)
- docs: Addresses minor typographical errors (#845)
- docs: Help description of default `--output` (#844)
- feat: Add Red Team PII Tests (#862)
- feat: Support custom gateway URLs in Portkey (#840)
- feat: add support for python embedding and classification providers (#864)
- feat: add support for titan premier on bedrock (#839)
- feat: pass evalId in results (#758)
- fix: Broken types (#854)
- fix: Fix broken progress callback in web ui (#860)
- fix: Fix formatting and add style check to CI (#872)
- fix: Fix type error eval page.tsx (#867)
- fix: Improve Error Handling for Python Assertions and Provider Exceptions (#863)
- fix: Pass evaluateOptions from web ui yaml (#859)
- fix: Render multiple result images with markdown, if markdown contains multiple images (#873)
- fix: The values of defaultTest and evaluateOptions are not set when editing the eval yaml file. (#834)
- fix: crash on db migration when cache is disabled on first run (#842)
- fix: csv and html outputs include both prompt and provider labels (#851)
- fix: docker build and prepublish script (#846)
- fix: show labels for custom provider (#875)
- chore: fix windows node 22 build issues by adding missing encoding dependency and updating webpack config (#900)
- chore: update Node.js version management and improve documentation (#896)
- Fix CI Passing Despite Failing Build (#866) (#876)

## [0.62.0] - 2024-06-05

### Fixed

- fix: Parameter evaluateOptions not passed correctly in jobs created using web (#870)

### Added

- feat(anthropic): add support for base url (#850)
- feat(openai): Support function/tool callbacks (#830)
- feat(vertex/gemini): add support for toolConfig and systemInstruction (#841)
- feat(webui): Ability to filter to highlighted cells (#852)
- feat(webui): ability to click to filter metric (#849)
- feat(webui): add copy and highlight cell actions (#847)

### Changed

- feat: Add Red Team PII Tests (#862)
- feat: Support custom gateway URLs in Portkey (#840)
- feat: add support for python embedding and classification providers (#864)
- feat: add support for titan premier on bedrock (#839)
- feat: pass evalId in results (#758)
- feat: upgrade default graders to gpt-4o (#848)
- fix: Broken types (#854)
- fix: Fix broken progress callback in web ui (#860)
- fix: Fix formatting and add style check to CI (#872)
- fix: Fix type error eval page.tsx (#867)
- fix: Improve Error Handling for Python Assertions and Provider Exceptions (#863)
- fix: Pass evaluateOptions from web ui yaml (#859)
- fix: Render multiple result images with markdown, if markdown contains multiple images (#873)
- fix: The values of defaultTest and evaluateOptions are not set when editing the eval yaml file. (#834)
- fix: crash on db migration when cache is disabled on first run (#842)
- fix: csv and html outputs include both prompt and provider labels (#851)
- fix: docker build and prepublish script (#846)
- fix: show labels for custom provider (#875)
- ci: Introduce jest test coverage reports (#868)
- ci: add support for node 22, remove support for node 16 (#836)
- docs: Addresses minor typographical errors (#845)
- docs: Help description of default `--output` (#844)

## [0.61.0] - 2024-05-30

### Changed

- feat: `moderation` assert type (#821)
- feat: general purpose http/https provider (#822)
- feat: add portkey provider (#819)
- feat: Add Cloudflare AI Provider (#817)
- fix: Remove duplicate logging line (#825)
- fix: The ‘defaultTest’ option has no effect during evaluation. (#829)
- fix: Improve Error Handling in Python Script Execution (#833)
- docs: How to red team LLMs (#828)
- chore(mistral): add codestral (#831)

## [0.60.0] - 2024-05-25

### Added

- feat(webui): Add image viewer (#816)

### Changed

- feat: redteam testset generation (#804)
- feat: support for deep equality check in equals assertion (#805)
- feat: Allow functions in renderVarsInObject (#813)
- feat: ability to reference previous llm outputs via storeOutputAs (#808)
- feat: support for prompt objects (#818)
- fix: huggingface api key handling (#809)
- docs: Restore ProviderResponse class name (#806)
- docs: Fix typo in local build command (#811)

## [0.59.1] - 2024-05-18

### Changed

- [fix: handle null result timestamp when writing to db.](https://github.com/promptfoo/promptfoo/commit/40e1ebfbfd512fea56761b4cbdfff0cd25d61ae1) https://github.com/promptfoo/promptfoo/issues/800

## [0.59.0] - 2024-05-18

### Added

- feat(webui): add --filter-description option to `promptfoo view` (#780)
- feat(bedrock): add support for embeddings models (#797)

### Changed

- fix: python prompts break when using whole file (#784)
- Langfuse need to compile variables (#779)
- chore(webui): display prompt and completion tokens (#794)
- chore: include full error response in openai errors (#791)
- chore: add logprobs to assertion context (#790)
- feat: support var interpolation in function calls (#792)
- chore: add timestamp to EvaluateSummary (#785)
- fix: render markdown in variables too (#796)

### Fixed

- fix(vertex): remove leftover dependency on apiKey (#798)

## [0.58.1] - 2024-05-14

### Changed

- fix: improve GradingResult validation (#772)
- [fix: update python ProviderResponse error message and docs.](https://github.com/promptfoo/promptfoo/commit/258013080809bc782afe3de51c9309230cb5cdb2) https://github.com/promptfoo/promptfoo/issues/769
- [chore(openai): add gpt-4o models (](https://github.com/promptfoo/promptfoo/commit/ff4655d31d3588972522bb162733cb61e460f36f)https://github.com/promptfoo/promptfoo/pull/776[)](https://github.com/promptfoo/promptfoo/commit/ff4655d31d3588972522bb162733cb61e460f36f)
- add gpt-4o models (#776)

### Fixed

- fix(langfuse): Check runtime type of `getPrompt`, stringify the result (#774)

## [0.58.0] - 2024-05-09

### Changed

- feat: assert-set (#765)
- feat: add comma-delimited string support for array-type assertion values (#755)
- fix: Resolve JS assertion paths relative to configuration file (#756)
- fix: not-equals assertion (#763)
- fix: upgrade rouge package and limit to strings (#764)

## [0.57.1] - 2024-05-02

### Changed

- fix: do not serialize js objects to non-js providers (#754)
- **[See 0.57.0 release notes](https://github.com/promptfoo/promptfoo/releases/tag/0.57.0)**

## [0.57.0] - 2024-05-01

### Changed

- feat: ability to override provider per test case (#725)
- feat: eval tests matching pattern (#735)
- feat: add `-n` limit arg for `promptfoo list` (#749)
- feat: `promptfoo import` and `promptfoo export` commands (#750)
- feat: add support for `--var name=value` cli option (#745)
- feat: promptfoo eval --filter-failing outputFile.json (#742)
- fix: eval --first-n arg (#734)
- chore: Update openai package to 3.48.5 (#739)
- chore: include logger and cache utils in javascript provider context (#748)
- chore: add `PROMPTFOO_FAILED_TEST_EXIT_CODE` envar (#751)
- docs: Document `python:` prefix when loading assertions in CSV (#731)
- docs: update README.md (#733)
- docs: Fixes to Python docs (#728)
- docs: Update to include --filter-\* cli args (#747)

## [0.56.0] - 2024-04-28

### Added

- feat(webui): improved comment dialog (#713)

### Changed

- feat: Intergration with Langfuse (#707)
- feat: Support IBM Research BAM provider (#711)
- fix: Make errors uncached in Python completion. (#706)
- fix: include python tracebacks in python errors (#724)
- fix: `getCache` should return a memory store when disk caching is disabled (#715)
- chore(webui): improve eval view performance (#719)
- chore(webui): always show provider in header (#721)
- chore: add support for OPENAI_BASE_URL envar (#717)

### Fixed

- fix(vertex/gemini): support nested generationConfig (#714)

## [0.55.0] - 2024-04-24

### Changed

- [Docs] Add llama3 example to ollama docs (#695)
- bugfix in answer-relevance (#697)
- feat: add support for provider `transform` property (#696)
- feat: add support for provider-specific delays (#699)
- feat: portkey.ai integration (#698)
- feat: `eval -n` arg for running the first n test cases (#700)
- feat: ability to write outputs to google sheet (#701)
- feat: first-class support for openrouter (#702)
- Fix concurrent cache request behaviour (#703)

## [0.54.1] - 2024-04-20

### Changed

- Add support for Mixtral 8x22B (#687)
- fix: google sheets async loading (#688)
- fix: trim spaces in csv assertions that can have file:// prefixes (#689)
- fix: apply thresholds to custom python asserts (#690)
- fix: include detail from external python assertion (#691)
- chore(webui): allow configuration of results per page (#694)
- fix: ability to override rubric prompt for all model-graded metrics (#692)

## [0.54.0] - 2024-04-18

### Changed

- feat: support for authenticated google sheets access (#686)
- fix: bugs in `Answer-relevance` calculation (#683)
- fix: Add tool calls to response from azure openai (#685)

## [0.53.0] - 2024-04-16

### Changed

- fix!: make `javascript` assert function call consistent with external js function call (#674)
- fix: node library supports prompt files (#668)
- feat: Enable post-hoc evaluations through defining and using output value in TestSuite (#671)
- feat: Allow local files to define providerOutput value for TestCase (#675)
- feat: detect suitable anthropic default provider (#677)
- feat: Ability to delete evals (#676)
- feat: ability to create derived metrics (#670)

## [0.52.0] - 2024-04-12

### Added

- feat(webui): add pagination (#649)

### Changed

- feat: support for inline yaml for is-json, contains-json in csv (#651)
- feat: run providers 1 at a time with --interactive-providers (#645)
- feat: --env-file arg (#615)
- fix: Do not fail with api error when azure datasource is used (#644)
- fix: allow loading of custom provider in windows (#518) (#652)
- fix: don't show telemetry message without telemtry (#658)
- fix: `E2BIG` error during the execution of Python asserts (#660)
- fix: support relative filepaths for non-code assert values (#664)

### Fixed

- fix(webui): handle invalid search regexes (#663)

## [0.51.0] - 2024-04-07

### Added

- feat(webui): store settings in localstorage (#617)
- feat(azureopenai): apiKeyEnvar support (#628)
- feat(webui): "progress" page that shows provider/prompt pairs (#631)

### Changed

- chore: improve json parsing errors (#620)
- feat: ability to override path to python binary (#619)
- Add documentation for openai vision (#637)
- Support claude vision and images (#639)
- fix: assertion files use relative path (#624)
- feat: add provider reference to prompt function (#633)
- feat: ability to import vars using glob (#641)
- feat!: return values directly in python assertions (#638)

### Fixed

- fix(webui): ability to save defaultTest and evaluateOptions in yaml editor (#629)

## [0.50.1] - 2024-04-02

### Changed

- fix: compiled esmodule interop (#613)
- fix: downgrade var resolution failure to warning (#614)
- fix: glob behavior on windows (#612)

## [0.50.0] - 2024-04-01

### Added

- feat(webui): download button (#482)
- feat(webui): toggle for showing full prompt in output cell (#603)

### Changed

- feat: support .mjs external imports (#601)
- feat: load .env from cli (#602)
- feat: ability to use js files as `transform` (#605)
- feat: ability to reference vars from other vars (#607)
- fix: handling for nonscript assertion files (#608)

### Fixed

- fix(selfhost): add support for prompts and datasets api endpoints (#600)
- fix(selfhost): Consolidate to `NEXT_PUBLIC_PROMPTFOO_REMOTE_BASE_URL` (#609)

## [0.49.3] - 2024-03-29

### Changed

- fix: bedrock model parsing (#593)
- [fix: make llm-rubric more resilient to bad json responses.](https://github.com/promptfoo/promptfoo/commit/93fd059a13454ed7a251a90a33306fb1f3c81895) https://github.com/promptfoo/promptfoo/issues/596
- feat: display progress bar for each parallel execution (#597)

## [0.49.2] - 2024-03-27

### Changed

- fix: support relative paths for custom providers (#589)
- fix: gemini generationConfig and safetySettings (#590)
- feat: cli watch for vars and providers (#591)

## [0.49.1] - 2024-03-25

### Changed

- fix: lazy import of azure peer dependency (#586)

## [0.49.0] - 2024-03-23

### Added

- feat(vertexai): use gcloud application default credentials (#580)

### Changed

- feat: Add support for huggingface token classification (#574)
- feat: Mistral provider support for URL and API key envar (#570)
- feat: run assertions in parallel (#575)
- feat: support for azure openai assistants (#577)
- feat: ability to set tags on standalone assertion llm outputs (#581)
- feat: add support for claude3 on bedrock (#582)
- fix: load file before running prompt function (#583)
- [fix: broken ansi colors on cli table](https://github.com/promptfoo/promptfoo/commit/bbb0157b09c0ffb5366d3cbd112438ca3d2d61c9)
- [fix: remove duplicate instruction output](https://github.com/promptfoo/promptfoo/commit/fb095617d36102f5b6256e9718e736378c0a5cea)
- chore: better error messages when expecting json but getting text (#576)

### Fixed

- fix(selfhost): handle sqlite db in docker image and build (#568)

### Dependencies

- chore(deps): bump webpack-dev-middleware from 5.3.3 to 5.3.4 in /site (#579)

## [0.48.0] - 2024-03-18

### Added

- feat(csv): add support for `__description` field (#556)

### Changed

- feat: migrate filesystem storage to sqlite db (#558)
  - **When you first run `eval` or `view` with 0.48.0, your saved evals will be migrated from `.json` files to a sqlite db. Please open an issue if you run into problems.**
  - Restoration: By default, the migration process runs on the promptfoo output directory `~/.promptfoo/output`. This directory is backed up at `~/.promptfoo/output-backup-*` and you can restore it and use a previous version by renaming that directory back to `output`
- feat: Add anthropic:messages and replicate:mistral as default providers to web ui (#562)
- feat: add label field to provider options (#563)
- docs: adjust configuration for python provider (#565)
- chore: db migration and cleanup (#564)

### Fixed

- fix(azureopenai): add support for `max_tokens` and `seed` (#561)

## [0.47.0] - 2024-03-14

### Changed

- feat: improve python inline asserts to not require printing (#542)
- feat: add tools and tool_choice config parameters to azure openai provider (#550)
- feat: Add support for Claude 3 Haiku (#552)
- fix: validate custom js function return values (#548)
- fix: dedupe prompts from combined configs (#554)

### Fixed

- fix(replicate): support non-array outputs (#547)

## [0.46.0] - 2024-03-08

### Added

- feat(self-host): run evals via web ui (#540)
- feat(self-host): Persist changes on self-deployed UI without sharing a new link (#538)
- feat(webui): ability to change eval name (#537)

### Changed

- feat: add support for calling specific functions for python prompt (#533)
- fix: openai tools and function checks handle plaintext responses (#541)

### Fixed

- fix(anthropic): wrap text if prompt supplied as json (#536)

## [0.45.2] - 2024-03-07

### Changed

- fix: python provider handles relative script paths correctly (#535)

## [0.45.1] - 2024-03-06

### Changed

- fix: json and yaml vars files (#531)

### Fixed

- fix(python): deserialize objects from json (#532)

## [0.45.0] - 2024-03-06

### Added

- feat(anthropic): Add Claude 3 support (#526)

### Changed

- feat: ability to load `vars` values at runtime (#496)
  // Example logic to return a value based on the varName
  if (varName === 'context') {
  return `Processed ${otherVars.input} for prompt: ${prompt}`;
  }
  return {
  output: 'default value',
  };
  // Handle potential errors
  // return { error: 'Error message' }
  # Example logic to dynamically generate variable content
  if var_name == 'context':
  return {
  'output': f"Context for {other_vars['input']} in prompt: {prompt}"
  }
  return {'output': 'default context'}
  # Handle potential errors
  # return { 'error': 'Error message' }

## [0.44.0] - 2024-03-04

### Added

- feat(mistral): Add new models, JSON mode, and update pricing (#500)

### Changed

- fix: Print incorrect response from factuality checker (#503)
- fix: Support missing open parenthesis (fixes #504) (#505)
- feat: include prompt in transform (#512)
- feat: Support csv and json files in the `tests` array (#520)

### Fixed

- fix(ollama): dont send invalid options for `OllamaChatProvider` (#506)
- fix(huggingface): do not pass through non-hf parameters (#519)

## [0.43.1] - 2024-02-25

### Changed

- fix: pass through PROMPTFOO\_\* variables from docker run (#498)
- docs: clean up python provider header

### Fixed

- fix(huggingface): support `apiKey` config param (#494)
- fix(bedrock): transform model output from cache. #474

### Documentation

- docs(huggingface): example of private huggingface inference endpoint (#497)

## [0.43.0] - 2024-02-23

### Added

- feat(webui): Display test suite description (#487)
- feat(webui): Add upload testcase csv to eval page (#484)

### Changed

- feat: pass `test` to assertion context (#485)
- fix: Change variable name to what the prompt template expects (#489)
- (docs): Replace references to deprecated postprocess option (#483)
- chore: update replicate library and add new common params (#491)

### Fixed

- fix(self-hosting): remove supabase dependency from webui eval view (#492)

## [0.42.0] - 2024-02-19

### Added

- feat(webview): toggle for prettifying json outputs (#472)
- feat(openai): support handling OpenAI Assistant functions tool calls (#473)

### Changed

- feat: add support for claude 2.1 on bedrock (#470)
- feat: support for overriding `select-best` provider (#478)
- feat: ability to disable var expansion (#476)
- fix: improve escaping for python prompt shell (#481)

## [0.41.0] - 2024-02-12

### Added

- feat(openai)!: Allow apiBaseUrl to override /v1 endpoint (#464)

### Changed

- feat: add support for async python providers (#465)
- fix: pass config to python provider (#460)
- chore: include progress output in debug logs (#461)
- docs: perplexity example (#463)

### Fixed

- fix(factuality): make factuality output case-insensitive (#468)
- fix: ensure that only valid ollama params are passed (#480)

## [0.40.0] - 2024-02-06

### Added

- feat(mistral): Add Mistral provider (#455)
- feat(openai): add support for `apiKeyEnvar` (#456)
- feat(azureopenai): add apiBaseUrl config (#459)

### Changed

- feat: cohere api support (#457)
- feat: ability to override select-best prompt. #289
- fix: support for gemini generationConfig and safetySettings (#454)

### Fixed

- fix(vertex/gemini): add support for llm-rubric and other OpenAI-formatted prompts (#450)

### Documentation

- documentation: update python.md typo in yaml (#446)

## [0.39.1] - 2024-02-02

### Changed

- fix: func => function in index.ts (#443)
- feat: add support for google ai studio gemini (#445)

## [0.39.0] - 2024-02-01

### Changed

- feat: Add DefaultGradingJsonProvider to improve `llm-rubric` reliability (#432)
- feat: add caching for exec and python providers (#435)
- feat: add `--watch` option to eval command (#439)
- feat: ability to transform output on per-assertion level (#437)
- feat: compare between multiple outputs with `select-best` (#438)
- fix: pass through cost to runAssertion
- fix: pass through cost to runAssertion

## [0.38.0] - 2024-01-29

### Added

- feat(openai): Jan 25 model updates (#416)
- feat(webui): eval deeplinks (#426)
- feat(huggingface): Support sentence similarity inference API (#425)

### Changed

- fix: Only open previous results when necessary (uses lots of memory) (#418)
- fix: html output (#430)
- feat: add a `python` provider that supports native python function calls (#419)
- feat: support for image models such as dall-e (#406)
- feat: support for `PROMPTFOO_PROMPT_SEPARATOR envar. #424

## [0.37.1] - 2024-01-26

### Changed

- fix: do not require token usage info on openai provider (#414)

## [0.37.0] - 2024-01-24

### Added

- feat(webui): add markdown support (#403)

### Changed

- feat: standalone share server (#408)
- feat: `PROMPTFOO_DISABLE_TEMPLATING` disables nunjucks templates (#405)

## [0.36.0] - 2024-01-18

### Added

- feat(webui): Ability to comment on outputs (#395)
- feat(azure): Add response_format support (#402)
- feat(azure): add support for `passthrough` and `apiVersion` (#399)

### Changed

- feat: add `promptfoo generate dataset` (#397)
- fix: typo (#401)

## [0.35.1] - 2024-01-12

### Added

- feat(bedrock): introduce amazon titan models as another option for Bedrock (#380)
- feat(openai): add support for `passthrough` request args (#388)
- feat(azure): add support for client id/secret auth (#389)
- feat(webui): label evals using `description` field (#391)

### Changed

- fix: proper support for multiple types of test providers (#386)
- feat: update CSV and HTML outputs with more details (#393)

## [0.35.0] - 2024-01-07

### Added

- feat(webview): add regex search (#378)

### Changed

- feat: support standalone assertions on CLI (#368)
- feat: add perplexity-score metric (#377)
- feat: add logprobs support for azure openai (#376)
- fix: use relative paths consistently and handle object formats (#375)
- [fix: restore **prefix and **suffix column handlers when loading test csv](https://github.com/promptfoo/promptfoo/commit/3a058684b3389693f4c5899f786fb090b04e3c93)

## [0.34.1] - 2024-01-02

### Added

- feat(openai): add support for overriding provider cost (1be1072)

### Fixed

- fix(webview): increase the request payload size limit (ef4c30f)

## [0.34.0] - 2024-01-02

### Changed

- feat: Support for evaluating cost of LLM inference (#358)
- feat: save manual edits to test outputs in webview (#362)
- feat: add `cost` assertion type (#367)
- fix: handle huggingface text generation returning dict (#357)
- fix: disable cache when using repeat (#361)
- fix: do not dereference tools and functions in config (#365)
- docs: optimize docs of openai tool usage (#355)

## [0.33.2] - 2023-12-23

### Changed

- fix: bad indentation for inline python sript (#353)
- [fix: truncate CLI table headers](https://github.com/promptfoo/promptfoo/commit/9aa9106cc9bc1660df40117d3c8f053f361fa09c)
- feat: add openai tool parameter (#350)
- feat: add `is-valid-openai-tools-call` assertion type (#354)

## [0.33.1] - 2023-12-18

### Changed

- [fix: pass env to providers when using CLI](https://github.com/promptfoo/promptfoo/commit/e8170a7f0e9d4033ef219169115f6474d978f1a7)
- [fix: correctly handle bedrock models containing :](https://github.com/promptfoo/promptfoo/commit/4469b693993934192fee2e84cc27c21e31267e5f)
- feat: add latency assertion type (#344)
- feat: add perplexity assertion type (#346)
- feat: add support for ollama chat API (#342)
- feat: retry when getting internal server error with PROMPTFOO_RETRY_5XX envar (#327)
- fix: properly escape arguments for external python assertions (#338)
- fix: use execFile/spawn for external processes (#343)
- [fix: handle null score in custom metrics](https://github.com/promptfoo/promptfoo/commit/514feed49e2f83f3e04d3e167e5833dc075e6c10)
- [fix: increment failure counter for script errors.](https://github.com/promptfoo/promptfoo/commit/61d1b068f26c63f3234dc49c9d5f5104b9cf1cda)

## [0.33.0] - 2023-12-17

### Changed

- feat: add latency assertion type (#344)
- feat: add perplexity assertion type (#346)
- feat: add support for ollama chat API (#342)
- feat: retry when getting internal server error with PROMPTFOO_RETRY_5XX envar (#327)
- fix: properly escape arguments for external python assertions (#338)
- fix: use execFile/spawn for external processes (#343)
- [fix: handle null score in custom metrics](https://github.com/promptfoo/promptfoo/commit/514feed49e2f83f3e04d3e167e5833dc075e6c10)
- [fix: increment failure counter for script errors.](https://github.com/promptfoo/promptfoo/commit/61d1b068f26c63f3234dc49c9d5f5104b9cf1cda)

## [0.32.0] - 2023-12-14

### Added

- feat(webview): Layout and styling improvements (#333)

### Changed

- feat: add support for Google Gemini model (#336)
- feat: add download yaml button in config modal. Related to #330 (#332)
- fix: set process exit code on failure

## [0.31.2] - 2023-12-11

### Added

- feat(webview): Show aggregated named metrics at top of column (#322)

### Changed

- fix: sharing option is degraded (#325)

## [0.31.1] - 2023-12-04

### Changed

- fix: issues when evaling multiple config files
- feat: support for web viewer running remotely (#321)

## [0.31.0] - 2023-12-02

### Added

- feat(openai): Adds support for function call validation (#316)

### Changed

- feat: add support for ajv formats (#314)
- feat: support prompt functions via nodejs interface (#315)
- fix: webview handling of truncated cell contents with html (#318)
- docs: Merge docs into main repo (#317)

## [0.30.2] - 2023-11-29

### Changed

- feat(cli): simplify onboarding and provide npx-specific instructions (f81bd88)

## [0.30.1] - 2023-11-29

### Changed

- feat: add bedrock in webui setup (#301)
- feat: add support for custom metrics (#305)
- feat: show table by default, even with --output (#306)
- fix: handle multiple configs that import multiple prompts (#304)
- fix: remove use of dangerouslySetInnerHTML in results table (#309)

### Fixed

- fix(openai): add support for overriding api key, host, baseurl, org in Assistants API (#311)

## [0.30.0] - 2023-11-29

### Changed

- feat: add bedrock in webui setup (#301)
- feat: add support for custom metrics (#305)
- feat: show table by default, even with --output (#306)
- fix: handle multiple configs that import multiple prompts (#304)
- fix: remove use of dangerouslySetInnerHTML in results table (#309)

## [0.29.0] - 2023-11-28

### Changed

- feat: Add support for external provider configs via file:// (#296)
- feat: Add support for HTTP proxies (#299)
- feat: claude-based models on amazon bedrock (#298)

## [0.28.2] - 2023-11-27

### Added

- feat(azureopenai): Warn when test provider should be overwritten with azure (#293)
- feat(webview): Display test descriptions if available (#294)
- feat(webview): Ability to set test scores manually (#295)

### Changed

- feat: add support for self-hosted huggingface text generation inference (#290)
- fix: prevent duplicate asserts with `defaultTest` (#287)
- fix: multiple configs handle external test and prompt files correctly (#291)

## [0.28.0] - 2023-11-19

### Changed

- feat: Add support for multiple "\_\_expected" columns (#284)
- feat: Support for OpenAI assistants API (#283)
- feat: Ability to combine multiple configs into a single eval (#285)

## [0.27.1] - 2023-11-14

### Added

- [feat(node-package): Add support for raw objects in prompts](https://github.com/promptfoo/promptfoo/commit/e6a5fe2fa7c05aabd2f52bd4fa143d957a7953dd)
- feat(openai): Add support for OpenAI `seed` param (#275)
- [feat(openai): Add support for OpenAI response_format](https://github.com/promptfoo/promptfoo/commit/12781f11f495bed21db1070e987f1b40a43b72e3)
- [feat(webview): Round score in details modal](https://github.com/promptfoo/promptfoo/commit/483c31d79486a75efc497508b9a42257935585cf)

### Changed

- fix: Set `vars._conversation` only if it is used in prompt (#282)
- feat: Add new RAG metrics (answer-relevance, context-recall, context-relevance, context-faithfulness) (#279)
- feat: throw error correctly when invalid api key is passed for OpenAI (#276)
- Bump langchain from 0.0.325 to 0.0.329 in /examples/langchain-python (#278)
- Provide the prompt in the context to external assertion scripts (#277)
- fix the following error : 'List should have at least 1 item after val… (#280)
- [chore: Add HuggingFace debug output](https://github.com/promptfoo/promptfoo/commit/2bae118e3fa7f8164fd78d29a3a30d187026bf13)

## [0.27.0] - 2023-11-14

### Added

- [feat(node-package): Add support for raw objects in prompts](https://github.com/promptfoo/promptfoo/commit/e6a5fe2fa7c05aabd2f52bd4fa143d957a7953dd)
- feat(openai): Add support for OpenAI `seed` param (#275)
- [feat(openai): Add support for OpenAI response_format](https://github.com/promptfoo/promptfoo/commit/12781f11f495bed21db1070e987f1b40a43b72e3)
- [feat(webview): Round score in details modal](https://github.com/promptfoo/promptfoo/commit/483c31d79486a75efc497508b9a42257935585cf)

### Changed

- feat: Add new RAG metrics (answer-relevance, context-recall, context-relevance, context-faithfulness) (#279)
- feat: throw error correctly when invalid api key is passed for OpenAI (#276)
- Bump langchain from 0.0.325 to 0.0.329 in /examples/langchain-python (#278)
- Provide the prompt in the context to external assertion scripts (#277)
- fix the following error : 'List should have at least 1 item after val… (#280)
- [chore: Add HuggingFace debug output](https://github.com/promptfoo/promptfoo/commit/2bae118e3fa7f8164fd78d29a3a30d187026bf13)

## [0.26.5] - 2023-11-10

### Changed

- feat: Support for Azure OpenAI Cognitive Search (#274)
- [feat: Add PROMPTFOO_PYTHON environment variable](https://github.com/promptfoo/promptfoo/commit/33ecca3dab9382f063e68529c047cfd3fbd959e5)

## [0.26.4] - 2023-11-09

### Fixed

- fix(providers): use Azure OpenAI extensions endpoint when dataSources is set (2e5f14d)

### Tests

- test(assertions): add tests for object outputs (9e0909c)

## [0.26.3] - 2023-11-08

### Added

- [feat(AzureOpenAI): Add support for deployment_id and dataSources](https://github.com/promptfoo/promptfoo/commit/3f6dee99b4ef860af1088c4ceda1a74726070f37)

### Changed

- [Stringify output display string if output is a JSON object](https://github.com/promptfoo/promptfoo/commit/e6eff1fb75e09bfd602c08edd89ec154e3e61bf9)
- [Add JSON schema dereferencing support for JSON configs](https://github.com/promptfoo/promptfoo/commit/c32f9b051a51ee6e1ee08738e0921b4e05a5c23d)
- Update chat completion endpoint in azureopenai.ts (#273)

### Fixed

- fix(openai): Improve handling for function call responses (#270)

## [0.26.2] - 2023-11-07

### Changed

- [Fix issue with named prompt function imports](https://github.com/promptfoo/promptfoo/commit/18a4d751af15b996310eceafc5a75e114ce1bf56)
- [Fix OpenAI finetuned model parsing](https://github.com/promptfoo/promptfoo/commit/b52de61c6e1fd0a9e67d2476a9f3f9153084ad61)
- [Add new OpenAI models](https://github.com/promptfoo/promptfoo/commit/d9432d3b5747516aea1a7e8a744167fbd10a69d2)
- Fix: Broken custom api host for OpenAI. (#261)
- Add `classifier` assert type (#263)
- Send provider options and test context to ScriptCompletion (exec) provider (#268)
- Support for loading JSON schema from external file (#266)

## [0.26.1] - 2023-11-01

### Changed

- Fix broken default config for OpenAI evals created in web app (#255)
- Fix prompt per provider (#253)
- Add support for custom config directory (#257)
- Add latency and token metrics per prompt (#258)
- Add caching support to Anthropic provider (#259)
- webview: Preserve formatting of LLM outputs
- Bump langchain from 0.0.317 to 0.0.325 in /examples/langchain-python (#254)

## [0.26.0] - 2023-10-28

### Changed

- cli: Add support for raw text prompts (#252)
- Ensure the directory for the output file is created if it does not exist

## [0.25.2] - 2023-10-26

### Changed

- allow Python in tests.csv (#237)
- Improve escaping in matchers (#242)
- Add support for nunjucks filters (#243)
- Fix issue where outputPath from the configuration file is not used when `-c` option is provided
- Add envar PROMPTFOO_DISABLE_CONVERSATION_VAR
- Resolve promises in external assert files

## [0.25.1] - 2023-10-19

### Changed

- Fix issue with loading google sheets directly. (#222)
- Add \_conversation variable for testing multiple-turn chat conversations (#224)
- Allow multiple output formats simultaneously with `outputPath` (#229)
- Fall back to default embedding model if provided model doesn't support embeddings
- Various fixes and improvements
- Bump langchain from 0.0.312 to 0.0.317 in /examples/langchain-python (#245)

## [0.25.0] - 2023-10-10

### Changed

- Add support for icontains-any and icontains-all (#210)
- Bump langchain from 0.0.279 to 0.0.308 in /examples/langchain-python (#213)
- Add support for .cjs file extensions (#214)
- Add Prompts and Datasets pages (#211)
- Add CLI commands for listing and showing evals, prompts, and datasets (#218)
- Add support for `config` object in webhook provider payload. (#217)
- Other misc changes and improvements
- Bump langchain from 0.0.308 to 0.0.312 in /examples/langchain-python (#219)

## [0.24.4] - 2023-10-01

### Changed

- Fix bug in custom function boolean return value score (#208)
- Fix ollama provider with `--no-cache` and improve error handling
- Add support for HuggingFace Inference API (text generation) (#205)
- Add `apiHost` config key to Azure provider

## [0.24.3] - 2023-09-28

### Changed

- Better LocalAI/Ollama embeddings traversal failure (#191)
- `OPENAI_API_HOST` to `OPENAI_API_BASE_URL` (#187)
- Ability to include files as assertion values (#180)
- Add hosted db for evals (#149)
- Webview details pane improvements (#196)
- Add support for ollama options (#199)
- Adding TXT and HTML to `--output` help/error message (#201)

## [0.24.2] - 2023-09-23

### Changed

- Specify repo in package.json (#174)
- Add support for parsing multiple json blobs in responses (#178)
- Updated node version update of Google Colab notebook example (#171)
- Fix arg escaping for external python prompts on Windows (#179)
- Better OpenAI embeddings traversal failure (#190)
- Adds embeddings providers for LocalAI and Oolama (#189)
- Add `noindex` to shared results
- Many other misc fixes and improvements

## [0.24.1] - 2023-09-21

### Changed

- Fix prompt errors caused by leading and trailing whitespace for var file imports
- Fix an issue with response parsing in LocalAI chat
- Fix issue preventing custom provider for similarity check (#152)
- Fix escaping in python asserts (#156)
- Fix README link to providers docs (#153)
- Allow object with function name as a value for function_call (#158)
- Add a -y/--yes option to `promptfoo view` command to skip confirmation (#166)
- Other misc fixes and improvements

## [0.24.0] - 2023-09-18

### Changed

- Support for custom functions as prompts (#147)
- Refactor parts of util into more descriptive files (#148)
- Misc fixes and improvements

## [0.23.1] - 2023-09-14

### Changed

- Improvements to custom grading (#140)
- Support for Google Vertex and PaLM chat APIs (#131)
- Add support for including files in defaultTest (#137)
- Add support for disabling cache in evaluate() options (#135)
- Add support for loading vars directly from file (#139)
- Include `provider` in `EvaluateResult`
- Other misc improvements and fixes

## [0.23.0] - 2023-09-14

### Changed

- Improvements to custom grading (#140)
- Support for Google Vertex and PaLM chat APIs (#131)
- Add support for including files in defaultTest (#137)
- Add support for disabling cache in evaluate() options (#135)
- Add support for loading vars directly from file (#139)
- Include `provider` in `EvaluateResult`
- Other misc improvements and fixes

## [0.22.1] - 2023-09-14

### Added

- feat(vars): add support for loading vars directly from file (#139)
- feat(config): add support for including files in defaultTest (#137)
- feat(config): add support for disabling cache in evaluate() options (#135)
- feat(providers): support for Google Vertex and PaLM chat APIs (#131)
- feat(api): include provider in EvaluateResult (#130)

### Changed

- chore(providers): improve PaLM recognized model detection (2317eac)

### Documentation

- docs(examples): add conversation history example (#136)
- docs(examples): update node-package example with context (#134)

## [0.22.0] - 2023-09-04

### Changed

- Add OpenAI factuality and closed-QA graders (#126). These new graders implement OpenAI's eval methodology.
- Auto-escape vars when prompt is a JSON object (#127).
- Improvements to custom providers - Pass context including `vars` to callApi and make `TestCase` generic for ease of typing
- Add `prompt` to Javascript, Python, and Webhook assertion context
- Fix llama.cpp usage of provider config overrides
- Fix ollama provider parsing for llama versions like llama:13b, llama:70b etc.
- Trim var strings in CLI table (prevents slowness during CLI table output)

## [0.21.4] - 2023-09-01

### Changed

- Add support for test case threshold value (#125)
- Add support for pass/fail threshold for javascript and python numeric return values

## [0.21.3] - 2023-09-01

### Changed

- Increase request backoff and add optional delay between API calls (#122)

## [0.21.2] - 2023-08-31

### Changed

- Fix symlink bug on Windows

## [0.21.1] - 2023-08-30

### Changed

- Consistent envars and configs across providers (#119)
- Add configuration for API keys in WebUI (#120)
- Add CodeLlama to WebUI
- Fix issue with numeric values in some assert types
- Add support for running specific prompts for specific providers using `{id, prompts, config}` format
- Add a feedback command

## [0.21.0] - 2023-08-28

### Changed

- Add webhook provider (#117)
- Add support for editing config in web view (#115)
- Standalone server with database with self-hosting support (#118)
- Add support for custom llm-rubric grading via `rubricPrompt` in Assertion objects
- Add support for `vars` in `rubricPrompt`, making it easier to pass expected values per test case
- Add a handful of new supported parameters to OpenAI, Azure, Anthropic, and Replicate providers
- Allow setting `config` on `provider` attached to Assertion or TestCase
- Add/improve support for custom providers in matchesSimilarity and matchesLlmRubric

## [0.20.1] - 2023-08-18

### Changed

- Fix issue when there's not enough data to display useful charts
- Add charts to web viewer (#112)
- Add support for multiline javascript asserts
- Add support for Levenshtein distance assert type (#111)

## [0.20.0] - 2023-08-18

### Changed

- Add charts to web viewer (#112)
- Add support for multiline javascript asserts
- Add support for Levenshtein distance assert type (#111)

## [0.19.3] - 2023-08-17

### Changed

- llm-rubric provider fixes (#110)
- New diff viewer for evals
- Web UI for running evals (#103)
- Add support for OpenAI organization (#106)
- function call azure fix (#95)
- Add support for JSON schema validation for is-json and contains-json (#108)
- Other misc fixes and API improvements

## [0.19.2] - 2023-08-15

### Changed

- function call azure fix (#95)
- Add support for JSON schema validation for is-json and contains-json (#108)
- New diff viewer for evals
- Web UI for running evals (#103)
- Add support for OpenAI organization (#106)
- Other misc fixes and API improvements

## [0.19.1] - 2023-08-14

### Changed

- Add support for OpenAI organization (#106)
- New diff viewer for evals
- Web UI for running evals (#103)
- Other misc fixes and API improvements

## [0.19.0] - 2023-08-14

### Changed

- New diff viewer for evals
- Web UI for running evals (#103)
- Other misc fixes and API improvements

## [0.18.4] - 2023-08-11

### Fixed

- fix(providers): resolve Ollama provider issue with empty line handling (c4d1e5f)

### Dependencies

- chore(deps): bump certifi from 2023.5.7 to 2023.7.22 in /examples/langchain-python (#104)

## [0.18.3] - 2023-08-08

### Added

- feat(providers): add Ollama provider (#102)

### Changed

- chore(webui): disable nunjucks autoescaping by default (#101)
- chore(webui): stop forcing manual line breaks in results view (76d18f5)

### Fixed

- fix(history): remove stale `latest` symlinks before regenerating eval output (a603eee)

## [0.18.2] - 2023-08-08

### Added

- feat(webui): display assertion summaries in the results viewer (#100)

### Changed

- feat(providers): allow testing identical models with different parameters (#83)

### Fixed

- fix(cli): repair `promptfoo share` regression (01df513)
- fix(config): handle provider map parsing when entries are strings (bdd1dea)
- fix(scoring): keep weighted averages accurate by running all test cases (7854424)

## [0.18.1] - 2023-08-06

### Added

- feat(providers): add llama.cpp server support (#94)

### Changed

- chore(providers): expose `LLAMA_BASE_URL` environment variable (f4b4c39)

### Fixed

- fix(history): repair symlink detection when writing latest results (e6aed7a)

## [0.18.0] - 2023-07-28

### Added

- feat(assertions): add `python` assertion type (#78)
- feat(api): support native function ApiProviders and assertions (#93)
- feat(evals): introduce Promptfoo scenarios for data-driven testing - allows datasets to be associated with specific tests, eliminating the need to copy tests for each dataset by @Skylertodd (#89)
- feat(cli): allow specifying `outputPath` when using the Node evaluate helper (#91)

### Changed

- chore(evals): rename default "theories" concept to "scenarios" (aca0821)

### Fixed

- fix(history): repair symlink handling when persisting latest results (81a4a26)
- fix(history): clean up stale eval history entries (253ae60)
- fix(cli): restore ANSI escape code rendering in console tables (497b698)

## [0.17.9] - 2023-07-24

### Added

- feat(evals): load test cases from file or directory paths (#88)

### Changed

- feat(metrics): record latency in eval results (#85)

### Fixed

- fix(windows): resolve path compatibility issues (8de6e12)

## [0.17.8] - 2023-07-22

### Added

- feat(evals): support post-processing hooks in test cases (#84)

### Changed

- feat(webui): show recent runs in the results viewer (#82)
- feat(providers): expose additional OpenAI parameters (#81)

### Fixed

- fix(evaluator): support empty test suites without crashing (31fb876)
- fix(network): ensure fetch timeouts bubble up correctly (9e4bf94)

## [0.17.7] - 2023-07-20

### Added

- feat(config): allow provider-specific prompts in test suites (#76)

### Changed

- chore(runtime): require Node.js 16 or newer (f7f85e3)
- chore(providers): reuse context configuration for Replicate provider (48819a7)

### Fixed

- fix(providers): handle missing provider prompt maps gracefully (7c6bb35)
- fix(grading): escape user input in grading prompts (4049b3f)

## [0.17.6] - 2023-07-20

### Added

- feat(cli): add `--repeat` support to evaluations (#71)
- feat(providers): add Azure YAML prompt support (#72)
- feat(providers): implement Replicate provider (#75)

### Changed

- chore(providers): refine Replicate provider behaviour (57fa43f)
- chore(cli): default `promptfoo share` prompt to Yes on enter (1a4c080)
- chore(webui): simplify dark mode and hide identical rows in history (c244403)

## [0.17.5] - 2023-07-14

### Added

- feat(assertions): add starts-with assertion type (#64)
- feat(providers): add Azure OpenAI provider (#66)

### Changed

- feat(providers): support YAML-formatted OpenAI prompts (#67)
- chore(cli): allow disabling sharing prompts (#69)
- chore(cli): require confirmation before running `promptfoo share` (f3de0e4)
- chore(env): add `PROMPTFOO_DISABLE_UPDATE` environment variable (60fee72)

### Fixed

- fix(config): read prompts relative to the config directory (ddc370c)

## [0.17.4] - 2023-07-13

### Added

- feat(assertions): add `contains-any` assertion support (#61)

### Changed

- chore(cli): handle npm outages without crashing (3177715)

### Fixed

- fix(cli): support terminals without `process.stdout.columns` (064dcb3)
- fix(cli): correct `promptfoo init` output to reference YAML (404be34)

### Documentation

- docs: add telemetry notice (#39)

## [0.17.3] - 2023-07-10

### Added

- feat(providers): add Anthropic provider (#58)

### Changed

- chore(onboarding): refresh init onboarding content (992c0b6)

### Fixed

- fix(cli): maintain table header ordering (1e3a711)
- fix(runtime): ensure compatibility with Node 14 (59e2bb1)

## [0.17.2] - 2023-07-07

### Changed

- feat(providers): improve support for running external scripts (#55)

## [0.17.1] - 2023-07-07

### Fixed

- fix(webui): restore output rendering in results view (5ce5598)

## [0.17.0] - 2023-07-06

### Added

- feat(models): add gpt-3.5-16k checkpoints (#51)
- feat(providers): add `script:` provider prefix for custom providers (bae14ec)
- feat(webui): view raw prompts in the web viewer (#54)
- feat(cli): add `cache clear` command (970ee67)

### Changed

- chore(providers): change default suggestion provider (cc11e59)
- chore(providers): ensure OpenAI chat completions fail on invalid JSON (c456c01)
- chore(assertions): allow numeric values for contains/icontains assertions (dc04329)

### Fixed

- fix(evals): avoid creating assertions from empty expected columns (d398866)

## [0.16.0] - 2023-06-28

### Added

- feat(cli): retry failed HTTP requests to reduce transient failures (#47)
- feat(templates): allow object vars inside nunjucks templates for richer prompts (#50)

### Documentation

- docs: refresh the Question reference page with updated guidance (#46)

## [0.15.0] - 2023-06-26

### Added

- feat(scoring): add continuous scoring support for evaluations (#44)
- feat(assertions): introduce assertion weights to fine-tune scoring (0688a64)

### Changed

- chore(prompt): rename grading prompt field from `content` to `output` (fa20a25)
- chore(webui): maintain backwards compatibility for row outputs in the viewer (b2fc084)

### Fixed

- fix(config): ensure `defaultTest` populates when configs load implicitly (44acb91)

## [0.14.2] - 2023-06-24

### Changed

- chore(assertions): switch the default grading provider to `gpt-4-0613` (0d26776)
- chore(cli): trim stray progress-bar newlines for cleaner output (8d624d6)

### Fixed

- fix(cli): update cached table output correctly when results change (8fe5f84)
- fix(cli): allow non-string result payloads during rendering (61d349e)

## [0.14.1] - 2023-06-19

### Fixed

- fix(config): only apply the config base path when a path override is provided (e67918b)

## [0.14.0] - 2023-06-18

### Added

- feat(cli)!: add shareable URLs and the `promptfoo share` command by @typpo (#42)
- feat(cli): add `--no-progress-bar` option to `promptfoo eval` (75adf8a)
- feat(cli): add `--no-table` flag for evaluation output (ecf79a4)
- feat(cli): add `--share` flag to automatically create shareable URLs (7987f6e)

### Changed

- chore(cli)!: resolve config-relative file references from the config directory, not working directory (dffb091)
- chore(api)!: restructure JSON/YAML output formats to include `results`, `config`, and `shareableUrl` properties (d1b7038)

### Fixed

- fix(cli): write the latest results before launching the viewer with `--view` (496f2fb)

## [0.13.1] - 2023-06-17

### Fixed

- fix(cli): ensure command arguments override config values (c425d3a)

## [0.13.0] - 2023-06-16

### Added

- feat(providers): support OpenAI functions and custom provider arguments by @typpo (#34)
- feat(cli): add JSONL prompt file support by @typpo (#40)
- feat(cli): export `generateTable()` for external tooling reuse by @tizmagik (#37)
- feat(openai): enable OpenAI ChatCompletion function calling (0f10cdd)

### Changed

- chore(openai): add official support for OpenAI `*-0613` models (4d5f827)
- chore(cli): allow optional configs when invoking the CLI (a9140d6)
- chore(cli): respect the `LOG_LEVEL` environment variable in the logger (1f1f05f)
- chore(cli): stabilize progress display when using var arrays (340da53)

### Fixed

- fix(build): fix HTML output generation in production builds (46a2233)

## [0.12.0] - 2023-06-12

### Added

- feat(share): publish evaluations with the `promptfoo share` workflow by @typpo (#33)
- feat(telemetry): add basic usage telemetry for insight gathering (7e7e3ea)
- feat(assertions): support CSV definitions for `rouge-n` and webhook assertions (7f8be15)

### Changed

- chore(build): resolve build output paths for the web client (#32)
- chore(cli): notify users when a newer promptfoo release is available by @typpo (#31)

## [0.11.0] - 2023-06-11

### Added

- feat(assertions): add contains, icontains, contains-some, contains-any, regex, webhook, and rouge-n assertion types (#30)
- feat(assertions): allow negating any assertion type with `not-` prefix (cc5fef1)
- feat(assertions): pass context objects with vars to custom functions (1e4df7e)
- feat(webui): add failure filtering and improved table layout (69189fe)
- feat(webui): add word-break toggle to results (9c1fd3b)
- feat(webui): highlight highest passing scores in matrix (6e2942f)

### Changed

- chore(cli): limit console table rows for readability (52a28c9)
- chore(cli): add more detailed custom function failure output (6fcc37a)

### Fixed

- fix(config): respect CLI write/cache options from config (5b456ec)
- fix(webui): improve dark mode colours and rating overflow (eb7bd54)
- fix(config): parse YAML references correctly in configs (62561b5)

## [0.10.0] - 2023-06-09

### Added

- feat(prompts): add support for named prompts by @typpo (#28)

### Changed

- chore(env)!: rename `OPENAI_MAX_TEMPERATURE` to `OPENAI_TEMPERATURE` (4830557)
- chore(config): read `.yml` files by default as configs (d5c179e)
- chore(build): add native ts-node compatibility by @MentalGear (#25)
- chore(openai): add chatml stopwords by default (561437f)
- chore(webui): adjust column ordering and styling (27977c5)

### Fixed

- fix(config): support `defaultTest` overrides in CLI (59c3cbb)
- fix(env): correctly parse `OPENAI_MAX_TOKENS` and `OPENAI_MAX_TEMPERATURE` by @abi (#29)
- fix(cli): improve JSON formatting error messages (5f59900)

## [0.9.0] - 2023-06-05

### Added

- feat(vars): add support for var arrays by @typpo (#21)

### Changed

- chore(core): set a default semantic similarity threshold (4ebea73)
- chore(cli): refresh `promptfoo init` output messaging (cdbf806)

### Fixed

- fix(cache): register cache manager types for TypeScript (1a82de7)
- fix(evals): handle string interpolation issues in prompts (6b8c175)

## [0.8.3] - 2023-05-31

### Fixed

- fix(cache): create cache directory on first use (423f375)
- fix(config): throw a clearer error for malformed default configs (0d759c4)

## [0.8.2] - 2023-05-30

### Fixed

- fix(cache): only persist cache entries on successful API responses (71c10a6)

## [0.8.1] - 2023-05-30

### Added

- feat(data): add Google Sheets loader support (df900c3)

### Fixed

- fix(cli): restore backward compatibility for `-t/--tests` flags (aad1822)

## [0.8.0] - 2023-05-30

### Added

- feat(api)!: simplify the API and support unified test suite definitions by @typpo (#14)

### Changed

- chore(api)!: move evaluation settings under `evaluateOptions` (`maxConcurrency`, `showProgressBar`, `generateSuggestions`) (#14)
- chore(api)!: move CLI flag defaults under `commandLineOptions` (`write`, `cache`, `verbose`, `view`) (#14)

## [0.7.0] - 2023-05-29

### Changed

- chore(cache): improve caching defaults and enable caching by default (#17)

## [0.6.0] - 2023-05-28

### Added

- feat(providers): add LocalAI support for open-source LLMs like Llama, Alpaca, Vicuna, GPT4All (6541bb2)
- feat(cli): add glob pattern support for prompts and tests (#13)
- feat(assertions): rename `eval:` to `fn:` for custom JavaScript assertions by @MentalGear (#11)
- feat(webui): add dark mode support (0a2bb49)
- feat(api): add exports for types and useful utility functions (57ac4bb)
- feat(tests): add Jest and Mocha integrations (00d9aa2)

### Changed

- chore(cli): improve error handling and word wrapping in CLI output (398f4b0)
- chore(cli): support non-ES module requires (c451362)

### Fixed

- fix(cli): move API key validation into OpenAI subclasses (c451362)
- fix(webui): correct HTML table rendering errors in the viewer (64c9161)
- fix(providers): improve handling of third-party API errors (398f4b0)

### Dependencies

- chore(deps): bump socket.io-parser from 4.2.2 to 4.2.3 in /src/web/client (#15)

## [0.5.1] - 2023-05-23

### Changed

- chore(cli): add glob support for prompt selection (#13)

### Fixed

- fix(cli): prevent crashes when `OPENAI_API_KEY` is not set (c451362)

## [0.5.0] - 2023-05-22

### Added

- feat(assertions): add semantic similarity grading (#7)

### Changed

- chore(cli): improve error handling and word wrapping in CLI output (398f4b0)

## [0.4.0] - 2023-05-13

### Added

- feat(webui): add web viewer for evaluation results (#5)

### Changed

- chore(openai): support `OPENAI_STOP` environment variable for stopwords (79d590e)
- chore(cli): increase the default request timeout (c73e055)

## [0.3.0] - 2023-05-07

### Added

- feat(grading): enable LLM automatic grading of outputs (#4)
- feat(webui): improve how test results are shown - PASS/FAIL is shown in matrix view rather than its own column (2c3f489)

### Changed

- chore(config): allow overriding `OPENAI_API_HOST` environment variable (e390678)
- chore(cli): add `REQUEST_TIMEOUT_MS` environment variable for API timeouts (644abf9)
- chore(webui): improve HTML table output readability (2384c69)

## [0.2.2] - 2023-05-04

### Added

- feat(cli): add `promptfoo --version` output (77e862b)

### Changed

- chore(cli): improve error messages when API calls fail (af2c8d3)

### Fixed

- fix(cli): correct `promptfoo init` output text (862d7a7)
- fix(evals): preserve table ordering when building concurrently (2e3ddfa)

## [0.2.0] - 2023-05-04

### Added

- feat(cli): add `promptfoo init` command (c6a3a59)
- feat(providers): improve custom provider loading and add example (4f6b6e2)
