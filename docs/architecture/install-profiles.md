# Installed consumer profiles

Source reach, tarball bytes, installed dependencies, downloaded assets, and startup
latency answer different questions. Use the install-profile tool to measure an
**already-built tarball** in fresh consumers outside the repository. The existing
`test:package-artifact` harness remains the artifact acceptance gate.

## Run

From the repository root, with the repository Node version and npm major 11:

```sh
nvm use
npm ci --cache /tmp/promptfoo-task-npm-cache
npm run build
npm pack --ignore-scripts --json --pack-destination /tmp
node --import tsx scripts/measureInstallProfiles.ts \
  --tarball /tmp/promptfoo-0.122.2.tgz \
  --output /tmp/promptfoo-install-report \
  --runs 5
```

Use the filename returned by `npm pack`. The output directory must be new. The
measurement command does not build, publish, or change the tarball. Installation
runs lifecycle scripts by default, including supported native/browser downloads.
`--no-install-scripts` is an explicit inventory experiment and must not be reported
as normal installation acceptance. `--profiles default` or
`--profiles omit-optional` selects one profile. The default registry comes from the invoking npm configuration; `--registry URL`
selects one explicitly. Other user npm settings and credentials are not inherited. Registry URLs containing
userinfo, query strings, or fragments are rejected before evidence is written.

The tool retains its temporary consumers and cache; their path is recorded in
`report.json`. Nothing deletes shared caches or databases. Consumer commands use
explicit config/cache paths and disable telemetry and update checks. They do not
inherit provider credentials, `NODE_PATH`, `NODE_OPTIONS`, or other npm settings.
Temporary roots are resolved through symlinks and must be outside the checkout,
without an ancestor `node_modules` directory. If `TMPDIR` selects an unsafe root,
the tool rejects it before writing reports or installing. Node probes also disable
global module search paths so undeclared dependencies cannot come from the host.
Outbound proxy settings are preserved without recording their values. Explicit
asset-cache paths cover the documented browser/model tooling; this is not a
sandbox for arbitrary dependency lifecycle scripts.

## Evidence

The report records:

- Tarball SHA-256 and compressed bytes, Node/npm versions, platform, architecture,
  CPU, profile order, lifecycle-script mode, and cache conditions.
- A newly resolved **consumer** lockfile and its hash. Both profiles use `npm ci`
  with the same lockfile. Root workspace overrides and the repository lockfile do
  not propagate to a downstream installation. Keep the retained tarball and
  consumer lockfile together when replaying an exact resolution.
- Every installed package occurrence, version, relative path, logical file bytes,
  and allocated file bytes. Nested dependency copies count separately; package
  attribution excludes nested `node_modules` to prevent double counting.
- Native library and WebAssembly paths. Symlinks are counted but never followed;
  regular files count once per pathname, including hardlinks. Directory allocation
  and symlink bytes are excluded. Allocated bytes depend on the filesystem, and
  these numbers are not equivalent to download size or unique physical blocks.
- Downloaded browser and explicitly isolated asset-cache bytes separately from
  `node_modules`. The npm download cache is excluded from installed footprint.
- `npm ls --all --json` output and status. Optional dependencies may be omitted by
  platform or failed installation scripts even in the default profile: inspect
  the actual inventory and logs, not just the lockfile. Direct dependency presence
  is reported from physical resolution paths, including absent optional capabilities.
- Fresh-process samples for Node alone, the contracts ESM import, the full facade
  through ESM/CJS, and CLI help. The first sample, raw samples, median, min/max,
  failures, and timeouts remain visible. Probe order rotates across rounds.
- Real installed CLI evaluations using the deterministic `echo` provider. One
  must pass and one must fail an assertion. Exported JSON is checked for the exact
  output, success, score, and error evidence; exit status alone is insufficient.

A failed install, dependency-tree check, startup probe, or eval makes the tool exit
nonzero. Every command timeout is a failure, including a timeout that races with
an expected exit code. Timeout cleanup terminates process groups on POSIX and
uses `taskkill /T /F` on Windows; unsuccessful cleanup stops measurement before
an inventory can be trusted. Completed evidence remains available. Partial inventories after install
failure are diagnostic; they cannot establish a smaller usable profile.

## Comparison rules

1. Compare the same artifact, consumer resolution, machine, npm version, and script
   mode. A fresh consumer directory does not imply a fresh npm or OS page cache.
   The tool starts a new local npm cache shared by resolution and the subsequent
   profile installs; installation durations are diagnostic, not speedup claims.
2. Sum installed tree bytes and downloaded asset bytes when comparing footprint.
   Shared dependency closures and npm hoisting make package sizes non-additive.
   Removing a source import or using a subpath does not remove npm dependencies.
3. Repeat fresh installations and report raw startup samples. These are process
   startup measurements with uncontrolled OS caches, **not cold-disk benchmarks**.
   Do not turn a single run or an import-only timing into an evaluation speed claim.
4. Default and `--omit=optional` are separate profiles. A failing omitted profile
   remains a failure; absent capabilities are not savings for a consumer that
   needs them. This tool's local echo QA does not prove every optional capability.

## Conditional private capability experiment

The first candidate is a dependency-only browser add-back profile: the unchanged
full facade plus explicit `playwright`, `playwright-extra`,
`puppeteer-extra-plugin-stealth`, and `@playwright/browser-chromium` dependencies.
Playwright also supports ChatKit, so these dependencies are not exclusively owned
by the browser provider. Any prototype remains private and outside the published
workspace graph. It must not duplicate provider registries or lifecycle state.

Set the gate before collecting results: at least **100 MiB and 15%** reduction in
installed tree plus downloaded assets versus a working full profile, repeated in
fresh consumers; deterministic browser success/error/recovery checks and the full
facade probes must pass; no repeatable startup regression. The fixture must use
local HTML and exact extracted output, with no external service or provider API.

Stop if the baseline capability is broken, omitted native dependencies prevent
execution, savings depend on missing requested features, a root-hoisted dependency
is needed, or meaningful browser/native execution cannot be verified. Correct a
production declaration through its owner before comparing profiles. A private
add-back dependency bundle proves selective consumer installation only; it does
not prove a standalone evaluator package or justify public package publication.

Local-model extraction is deferred until a pinned deterministic model fixture is
available. Importing a mocked pipeline or reporting a missing-model error does
not establish native execution usability.

## Initial observation (September 8, 2026)

A Linux x64 consumer run with Node 24.20.0 / npm 11.19.0 used an artifact built
from source `885da5f5e75de17acf4d92656c5c1bbcdb851ce4`, SHA-256
`665287aabea681e736c02af3b75184c752ad26d6c9a3e806aa3c021999e3ba10`.
Lifecycle scripts ran. Both profiles used one consumer lockfile. This is a
single-machine baseline, not a claim about all supported platforms or current
registry contents.

| Observation                                  |       Default |        Omit optional |
| -------------------------------------------- | ------------: | -------------------: |
| Installed package occurrences                |           772 |                  374 |
| Logical `node_modules` bytes                 | 1,793,938,891 |          206,263,527 |
| Downloaded browser asset bytes               |   687,912,024 |                    0 |
| Contracts ESM median, five fresh processes   |        104 ms |               101 ms |
| Facade ESM median, five fresh processes      |      1,277 ms |             1,299 ms |
| Facade CJS median, five fresh processes      |        921 ms |               894 ms |
| CLI help median, five fresh processes        |      1,553 ms |      All five failed |
| Echo success / intentional assertion failure | Both verified | Both failed to start |

The omitted CLI could not load `@libsql/linux-x64-gnu`. Root facade imports still
succeeded, demonstrating why importing the facade cannot establish consumer
usability. The default dependency-tree check also reported an invalid
`gcp-metadata@9.0.3` relationship. The default install silently omitted
`@huggingface/transformers` after its optional installation failed, in addition to
normal platform exclusions. These are failed acceptance checks and incomplete
capability coverage, not accepted installation savings.

A private four-dependency browser add-back prototype was prepared, but its fresh
installation through the configured registry returned a missing-package error for
a required facade dependency before browser execution. The benefit gate remains
unmet. Do not publish a capability package based on these results. Re-run with a
working approved registry and equivalent usable consumers before drawing a
capability-size or startup conclusion.
