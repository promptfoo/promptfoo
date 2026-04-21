/**
 * Entry point for the promptfoo CLI.
 *
 * This file intentionally has NO dependencies to ensure the Node.js version
 * check runs before any module loading that might fail on older versions.
 *
 * Some dependencies (like string-width via ora) use ES2024 features (e.g., RegExp /v flag)
 * that cause cryptic syntax errors on Node.js < 20. By checking the version first,
 * we can provide a helpful error message instead.
 */
import { fileURLToPath } from 'node:url';

type NodeEngineComparatorOperator = '=' | '>' | '>=' | '<' | '<=';
type NodeEngineVersionTuple = [number, number, number];
type NodeEngineComparator = {
  operator: '' | NodeEngineComparatorOperator;
  version: string;
};
type ParseNodeEngineVersionOptions = {
  allowPrerelease?: boolean;
};

// Build-time constants injected by tsdown from package.json engines field
declare const __PROMPTFOO_NODE_ENGINE_RANGE__: string | undefined;
declare const __PROMPTFOO_NODE_ENGINE_COMPARATOR_SETS__: NodeEngineComparator[][] | undefined;

const fallbackNodeEngineRange = '>=20.0.0';
const fallbackNodeEngineComparatorSets: NodeEngineComparator[][] = [
  [{ operator: '>=', version: '20.0.0' }],
];

const nodeEngineRange =
  typeof __PROMPTFOO_NODE_ENGINE_RANGE__ === 'undefined'
    ? fallbackNodeEngineRange
    : __PROMPTFOO_NODE_ENGINE_RANGE__;
const nodeEngineComparatorSets =
  typeof __PROMPTFOO_NODE_ENGINE_COMPARATOR_SETS__ === 'undefined'
    ? fallbackNodeEngineComparatorSets
    : __PROMPTFOO_NODE_ENGINE_COMPARATOR_SETS__;

function parseNodeEngineVersion(
  version: string,
  options: ParseNodeEngineVersionOptions = {},
): NodeEngineVersionTuple | null {
  const match = /^v?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+.*)?$/.exec(version);
  if (!match) {
    return null;
  }
  if (!options.allowPrerelease && match[4]) {
    return null;
  }

  return [
    Number.parseInt(match[1], 10),
    Number.parseInt(match[2], 10),
    Number.parseInt(match[3], 10),
  ];
}

function compareNodeEngineVersion(
  left: NodeEngineVersionTuple,
  right: NodeEngineVersionTuple,
): number {
  for (let index = 0; index < left.length; index++) {
    if (left[index] > right[index]) {
      return 1;
    }
    if (left[index] < right[index]) {
      return -1;
    }
  }

  return 0;
}

function satisfiesNodeEngineComparator(
  currentVersion: NodeEngineVersionTuple,
  comparator: NodeEngineComparator,
): boolean {
  const comparatorVersion = parseNodeEngineVersion(comparator.version, { allowPrerelease: true });
  if (!comparatorVersion) {
    return false;
  }

  const comparison = compareNodeEngineVersion(currentVersion, comparatorVersion);
  switch (comparator.operator || '=') {
    case '=':
      return comparison === 0;
    case '>':
      return comparison > 0;
    case '>=':
      return comparison >= 0;
    case '<':
      return comparison < 0;
    case '<=':
      return comparison <= 0;
    default:
      return false;
  }
}

function isSupportedNodeEngineVersion(currentVersion: string): boolean | null {
  const parsedCurrentVersion = parseNodeEngineVersion(currentVersion);
  if (!parsedCurrentVersion) {
    return null;
  }

  return nodeEngineComparatorSets.some(
    (comparatorSet) =>
      comparatorSet.length === 0 ||
      comparatorSet.every((comparator) =>
        satisfiesNodeEngineComparator(parsedCurrentVersion, comparator),
      ),
  );
}

function formatUnsupportedNodeVersionMessage(currentVersion: string): string {
  return [
    '\x1b[33mpromptfoo requires a supported Node.js runtime.',
    '',
    `Detected: ${currentVersion}`,
    `Required: ${nodeEngineRange}`,
    '',
    'Install a supported Node.js version and try again.\x1b[0m',
  ].join('\n');
}

function formatMalformedNodeVersionMessage(currentVersion: string): string {
  return [
    `\x1b[33mUnable to parse the current Node.js version: ${currentVersion}`,
    `Required: ${nodeEngineRange}`,
    '',
    'Install a supported Node.js version and try again.\x1b[0m',
  ].join('\n');
}

// Skip version check for alternative runtimes (Bun, Deno) - they support modern JS features
const isBun = typeof (globalThis as Record<string, unknown>).Bun !== 'undefined';
const isDeno = typeof (globalThis as Record<string, unknown>).Deno !== 'undefined';

if (!isBun && !isDeno) {
  const isSupportedVersion = isSupportedNodeEngineVersion(process.version);
  if (isSupportedVersion === null) {
    console.error(formatMalformedNodeVersionMessage(process.version));
    process.exit(1);
  }
  if (!isSupportedVersion) {
    console.error(formatUnsupportedNodeVersionMessage(process.version));
    process.exit(1);
  }
}

// Update argv[1] so isMainModule() in main.ts correctly detects CLI execution.
// Trade-off: This permanently changes argv[1] for the process lifetime.
// Any code reading argv[1] will see the synthetic main.js path, not entrypoint.js.
process.argv[1] = fileURLToPath(new URL('./main.js', import.meta.url));
await import('./main.js');

// Required for top-level await - makes this file an ES module
export {};
