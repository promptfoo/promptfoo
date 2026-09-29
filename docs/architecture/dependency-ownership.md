# Dependency ownership

Run from the repository root:

```sh
npm run deps:ownership
npm run --silent deps:ownership -- --json > dependency-ownership.json
npm run deps:ownership -- --json --check
```

The Markdown table groups root regular, optional, and peer dependencies by the
source layers that import them. It includes the dependency kind and source file
count. `unreferenced` means no direct source import was found; check installation,
build, and public declaration requirements before removing a package.

## Manifest owners and references

`architecture/dependency-ownership.json` assigns an owner to each manifest:
`root/runtime`, `contracts/portable-contracts`, `app/browser`, `site/docs-build`,
or `code-scan/action`. These component names identify who reviews declarations,
including dependencies shared with other components. Add an owner for each new
workspace.

The JSON report contains:

- `rows`: the root summary shown in Markdown. Consumers of the former JSON array
  must now read `.rows`.
- `manifestOwners`: assignments, including manifests with no dependencies.
- `declarations`: regular, optional, development, and peer declarations, with
  their owner, source references, scopes, and reviewed annotations.
- `undeclaredUsages`: imports absent from their own manifest, with file and line
  references and declarations found elsewhere. Root hoisting does not satisfy a
  workspace declaration.
- `runtimeDeclarationGaps`: root source imports with no regular, optional, or peer
  declaration. Explicit type imports and references covered by a build annotation
  are excluded. Build annotations apply only to their named evidence files.
- `computedImports`: nonliteral imports and loader calls. `fileAnnotations` links
  reviewed dependencies in the same file without attributing every call to them.
- `annotationErrors` and `unassignedManifests`: stale annotations and missing owners.
- `coverage`: scanned manifests, source file count, and generated declarations.

References distinguish source, build, test/story, and declaration files. Kinds
include explicit type imports, leading triple-slash references, module
augmentations, JavaScript JSDoc tags and `@import`, value imports, dynamic imports,
resolution calls, and annotations. Type imports may refer to installed `@types`
packages; the scanner uses the referencing file's default Node lookup paths.
It does not interpret custom compiler resolution or determine which value imports
TypeScript erases.

## Coverage and limits

The scanner reads root npm workspaces, including npm's glob exclusion rules, and
the standalone `code-scan-action` package. It scans each package's `src/`,
`scripts/`, `.storybook/`, and root JavaScript/TypeScript configuration files,
plus configured architecture roots. Executable components and shared data under
`site/docs/` and `site/blog/` are included. Source declarations are included;
colocated tests and declarations do not count as runtime source.

Installed packages, generated bundles, mocks, build/cache output, and configured
ignored roots are excluded. Workspace discovery excludes only `node_modules` and
explicit workspace exclusions, so workspaces named `build` or `dist` remain valid.
Files beneath an unaudited nested manifest do not count as root references.

The scanner does not parse Markdown/MDX, CSS, shell commands, tsconfig files,
JSX runtime pragmas, package `imports` maps, tests outside source roots, or custom
loaders. It does not follow named `createRequire` results, which may resolve
against a different package. Review these dependencies separately.

Architecture aliases that resolve to source or assets, and documented virtual
site aliases, do not count as package imports. A shared alias prefix alone does
not hide an external package. Declared workspace names take precedence over broad
source aliases and still require manifest declarations.

If `dist/` exists, generated declarations are scanned and listed in `coverage`.
Build first when checking public declarations: the report cannot detect stale
output or determine which declarations are reachable from public exports.
An empty generated-declarations list means no build evidence was available.

The report does not prove installation size, native binary availability, or
transitive compatibility. Validate dependency changes with a packed consumer and
the affected CLI/API workflow. Root overrides do not propagate to consumers;
optional peers still need compatible versions. An `--omit=optional` installation
also removes libSQL platform binaries, so successful imports alone do not prove
that local evaluation works.

## Annotations and strict checks

Annotations record computed loaders, native assets, peers, compatibility pins,
build tooling, and public declaration requirements. Each names a declared
dependency, a reason, and existing evidence paths. Paths point reviewers to
supporting code; they do not prove the explanation remains current.

Computed-loader evidence must belong to its manifest. These entries produce
references with `kind: "annotation"` and `line: 0`, separate from the root table's
literal import count. Other annotations retain the reason without inventing a
source reference.

Invalid annotations fail both ordinary and strict report modes and are excluded
from reference metadata. `--check` also fails on undeclared imports, root runtime
declaration gaps, and unassigned manifests. Computed user-module loads do not fail
strict checking. This check is available locally; it is not a required CI gate.
