# Shipped dependency inventories

CI inventories three software surfaces separately:

- **Default npm consumer:** the actual packages installed from the built Promptfoo
  tarball, including optional dependencies that installed on the runner. The
  `runtime-default.cdx.json` artifact is npm's CycloneDX SBOM. The smaller
  `runtime-default.json` records unique package/version identities, the archive's
  SHA-512 and size, and the installation environment.
- **Bundled app:** packages contributing rendered browser modules, plus asset
  filenames, sizes and SHA-256 hashes. The inventory is included in the tarball at
  `dist/src/app/browser-inventory.json`. Acceptance verifies every listed asset
  against its installed bytes and rejects unreported files.
- **Documentation site:** packages contributing client webpack chunks, plus
  emitted assets and copied static files. Server-rendering packages and build tools
  are not counted unless their code also contributes to client output.

The runtime inventory is captured immediately after the isolated consumer install,
before acceptance tests install optional SDKs or create package fixtures. A second
filesystem traversal verifies that npm's SBOM includes exactly the identities on
disk. No repository workspace, lockfile-only graph or development install is used
as a substitute for the consumer tree.

## CI comparison

The **Compare shipped dependency inventories** job publishes a summary and the
`sbom-inventory` artifact. For pull requests, it compares against a successful main
CI run at the exact PR base SHA. For pushes to main, it uses the preceding SHA.
The comparison includes additions and removals even if total counts stay equal;
it also reports emitted JavaScript/CSS bytes and known external script changes.

Growth produces a CI warning for review. It does not impose a fixed count ceiling:
fresh consumer semver resolution can change between runs independently of a PR.
The recorded Node/npm versions, platform, architecture, registry and installation
strategy explain the measurement. If the platform, architecture, registry, strategy
or Node/npm major version changes, the runtime comparison is explicitly unavailable
and this run records a baseline for the new environment. Browser comparisons still
run independently.

The app inventory records whether an analytics key was present at build time,
without recording its value. When this differs (for example, a fork PR compared
with main), the app comparison is unavailable; runtime and site comparisons still
run. This avoids attributing differently configured bundles to the PR.

On the first run, or when the base has no successful run or retained inventory,
the summary explicitly says that no comparison is available. It records the
current inventory without claiming a reduction. Missing or malformed current
reports, an incomplete npm SBOM, a browser hash mismatch or a baseline from the
wrong commit fail the check. Baseline artifacts are retained for 90 days.

The download step has a read-only Actions token. Repository scripts and builds do
not run with that token, and baseline artifacts are parsed as data.

## Local use

Use the repository's Node/npm versions, then build and test the packed consumer:

```bash
npm run build
GITHUB_SHA="$(git rev-parse HEAD)" npm run test:package-artifact -- --sbom-output /tmp/promptfoo-sbom
```

The artifact test can also accept an existing archive with `--tarball`. The optional
`--profile omit-optional` produces a separately named runtime report; CI's standard
comparison uses the default profile.

Build the site with `SKIP_OG_GENERATION=true npm run build --prefix site`. Copy its
`site/build/browser-inventory.json` to the report directory as `site-browser.json`.
To compare two downloaded CI artifact directories:

```bash
node scripts/compareSbom.ts \
  --current /tmp/current-inventory --baseline /tmp/base-inventory \
  --baseline-status available --source-sha <current-full-sha> --base-sha <base-full-sha> \
  --output /tmp/sbom-comparison
```

## Coverage limits

The consumer install is platform-specific and disables lifecycle scripts, matching
package acceptance. It does not represent every operating system, user-installed
optional peer, native build output or executable downloaded by a lifecycle script.
Repository overrides and the lockfile are not published with the npm package.

Browser inventories record contributing packages, not per-package byte attribution
or a complete license analysis. Preprocessed/generated CSS can lose package
provenance. Source maps and the inventory itself are excluded from hashes; site
HTML and content created by other post-build plugins are outside the browser-code
inventory. Known external scripts are listed separately without fetching them or
guessing versions. Dynamically constructed URLs and downstream CDN dependencies
can remain unrecorded; each report lists its specific limitations.

These surfaces overlap: their counts must not be summed as unique software.
Docker/OS/Python packages and the separately bundled GitHub Action require their
own inventories. This workflow does not change Docker packaging.
