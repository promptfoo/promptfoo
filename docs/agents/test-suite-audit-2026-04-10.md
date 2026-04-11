# Test Suite Audit - 2026-04-10

This document captures a repository-level audit of Promptfoo's unit and near-unit test suite, with special attention to random-order safety, mock pollution, noisy logs, state cleanup, anti-patterns, coverage posture, refactoring opportunities, and code complexity.

## Follow-Up Fix PRs

The highest-priority issues found during this audit were split into focused implementation PRs:

- `#8610` - fixes proxy environment isolation in `test/fetch.test.ts`, including `ALL_PROXY`.
- `#8611` - makes site coverage report to Codecov and makes site tests run shuffled by default.
- `#8612` - reduces pass-time test output noise and tightens several mock/state cleanup issues.

## Audit Scope

- Backend tests under `test/**/*.test.ts` and `test/**/*.test.tsx`
- Frontend app tests under `src/app/src/**/*.{test,spec}.{ts,tsx}`
- Site tests under `site/src/**/*.{test,spec}.{ts,tsx}`
- Smoke tests under `test/smoke/**/*.test.ts` where they affect hygiene patterns, even though they are intentionally more end-to-end

There are 934 test files across those locations at the time of this audit.

## Initial Configuration Notes

- Backend unit tests use `vitest.config.ts` and enable `sequence.shuffle: true`, `pool: 'forks'`, `isolate: true`, explicit Vitest globals disabled, and global backend setup from `vitest.setup.ts`.
- Backend integration tests use `vitest.integration.config.ts` and also enable `sequence.shuffle: true`, `pool: 'forks'`, and `isolate: true`.
- Frontend app tests use `src/app/vite.config.ts` and enable `sequence.shuffle: true`, `pool: 'forks'`, `isolate: true`, explicit Vitest globals disabled, and JSDOM setup from `src/app/src/setupTests.ts`.
- Smoke tests intentionally disable random order via `sequence.shuffle: false` for predictable CLI output.
- Site tests use `site/vitest.config.ts`; this config currently does not set random ordering, worker pool isolation controls, or explicit cleanup policy beyond its setup file.

## Running Notes

- The root `test/AGENTS.md` is aligned with random-order execution and specifically warns that `vi.clearAllMocks()` only clears call history, not implementations.
- The global backend `vitest.setup.ts` currently calls `vi.clearAllMocks()`, `vi.clearAllTimers()`, and `vi.useRealTimers()` in `afterEach`, then `vi.resetModules()` in `afterAll`. This catches some hygiene issues but does not reset mock implementations or restore spies.
- `git status` reported a detached HEAD with no visible file changes before this audit file was created.

## Quantitative Snapshot

- Test files: 669 backend/root test files, 260 frontend app test files, 5 site test files.
- Test file lines: about 305,689 lines under `test/`, 88,368 lines under `src/app/src`, and 739 lines under `site/src`.
- Production source files in coverage scope: about 780 backend/core TypeScript files, 364 frontend app source files, and 91 site source files.
- Largest test files by line count:
  - `test/providers/http.test.ts` - 8,527 lines
  - `test/evaluator.test.ts` - 7,112 lines
  - `test/providers/openai/responses.test.ts` - 5,042 lines
  - `test/redteam/commands/generate.test.ts` - 3,734 lines
  - `src/app/src/pages/eval/components/ResultsTable.test.tsx` - 3,688 lines
  - `test/redteam/index.test.ts` - 3,649 lines
  - `test/assertions/runAssertion.test.ts` - 3,573 lines
  - `test/providers/bedrock/index.test.ts` - 3,388 lines
  - `test/util/config/load.test.ts` - 3,205 lines
  - `test/providers/claude-agent-sdk.test.ts` - 3,114 lines
- High-risk hygiene pattern file counts:
  - `vi.mock(...)`: 531 files
  - `vi.hoisted(...)`: 85 files
  - `vi.spyOn(...)`: 147 files
  - `process.env` references/mutations: 139 files
  - fake timers or fixed system time: 44 files
  - direct `console.*` in tests or benchmark tests: 26 files
  - direct filesystem temp/write/remove operations: 61 files
  - `as any` in tests: 2,473 occurrences
  - `@ts-ignore`: 57 occurrences
  - `@ts-expect-error`: 14 occurrences
  - app test files using `fireEvent`: 84 files
  - app test files using `getByTestId` or `data-testid`: 78 files

## Random Order

- Backend unit tests: configured to shuffle by default in `vitest.config.ts`.
- Backend integration tests: configured to shuffle by default in `vitest.integration.config.ts`.
- Frontend app tests: configured to shuffle by default in `src/app/vite.config.ts`.
- Smoke tests: intentionally not shuffled in `vitest.smoke.config.ts`; this is reasonable because CLI smoke tests often share expensive setup and benefit from predictable output.
- Site tests: not configured to shuffle in `site/vitest.config.ts`; this is an inconsistency with the repository rule that tests run random-order by default.
- Verification attempt: after installing dependencies with `npm ci`, I started `npm test -- --sequence.seed=424242 --reporter=dot`. Vitest confirmed `Running tests with seed "424242"`, proving root unit randomization is active for this run.
- Result of seeded backend unit run: failed with 3 failures in `test/fetch.test.ts` out of 15,722 tests.
  - `fetchWithProxy > should not create ProxyAgent when no proxy URL is found` observed a `ProxyAgent` call with `uri: "socks5h://127.0.0.1:54952"`.
  - `fetchWithProxy > should reuse the same Agent dispatcher across concurrent requests` expected `Agent` once but got zero calls because the request used the proxy path.
  - `fetchWithProxy > should reuse a dedicated Agent dispatcher per maxConcurrency value` expected two `Agent` creations but got zero calls for the same reason.
- Root cause evidence: the test `beforeEach` clears `HTTPS_PROXY`, `https_proxy`, `HTTP_PROXY`, `http_proxy`, `npm_config_https_proxy`, `npm_config_http_proxy`, `npm_config_proxy`, and lowercase `all_proxy`, but does not clear uppercase `ALL_PROXY`, `FTP_PROXY`, uppercase `NPM_CONFIG_*`, or related proxy env vars. The local environment contains `ALL_PROXY=socks5h://127.0.0.1:54952`, and `src/util/fetch/index.ts` delegates proxy detection to `proxy-from-env`.
- Recommendation: add a shared `withProxyEnvCleared()` / `snapshotEnv()` test helper and use it in all proxy-sensitive tests. The helper should restore the complete environment after each test, clear every proxy spelling supported by `proxy-from-env`, and document which proxy vars are intentionally covered.
- Frontend app verification:
  - `npm run test:app -- --run --sequence.seed=424242 --reporter=dot` did run the app suite, but the wrapper swallowed the CLI flags as npm config warnings because `test:app` itself shells into another `npm run`.
  - The correct seeded command is `npm run test --prefix src/app -- --run --sequence.seed=424242 --reporter=dot`.
  - The app suite passed with that command: 262 files, 4,054 tests, seed `424242`.
- Site verification:
  - `npm run test --prefix site -- --sequence.shuffle=true --sequence.seed=424242 --reporter=dot` passed: 5 files, 99 tests.
  - This proves the site tests can pass shuffled, but the shuffle flag is not configured by default.

Command ergonomics note: the root `test:app` script makes it easy to accidentally pass Vitest flags to npm instead of Vitest. Consider changing it from `npm run test --prefix src/app` to a form that forwards arguments reliably, or document the correct double-`--` invocation in one canonical place.

## Logging And Output Hygiene

- There is substantial noisy output from tests that exercise expected failure paths. The seeded backend run printed many blocks to stdout/stderr before completion, including expected provider errors, redteam provider error loops, update banners, Python worker tracebacks, cache-folder messages, and Vitest spy warnings.
- Concrete noisy examples observed during the seeded run:
  - `test/redteam/providers/crescendo/index.test.ts` repeatedly prints `[Crescendo] Error Running crescendo step` plus JSON error payloads for expected failure cases.
  - `test/providers/golangCompletion.test.ts` prints `Golang script stderr`, `Error running Golang script`, and full error objects for expected error handling cases.
  - `test/updates.test.ts` prints full terminal update banners.
  - `test/python/worker.test.ts` prints Python worker stderr and tracebacks for expected missing-function coverage.
  - `test/providers/index.test.ts` prints long provider/model warnings and "Loaded provider ..." messages.
  - `test/providers/voyage.test.ts`, `test/providers/google/vertex.test.ts`, `test/providers/httpTransforms.test.ts`, and several redteam/provider tests print expected errors directly.
- Direct console output in test files should be reserved for intentionally diagnostic failure-only messages. Several files print on success/failure branches rather than encoding diagnostics into assertion messages:
  - `src/app/src/components/Navigation.test.tsx` has `console.log('Model Audit link tabindex:', tabIndex)` and then only asserts the element exists.
  - `test/redteam/plugins/pluginDocumentation.test.ts`, `test/redteam/plugins/pluginId.test.ts`, `test/redteam/strategies/strategyId.test.ts`, and `test/config-schema.test.ts` print manual diagnostics before assertions.
  - `test/smoke/regression-recent.test.ts` prints stdout/stderr on non-zero exit; this is more defensible for smoke tests, but should use a helper that adds the output to the thrown assertion instead of printing out of band.
  - `test/providers/openai-codex-sdk.e2e.test.ts` prints real model outputs, token usage, and skip messages; this file is E2E-gated, but output should still be opt-in or failure-only.
- `src/app/src/__benchmarks__/reactCompiler.test.tsx` is named `*.test.tsx` and is not excluded by app Vitest config, so benchmark console logs and benchmark-style tests appear eligible to run as normal app tests.
- The seeded app run produced recurring React and JSDOM warnings that are worth treating as test failures over time:
  - React DOM validity warning: nested `<button>` in `src/pages/redteam/report/components/RiskCategoryDrawer.test.tsx`.
  - React unknown prop warning: `isGenerating` and `tooltipTitle` passed through to DOM in `src/pages/redteam/setup/components/PluginsTab.test.tsx`.
  - Numerous `The current testing environment is not configured to support act(...)` warnings in data-table and eval output dialog tests.
  - React key warnings in `src/pages/eval/components/TruncatedText.test.tsx`.
  - NaN DOM attribute warnings in `ResultsTable` and `WebSocketEndpointConfiguration` tests.
  - Outdated JSX transform warnings in site tests.
- These are not just cosmetic. React warnings often reveal invalid accessibility structure, invalid DOM attributes, unwrapped state updates, or test expectations that pass before UI work settles.

Recommended direction:

- Add a backend test setup policy that fails on unexpected `console.*` output, with explicit helpers such as `allowConsoleOutput()` or `expectConsoleError()` for tests whose product behavior is logging.
- Prefer logger mocks in unit tests over allowing real logger transports to write to stdout/stderr.
- Convert manual diagnostics to assertion messages, custom matchers, or helper errors. Failure context should appear only when the test fails.
- Move benchmark tests out of the default test glob, for example `*.bench.tsx`, or add an explicit app `test.exclude` for `src/**/__benchmarks__/**`.
- Add a frontend console-warning gate that fails on unexpected `console.error`/`console.warn`. Allowlist specific expected messages temporarily, then burn down the allowlist.

## Coverage Posture

The suite has a large amount of useful coverage, but coverage enforcement is currently more permissive than I would expect for a production open-source security/testing tool.

### Coverage Runs

- Backend coverage command run during this audit:
  - `env -u ALL_PROXY -u all_proxy -u HTTP_PROXY -u HTTPS_PROXY -u http_proxy -u https_proxy -u NO_PROXY -u no_proxy -u NPM_CONFIG_PROXY -u NPM_CONFIG_HTTP_PROXY -u NPM_CONFIG_HTTPS_PROXY -u npm_config_proxy -u npm_config_http_proxy -u npm_config_https_proxy npm run test:vitest -- --coverage --coverage.reporter=json-summary --coverage.reporter=text-summary --sequence.seed=424242 --silent`
  - Result: 650 passed files, 1 skipped file, 15,712 passed tests, 10 skipped tests.
  - Coverage: 72.65% statements, 67.43% branches, 75.64% functions, 72.75% lines.
- Frontend app coverage command run during this audit:
  - `npm run test --prefix src/app -- --coverage --coverage.reporter=json-summary --coverage.reporter=text-summary --sequence.seed=424242 --silent`
  - Result: 262 passed files, 4,054 passed tests.
  - Coverage: 71.13% statements, 64.65% branches, 64.23% functions, 73.09% lines.
- Site coverage command run during this audit:
  - `npm run test --prefix site -- --coverage --coverage.reporter=json-summary --coverage.reporter=text-summary --sequence.shuffle=true --sequence.seed=424242 --silent`
  - Result: 5 passed files, 99 passed tests.
  - Coverage: 8.41% statements, 10.88% branches, 11.29% functions, 8.57% lines.
  - Important caveat: the site coverage provider printed many parse failures and excluded TS/TSX files from coverage, so the site coverage number is not reliable as a quality gate.

### CI And Codecov

- Backend coverage is uploaded in `.github/workflows/main.yml` from `./coverage/coverage-final.json`.
- Frontend coverage is uploaded separately from `./src/app/coverage/coverage-final.json`.
- Site tests run in CI, but `codecov.yml` explicitly ignores `site/**/*`, so docs-site code has no tracked coverage signal.
- Codecov requires project coverage not to decrease with `target: auto` and `threshold: 0%`.
- Codecov patch coverage is only `50%` with `threshold: 0%`.
- Vitest configs collect coverage but do not define local minimum thresholds by statements, branches, functions, or lines.

The current gates prevent obvious coverage collapse, but they do not strongly force new critical code to be tested. A 50% patch gate can still allow most error branches, edge cases, and negative paths to remain untested. That is especially risky in areas that parse untrusted input, execute providers, touch files, handle credentials, or run redteam workflows.

### Backend Coverage Hotspots

The backend coverage report included 781 source files. There were 31 source files with more than 20 lines and 0% line coverage. Representative low-coverage files with more than 50 lines:

- `src/assertions/meteor.ts` - 0/109 lines.
- `src/codeScan/git/diffProcessor.ts` - 0/158 lines.
- `src/codeScan/mcp/transport.ts` - 0/61 lines.
- `src/codeScan/scanner/output.ts` - 0/55 lines.
- `src/commands/mcp/tools/compareProviders.ts` - 0/53 lines.
- `src/commands/mcp/tools/generateTestCases.ts` - 0/56 lines.
- `src/commands/mcp/tools/testProvider.ts` - 0/53 lines.
- `src/providers/audio/index.ts` - 0/71 lines.
- `src/providers/elevenlabs/websocket-client.ts` - 0/60 lines.
- `src/providers/elevenlabs/stt/wer.ts` - 0/103 lines.
- `src/providers/elevenlabs/tts/streaming.ts` - 0/62 lines.
- `src/providers/openai/agents-tracing.ts` - 0/77 lines.
- `src/providers/xai/responses.ts` - 0/80 lines.
- `src/redteam/strategies/multilingual.ts` - 0/235 lines.
- `src/ui/init/components/shared/TextInput.tsx` - 0/53 lines.

The code scan and MCP transport/tooling areas look especially under-covered relative to their risk profile. They touch source code, paths, transports, generated test cases, provider comparison, and user-facing automation boundaries.

### Frontend Coverage Hotspots

The app coverage report included 362 source files. There were 11 source files with more than 20 lines and 0% line coverage. Representative low-coverage files with more than 50 lines:

- `src/app/src/components/ui/navigation-sidebar.tsx` - 0/117 lines.
- `src/app/src/pages/eval-creator/components/ProviderConfigDialog.tsx` - 0/75 lines.
- `src/app/src/pages/eval-creator/components/ProvidersListSection.tsx` - 0/62 lines.
- `src/app/src/pages/eval-creator/components/RunOptionsSection.tsx` - 0/64 lines.
- `src/app/src/pages/model-audit/components/InstallationGuide.tsx` - 0/54 lines.
- `src/app/src/pages/redteam/report/components/ReportDownloadButton.tsx` - 0/55 lines.
- `src/app/src/pages/redteam/setup/components/Targets/BrowserAutomationConfiguration.tsx` - 1/80 lines.
- `src/app/src/pages/redteam/report/components/FrameworkCsvExporter.tsx` - 1/62 lines.
- `src/app/src/pages/redteam/setup/components/Targets/ExtensionEditor.tsx` - 2/62 lines.
- `src/app/src/pages/redteam/setup/components/Targets/PostmanImportDialog.tsx` - 12/126 lines.
- `src/app/src/pages/redteam/setup/components/Targets/tabs/TlsHttpsConfigTab.tsx` - 9/94 lines.

These are mostly configuration, export, setup, and report affordances. They deserve tests because failures here tend to become confusing user-facing workflows rather than obvious runtime crashes.

### Site Coverage Hotspots

The site suite is small and its coverage command is not currently trustworthy:

- It passes tests, but coverage parsing excludes many TS/TSX files.
- `site/src/components/Store/CartProvider.tsx` and `site/src/components/Store/ProductModal.tsx` show 0% line coverage in the partial report.
- `site/src/components/Store/useFourthwall.ts` shows 27/188 lines covered.
- `codecov.yml` ignores `site/**/*`, so this is not blocking any PR.

For a docs site, low coverage may be acceptable for static pages, but not for interactive store/cart behavior, calculators, validators, or documentation tooling that users rely on.

### Coverage Recommendations

- Raise patch coverage gradually, not abruptly. A realistic path is `50% -> 60% -> 70%`, with stricter rules for files under providers, assertions, redteam, server routes, code scanning, config loading, file access, auth, and network layers.
- Add local Vitest coverage thresholds once the suite stabilizes. Start with ratcheting thresholds set near current totals, then increase by component.
- Track branch coverage explicitly. Backend branch coverage is 67.43% and app branch coverage is 64.65%; those numbers are the best indicator that edge and error paths are not uniformly exercised.
- Add targeted coverage expectations for high-risk modules even when overall project coverage is healthy.
- Decide whether site coverage matters. If it does, fix site V8 coverage parsing and upload it as a Codecov flag. If it does not, remove or narrow `site/package.json` `test:coverage` to avoid misleading local reports.
- Require meaningful tests when a PR fixes a bug. A regression test should fail against the old behavior, not merely cover the changed lines.

## Mock, Spy, And Module Pollution

The test suite uses heavy mocking, and some of that is inevitable for this repository. Provider tests, CLI tests, and redteam tests need to simulate network calls, filesystem state, model providers, and process behavior. The issue is not "there are mocks"; the issue is that the cleanup contract is uneven.

### Current State

- 531 test files call `vi.mock(...)`.
- 85 test files call `vi.hoisted(...)`.
- 147 test files call `vi.spyOn(...)`.
- A heuristic scan found 58 backend files using `vi.spyOn` without an obvious `restoreAllMocks()` or `mockRestore()` in the same file.
- The backend setup file intentionally uses `vi.clearAllMocks()` after each test because some tests depend on describe-level or module-level spies staying installed.
- The app setup is stronger: it calls `vi.restoreAllMocks()`, restores browser property mocks, clears storage, and clears call history after every test.
- The site setup is weaker: it globally patches `console.error`, stubs `fetch`, and only calls `vi.clearAllMocks()` after each test.

`vi.clearAllMocks()` only resets call history. It does not reset implementations and it does not restore spied methods. In a shuffled suite, that means tests can pass because they inherit an implementation from a previous test in the same file. Forked isolated workers reduce cross-file pollution, but they do not protect against same-file pollution.

### High-Risk Patterns

- Module-level `vi.mock` factories with mutable `vi.fn()` implementations, followed by tests that mutate those implementations without `mockReset()`.
- `vi.hoisted` mock objects shared by all tests in a file.
- Spies installed in `beforeEach` and only cleared, not restored.
- Tests that depend on global setup mocks instead of declaring the network/browser behavior they require.
- Tests that call `vi.resetAllMocks()` after a test that has module-level mock implementations. This can accidentally remove default implementations needed by later tests unless every `beforeEach` rebuilds them.
- Tests that use `vi.resetModules()` or dynamic imports without clearly documenting which module-level singleton they are isolating.

### Concrete Examples

- `test/fetch.test.ts` mocks `undici`, `envars`, `logger`, `node:fs`, `node:fs/promises`, `cliState`, and `global.fetch` in one file. It mutates env vars and `cliState.maxConcurrency`, clears some env vars in `beforeEach`, and resets mocks in `afterEach`. This is a high-value test file, but it is doing too much setup by hand and already surfaced a real proxy-env isolation bug under a seeded run.
- `vitest.setup.ts` documents that `restoreAllMocks()` would break tests that rely on describe-level spies. That is a smell worth paying down. Tests should prefer per-test setup or helper-managed scopes over long-lived spies.
- `site/src/setupTests.ts` replaces `console.error` manually rather than using a spy that is restored. This can hide warnings that should be seen, and it is inconsistent with the app's stricter cleanup model.

### Recommendations

- Add a backend mock hygiene migration path:
  - Short term: add helpers such as `mockedModuleDefaults()`, `resetHoistedMocks()`, and `withMockedLogger()`.
  - Medium term: require `vi.restoreAllMocks()` in backend global cleanup after migrating files that rely on persistent spies.
  - Long term: make persistent describe-level spies rare and explicit.
- Prefer `mockReset()` plus default implementation rebuilding in `beforeEach` for file-scoped mocks whose behavior changes per test.
- Avoid direct mutation of imported singleton state unless a helper snapshots and restores it.
- Add a hygiene test that flags `vi.spyOn` without local restoration or an approved helper.
- Add a hygiene test that flags `vi.hoisted` files without an exported/declared reset helper.
- Keep module mocks close to the behavior under test. When one test file mocks five or more modules, consider extracting fixture helpers or splitting the file by behavior.

## Environment, Process, And Global State Cleanup

This is the highest-priority isolation category because it produced an actual random-order/environment-sensitive failure during the audit.

### Current Risks

- 139 test files reference or mutate `process.env`.
- A heuristic scan found 67 files with `process.env` mutations and no obvious full environment snapshot/restore helper.
- Tests mutate globals such as `global.fetch`, `console`, `Date`, `Error`, `window`, `navigator`, browser storage, and CLI singleton state.
- Some files restore the specific env vars they remember changing, but not the full process environment they observed before the test.

### Random-Order Failure: Proxy Environment

`test/fetch.test.ts` failed under seed `424242` because the local environment had `ALL_PROXY=socks5h://127.0.0.1:54952`. The test cleared `HTTPS_PROXY`, `https_proxy`, `HTTP_PROXY`, `http_proxy`, `npm_config_https_proxy`, `npm_config_http_proxy`, `npm_config_proxy`, and lowercase `all_proxy`, but did not clear uppercase `ALL_PROXY`.

This is a good example of an incomplete cleanup pattern:

- The test's intent was "no proxy env exists".
- The implementation cleared only the proxy spellings it knew about.
- The production code delegates to `proxy-from-env`, which knows more spellings.
- The test therefore became sensitive to the developer or CI environment.

### Recommendations

- Add a shared env helper in `test/util/env.ts` or similar:
  - `snapshotEnv()`
  - `restoreEnv(snapshot)`
  - `withEnv(overrides, fn)`
  - `withoutProxyEnv(fn)`
- The proxy helper should clear all spellings used by `proxy-from-env`: `HTTP_PROXY`, `http_proxy`, `HTTPS_PROXY`, `https_proxy`, `ALL_PROXY`, `all_proxy`, `NO_PROXY`, `no_proxy`, npm proxy variants, and any repo-supported aliases.
- Use full snapshot/restore for tests that mutate env vars, not piecemeal deletion.
- Add a backend hygiene test that flags direct `process.env.X =`, `delete process.env.X`, and `vi.stubEnv` unless the file imports the shared env helper or is explicitly allowlisted.
- Snapshot and restore singleton modules such as `cliState` with helpers. For example, a `withCliState()` helper would prevent tests from forgetting `basePath`, `maxConcurrency`, or future fields.
- Use scoped global helpers for backend too, mirroring the app's `browserMocks.ts`.

## Filesystem, Temp Directories, And Persistent State

The suite has many tests that write files, create temp directories, copy configs, or exercise CLI behavior. That is appropriate, but cleanup should be standardized.

Observed risk categories:

- 61 files contain direct temp, write, remove, or filesystem mutation patterns.
- Some tests use worker-specific directories under `.local/vitest`, which is good.
- Other tests use ad hoc temp paths or manual cleanup in `afterEach`/`afterAll`.
- The global backend setup removes only the worker config dir at the end of the worker.

Recommendations:

- Add a central `createTestDir()` helper that creates a unique directory per test, returns absolute paths, and registers cleanup automatically.
- Prefer `fs.mkdtemp` under a known repo-local ignored root or OS temp root with a repo-specific prefix.
- Make cleanup failure visible. If a test cannot remove a temp dir, fail the test or emit a structured warning in CI rather than silently continuing.
- Avoid hard-coded temp filenames and shared `.promptfoo` or cache paths.
- Continue respecting the repository rule not to delete `~/.cache/promptfoo` or `~/.promptfoo/promptfoo.db`; tests should redirect those locations rather than mutate real user state.

## Frontend Test Quality

The app test harness is one of the stronger parts of the suite. It has random ordering, fork isolation, explicit browser mock helpers, timer helpers, API mock helpers, storage cleanup, and hygiene tests. The main issues are the warning volume, heavy store mocking, and a few interaction-query anti-patterns.

### Strengths

- `src/app/src/setupTests.ts` unmounts React trees, restores timers, restores spies, restores browser property mocks, clears local/session storage, and clears mocks after each test.
- `src/app/src/tests/browserMocks.ts` provides scoped browser global replacements.
- `src/app/src/tests/apiMocks.ts` centralizes `callApi` mocking.
- `src/app/src/tests/timers.ts` centralizes fake timer usage.
- `src/app/src/tests/test-hygiene.test.ts` blocks focused/skipped frontend tests, direct browser global mocks, many direct API mocks, and direct fake timer usage.
- The app suite passed a seeded shuffled run and a seeded coverage run.

### Issues

- The app run printed React warnings about invalid nesting, unknown DOM props, missing keys, NaN attributes, and unwrapped `act(...)` updates.
- 84 app test files use `fireEvent`.
- 78 app test files use `getByTestId` or `data-testid`.
- 75 app test files use `waitFor`.
- 153 app test files use `screen.getByText`; 129 use `screen.getByRole`.
- Many component tests mock Zustand stores even though the repo's frontend testing guidance prefers real stores for behavior tests.
- Benchmark tests under `src/app/src/__benchmarks__` are named as normal tests and can run in default test commands.

### Recommendations

- Add a frontend console gate that fails on unexpected `console.error` and `console.warn`.
- Burn down React warnings as first-class test debt. These warnings often map to real UI/accessibility defects.
- Prefer `userEvent` over `fireEvent` for user interactions, especially typing, selection, clicks that trigger focus behavior, keyboard navigation, and pointer interactions.
- Prefer role/name/label queries over `getByTestId`. Test IDs are fine for canvas-like or virtualization-heavy components, but they should not be the default for buttons, dialogs, forms, links, alerts, tabs, or menus.
- Prefer `findBy*` for async UI where possible. Use `waitFor` when waiting on side effects or when no semantic query exists.
- Move benchmark files to `*.bench.tsx` or exclude `__benchmarks__` from default Vitest.
- For Zustand-backed UI, add store factory/reset helpers so tests can use real stores without leaking state. Mock store hooks only when the component is intentionally presentational.

## Site Test Quality

The site tests are small enough that drift is easy to miss.

Issues:

- `site/vitest.config.ts` does not enable random order by default.
- `site/vitest.config.ts` does not configure `pool: 'forks'` or `isolate: true`.
- `site/src/setupTests.ts` imports `@testing-library/jest-dom/vitest` and also manually extends the same matchers.
- `site/src/setupTests.ts` manually patches `console.error` globally and does not restore it.
- `site/src/setupTests.ts` only calls `vi.clearAllMocks()` in cleanup.
- Site coverage parsing fails for many TS/TSX files and excludes them while still exiting successfully.
- The site is ignored by Codecov.

Recommendations:

- Align site Vitest config with app defaults where practical: `sequence.shuffle: true`, `pool: 'forks'`, `isolate: true`, and explicit cleanup policy.
- Replace manual `console.error` patching with a spy-based console gate or a scoped helper.
- Use one jest-dom extension path, not both.
- Add storage cleanup and `vi.restoreAllMocks()` after each test.
- Fix coverage parsing or remove the misleading site coverage command.
- Add a small site hygiene test for `.only`, `.skip`, direct console suppression, and direct global mutation.

## Test Anti-Patterns

These are patterns I would actively reduce over time. Not every occurrence is wrong, but each is a good candidate for review when touching nearby tests.

- Excessive use of `as any`: 2,473 occurrences in tests.
- `@ts-ignore`: 57 occurrences.
- Large tests with many unrelated assertions and a lot of setup.
- Tests that assert implementation details over public behavior.
- Tests that print diagnostics instead of embedding them in assertion failure messages.
- Tests that mock the module under test's close collaborators so heavily that they no longer catch integration breakage.
- Tests that copy production logic into the expectation, especially for prompt construction, generated schemas, and provider request bodies.
- Tests that use broad snapshots or giant object literals without helper builders.
- Tests that rely on global setup defaults for network or browser behavior.
- Tests that mutate `process.env`, `cliState`, `global.fetch`, `console`, `Date`, `Error`, or filesystem state without a scoped helper.
- Tests that use `waitFor` to hide timing uncertainty rather than awaiting the exact user-visible transition.
- Tests that validate happy paths but do not exercise malformed input, provider errors, retries, rate limits, aborts, partial data, and cleanup failure.

Recommendations:

- Replace many `as any` cases with typed fixture builders and `satisfies`.
- Allow intentional malformed-input tests to use narrow local casts, but avoid broad file-level type escape hatches.
- Prefer builder helpers such as `makeEvalResult()`, `makeProviderResponse()`, `makeRedteamTestCase()`, `makeHttpResponse()`, and `makeConfig()`.
- Use custom matchers for recurring structures, for example provider requests, assertion outcomes, redteam plugin outputs, and CLI output summaries.
- For expected thrown/logged errors, assert the error and suppress only that exact expected output.

## Complexity And Refactoring Opportunities

The largest tests mirror the largest production modules. That is common in mature systems, but it is also where test maintenance becomes expensive.

### Largest Test Files

- `test/providers/http.test.ts` - 8,527 lines.
- `test/evaluator.test.ts` - 7,112 lines.
- `test/providers/openai/responses.test.ts` - 5,042 lines.
- `test/redteam/commands/generate.test.ts` - 3,734 lines.
- `src/app/src/pages/eval/components/ResultsTable.test.tsx` - 3,688 lines.
- `test/redteam/index.test.ts` - 3,649 lines.
- `test/assertions/runAssertion.test.ts` - 3,573 lines.
- `test/providers/bedrock/index.test.ts` - 3,388 lines.
- `test/util/config/load.test.ts` - 3,205 lines.
- `test/providers/claude-agent-sdk.test.ts` - 3,114 lines.

### Largest Source Files

- `src/evaluator.ts` - about 4,363 lines.
- `src/providers/http.ts` - about 2,828 lines.
- `src/providers/bedrock/index.ts` - about 2,638 lines.
- `src/redteam/plugins/codingAgent/verifiers.ts` - about 2,268 lines.
- `src/providers/openai/codex-sdk.ts` - about 2,231 lines.
- `src/matchers.ts` - about 2,198 lines.
- `src/app/src/pages/eval/components/ResultsTable.tsx` - about 1,810 lines.
- `src/app/src/pages/redteam/setup/components/StrategyConfigDialog.tsx` - about 1,353 lines.
- `src/app/src/pages/redteam/setup/components/ProviderTypeSelector.tsx` - about 1,256 lines.
- `src/app/src/pages/redteam/setup/components/Review.tsx` - about 1,227 lines.

### Refactoring Direction

- Split giant test files by behavior, not by arbitrary line count. For example:
  - `http.proxy.test.ts`
  - `http.retries.test.ts`
  - `http.transforms.test.ts`
  - `http.tls.test.ts`
  - `http.multipart.test.ts`
  - `evaluator.providers.test.ts`
  - `evaluator.assertions.test.ts`
  - `evaluator.cache.test.ts`
  - `evaluator.concurrency.test.ts`
- Extract fixture builders before splitting. Splitting first without shared fixtures often creates duplication.
- Separate pure logic tests from integration-style tests. A file can then use stricter mock cleanup for pure units and heavier setup only where needed.
- Move repeated provider request expectations into custom helpers.
- For frontend monolith components, extract pure helpers and smaller subcomponents where the tests repeatedly need to render a huge parent just to exercise a small behavior.
- For `ResultsTable`, `ResultsView`, and redteam setup components, consider a layered test strategy:
  - Pure data transformation tests.
  - Store/reducer behavior tests.
  - Component interaction tests with realistic store state.
  - A small number of workflow tests that render the larger composition.

## Recommended Hygiene Automation

Existing hygiene tests are a good foundation. I would extend them rather than introduce a separate linting system immediately.

Add backend hygiene checks for:

- Unexpected direct `console.log`, `console.warn`, and `console.error` in unit tests, with an allowlist for smoke/E2E tests and approved helpers.
- Direct `process.env` mutation outside a shared env helper.
- `vi.spyOn` without local `mockRestore`, `vi.restoreAllMocks`, or a scoped helper.
- `vi.hoisted` without a reset helper.
- Direct `global.fetch =` or `globalThis.fetch =`.
- Direct `Date.now =`, `global.Date =`, `global.Error =`, or similar constructor replacement without scoped restoration.
- New `@ts-ignore` in tests.
- New `as any` above a ratcheting budget, or at least in newly changed files.
- `testTimeout`/`hookTimeout` increases in individual test files without a reason.

Add app hygiene checks for:

- New `fireEvent` usage unless explicitly justified.
- New `getByTestId`/`data-testid` usage in files where role/label queries are feasible.
- Console warnings/errors not explicitly allowed by a helper.
- New store-hook mocks in integration-style component tests.
- Benchmark files included in the default test glob.

Add site hygiene checks for:

- Focused/skipped tests.
- Direct console patching.
- Direct global/browser mutation.
- Missing random order in config.

## Prioritized Recommendations

### P0 - Fix Real Isolation Failures

- Fix `test/fetch.test.ts` by clearing/restoring the complete proxy environment, especially `ALL_PROXY`.
- Add a proxy-env helper so this class of bug does not recur elsewhere.
- Configure site tests to shuffle by default, since they already passed a shuffled run.

### P1 - Make Noise Fail Fast

- Add a backend console-output gate with scoped allow helpers.
- Add a frontend console-warning gate and start burning down React warnings.
- Replace manual `console.log` diagnostics in tests with assertion messages or helper errors.
- Move app benchmark tests out of default test execution.
- Fix site `console.error` patching so warnings are not globally suppressed.

### P1 - Strengthen Cleanup Contracts

- Introduce shared helpers for env vars, proxy vars, CLI state, global fetch, console spies, timers, and temp directories.
- Migrate backend tests away from persistent describe-level spies so `vi.restoreAllMocks()` can eventually become global cleanup.
- Add backend hygiene tests for direct env/global mutation and un-restored spies.
- Align site setup cleanup with app setup cleanup.

### P1 - Improve Coverage Quality

- Raise patch coverage gradually and introduce higher expectations for high-risk modules.
- Add targeted tests for currently 0%-covered backend files in assertions, code scan, MCP tools, audio/ElevenLabs, OpenAI tracing, xAI responses, and multilingual redteam strategy.
- Add targeted app tests for navigation/sidebar, eval creator provider/run options, model-audit installation guide, report download/export, and target configuration components.
- Fix or intentionally retire site coverage reporting.

### P2 - Reduce Test And Source Complexity

- Split the largest test files by behavior after extracting shared fixtures.
- Add typed fixture builders to reduce `as any` and repeated object literals.
- Refactor giant source modules along natural boundaries when making related feature changes.
- Prefer layered frontend tests over rendering very large parent components for small behaviors.

### P2 - Improve Developer Ergonomics

- Fix or document the `npm run test:app -- --...` flag-forwarding trap.
- Add canonical commands for seeded random-order runs in `test/AGENTS.md` and app/site equivalents.
- Add a short guide for writing tests that mutate env, globals, timers, filesystem, stores, or provider mocks.

## Suggested Near-Term Work Plan

1. Fix the `test/fetch.test.ts` proxy env leak and add an env/proxy helper.
2. Add site `sequence.shuffle: true`, `pool: 'forks'`, `isolate: true`, and cleanup parity with app setup.
3. Add backend console gating in warning-only or allowlist mode, collect the initial allowlist, then flip to fail-on-new-noise.
4. Add a frontend console-warning gate and burn down the current React warnings.
5. Add backend hygiene tests for direct env mutation and direct console output.
6. Move benchmarks out of default app tests.
7. Add coverage ratchets for backend and app branch coverage.
8. Pick one giant backend test file and one giant app test file as exemplars for fixture extraction and behavior-based splitting.

## Commands Run

- `npm ci`
- `source ~/.nvm/nvm.sh && nvm use && npm test -- --sequence.seed=424242 --reporter=dot`
- `source ~/.nvm/nvm.sh && nvm use && npm run test --prefix src/app -- --run --sequence.seed=424242 --reporter=dot`
- `source ~/.nvm/nvm.sh && nvm use && npm run test --prefix site -- --sequence.shuffle=true --sequence.seed=424242 --reporter=dot`
- `source ~/.nvm/nvm.sh && nvm use && env -u ALL_PROXY -u all_proxy -u HTTP_PROXY -u HTTPS_PROXY -u http_proxy -u https_proxy -u NO_PROXY -u no_proxy -u NPM_CONFIG_PROXY -u NPM_CONFIG_HTTP_PROXY -u NPM_CONFIG_HTTPS_PROXY -u npm_config_proxy -u npm_config_http_proxy -u npm_config_https_proxy npm run test:vitest -- --coverage --coverage.reporter=json-summary --coverage.reporter=text-summary --sequence.seed=424242 --silent`
- `source ~/.nvm/nvm.sh && nvm use && npm run test --prefix src/app -- --coverage --coverage.reporter=json-summary --coverage.reporter=text-summary --sequence.seed=424242 --silent`
- `source ~/.nvm/nvm.sh && nvm use && npm run test --prefix site -- --coverage --coverage.reporter=json-summary --coverage.reporter=text-summary --sequence.shuffle=true --sequence.seed=424242 --silent`

## Bottom Line

Promptfoo has a serious and broad test suite, and the app test harness in particular has several high-quality guardrails already. The main opportunity is to make the suite less tolerant of hidden shared state and less noisy when it passes. The random-order setup is doing its job: it surfaced a real environment-isolation bug. The next level of quality is to standardize state cleanup, make logs and React warnings fail fast, ratchet branch coverage, and split the largest tests into behavior-focused files backed by typed fixture builders.
