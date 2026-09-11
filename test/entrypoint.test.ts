import { spawnSync } from 'node:child_process';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { spoofedNodeVersionEnv } from './util/utils';

type NodeEngineComparatorOperator = '=' | '>' | '>=' | '<' | '<=';
type NodeEngineVersionTuple = [number, number, number];
type NodeEngineComparator = {
  operator: '' | NodeEngineComparatorOperator;
  version: string;
};
type ParseNodeEngineVersionOptions = {
  allowPrerelease?: boolean;
};

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

function isSupportedNodeEngineVersion(
  currentVersion: string,
  comparatorSets: NodeEngineComparator[][],
): boolean | null {
  const parsedCurrentVersion = parseNodeEngineVersion(currentVersion);
  if (!parsedCurrentVersion) {
    return null;
  }

  return comparatorSets.some(
    (comparatorSet) =>
      comparatorSet.length === 0 ||
      comparatorSet.every((comparator) =>
        satisfiesNodeEngineComparator(parsedCurrentVersion, comparator),
      ),
  );
}

function formatUnsupportedNodeVersionMessage(
  currentVersion: string,
  requiredRange: string,
): string {
  return [
    '\x1b[33mpromptfoo requires a supported Node.js runtime.',
    '',
    `Detected: ${currentVersion}`,
    `Required: ${requiredRange}`,
    '',
    'Install a supported Node.js version and try again.\x1b[0m',
  ].join('\n');
}

function formatMalformedNodeVersionMessage(currentVersion: string, requiredRange: string): string {
  return [
    `\x1b[33mUnable to parse the current Node.js version: ${currentVersion}`,
    `Required: ${requiredRange}`,
    '',
    'Install a supported Node.js version and try again.\x1b[0m',
  ].join('\n');
}

const nodeEngineRange = '>=22.22.0';
const nodeEngineComparatorSets: NodeEngineComparator[][] = [
  [{ operator: '>=', version: '22.22.0' }],
];
describe('entrypoint version check logic', () => {
  describe('production entrypoint runtime guard', () => {
    it.each(['v20.20.0', 'v22.21.9'])(
      'rejects unsupported Node.js %s before importing CLI dependencies',
      (version) => {
        const result = spawnSync(
          process.execPath,
          ['--import', 'tsx', path.resolve(__dirname, '../src/entrypoint.ts'), '--version'],
          {
            cwd: path.resolve(__dirname, '..'),
            encoding: 'utf8',
            env: { ...process.env, ...spoofedNodeVersionEnv(version) },
          },
        );

        expect(result.status, result.stderr || result.stdout).toBe(1);
        expect(result.stderr).toContain(`Detected: ${version}`);
        expect(result.stderr).toContain('Required: >=22.22.0');
        expect(result.stderr).toContain('Install a supported Node.js version and try again.');
      },
    );
  });

  describe('Node.js version parsing', () => {
    it('parses full semver versions with optional prefixes and suffixes', () => {
      expect(parseNodeEngineVersion('v20.9.0')).toEqual([20, 9, 0]);
      expect(parseNodeEngineVersion('20.20.0')).toEqual([20, 20, 0]);
      expect(parseNodeEngineVersion('22.22.0+build.1')).toEqual([22, 22, 0]);
    });

    it('allows prerelease comparator versions but rejects prerelease runtime versions', () => {
      expect(parseNodeEngineVersion('21.0.0-0', { allowPrerelease: true })).toEqual([21, 0, 0]);
      expect(parseNodeEngineVersion('v20.20.0-rc.1')).toBeNull();
    });

    it('returns null for malformed versions', () => {
      const malformedVersions = ['vX.Y.Z', 'v20', '', 'node-20.0.0', 'invalid'];

      for (const version of malformedVersions) {
        expect(parseNodeEngineVersion(version)).toBeNull();
      }
    });
  });

  describe('engine range matching', () => {
    // A single `>=22.22.0` comparator set means retired majors and below-floor patches now
    // take the same path; there is no longer a gap between ranges to fall into.
    it.each(['v20.9.0', 'v20.19.0', 'v20.20.0', 'v21.0.0', 'v21.7.0', 'v22.13.0', 'v22.21.9'])(
      'rejects Node.js %s below the supported range',
      (version) => {
        expect(isSupportedNodeEngineVersion(version, nodeEngineComparatorSets)).toBe(false);
      },
    );

    it('accepts Node.js versions that satisfy the exact supported range', () => {
      const supportedVersions = ['v22.22.0', 'v22.23.1', 'v24.14.1', 'v26.0.0'];

      for (const version of supportedVersions) {
        expect(isSupportedNodeEngineVersion(version, nodeEngineComparatorSets)).toBe(true);
      }
    });

    it('treats an empty comparator set as a wildcard', () => {
      expect(isSupportedNodeEngineVersion('v20.9.0', [[]])).toBe(true);
    });

    it('returns null when the current Node.js version cannot be parsed', () => {
      expect(isSupportedNodeEngineVersion('node-20.9.0', nodeEngineComparatorSets)).toBeNull();
    });

    it('rejects prerelease runtime versions so unstable Node builds do not slip through', () => {
      expect(isSupportedNodeEngineVersion('v20.20.0-rc.1', nodeEngineComparatorSets)).toBeNull();
    });
  });

  describe('alternative runtime detection', () => {
    let originalBun: unknown;
    let originalDeno: unknown;

    beforeEach(() => {
      originalBun = (globalThis as Record<string, unknown>).Bun;
      originalDeno = (globalThis as Record<string, unknown>).Deno;
    });

    afterEach(() => {
      if (originalBun === undefined) {
        delete (globalThis as Record<string, unknown>).Bun;
      } else {
        (globalThis as Record<string, unknown>).Bun = originalBun;
      }
      if (originalDeno === undefined) {
        delete (globalThis as Record<string, unknown>).Deno;
      } else {
        (globalThis as Record<string, unknown>).Deno = originalDeno;
      }
    });

    it('detects Bun runtime via globalThis.Bun', () => {
      (globalThis as Record<string, unknown>).Bun = { version: '1.0.0' };

      const isBun = typeof (globalThis as Record<string, unknown>).Bun !== 'undefined';
      expect(isBun).toBe(true);
    });

    it('detects Deno runtime via globalThis.Deno', () => {
      (globalThis as Record<string, unknown>).Deno = { version: { deno: '1.40.0' } };

      const isDeno = typeof (globalThis as Record<string, unknown>).Deno !== 'undefined';
      expect(isDeno).toBe(true);
    });

    it('returns false for Bun and Deno detection in standard Node.js', () => {
      delete (globalThis as Record<string, unknown>).Bun;
      delete (globalThis as Record<string, unknown>).Deno;

      const isBun = typeof (globalThis as Record<string, unknown>).Bun !== 'undefined';
      const isDeno = typeof (globalThis as Record<string, unknown>).Deno !== 'undefined';

      expect(isBun).toBe(false);
      expect(isDeno).toBe(false);
    });

    it('skips the version check when running in Bun', () => {
      (globalThis as Record<string, unknown>).Bun = { version: '1.0.0' };

      const isBun = typeof (globalThis as Record<string, unknown>).Bun !== 'undefined';
      const isDeno = typeof (globalThis as Record<string, unknown>).Deno !== 'undefined';

      expect(!isBun && !isDeno).toBe(false);
    });

    it('skips the version check when running in Deno', () => {
      (globalThis as Record<string, unknown>).Deno = { version: { deno: '1.40.0' } };

      const isBun = typeof (globalThis as Record<string, unknown>).Bun !== 'undefined';
      const isDeno = typeof (globalThis as Record<string, unknown>).Deno !== 'undefined';

      expect(!isBun && !isDeno).toBe(false);
    });
  });

  describe('error message formatting', () => {
    it('formats a range-aware error message for unsupported versions', () => {
      const errorMessage = formatUnsupportedNodeVersionMessage('v20.9.0', nodeEngineRange);

      expect(errorMessage).toContain('promptfoo requires a supported Node.js runtime');
      expect(errorMessage).toContain('Detected: v20.9.0');
      expect(errorMessage).toContain(`Required: ${nodeEngineRange}`);
      expect(errorMessage).toContain('Install a supported Node.js version and try again.');
      expect(errorMessage).toContain('\x1b[33m');
      expect(errorMessage).toContain('\x1b[0m');
    });

    it('formats a distinct error message for malformed versions', () => {
      const errorMessage = formatMalformedNodeVersionMessage('node-20.9.0', nodeEngineRange);

      expect(errorMessage).toContain('Unable to parse the current Node.js version');
      expect(errorMessage).toContain('node-20.9.0');
      expect(errorMessage).toContain(`Required: ${nodeEngineRange}`);
    });
  });

  describe('build-time constant behavior', () => {
    it('uses the fallback range and comparator set when build-time constants are undefined', () => {
      const __PROMPTFOO_NODE_ENGINE_RANGE__: string | undefined = undefined;
      const __PROMPTFOO_NODE_ENGINE_COMPARATOR_SETS__: NodeEngineComparator[][] | undefined =
        undefined;

      const fallbackRange =
        typeof __PROMPTFOO_NODE_ENGINE_RANGE__ === 'undefined'
          ? '>=22.22.0'
          : __PROMPTFOO_NODE_ENGINE_RANGE__;
      const fallbackComparatorSets =
        typeof __PROMPTFOO_NODE_ENGINE_COMPARATOR_SETS__ === 'undefined'
          ? [[{ operator: '>=', version: '22.22.0' }]]
          : __PROMPTFOO_NODE_ENGINE_COMPARATOR_SETS__;

      expect(fallbackRange).toBe('>=22.22.0');
      expect(fallbackComparatorSets).toEqual([[{ operator: '>=', version: '22.22.0' }]]);
    });

    it('uses the injected engine range and comparator sets when provided', () => {
      // Deliberately NOT the current engine range: if the injected value equalled the
      // fallback, both ternary branches would satisfy the assertions and this test could
      // never fail.
      const __PROMPTFOO_NODE_ENGINE_RANGE__ = '>=99.1.2';
      const __PROMPTFOO_NODE_ENGINE_COMPARATOR_SETS__: NodeEngineComparator[][] = [
        [{ operator: '>=', version: '99.1.2' }],
      ];

      const injectedRange =
        typeof __PROMPTFOO_NODE_ENGINE_RANGE__ === 'undefined'
          ? '>=22.22.0'
          : __PROMPTFOO_NODE_ENGINE_RANGE__;
      const injectedComparatorSets =
        typeof __PROMPTFOO_NODE_ENGINE_COMPARATOR_SETS__ === 'undefined'
          ? [[{ operator: '>=', version: '22.22.0' }]]
          : __PROMPTFOO_NODE_ENGINE_COMPARATOR_SETS__;

      expect(injectedRange).toBe('>=99.1.2');
      expect(injectedComparatorSets).toEqual([[{ operator: '>=', version: '99.1.2' }]]);
    });
  });
});
