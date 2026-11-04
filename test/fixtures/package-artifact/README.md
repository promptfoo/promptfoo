# Installed package fixtures

`scripts/testPackageArtifact.ts` installs packed `promptfoo` in a temporary consumer
outside the repository and copies these fixtures there. Installs use the public npm
registry with lifecycle scripts disabled. Pass `--registry URL` to use a trusted mirror.

Use npm 11 as required by the repository. Older npm 10 pack implementations can
run `prepare` despite `--ignore-scripts`. After `npm run build`, run from the
repository root:

```sh
npm run test:package-artifact
npm run test:package-artifact -- --profile omit-optional
```

Both profiles check ESM/CommonJS evaluations and JSON exports, declaration types,
and web assets. Evaluations cover success, assertion failure, and provider errors
with caching disabled and isolated configuration paths. CommonJS also checks
writable exports and Zod constructor identity.

Both profiles check that Slack stays opt-in and rejects an incompatible SDK without
affecting ordinary providers, in ESM and CommonJS. The default profile also installs
the supported Slack SDK and constructs providers without making Slack requests.

Langfuse prompt management is checked in both module formats with the SDK absent or
incompatible. The default profile installs the real SDK and evaluates text and chat
prompts against a loopback server, checking version/label selection, compilation,
concurrent request sharing, and reuse of the SDK prompt cache.

Both profiles check WatsonX with neither SDK, each SDK individually missing, and
each SDK incompatible, in ESM and CommonJS. The default profile installs both SDKs
and exercises real text/chat requests against a local bearer-token server, plus
IAM authenticator construction without external token requests.

Both profiles verify that Claude Agent and Codex SDKs are absent by default, in
ESM and CommonJS. The default profile installs incompatible and supported real
SDK versions, then exercises success and failure through local subprocess
protocol fixtures without model-service requests.

The default profile checks both CLI aliases and evaluates compressed HTTP responses
from a local server. It also checks the Transformers provider with an offline model
fixture when the optional SDK is absent, incompatible, and installed.
Without optional dependencies, native SQLite is unavailable;
even `--version` must report the expected missing-dependency diagnostic.

The repository's TypeScript compiler checks callers against the installed declarations.
Contracts use full strict checking. Root API callers use `skipLibCheck` because `Eval`
exposes Drizzle declarations with upstream errors and optional-driver imports.

## Validate an existing artifact

```sh
npm run package:pack -- --destination /tmp/promptfoo-artifacts
npm run test:package-artifact -- --tarball /tmp/promptfoo-artifacts/promptfoo-VERSION.tgz
npm run test:package-artifact -- --tarball /tmp/promptfoo-artifacts/promptfoo-VERSION.tgz --profile omit-optional
```

The supplied archive is inspected and installed without repacking. Validation
checks its own migration journal and UI references, works without a local `dist`,
and verifies that its bytes remain unchanged. Current release jobs run
`prepublishOnly` first, then pack, validate both profiles, and upload that archive
to an isolated publisher. Publication cannot invoke another build.

Historical backfills keep their tagged build. Tags with an exact-artifact harness
use it; older tags receive an explicitly limited installed CLI/JSON echo check.
They still publish the same archive that passed that compatibility check.

## Runtime assets and platforms

Default consumers upgrade a database from the first packaged migration. Checks
cover historical data and CLI exports, new passing and failing results, and
migration idempotency after reopening.

Fixtures run in supervised child processes. Temporary state is removed after the
children exit and retained if process-tree termination fails.

Select the interpreter checks to run. Each selected interpreter must be installed:

```sh
npm run test:package-artifact -- --runtime-assets python-go
npm run test:package-artifact -- --profile omit-optional --runtime-assets all
```

`python-go` tests Python and Go; `all` additionally requires Ruby. Each provider
runs success, deliberate error, and recovery cases with scores 1/0/1. The Python
fixture uses both the prompt wrapper and a persistent provider worker. The protobuf
check roundtrips a nonempty trace using the installed definitions and rejects malformed
bytes. It does not start an OTLP receiver.

| CI consumer                  | Install layout                        | Additional checks                                            |
| ---------------------------- | ------------------------------------- | ------------------------------------------------------------ |
| Linux Node 22.22             | Shallow                               | Historical database upgrade                                  |
| Linux Node 24                | Hoisted, default and optional-omitted | Python, Go, Ruby, protobuf; upgrade in default profile       |
| Linux Node 26                | Hoisted                               | Historical database upgrade                                  |
| macOS and Windows Node 22.22 | Hoisted                               | Linux-produced archive, native SQLite and historical upgrade |

The macOS/Windows jobs use `scripts/preparePackageArtifactTest.mjs` to copy only
the acceptance scripts/fixtures into a temporary tool package. Its two tools
and their complete dependency graph are copied from the repository lockfile,
including integrity hashes and optional native packages, then installed with `npm ci`.
The installed Promptfoo consumer resolves dependencies independently. No repository
dependency install or build is required on those platforms. Incremental TypeScript
compiler state is excluded from the published archive.

## Browser capability

Add `--browser` to the default profile to install compatible browser SDKs and test them:

```sh
npm run test:package-artifact -- --browser
```

The installed Playwright CLI downloads matching Chromium into a temporary directory.
The fixture checks Unicode input, clicks, extraction, stealth, a missing-selector
error, and recovery on local HTML. Expected scores are 1/0/1. This runs on Linux
Node 24 in CI; other jobs require `--browser`. Missing-SDK checks run in both profiles
without this flag.
