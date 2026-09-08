# Installed package fixtures

`scripts/testPackageArtifact.ts` copies these scripts into a temporary consumer
outside the repository, installs a packed `promptfoo`, and runs its public API.
The consumer uses the public npm registry and is isolated from the repository's
workspaces, lockfile, overrides, and development dependencies. To select a trusted
local mirror explicitly, pass `--registry https://your-registry.example/`.

Use npm 11 as required by the repository. Older npm 10 pack implementations can
run `prepare` despite `--ignore-scripts`. After `npm run build`, run from the
repository root:

```sh
npm run test:package-artifact
npm run test:package-artifact -- --profile omit-optional
```

Both dependency profiles disable install scripts. They verify ESM/CommonJS root
API evaluations, root and contracts declarations, and web asset references.
The CommonJS fixture checks writable exports and the identity of its native Zod
constructors. API fixtures check a pass, an assertion failure, and a provider
error with caching disabled and isolated configuration paths. Default dependency
resolution also runs the installed CLI against a local compressed HTTP server.
Default CLI version aliases must report the installed version. The
optional-omitted profile intentionally lacks native SQLite platform packages and
checks the existing actionable CLI failure (even `--version` initializes SQLite).
It cannot run persistence-dependent CLI evaluations.

The TypeScript compiler is a test tool from the repository; its consumer projects
resolve all package declarations from the isolated installation with strict
checking enabled for consumer code. Contracts also check dependency declarations;
root API consumers use `skipLibCheck` because the public `Eval` surface currently
exposes Drizzle declarations with upstream errors and unrelated optional driver
imports. This does not claim a clean root declaration closure.

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

Default consumers migrate an isolated database from the first packaged migration,
retain a nonempty legacy result/table/config byte-for-byte, export it through the
installed CLI, and persist a new passing and failing evaluation. A second process
reopens the database and verifies migration idempotency and stored results.

Select interpreter checks explicitly; missing interpreters fail the selected gate:

```sh
npm run test:package-artifact -- --runtime-assets python-go
npm run test:package-artifact -- --profile omit-optional --runtime-assets all
```

`python-go` tests Python and Go; `all` additionally requires Ruby. Each provider
runs success, deliberate error, and recovery cases with scores 1/0/1. The Python
fixture uses both the prompt wrapper and a persistent provider worker. The same
gate roundtrips a nonempty trace using the installed protobuf definitions and
rejects malformed bytes; it does not start an OTLP receiver.

| CI consumer                  | Install layout                        | Additional checks                                            |
| ---------------------------- | ------------------------------------- | ------------------------------------------------------------ |
| Linux Node 22.22             | Shallow                               | Historical database upgrade                                  |
| Linux Node 24                | Hoisted, default and optional-omitted | Python, Go, Ruby, protobuf; upgrade in default profile       |
| Linux Node 26                | Hoisted                               | Historical database upgrade                                  |
| macOS and Windows Node 22.22 | Hoisted                               | Linux-produced archive, native SQLite and historical upgrade |

The macOS/Windows jobs use `scripts/preparePackageArtifactTest.mjs` to copy only
the acceptance scripts/fixtures into a temporary tool package. Its three tools
use exact versions from the repository lockfile; the installed Promptfoo consumer
resolves dependencies independently. No repository dependency install or build is
required on those platforms. Incremental TypeScript compiler state is excluded
from the published archive.
