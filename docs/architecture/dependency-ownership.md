# Dependency ownership

Run the report from the repository root:

```sh
npm run deps:ownership
npm run --silent deps:ownership -- --json > dependency-ownership.json
npm run deps:ownership -- --json --check
```

The Markdown table groups root runtime dependencies by source layer and counts
files with direct imports. `unreferenced` means no direct source import was found;
check for build tools, installed assets, and computed imports before removing a
package. Colocated tests and ambient declarations do not count as runtime source.

## Manifest ownership

`architecture/dependency-ownership.json` assigns each manifest a component role:
`root/runtime`, `contracts/portable-contracts`, `app/browser`, `site/docs-build`,
or `code-scan/action`. The role
identifies which component owns its dependency declarations. Add an owner when
introducing a workspace.

The JSON report has `schemaVersion: 1` and these fields:

- `rows`: the root summary shown in Markdown. Previous JSON output was this array
  alone; consumers should now read `.rows`.
- `manifestOwners`: assignments from the ledger, including empty manifests.
- `declarations`: regular, optional, development, and peer dependencies from every
  audited manifest, with owners, reference scopes, and annotations.
- `undeclaredUsages`: imports missing from their own manifest, with file/line
  references and declarations elsewhere. A hoisted root dependency does not
  satisfy a workspace declaration, even if that workspace currently builds.
- `runtimeDeclarationGaps`: root source imports missing a regular, optional, or
  peer declaration. Explicit type imports and files with reviewed build
  annotations are excluded. This check does not apply to app/site bundles.
- `computedImports`: nonliteral import, require, and resolution calls.
  `fileAnnotations` lists reviewed computed-loader dependencies for the file;
  it does not attribute every computed call to those packages.
- `annotationErrors` and `unassignedManifests`: invalid annotations and missing owners.
- `coverage`: manifests, source file count, and generated declarations scanned.

Reference scopes distinguish source, build, colocated tests/stories, and
declarations. Reference kinds distinguish type, value, dynamic, and resolution
imports from manual annotations. A value-capable TypeScript import can still be
erased during compilation.

`--check` fails on undeclared imports, root runtime declaration gaps, or unassigned
manifests. Invalid annotations fail in either mode. Computed user-module loads do
not fail strict checking. Strict checking is available locally; it is not a
required CI gate.

## What is scanned

The scanner reads root workspaces, including npm glob exclusions and re-inclusions,
and the standalone `code-scan-action` package. For each package it scans `src/`,
`scripts/`, `.storybook/`, and JavaScript/TypeScript files in the package root.
It also scans configured architecture roots, including individual files, and
JavaScript/TypeScript under `site/docs/` and `site/blog/`.

Supported references include static imports, literal loader calls, type imports,
leading triple-slash type and AMD directives, module augmentations in external
modules, and JavaScript JSDoc type tags and `@import` declarations. Type directives
retain their written specifiers. Node types and installed DefinitelyTyped entries
are attributed to their `@types` package using the referencing file's default
Node lookup paths; custom compiler resolution settings are not interpreted.

Installed dependencies, mocks, generated runtime bundles, build/cache output, and
configured ignored roots are excluded. Workspace discovery itself excludes only
`node_modules` and explicit workspace exclusions, so a workspace can live under
`build` or `dist`. Files with a nested manifest outside the audited list are
excluded rather than assigned to the root package.

The scanner does not read tests outside those source roots, Markdown/MDX, CSS,
package-script shell commands, tsconfig files, JSX runtime pragmas, package
`imports` maps, or custom loader functions. Named `createRequire` results also
need separate review because they can resolve against a different package.

If `dist/` exists, generated declarations are scanned and listed in `coverage`.
Run a fresh build before auditing them. The report cannot detect stale output or
determine which declarations are reachable through public exports. An empty list
means no generated declaration files were available.

Imports that resolve through architecture source/asset aliases or documented
virtual site aliases are excluded. Declared workspace package names take
precedence over broad aliases: an `@promptfoo` alias must not hide a dependency on
a future `@promptfoo/contracts` package.

## Annotations and installation checks

Annotations explain computed loaders, installed assets, peers, compatibility
pins, build tools, and public declaration requirements. Each needs a manifest
declaration, disposition, reason, and existing evidence paths. Stale declarations
or missing paths fail the report and exclude the annotation from its output.
Review the explanation itself; a valid file path does not prove it remains true.

Computed-loader files must belong to the annotation's manifest. They add
references with `kind: "annotation"` and `line: 0`, without changing the root
summary's direct source count. Other annotations record installation or build
requirements without creating synthetic imports.

The report does not check installed dependency trees, native binaries, or
transitive requirements. Validate dependency changes with a packed consumer
installation and the relevant CLI/API workflow. Root overrides do not propagate
to consumers, and successful ESM/CJS imports do not prove an evaluation works.
For example, a plain `--omit=optional` installation also removes libSQL's platform
binary. Retain required native assets when testing smaller installation profiles.
