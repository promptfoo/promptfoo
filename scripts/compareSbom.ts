import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

interface Inventory {
  schemaVersion: number;
  surface: string;
  sourceSha?: string;
  components: Array<{ name: string; version: string }>;
  assets?: Array<{ path: string; size: number; sha256: string }>;
  externalResources?: Array<{ url: string; source: string }>;
  environment?: Record<string, string | boolean>;
  buildConfiguration?: { posthogKeyPresent: boolean };
}

const surfaces = ['runtime-default', 'app', 'site'] as const;
const filenames = {
  'runtime-default': 'runtime-default.json',
  app: 'app-browser.json',
  site: 'site-browser.json',
};

export function validateInventory(value: unknown, surface: string): Inventory {
  assert(value && typeof value === 'object', `Missing ${surface} inventory`);
  const inventory = value as Inventory;
  assert.equal(inventory.schemaVersion, 1, 'Unsupported inventory schema');
  assert.equal(inventory.surface, surface, 'Inventory surface mismatch');
  assert(Array.isArray(inventory.components) && inventory.components.length > 0);
  const keys = new Set<string>();
  for (const component of inventory.components) {
    assert(typeof component.name === 'string' && component.name.length > 0);
    assert(typeof component.version === 'string' && component.version.length > 0);
    const key = `${component.name}@${component.version}`;
    assert(!keys.has(key), `Duplicate component: ${key}`);
    keys.add(key);
  }
  if (surface === 'runtime-default') {
    assert(inventory.environment, 'Missing consumer environment');
    for (const key of ['platform', 'arch', 'node', 'npm', 'registry', 'installStrategy']) {
      assert(typeof inventory.environment[key] === 'string', `Missing consumer ${key}`);
    }
    assert.equal(inventory.environment.lifecycleScripts, false);
  } else {
    if (surface === 'app') {
      assert.equal(
        typeof inventory.buildConfiguration?.posthogKeyPresent,
        'boolean',
        'Missing app analytics build configuration',
      );
    }
    assert(Array.isArray(inventory.assets) && inventory.assets.length > 0);
    const paths = new Set<string>();
    for (const asset of inventory.assets) {
      assert(typeof asset.path === 'string' && asset.path.length > 0);
      assert(
        !path.posix.isAbsolute(asset.path) &&
          !path.win32.isAbsolute(asset.path) &&
          !asset.path.includes('\\') &&
          !asset.path.split('/').includes('..'),
        `Invalid browser asset path: ${asset.path}`,
      );
      assert(!paths.has(asset.path), `Duplicate asset: ${asset.path}`);
      paths.add(asset.path);
      assert(Number.isSafeInteger(asset.size) && asset.size >= 0);
      assert(typeof asset.sha256 === 'string' && /^[a-f\d]{64}$/.test(asset.sha256));
    }
  }
  if (inventory.externalResources !== undefined) {
    assert(Array.isArray(inventory.externalResources), 'Invalid external resources');
    const resources = new Set<string>();
    for (const resource of inventory.externalResources) {
      assert(resource && typeof resource === 'object', 'Invalid external resource');
      assert(typeof resource.url === 'string' && resource.url.length > 0);
      assert(['http:', 'https:'].includes(new URL(resource.url).protocol));
      assert(typeof resource.source === 'string' && resource.source.trim().length > 0);
      const key = JSON.stringify([resource.url, resource.source]);
      assert(!resources.has(key), `Duplicate external resource: ${key}`);
      resources.add(key);
    }
  }
  return inventory;
}

function incompatibleEnvironment(before: Inventory, after: Inventory): string | undefined {
  if (
    after.surface === 'app' &&
    before.buildConfiguration?.posthogKeyPresent !== after.buildConfiguration?.posthogKeyPresent
  ) {
    return 'Incompatible app analytics build configuration';
  }
  if (after.surface === 'runtime-default') {
    for (const key of ['platform', 'arch', 'registry', 'installStrategy', 'lifecycleScripts']) {
      if (before.environment?.[key] !== after.environment?.[key]) {
        return `Incompatible ${key}`;
      }
    }
    for (const key of ['node', 'npm']) {
      if (
        String(before.environment?.[key]).split('.')[0] !==
        String(after.environment?.[key]).split('.')[0]
      ) {
        return `Incompatible ${key} major version`;
      }
    }
  }
  return undefined;
}

export function compareInventory(before: Inventory, after: Inventory) {
  assert.equal(before.surface, after.surface);
  const incompatible = incompatibleEnvironment(before, after);
  assert(!incompatible, incompatible);
  const identities = (inventory: Inventory) =>
    new Set(inventory.components.map(({ name, version }) => `${name}@${version}`));
  const oldComponents = identities(before);
  const newComponents = identities(after);
  const oldNames = new Set(before.components.map(({ name }) => name));
  const newNames = new Set(after.components.map(({ name }) => name));
  const resources = (inventory: Inventory) =>
    new Set((inventory.externalResources ?? []).map(({ url, source }) => `${url} (${source})`));
  const difference = (left: Set<string>, right: Set<string>) =>
    [...left].filter((item) => !right.has(item)).sort();
  const bytes = (inventory: Inventory, codeOnly = false) =>
    (inventory.assets ?? [])
      .filter((asset) => !codeOnly || /\.(?:js|mjs|cjs|css)$/.test(asset.path))
      .reduce((total, asset) => total + asset.size, 0);
  return {
    surface: after.surface,
    before: oldComponents.size,
    after: newComponents.size,
    delta: newComponents.size - oldComponents.size,
    added: difference(newComponents, oldComponents),
    removed: difference(oldComponents, newComponents),
    addedNames: difference(newNames, oldNames),
    removedNames: difference(oldNames, newNames),
    externalResources: {
      added: difference(resources(after), resources(before)),
      removed: difference(resources(before), resources(after)),
    },
    ...(after.assets
      ? {
          assets: {
            before: before.assets?.length ?? 0,
            after: after.assets.length,
            bytesBefore: bytes(before),
            bytesAfter: bytes(after),
            codeBytesBefore: bytes(before, true),
            codeBytesAfter: bytes(after, true),
          },
        }
      : {}),
  };
}

function readJson(filename: string): unknown {
  return JSON.parse(fs.readFileSync(filename, 'utf8'));
}

const inlineCode = (text: string) =>
  `<code>${text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/[\r\n]/g, ' ')}</code>`;

function describeComparison(comparison: ReturnType<typeof compareInventory>): string[] {
  const lines: string[] = [];
  lines.push('', `### ${comparison.surface}`, '');
  if (comparison.assets) {
    lines.push(
      `Emitted JavaScript/CSS bytes: ${comparison.assets.codeBytesBefore} → ${comparison.assets.codeBytesAfter}. Total inventoried asset bytes: ${comparison.assets.bytesBefore} → ${comparison.assets.bytesAfter}.`,
      '',
    );
  }
  for (const kind of ['added', 'removed'] as const) {
    const changes = comparison[kind];
    lines.push(
      `${kind === 'added' ? 'Added' : 'Removed'} package/version identities (${changes.length}):`,
      '',
    );
    lines.push(...changes.slice(0, 100).map((component) => `- ${inlineCode(component)}`));
    if (changes.length > 100) {
      lines.push('- Remaining entries are in comparison.json.');
    } else if (changes.length === 0) {
      lines.push('None.');
    }
    lines.push('');
  }
  for (const kind of ['added', 'removed'] as const) {
    const resources = comparison.externalResources[kind];
    if (resources.length > 0) {
      lines.push(
        `Known external resources ${kind}:`,
        '',
        ...resources.map((resource) => `- ${inlineCode(resource)}`),
        '',
      );
    }
  }
  return lines;
}

export function writeComparison(options: {
  current: string;
  baseline?: string;
  baselineStatus: string;
  sourceSha: string;
  baseSha?: string;
  output: string;
}): string {
  assert(/^[a-f\d]{40}$/.test(options.sourceSha), 'Expected a full source SHA');
  assert(
    ['available', 'no-base', 'no-successful-run', 'missing-artifact', 'expired-artifact'].includes(
      options.baselineStatus,
    ),
    'Unknown baseline status',
  );
  const current = surfaces.map((surface) =>
    validateInventory(readJson(path.join(options.current, filenames[surface])), surface),
  );
  const comparisons: ReturnType<typeof compareInventory>[] = [];
  const unavailable: Array<{ surface: string; reason: string }> = [];
  assert.equal(
    current[0].sourceSha,
    options.sourceSha,
    'Consumer inventory must match the tested commit',
  );
  if (options.baselineStatus === 'available') {
    assert(options.baseline && options.baseSha, 'Available baseline requires directory and SHA');
    const provenance = readJson(path.join(options.baseline, 'provenance.json')) as {
      sourceSha?: string;
    };
    assert.equal(
      provenance.sourceSha,
      options.baseSha,
      'Baseline must match the exact base commit',
    );
    for (const inventory of current) {
      const surface = inventory.surface as (typeof surfaces)[number];
      const baseline = validateInventory(
        readJson(path.join(options.baseline, filenames[surface])),
        surface,
      );
      if (surface === 'runtime-default') {
        assert.equal(
          baseline.sourceSha,
          options.baseSha,
          'Consumer baseline must match the base commit',
        );
      }
      const incompatible = incompatibleEnvironment(baseline, inventory);
      if (incompatible) {
        unavailable.push({ surface, reason: incompatible });
      } else {
        comparisons.push(compareInventory(baseline, inventory));
      }
    }
  }
  const lines = [
    '## Shipped dependency inventory',
    '',
    `Source: ${inlineCode(options.sourceSha)}. Baseline: ${inlineCode(options.baseSha ?? 'none')} (${options.baselineStatus}).`,
    '',
  ];
  if (comparisons.length === 0) {
    lines.push(
      '**No comparison available. This run records an inventory, not a verified reduction.**',
      '',
    );
  }
  lines.push('| Surface | Packages/versions | Change |', '| --- | ---: | ---: |');
  for (const inventory of current) {
    const comparison = comparisons.find(({ surface }) => surface === inventory.surface);
    lines.push(
      `| ${inventory.surface} | ${inventory.components.length} | ${comparison ? (comparison.delta > 0 ? '+' : '') + comparison.delta : 'unavailable'} |`,
    );
  }
  for (const comparison of comparisons) {
    lines.push(...describeComparison(comparison));
  }
  for (const entry of unavailable) {
    lines.push(
      '',
      `**${entry.surface} comparison unavailable:** ${entry.reason}. This run records a baseline for the new environment.`,
      '',
    );
  }
  lines.push(
    'Runtime measurements use fresh npm resolution on the recorded platform, before acceptance fixtures are installed. Registry changes between runs can change the tree independently of this PR. Browser inventories measure emitted modules/assets separately; see each report for external resources and coverage limits.',
    '',
    'Growth is reported for review, not blocked by a fixed package-count budget. Missing/malformed inventories and mismatched baselines fail this check.',
    '',
  );
  fs.mkdirSync(options.output, { recursive: true });
  for (const filename of [...Object.values(filenames), 'runtime-default.cdx.json']) {
    fs.copyFileSync(path.join(options.current, filename), path.join(options.output, filename));
  }
  fs.writeFileSync(
    path.join(options.output, 'provenance.json'),
    `${JSON.stringify({ schemaVersion: 1, sourceSha: options.sourceSha }, null, 2)}\n`,
  );
  fs.writeFileSync(
    path.join(options.output, 'comparison.json'),
    `${JSON.stringify({ schemaVersion: 1, ...options, current: undefined, baseline: undefined, output: undefined, comparisons, unavailable }, null, 2)}\n`,
  );
  const summary = `${lines.join('\n')}\n`;
  fs.writeFileSync(path.join(options.output, 'comparison.md'), summary);
  if (
    comparisons.some(
      ({ delta, addedNames, assets, externalResources }) =>
        delta > 0 ||
        addedNames.length > 0 ||
        (assets && assets.codeBytesAfter > assets.codeBytesBefore) ||
        externalResources.added.length > 0,
    )
  ) {
    console.log(
      '::warning::Shipped dependency inventory grew or introduced package names. Review the SBOM comparison summary.',
    );
  }
  return summary;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { values } = parseArgs({
    options: {
      current: { type: 'string' },
      baseline: { type: 'string' },
      'baseline-status': { type: 'string' },
      'source-sha': { type: 'string' },
      'base-sha': { type: 'string' },
      output: { type: 'string' },
    },
  });
  assert(values.current && values.output && values['source-sha'] && values['baseline-status']);
  const summary = writeComparison({
    current: values.current,
    baseline: values.baseline,
    output: values.output,
    baselineStatus: values['baseline-status'],
    sourceSha: values['source-sha'],
    baseSha: values['base-sha'],
  });
  console.log(summary);
  if (process.env.GITHUB_STEP_SUMMARY) {
    fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, summary);
  }
}
