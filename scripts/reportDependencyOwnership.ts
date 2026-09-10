import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { globSync } from 'glob';
import { minimatch } from 'minimatch';
import { type Comment, type Node, parseSync, Visitor } from 'oxc-parser';
import { z } from 'zod';
import {
  getExternalModuleName,
  getLayerForFile,
  getPackageName,
  normalizePath,
  readLayerConfig,
} from './architectureUtils';

import type { LayerConfig } from './architectureUtils';

const sections = [
  'dependencies',
  'optionalDependencies',
  'devDependencies',
  'peerDependencies',
] as const;
type Section = (typeof sections)[number];
type Scope = 'source' | 'build' | 'test' | 'declaration';
interface PackageJson extends Partial<Record<Section, Record<string, string>>> {
  name?: string;
  workspaces?: string[] | { packages: string[] };
}

const ledgerSchema = z
  .object({
    manifestOwners: z.record(z.string(), z.string().min(1)),
    aliases: z.record(z.string(), z.array(z.string().min(1))).default({}),
    annotations: z
      .array(
        z
          .object({
            manifest: z.string(),
            dependency: z.string(),
            disposition: z.enum([
              'computed-loader',
              'native-install',
              'peer',
              'compatibility-pin',
              'build',
              'public-declaration',
            ]),
            reason: z.string().min(1),
            evidence: z.array(z.string().min(1)).min(1),
          })
          .strict(),
      )
      .default([]),
  })
  .strict();

type Ledger = z.infer<typeof ledgerSchema>;
interface Reference {
  file: string;
  line: number;
  scope: Scope;
  kind: 'value' | 'type' | 'dynamic' | 'resolve' | 'annotation';
  layer: string;
  specifier: string;
}

const extensions = '{ts,tsx,mts,cts,js,jsx,mjs,cjs}';
const ignored = [
  '**/node_modules/**',
  '**/dist/**',
  '**/build/**',
  '**/.docusaurus/**',
  '**/coverage/**',
  '**/__mocks__/**',
];

function readPackage(repoRoot: string, manifest: string): PackageJson {
  return JSON.parse(fs.readFileSync(path.join(repoRoot, manifest), 'utf8')) as PackageJson;
}

function discoverManifests(repoRoot: string): string[] {
  const root = readPackage(repoRoot, 'package.json');
  const workspaces = Array.isArray(root.workspaces)
    ? root.workspaces
    : (root.workspaces?.packages ?? []);
  const patterns: string[] = [];
  const exclusions: string[] = [];
  // Match npm's workspace negation handling: exclusions apply across the list,
  // but a later positive pattern matching an exclusion removes that exclusion.
  for (const workspace of workspaces) {
    const bangs = workspace.match(/^!+/)?.[0].length ?? 0;
    const pattern = workspace.slice(bangs).replace(/^\.?\/+/, '');
    if (bangs % 2 === 1) {
      exclusions.push(pattern);
    } else {
      // Preserve npm's forward-splice behavior for overlapping exclusions.
      for (let index = 0; index < exclusions.length; index++) {
        if (minimatch(pattern, exclusions[index])) {
          exclusions.splice(index, 1);
        }
      }
      patterns.push(pattern);
    }
  }
  const included = patterns.filter(
    (pattern) => !exclusions.some((excluded) => minimatch(pattern, excluded)),
  );
  const workspaceDirectories = globSync(
    included.map((pattern) => `${pattern.replace(/\\/g, '/').replace(/\/$/, '')}/`),
    { cwd: repoRoot, ignore: ['**/node_modules/**', ...exclusions] },
  );
  const manifests = workspaceDirectories
    .filter((directory) =>
      included.some((pattern) =>
        minimatch(directory, pattern, { partial: true, windowsPathsNoEscape: true }),
      ),
    )
    .map((directory) => normalizePath(path.join(directory, 'package.json')))
    .filter((manifest) => fs.existsSync(path.join(repoRoot, manifest)));
  return [
    ...new Set([
      'package.json',
      ...manifests,
      ...(fs.existsSync(path.join(repoRoot, 'code-scan-action/package.json'))
        ? ['code-scan-action/package.json']
        : []),
    ]),
  ].sort();
}

function manifestFor(file: string, manifests: string[]): string {
  return (
    manifests
      .filter((manifest) => manifest !== 'package.json')
      .sort((left, right) => right.length - left.length)
      .find((manifest) => file.startsWith(`${path.posix.dirname(manifest)}/`)) ?? 'package.json'
  );
}

function isTestFile(file: string): boolean {
  return /(?:^|\/)(?:__tests__|test|tests)\/|\.(?:test|spec|stories)(?:\.d)?\.[^.]+$/.test(file);
}

function scopeFor(file: string, manifest: string, configuredRoots: string[]): Scope {
  const relative =
    manifest === 'package.json' ? file : path.posix.relative(path.posix.dirname(manifest), file);
  if (/\.d\.(?:ts|mts|cts)$/.test(relative)) {
    return 'declaration';
  }
  if (isTestFile(relative)) {
    return 'test';
  }
  const workspaceRoot = manifest === 'package.json' ? '' : path.posix.dirname(manifest);
  const configuredSource = configuredRoots.some(
    (root) =>
      (file === root || file.startsWith(`${root}/`)) &&
      // A broad layer containing a workspace also includes its build configuration.
      root !== workspaceRoot &&
      !workspaceRoot.startsWith(`${root}/`),
  );
  return relative.startsWith('src/') ||
    (manifest === 'site/package.json' && /^(?:docs|blog)\//.test(relative)) ||
    configuredSource
    ? 'source'
    : 'build';
}

function staticSpecifier(node: Node): string | undefined {
  if (node.type === 'Literal' && typeof node.value === 'string') {
    return node.value;
  }
  if (node.type === 'TemplateLiteral' && node.expressions.length === 0) {
    return node.quasis[0]?.value.cooked ?? undefined;
  }
  return undefined;
}

function discoverFiles(
  repoRoot: string,
  manifests: string[],
  configuredRoots: string[],
  ignoredRoots: string[],
) {
  const files = new Set<string>();
  const declarationFiles = new Set<string>();
  const configuredIgnores = ignoredRoots.flatMap((root) => [root, `${root}/**`]);
  const sourceIgnores = (root: string) => [
    ...ignored.map((pattern) => `${root}${pattern}`),
    ...configuredIgnores,
  ];
  for (const manifest of manifests) {
    const root = manifest === 'package.json' ? '' : `${path.posix.dirname(manifest)}/`;
    for (const pattern of [
      `${root}*.${extensions}`,
      `${root}src/**/*.${extensions}`,
      `${root}scripts/**/*.${extensions}`,
      `${root}.storybook/**/*.${extensions}`,
      ...(manifest === 'site/package.json'
        ? [`${root}docs/**/*.${extensions}`, `${root}blog/**/*.${extensions}`]
        : []),
    ]) {
      for (const file of globSync(pattern, {
        cwd: repoRoot,
        nodir: true,
        ignore: sourceIgnores(root),
      }).map(normalizePath)) {
        files.add(file);
      }
    }
    for (const file of globSync(`${root}dist/**/*.d.{ts,mts,cts}`, {
      cwd: repoRoot,
      nodir: true,
      ignore: ['**/node_modules/**', '**/dist/test/**', ...configuredIgnores],
    }).map(normalizePath)) {
      if (manifestFor(file, manifests) !== manifest || isTestFile(file)) {
        continue;
      }
      files.add(file);
      declarationFiles.add(file);
    }
  }

  for (const root of configuredRoots) {
    for (const file of globSync([root, `${root}/**/*.${extensions}`], {
      cwd: repoRoot,
      nodir: true,
      ignore: sourceIgnores(
        manifestFor(`${root}/`, manifests) === 'package.json'
          ? ''
          : `${path.posix.dirname(manifestFor(`${root}/`, manifests))}/`,
      ),
    }).map(normalizePath)) {
      if (/\.(?:[cm]?[jt]s|[jt]sx)$/.test(file)) {
        files.add(file);
      }
    }
  }

  return { files, declarationFiles };
}

function leadingTypeReferences(
  comments: Comment[],
  firstStatement: number,
  packages: Map<string, PackageJson>,
) {
  const references: Array<{ start: number; specifier: string; dependency: string }> = [];
  // TypeScript directives are leading line comments, not AST imports. Ignore
  // lookalikes in strings/block comments and comments after the first statement.
  for (const comment of comments) {
    if (comment.type !== 'Line' || comment.start >= firstStatement) {
      continue;
    }
    const directive = comment.value.match(
      /^\/\s*<reference\s+((?:[\w-]+\s*=\s*(?:"[^"]*"|'[^']*')\s*)+)\/>/,
    );
    const typeAttribute =
      directive &&
      [...directive[1].matchAll(/([\w-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)].find(
        (attribute) => attribute[1] === 'types',
      );
    const specifier = typeAttribute?.[2] ?? typeAttribute?.[3];
    if (!specifier) {
      continue;
    }
    const name = getExternalModuleName(specifier);
    if (!name) {
      continue;
    }
    const typesPackage = `@types/${name.startsWith('@') ? name.slice(1).replace('/', '__') : name}`;
    const hasTypesDeclaration = [...packages.values()].some((pkg) =>
      sections.some((section) => Object.hasOwn(pkg[section] ?? {}, typesPackage)),
    );
    const hasRuntimeDeclaration = [...packages.values()].some((pkg) =>
      ['dependencies', 'optionalDependencies', 'peerDependencies'].some((section) =>
        Object.hasOwn(pkg[section as Section] ?? {}, name),
      ),
    );
    references.push({
      start: comment.start,
      specifier,
      dependency:
        name === 'node' || hasTypesDeclaration || hasRuntimeDeclaration ? typesPackage : name,
    });
  }
  return references;
}

/** Report source evidence and declaration ownership; neither proves installed dependency reach. */
export function reportDependencyOwnership(
  repoRoot: string,
  config: LayerConfig = readLayerConfig(repoRoot),
) {
  const ledgerPath = path.join(repoRoot, 'architecture/dependency-ownership.json');
  const ledger: Ledger = fs.existsSync(ledgerPath)
    ? ledgerSchema.parse(JSON.parse(fs.readFileSync(ledgerPath, 'utf8')))
    : { manifestOwners: {}, aliases: {}, annotations: [] };
  const manifests = discoverManifests(repoRoot);
  const packages = new Map(
    manifests.map((manifest) => [manifest, readPackage(repoRoot, manifest)]),
  );
  const sourceConfig = {
    ...config,
    layers: config.layers.map((layer) => ({
      ...layer,
      roots: layer.roots.map((root) => normalizePath(root).replace(/\/+$/, '')),
    })),
  };
  const configuredRoots = sourceConfig.layers.flatMap((layer) => layer.roots);
  const { files, declarationFiles } = discoverFiles(
    repoRoot,
    manifests,
    configuredRoots,
    (config.ignoredRoots ?? []).map((root) => normalizePath(root).replace(/\/+$/, '')),
  );

  const usages = new Map<string, Reference[]>();
  const computedImports: Array<{
    file: string;
    line: number;
    expression: string;
    fileAnnotations: string[];
  }> = [];
  const annotationErrors: string[] = [];
  for (const manifest of Object.keys(ledger.manifestOwners)) {
    if (!packages.has(manifest)) {
      annotationErrors.push(`Unknown manifest owner: ${manifest}`);
    }
  }
  const validAnnotations: Ledger['annotations'] = [];
  for (const annotation of ledger.annotations) {
    const errorCount = annotationErrors.length;
    const pkg = packages.get(annotation.manifest);
    if (
      !pkg ||
      !sections.some((section) => Object.hasOwn(pkg[section] ?? {}, annotation.dependency))
    ) {
      annotationErrors.push(
        `Annotation has no declaration: ${annotation.manifest}: ${annotation.dependency}`,
      );
    }
    for (const evidence of annotation.evidence) {
      if (!fs.existsSync(path.join(repoRoot, evidence))) {
        annotationErrors.push(`Missing annotation evidence: ${evidence}`);
      }
    }
    if (annotationErrors.length === errorCount) {
      validAnnotations.push({
        ...annotation,
        evidence: annotation.evidence.map((evidence) =>
          path.posix.normalize(normalizePath(evidence)),
        ),
      });
    }
  }

  function record(manifest: string, dependency: string, reference: Reference) {
    const key = `${manifest}:${dependency}`;
    const refs = usages.get(key) ?? [];
    refs.push(reference);
    usages.set(key, refs);
  }

  for (const file of [...files].sort()) {
    const manifest = manifestFor(file, manifests);
    const source = fs.readFileSync(path.join(repoRoot, file), 'utf8');
    const result = parseSync(file, source, {
      ...(file.endsWith('.js') ? { lang: 'jsx' as const } : {}),
    });
    if (result.errors.length > 0) {
      throw new Error(`Could not parse ${file}: ${result.errors[0].message}`);
    }
    const scope = scopeFor(file, manifest, configuredRoots);
    const layer = getLayerForFile(file, sourceConfig);
    const aliases = [...Object.keys(config.aliases ?? {}), ...(ledger.aliases[manifest] ?? [])];
    const packageNames = [...packages.values()].map((pkg) => pkg.name).filter(Boolean);
    const add = (
      node: Pick<Node, 'start'>,
      specifier: string,
      kind: Reference['kind'],
      dependency = getPackageName(specifier),
    ) => {
      // Workspace names remain dependencies and need declarations, even when a broad
      // source alias shares their scope (for example @promptfoo/*).
      if (
        !dependency ||
        dependency === packages.get(manifest)?.name ||
        (aliases.some((alias) => specifier === alias || specifier.startsWith(`${alias}/`)) &&
          !packageNames.includes(dependency)) ||
        specifier === 'src' ||
        specifier.startsWith('src/') ||
        specifier.includes(':')
      ) {
        return;
      }
      record(manifest, dependency, {
        file,
        line: source.slice(0, node.start).split(/\r\n|[\r\n\u2028\u2029]/u).length,
        scope,
        kind,
        layer,
        specifier,
      });
    };
    const load = (node: Node, argument: Node, kind: 'dynamic' | 'resolve' | 'value') => {
      const specifier = staticSpecifier(argument);
      if (specifier === undefined) {
        computedImports.push({
          file,
          line: source.slice(0, node.start).split(/\r\n|[\r\n\u2028\u2029]/u).length,
          expression: source.slice(node.start, node.end),
          fileAnnotations: validAnnotations
            .filter(
              (annotation) =>
                annotation.disposition === 'computed-loader' &&
                annotation.evidence.includes(file) &&
                manifestFor(file, manifests) === annotation.manifest,
            )
            .map((annotation) => annotation.dependency),
        });
      } else {
        add(node, specifier, kind);
      }
    };
    for (const reference of leadingTypeReferences(
      result.comments,
      result.program.body[0]?.start ?? source.length,
      packages,
    )) {
      add(reference, reference.specifier, 'type', reference.dependency);
    }
    for (const comment of result.comments) {
      if (comment.type !== 'Block' || !comment.value.startsWith('*')) {
        continue;
      }
      // Keep offsets intact while removing JSDoc line prefixes.
      const body = comment.value.replace(
        /(^|[\r\n\u2028\u2029])([ \t]*\*[ \t]?)/g,
        (_, newline: string, prefix: string) => newline + ' '.repeat(prefix.length),
      );
      for (const tag of body.matchAll(
        /(?:^|[\r\n\u2028\u2029])[ \t]*@import\s+(?:\{[^}]*\}\s+from\s+)?['"]([^'"]+)['"]/g,
      )) {
        add({ start: comment.start + (tag.index ?? 0) }, tag[1], 'type');
      }
      for (const tag of body.matchAll(
        /(?:^|[\r\n\u2028\u2029])[ \t]*@(?:type|param|returns?|typedef|property|prop|this|extends|implements|satisfies|throws|enum)\s*\{/g,
      )) {
        const start = tag.index + tag[0].length;
        let depth = 1;
        // Quoted braces belong to string/template types, not the enclosing type tag.
        for (const token of body
          .slice(start)
          .matchAll(/"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|`(?:[^`\\]|\\.)*`|[{}]/g)) {
          if (token[0] === '{') {
            depth++;
          } else if (token[0] === '}') {
            depth--;
          }
          if (depth !== 0) {
            continue;
          }
          const prefix = 'type Dependency = ';
          const type = parseSync('jsdoc.ts', prefix + body.slice(start, start + token.index));
          if (type.errors.length === 0 && type.program.body.length === 1) {
            new Visitor({
              TSImportType(node) {
                add(
                  { start: comment.start + 2 + start + node.start - prefix.length },
                  node.source.value,
                  'type',
                );
              },
            }).visit(type.program);
          }
          break;
        }
      }
    }
    new Visitor({
      ImportDeclaration(node) {
        add(
          node,
          node.source.value,
          node.importKind === 'type' ||
            (node.specifiers.length > 0 &&
              node.specifiers.every(
                (specifier) =>
                  specifier.type === 'ImportSpecifier' && specifier.importKind === 'type',
              ))
            ? 'type'
            : 'value',
        );
      },
      ExportAllDeclaration(node) {
        add(node, node.source.value, node.exportKind === 'type' ? 'type' : 'value');
      },
      ExportNamedDeclaration(node) {
        if (node.source) {
          add(
            node,
            node.source.value,
            node.exportKind === 'type' ||
              (node.specifiers.length > 0 &&
                node.specifiers.every((specifier) => specifier.exportKind === 'type'))
              ? 'type'
              : 'value',
          );
        }
      },
      TSImportType(node) {
        add(node, node.source.value, 'type');
      },
      TSImportEqualsDeclaration(node) {
        if (node.moduleReference.type === 'TSExternalModuleReference') {
          add(
            node,
            node.moduleReference.expression.value,
            node.importKind === 'type' ? 'type' : 'value',
          );
        }
      },
      ImportExpression(node) {
        load(node, node.source, 'dynamic');
      },
      CallExpression(node) {
        if (!node.arguments[0]) {
          return;
        }
        if (node.callee.type === 'Identifier' && node.callee.name === 'require') {
          load(node, node.arguments[0], 'value');
        } else if (
          node.callee.type === 'MemberExpression' &&
          !node.callee.computed &&
          node.callee.property.type === 'Identifier' &&
          node.callee.property.name === 'resolve' &&
          ((node.callee.object.type === 'Identifier' && node.callee.object.name === 'require') ||
            (node.callee.object.type === 'MetaProperty' &&
              node.callee.object.meta.name === 'import'))
        ) {
          load(node, node.arguments[0], 'resolve');
        }
      },
    }).visit(result.program);
  }

  for (const annotation of validAnnotations.filter(
    (entry) => entry.disposition === 'computed-loader',
  )) {
    for (const file of annotation.evidence.filter(
      (evidence) => files.has(evidence) && manifestFor(evidence, manifests) === annotation.manifest,
    )) {
      record(annotation.manifest, annotation.dependency, {
        file,
        line: 0,
        scope: scopeFor(file, annotation.manifest, configuredRoots),
        kind: 'annotation',
        layer: getLayerForFile(file, sourceConfig),
        specifier: annotation.dependency,
      });
    }
  }

  const declarations = manifests.flatMap((manifest) => {
    const pkg = packages.get(manifest)!;
    const dependencies = new Set(sections.flatMap((section) => Object.keys(pkg[section] ?? {})));
    return [...dependencies].sort().map((dependency) => {
      const refs = usages.get(`${manifest}:${dependency}`) ?? [];
      const annotations = validAnnotations.filter(
        (entry) => entry.manifest === manifest && entry.dependency === dependency,
      );
      return {
        manifest,
        dependency,
        owner: ledger.manifestOwners[manifest] ?? 'unassigned',
        sections: sections.filter((section) => Object.hasOwn(pkg[section] ?? {}, dependency)),
        scopes: [...new Set(refs.map((ref) => ref.scope))].sort(),
        references: refs,
        annotations,
      };
    });
  });
  const undeclaredUsages = [...usages.entries()]
    .flatMap(([key, references]) => {
      const [manifest, dependency] = key.split(':');
      const pkg = packages.get(manifest)!;
      return sections.some((section) => Object.hasOwn(pkg[section] ?? {}, dependency))
        ? []
        : [
            {
              manifest,
              dependency,
              references,
              declaredElsewhere: declarations
                .filter((entry) => entry.dependency === dependency)
                .map((entry) => entry.manifest),
            },
          ];
    })
    .sort(
      (left, right) =>
        left.manifest.localeCompare(right.manifest) ||
        left.dependency.localeCompare(right.dependency),
    );

  const runtimeDeclarationGaps = [...usages.entries()]
    .flatMap(([key, references]) => {
      const [manifest, dependency] = key.split(':');
      const pkg = packages.get(manifest)!;
      if (
        manifest !== 'package.json' ||
        ['dependencies', 'optionalDependencies', 'peerDependencies'].some((section) =>
          Object.hasOwn(pkg[section as Section] ?? {}, dependency),
        )
      ) {
        return [];
      }
      const buildEvidence = new Set(
        validAnnotations
          .filter(
            (entry) =>
              entry.manifest === manifest &&
              entry.dependency === dependency &&
              entry.disposition === 'build',
          )
          .flatMap((entry) => entry.evidence),
      );
      const runtimeReferences = references.filter(
        (ref) => ref.scope === 'source' && ref.kind !== 'type' && !buildEvidence.has(ref.file),
      );
      return runtimeReferences.length > 0 ? [{ dependency, references: runtimeReferences }] : [];
    })
    .sort((left, right) => left.dependency.localeCompare(right.dependency));

  // Retain the original root-runtime summary separately from accountable ownership.
  const rows = declarations
    .filter(
      (entry) =>
        entry.manifest === 'package.json' &&
        (entry.sections.includes('dependencies') ||
          entry.sections.includes('optionalDependencies')),
    )
    .map((entry) => {
      const sourceRefs = entry.references.filter(
        (ref) => ref.scope === 'source' && ref.kind !== 'annotation',
      );
      const layers = [...new Set(sourceRefs.map((ref) => ref.layer))].sort();
      return {
        dependency: entry.dependency,
        kind: [
          entry.sections.includes('dependencies') ? 'dependency' : '',
          entry.sections.includes('optionalDependencies') ? 'optional' : '',
        ]
          .filter(Boolean)
          .join('+'),
        owner: layers.length === 0 ? 'unreferenced' : layers.length === 1 ? layers[0] : 'shared',
        layers: layers.join(', ') || '-',
        files: new Set(sourceRefs.map((ref) => ref.file)).size,
      };
    });
  return {
    schemaVersion: 1,
    manifestOwners: ledger.manifestOwners,
    rows,
    declarations,
    undeclaredUsages,
    runtimeDeclarationGaps,
    computedImports,
    annotationErrors,
    unassignedManifests: manifests.filter((manifest) => !ledger.manifestOwners[manifest]),
    coverage: {
      manifests,
      sourceFiles: files.size - declarationFiles.size,
      generatedDeclarations: [...declarationFiles].sort(),
    },
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const report = reportDependencyOwnership(repoRoot);
  if (process.argv.includes('--json')) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log('| Dependency | Kind | Candidate owner | Direct layers | Source files |');
    console.log('| --- | --- | --- | --- | ---: |');
    for (const row of report.rows) {
      console.log(
        `| ${row.dependency} | ${row.kind} | ${row.owner} | ${row.layers} | ${row.files} |`,
      );
    }
    console.log('\nDeclarations by accountable manifest owner:');
    for (const manifest of report.coverage.manifests) {
      const entries = report.declarations.filter((entry) => entry.manifest === manifest);
      console.log(
        `- ${manifest}: ${report.manifestOwners[manifest] ?? 'unassigned'} (${entries.length} declarations)`,
      );
    }
    console.log('\nRoot source imports outside runtime dependencies:');
    for (const usage of report.runtimeDeclarationGaps) {
      console.log(
        `- ${usage.dependency}: ${usage.references.map((ref) => `${ref.file}:${ref.line}`).join(', ')}`,
      );
    }
    console.log('\nImported packages missing from their own manifest:');
    for (const usage of report.undeclaredUsages) {
      console.log(
        `- ${usage.manifest}: ${usage.dependency} (${usage.references.map((ref) => `${ref.file}:${ref.line}`).join(', ')})`,
      );
    }
    console.log(
      `\nComputed imports: ${report.computedImports.length}; generated declarations scanned: ${report.coverage.generatedDeclarations.length}. Use --json for references and annotations.`,
    );
    for (const error of report.annotationErrors) {
      console.error(error);
    }
  }
  if (
    report.annotationErrors.length > 0 ||
    (process.argv.includes('--check') &&
      (report.undeclaredUsages.length > 0 ||
        report.runtimeDeclarationGaps.length > 0 ||
        report.unassignedManifests.length > 0))
  ) {
    process.exitCode = 1;
  }
}
