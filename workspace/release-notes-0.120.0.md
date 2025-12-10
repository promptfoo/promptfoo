## [0.120.0](https://github.com/promptfoo/promptfoo/compare/0.119.14...0.120.0) (2025-12-08)

### Features

- **build:** migrate to ESM (ECMAScript Modules) ([#5594](https://github.com/promptfoo/promptfoo/issues/5594)) ([9cdf09b](https://github.com/promptfoo/promptfoo/commit/9cdf09b1c681454ed3fa047dee41a43fea48028a))
- **cli:** toggle debug log live ([#6517](https://github.com/promptfoo/promptfoo/issues/6517)) ([6beebce](https://github.com/promptfoo/promptfoo/commit/6beebce4134f0e0dfd54e7f14cf4b213abd9573c))
- **providers:** add Gemini native image generation support ([#6405](https://github.com/promptfoo/promptfoo/issues/6405)) ([13bc040](https://github.com/promptfoo/promptfoo/commit/13bc04000accebae4231d77997970528d207a377))
- **redteam:** add multi-modal layer strategy support for audio/image attacks ([#6472](https://github.com/promptfoo/promptfoo/issues/6472)) ([c0d7c1c](https://github.com/promptfoo/promptfoo/commit/c0d7c1c0aef2cc63957075c7f60829e77ee4741e))

### Bug Fixes

- **build:** add CommonJS fallback for .js files in ESM environment ([#6501](https://github.com/promptfoo/promptfoo/issues/6501)) ([ae39641](https://github.com/promptfoo/promptfoo/commit/ae39641d3db36d47aba72b39a0bc35290ca80d93))
- **build:** fix require() module resolution ([#6468](https://github.com/promptfoo/promptfoo/issues/6468)) ([ea6b299](https://github.com/promptfoo/promptfoo/commit/ea6b2995ecdc94e970dcabbc95fe6aa5a0e94bf5))
- **build:** migrate require() to ESM-compatible imports ([#6509](https://github.com/promptfoo/promptfoo/issues/6509)) ([7b30dda](https://github.com/promptfoo/promptfoo/commit/7b30dda3c362d2f3ffe768acd8450b3a25ee151d))
- **build:** use npm environment variables for version detection ([#6479](https://github.com/promptfoo/promptfoo/issues/6479)) ([2a88aab](https://github.com/promptfoo/promptfoo/commit/2a88aab8a4a1f7e97dc851f58aa9a103bc09981f))
- **assertions:** allow Nunjucks templates in JSON rubricPrompt files ([#6554](https://github.com/promptfoo/promptfoo/issues/6554)) ([7cdb1af](https://github.com/promptfoo/promptfoo/commit/7cdb1afae9bec1432bbcd898c583451e7cf0ac8f))
- **assertions:** resolve provider paths relative to config file location ([#6503](https://github.com/promptfoo/promptfoo/issues/6503)) ([61a77eb](https://github.com/promptfoo/promptfoo/commit/61a77eb5cfa3619bbcdb82eac89e20293f2d6cb8))
- **cache:** fix initialization ([#6467](https://github.com/promptfoo/promptfoo/issues/6467)) ([df2ae94](https://github.com/promptfoo/promptfoo/commit/df2ae94cc967cd6fc3df4e0d170bdcb4702c2e53))
- **cli:** await modelaudit subprocess completion in scan-model command ([#6518](https://github.com/promptfoo/promptfoo/issues/6518)) ([fe19331](https://github.com/promptfoo/promptfoo/commit/fe19331acada496c3ea528c65c3b39066d97ca67))
- **cli:** resolve view command premature exit and eval hanging issues ([#6460](https://github.com/promptfoo/promptfoo/issues/6460)) ([d9e9814](https://github.com/promptfoo/promptfoo/commit/d9e9814ff3a21b5922794ea48b70d104e29b948c))
- **code-scan:** output valid JSON when no files to scan with --json flag ([#6496](https://github.com/promptfoo/promptfoo/issues/6496)) ([8c41fce](https://github.com/promptfoo/promptfoo/commit/8c41fceaff6474e7de919d73fc01c2cd80979cf9))
- **config:** handle setting maxConcurrency in config.yaml ([#6526](https://github.com/promptfoo/promptfoo/issues/6526)) ([5443171](https://github.com/promptfoo/promptfoo/commit/5443171ea0eec30215c56e83cce6378e482cd1e7))
- **deps:** downgrade zod-validation-error for ESM compatibility ([#6471](https://github.com/promptfoo/promptfoo/issues/6471)) ([a39643a](https://github.com/promptfoo/promptfoo/commit/a39643ad94d4d9a804d3cec0a736e120b17d092d))
- **deps:** resolve Express CVE-2024-51999 vulnerability ([#6457](https://github.com/promptfoo/promptfoo/issues/6457)) ([c2ef1ad](https://github.com/promptfoo/promptfoo/commit/c2ef1ad64fc2a0f4b0bc6a76dac751733b52a77f))
- **deps:** update dependency @modelcontextprotocol/sdk to v1.24.0 [security] ([#6463](https://github.com/promptfoo/promptfoo/issues/6463)) ([cfdffff](https://github.com/promptfoo/promptfoo/commit/cfdfffff518e02c29cec705f93ebdc2e24a07901))
- **deps:** update jws to fix security vulnerability ([#6497](https://github.com/promptfoo/promptfoo/issues/6497)) ([28112f5](https://github.com/promptfoo/promptfoo/commit/28112f5fac826d6d32aaa80f82d291955ed42555))
- **eval:** correct share progress count to match actual results ([#6513](https://github.com/promptfoo/promptfoo/issues/6513)) ([ea4410c](https://github.com/promptfoo/promptfoo/commit/ea4410cdf5deea1af08a9e29688adbc6fbdb8909))
- **eval:** handle missing defaultTest in extension-api hooks ([#6504](https://github.com/promptfoo/promptfoo/issues/6504)) ([c0d111c](https://github.com/promptfoo/promptfoo/commit/c0d111c457ddbabf54cf5652b04fcbf2ce336838))
- **eval:** include provider in Google Sheets output column headers ([#6528](https://github.com/promptfoo/promptfoo/issues/6528)) ([ded540a](https://github.com/promptfoo/promptfoo/commit/ded540a97a10f78e4bc0aeb4b4c39248cdc06919))
- **http:** improve parsing of body in HTTP provider ([#6484](https://github.com/promptfoo/promptfoo/issues/6484)) ([7665f48](https://github.com/promptfoo/promptfoo/commit/7665f4857a06796b7558e9dfc50730523c47b801))
- **logger:** prevent Winston 'write after end' error during shutdown ([#6511](https://github.com/promptfoo/promptfoo/issues/6511)) ([a5ad5cb](https://github.com/promptfoo/promptfoo/commit/a5ad5cb3381e5ac3ae5c34640cf99915216490bf))
- **logger:** prevent write-after-end error in shutdown ([#6514](https://github.com/promptfoo/promptfoo/issues/6514)) ([c901d8d](https://github.com/promptfoo/promptfoo/commit/c901d8dcd6fa24201d99ede3ef2552c7fb91b945))
- **providers:** fix Golang and Ruby wrappers ([#6506](https://github.com/promptfoo/promptfoo/issues/6506)) ([d429b00](https://github.com/promptfoo/promptfoo/commit/d429b005ff222c818d3946fc3108a7c8970abcb2))
- **providers:** handle Vertex AI global region endpoint ([#6570](https://github.com/promptfoo/promptfoo/issues/6570)) ([f8c0f76](https://github.com/promptfoo/promptfoo/commit/f8c0f760b4a6da1caf18b00e6f5f73b7e1cc563a))
- **providers:** improve ChatKit multi-step workflow support ([#6425](https://github.com/promptfoo/promptfoo/issues/6425)) ([ceef623](https://github.com/promptfoo/promptfoo/commit/ceef623af0c48f864f13bd3b29e9c63acd83160c))
- **providers:** improve ChatKit response capture reliability ([#6482](https://github.com/promptfoo/promptfoo/issues/6482)) ([f251a03](https://github.com/promptfoo/promptfoo/commit/f251a03e3aad4ca0ee7b5030e9a94b66a1323dc1))
- **python:** fix provider path resolution ([#6465](https://github.com/promptfoo/promptfoo/issues/6465)) ([20b363e](https://github.com/promptfoo/promptfoo/commit/20b363e686002fd53d3fdb7b769481d1f49889a3))
- **python:** fix wrapper.py path resolution ([#6500](https://github.com/promptfoo/promptfoo/issues/6500)) ([f617ee5](https://github.com/promptfoo/promptfoo/commit/f617ee545248cd45e8eb7666470294b456984c21))
- **python:** replace deprecated asyncio.iscoroutinefunction with inspect.iscoroutinefunction ([#6551](https://github.com/promptfoo/promptfoo/issues/6551)) ([804d6c8](https://github.com/promptfoo/promptfoo/commit/804d6c83e1de5b167e341ebe43178a76f865cb46))
- **redteam:** handle missing strategy test cases ([#6485](https://github.com/promptfoo/promptfoo/issues/6485)) ([2ae2315](https://github.com/promptfoo/promptfoo/commit/2ae231518f1b93fc1f247d5b941940de2c8c9e10))
- **redteam:** propagate abort signals through agentic strategy providers ([#6412](https://github.com/promptfoo/promptfoo/issues/6412)) ([49b96e7](https://github.com/promptfoo/promptfoo/commit/49b96e7417eead8b880646b5bec0d6dc7c0641d6))
- **server:** resolve drizzle migrations path for cloud bundled context ([#6522](https://github.com/promptfoo/promptfoo/issues/6522)) ([6d2ff39](https://github.com/promptfoo/promptfoo/commit/6d2ff395d9b10db9b87dc9cba5263b5d053c10fd))

### Performance Improvements

- **build:** parallelize build steps and use esbuild minifier ([#6494](https://github.com/promptfoo/promptfoo/issues/6494)) ([8b41b40](https://github.com/promptfoo/promptfoo/commit/8b41b40034c6025d83eb1b351da63a61928b13d5))

### Documentation

- **site:** display correct blog post dates regardless of user timezone ([#6534](https://github.com/promptfoo/promptfoo/issues/6534)) ([3401ca1](https://github.com/promptfoo/promptfoo/commit/3401ca15c373f332dc33f955744b0a2191c414c9))
- **site:** fix responsive logo containers ([#6470](https://github.com/promptfoo/promptfoo/issues/6470)) ([a94cef9](https://github.com/promptfoo/promptfoo/commit/a94cef98af50dcf15c503bc055b98100f83a286c))
- **site:** update Tabs Fakier GitHub profile URL ([#6527](https://github.com/promptfoo/promptfoo/issues/6527)) ([d7959c6](https://github.com/promptfoo/promptfoo/commit/d7959c61153646184a558990f3c62e1dcfe70f74))

### Miscellaneous Chores

- **build:** replace TypeScript enums with const objects ([#6428](https://github.com/promptfoo/promptfoo/issues/6428)) ([ae2b609](https://github.com/promptfoo/promptfoo/commit/ae2b609fe593d63f4b7ca51fb55f6822a44b0ce6))
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
- **deps:** revert jsdom v27 update ([#6449](https://github.com/promptfoo/promptfoo/issues/6449)) ([1cd29ad](https://github.com/promptfoo/promptfoo/commit/1cd29ad68cf93ab3c7c40a75212ac6f4ca56bcbf))
- **examples:** add JS loader for cyberseceval test cases ([#6505](https://github.com/promptfoo/promptfoo/issues/6505)) ([b3d4a85](https://github.com/promptfoo/promptfoo/commit/b3d4a85fd1c84f9f7b41443d55c1111a0d3fe692))
