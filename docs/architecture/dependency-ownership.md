# Dependency ownership

Run the report from the repository root:

```sh
npm run deps:ownership
npm run --silent deps:ownership -- --json > dependency-ownership.json
```

The Markdown table retains the root runtime dependency view: a candidate source
layer, direct layers, and file count. It is a discovery tool. `unreferenced` means
no direct source import was found; it does not mean the package is removable.
Colocated tests and ambient declaration files do not count as runtime source.

## Declared responsibility and observed usage

`architecture/dependency-ownership.json` assigns each manifest an accountable
component role: `root/runtime`, `app/browser`, or `site/docs-build`. This role owns
review of the declarations in that manifest, including dependencies shared with
other components. It is deliberately separate from a candidate source layer or
an individual contributor's identity. Add an owner when introducing a workspace.

The versioned JSON object contains:

- `rows`: the root runtime summary shown in Markdown (previous JSON output was
  this array alone; consumers should now read `.rows`).
- `declarations`: every root/workspace regular, optional, development, and peer
  declaration, its accountable owner, observed scopes, source references, and
  any reviewed annotations.
- `undeclaredUsages`: imports missing from their own manifest, with file/line
  evidence and declarations in other manifests. Root hoisting does not satisfy
  a workspace's declaration here. This is a review signal; it does not establish
  that a workspace build currently fails.
- `runtimeDeclarationGaps`: value-capable root source imports with no regular,
  optional, or peer declaration. This preserves visibility of runtime packages
  accidentally declared only as development dependencies. Explicit type imports
  are separate evidence; app/site bundling profiles are not judged by this rule.
- `computedImports`: nonliteral `import`, `require`, and resolution calls, without
  guessing the names of packages supplied by users. `fileAnnotations` links
  reviewed computed-loader dependencies in that file; it does not claim every
  computed call loads those dependencies.
- `annotationErrors` and `unassignedManifests`: stale ledger entries and missing
  ownership assignments.
- `coverage`: exact manifests, source file count, and emitted declarations read.

Reference scopes separate source, build, colocated test/story, and declaration
files. Reference kinds distinguish explicit type imports, value-capable imports,
dynamic imports, resolution calls, and manual annotation evidence. A value-capable
TypeScript import might still be erased during compilation.

## Coverage and limits

The scanner discovers root `workspaces` entries, including glob patterns, and
reads each workspace's manifest. It scans `src/`, `scripts/`, `.storybook/`, and
JavaScript/TypeScript files directly in each package root. This includes app and
site build configuration, JavaScript with JSX, and source `.d.ts`/`.d.mts`/`.d.cts`
files. It excludes installed packages, generated runtime bundles, mocks, and
build/cache output. Tests outside those source roots, Markdown/MDX, CSS imports,
package-script shell commands, and custom loader functions are not parsed.

If `dist/` exists, emitted declaration files are also scanned and listed explicitly.
Run a fresh build first when assessing public declaration dependencies. The report
does not determine which declaration files are reachable through public exports,
and it cannot tell whether existing build output is stale. No emitted declaration
files in `coverage` means no emitted declaration evidence was available.

Static imports through known architecture aliases or documented virtual site
aliases are excluded. Declared workspace package names take precedence over a
broad source alias, so a future `@promptfoo/contracts` package still needs a
manifest declaration. Framework aliases in the ledger must name actual virtual
modules; do not hide ordinary transitive packages with an alias entry.

The report does not infer execution order, installation size, native binary
availability, or a package's transitive requirements. Production declaration
repairs still require a packed consumer installation and relevant capability QA.

## Reviewed annotations

Annotations explain uses that direct import scanning cannot establish: computed
loaders, native/install assets, peers, compatibility pins, build tooling, and
public declaration requirements. Each names an existing manifest declaration,
a disposition, a reason, and existing evidence paths. Stale declarations or
missing evidence make the command fail. Evidence paths are review pointers, not
automated proof that the explanation remains true.

Computed-loader annotations add references with `kind: "annotation"` and
`line: 0`. They remain distinct from parsed imports and do not change the root
table's literal source count. Other annotations preserve installation/build
reasons without pretending that a source import exists.

Strict checking is available for a future CI gate or a focused fixture:

```sh
npm run deps:ownership -- --json --check
```

`--check` fails on undeclared imports, root runtime declaration gaps, or unassigned
manifests. Computed user-module
loads do not fail strict checking. Existing workspace declaration debt is reported
as-is; this command is not yet a repository-wide passing ratchet. Ordinary report
mode remains descriptive, except that invalid annotations fail in either mode.
