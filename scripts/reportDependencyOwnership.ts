import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { globSync } from 'glob';
import { type Node, parseSync, Visitor } from 'oxc-parser';
import { z } from 'zod';
import {
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
  return [
    'package.json',
    ...new Set(
      workspaces.flatMap((workspace) =>
        globSync(`${workspace}/package.json`, {
          cwd: repoRoot,
          nodir: true,
          ignore: ignored,
        }).map(normalizePath),
      ),
    ),
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

function scopeFor(file: string, manifest: string): Scope {
  const relative =
    manifest === 'package.json' ? file : path.posix.relative(path.posix.dirname(manifest), file);
  if (/\.d\.(?:ts|mts|cts)$/.test(relative)) {
    return 'declaration';
  }
  if (/(?:^|\/)(?:__tests__|test|tests)\/|\.(?:test|spec|stories)\.[^.]+$/.test(relative)) {
    return 'test';
  }
  return relative.startsWith('src/') ||
    (manifest === 'site/package.json' && /^(?:docs|blog)\//.test(relative))
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

function discoverFiles(repoRoot: string, manifests: string[]) {
  const files = new Set<string>();
  const declarationFiles = new Set<string>();
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
      for (const file of globSync(pattern, { cwd: repoRoot, nodir: true, ignore: ignored }).map(
        normalizePath,
      )) {
        files.add(file);
      }
    }
    for (const file of globSync(`${root}dist/**/*.d.{ts,mts,cts}`, {
      cwd: repoRoot,
      nodir: true,
      ignore: ['**/node_modules/**', '**/dist/test/**'],
    }).map(normalizePath)) {
      files.add(file);
      declarationFiles.add(file);
    }
  }

  return { files, declarationFiles };
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
  const { files, declarationFiles } = discoverFiles(repoRoot, manifests);

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
      validAnnotations.push(annotation);
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
    const scope = scopeFor(file, manifest);
    const layer = getLayerForFile(file, config);
    const aliases = [...Object.keys(config.aliases ?? {}), ...(ledger.aliases[manifest] ?? [])];
    const packageNames = [...packages.values()].map((pkg) => pkg.name).filter(Boolean);
    const add = (node: Node, specifier: string, kind: Reference['kind']) => {
      const dependency = getPackageName(specifier);
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
        line: source.slice(0, node.start).split('\n').length,
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
          line: source.slice(0, node.start).split('\n').length,
          expression: source.slice(node.start, node.end),
          fileAnnotations: validAnnotations
            .filter(
              (annotation) =>
                annotation.disposition === 'computed-loader' && annotation.evidence.includes(file),
            )
            .map((annotation) => annotation.dependency),
        });
      } else {
        add(node, specifier, kind);
      }
    };
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
    for (const file of annotation.evidence.filter((evidence) => files.has(evidence))) {
      record(annotation.manifest, annotation.dependency, {
        file,
        line: 0,
        scope: scopeFor(file, annotation.manifest),
        kind: 'annotation',
        layer: getLayerForFile(file, config),
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
      const runtimeReferences = references.filter(
        (ref) => ref.scope === 'source' && ref.kind !== 'type',
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
        (ref) => ref.file.startsWith('src/') && ref.scope === 'source' && ref.kind !== 'annotation',
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
        `- ${manifest}: ${entries[0]?.owner ?? 'unassigned'} (${entries.length} declarations)`,
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
