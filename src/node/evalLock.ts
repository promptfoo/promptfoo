import { randomBytes } from 'crypto';
import fs from 'fs/promises';
import * as path from 'path';

import { z } from 'zod';
import { toSerializableProviderRef } from '../models/evalResult';
import { sha256 } from '../util/createHash';
import {
  buildConfiguredProviderMap,
  resolveConfiguredProviderReference,
} from '../util/gradingProvider';

const SHA256_HEX = /^[a-f0-9]{64}$/;
const UUID_V7 = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

// PRML v0.1 canonicalization follows the portable YAML scalar rules in section 3.6.
const YAML_INDICATORS = new Set([
  '#',
  ',',
  '[',
  ']',
  '{',
  '}',
  '&',
  '*',
  '!',
  '|',
  '>',
  "'",
  '"',
  '%',
  '@',
  '`',
]);
const YAML_IMPLICIT_VALUES = [
  /^(?:yes|Yes|YES|no|No|NO|true|True|TRUE|false|False|FALSE|on|On|ON|off|Off|OFF)$/,
  /^(?:[-+]?(?:[0-9][0-9_]*)\.[0-9_]*(?:[eE][-+][0-9]+)?|\.[0-9][0-9_]*(?:[eE][-+][0-9]+)?|[-+]?[0-9][0-9_]*(?::[0-5]?[0-9])+\.[0-9_]*|[-+]?\.(?:inf|Inf|INF)|\.(?:nan|NaN|NAN))$/,
  /^(?:[-+]?0b[0-1_]+|[-+]?0[0-7_]+|[-+]?(?:0|[1-9][0-9_]*)|[-+]?0x[0-9a-fA-F_]+|[-+]?[1-9][0-9_]*(?::[0-5]?[0-9])+)$/,
  /^(?:~|null|Null|NULL)$/,
  /^(?:[0-9]{4}-[0-9]{2}-[0-9]{2}|[0-9]{4}-[0-9]?[0-9]-[0-9]?[0-9](?:[Tt]|[ \t]+)[0-9]?[0-9]:[0-9]{2}:[0-9]{2}(?:\.[0-9]*)?(?:[ \t]*(?:Z|[-+][0-9]?[0-9](?::[0-9]{2})?))?)$/,
  /^(?:<<|=|!|&|\*)$/,
];

const PrmlManifestSchema = z
  .object({
    version: z.literal('prml/0.1'),
    claim_id: z.string().regex(UUID_V7),
    created_at: z.iso.datetime(),
    metric: z.literal('pass_rate'),
    comparator: z.literal('>='),
    threshold: z.number().min(0).max(1),
    dataset: z
      .object({
        id: z.literal('promptfoo-resolved-eval-bar-v1'),
        hash: z.string().regex(SHA256_HEX),
      })
      .strict(),
    seed: z.null(),
    producer: z.object({ id: z.literal('promptfoo') }).strict(),
  })
  .strict();

const EvalLockFileSchema = z
  .object({
    manifest: PrmlManifestSchema,
    locked: z.string().regex(SHA256_HEX),
  })
  .strict();

export type PrmlManifest = z.infer<typeof PrmlManifestSchema>;
export type EvalLockFile = z.infer<typeof EvalLockFileSchema>;

type EvalBarSource = {
  defaultTest?: unknown;
  tests?: unknown;
  scenarios?: unknown;
  extensions?: unknown;
  providers?: unknown;
};

export type EvalBar = {
  version: 1;
  defaultTest: unknown;
  tests: unknown;
  scenarios: unknown;
  execution: {
    repeat: number;
    filterRange: string | null;
  };
};

function isRuntimeApiProvider(value: unknown): value is {
  id: () => string;
  callApi: (...args: unknown[]) => unknown;
} {
  return (
    typeof value === 'object' &&
    value !== null &&
    'id' in value &&
    typeof value.id === 'function' &&
    'callApi' in value &&
    typeof value.callApi === 'function'
  );
}

type ConfiguredProviderMap = ReturnType<typeof buildConfiguredProviderMap>;

function snapshotGradingProviderReferences(
  value: unknown,
  providerMap: ConfiguredProviderMap,
  ancestors: Set<object>,
  providerOption = false,
): unknown {
  if (
    value === null ||
    value === undefined ||
    typeof value !== 'object' ||
    isRuntimeApiProvider(value) ||
    Buffer.isBuffer(value) ||
    value instanceof Date
  ) {
    return value;
  }
  if (ancestors.has(value)) {
    throw new Error('Evaluation locks cannot include circular test data');
  }
  ancestors.add(value);

  try {
    if (Array.isArray(value)) {
      return value.map((entry) =>
        snapshotGradingProviderReferences(entry, providerMap, ancestors, providerOption),
      );
    }

    const record = value as Record<string, unknown>;
    const isAssertion = typeof record.type === 'string';
    return Object.fromEntries(
      Object.entries(record).map(([key, entry]) => {
        const resolved =
          key === 'provider' && (providerOption || isAssertion)
            ? resolveConfiguredProviderReference(entry, providerMap)
            : entry;
        return [
          key,
          snapshotGradingProviderReferences(resolved, providerMap, ancestors, key === 'options'),
        ];
      }),
    );
  } finally {
    ancestors.delete(value);
  }
}

function uuidV7(): string {
  const bytes = randomBytes(16);
  const timestamp = Date.now();
  for (let index = 5; index >= 0; index--) {
    bytes[index] = Math.floor(timestamp / 2 ** (8 * (5 - index))) & 0xff;
  }
  bytes[6] = (bytes[6] & 0x0f) | 0x70;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;

  const hex = bytes.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function needsYamlQuoting(value: string): boolean {
  if (value.length === 0 || YAML_INDICATORS.has(value[0])) {
    return true;
  }
  if (['?', ':', '-'].includes(value[0]) && (value.length === 1 || value[1] === ' ')) {
    return true;
  }
  if (value.startsWith(' ') || value.endsWith(' ')) {
    return true;
  }
  for (let index = 1; index < value.length; index++) {
    if (
      (value[index] === ':' && (index === value.length - 1 || value[index + 1] === ' ')) ||
      (value[index] === '#' && value[index - 1] === ' ')
    ) {
      return true;
    }
  }
  return YAML_IMPLICIT_VALUES.some((pattern) => pattern.test(value));
}

function formatPrmlFloat(value: number): string {
  if (value === 0) {
    return '0.0';
  }
  if (Number.isInteger(value) && Math.abs(value) < 1e16) {
    return value.toFixed(1);
  }
  if (Math.abs(value) >= 1e-4 && Math.abs(value) < 1e16) {
    return value.toString();
  }

  const match = value.toExponential().match(/^(-?)(\d+)(\.\d+)?e([+-])(\d+)$/);
  if (!match) {
    return value.toString();
  }
  const [, sign, integer, fraction = '.0', exponentSign, exponent] = match;
  return `${sign}${integer}${fraction}e${exponentSign}${exponent.padStart(2, '0')}`;
}

function renderPrmlScalar(value: unknown, key: string): string {
  if (value === null) {
    return 'null';
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw new Error('PRML manifests cannot include non-finite numbers');
    }
    return key === 'threshold' ? formatPrmlFloat(value) : value.toString();
  }
  if (typeof value === 'boolean') {
    return value ? 'true' : 'false';
  }
  if (typeof value === 'string') {
    return needsYamlQuoting(value) ? `'${value.replaceAll("'", "''")}'` : value;
  }
  throw new Error(`PRML manifests cannot include ${typeof value} scalar values`);
}

function renderPrmlMapping(value: Record<string, unknown>, indent = 0): string {
  const padding = ' '.repeat(indent);
  return Object.keys(value)
    .sort()
    .map((key) => {
      const entry = value[key];
      if (entry !== null && typeof entry === 'object' && !Array.isArray(entry)) {
        return `${padding}${key}:\n${renderPrmlMapping(entry as Record<string, unknown>, indent + 2)}`;
      }
      return `${padding}${key}: ${renderPrmlScalar(entry, key)}`;
    })
    .join('\n');
}

export function canonicalPrml(manifest: Record<string, unknown>): string {
  return `${renderPrmlMapping(manifest)}\n`;
}

function canonicalize(value: unknown, ancestors: Set<object>): unknown {
  if (value === null || typeof value === 'boolean' || typeof value === 'number') {
    if (typeof value === 'number' && !Number.isFinite(value)) {
      throw new Error('Evaluation locks cannot include non-finite numbers');
    }
    return value;
  }

  if (typeof value === 'string') {
    if (value.startsWith('file://') || value.startsWith('package:')) {
      throw new Error(
        `Evaluation locks cannot include unresolved external reference "${value}"; replace it with self-contained criteria before locking`,
      );
    }
    return value;
  }

  if (value === undefined) {
    return undefined;
  }

  if (typeof value === 'function') {
    throw new Error(
      'Evaluation locks cannot safely bind function values because captured state is not represented; use self-contained data-backed criteria instead',
    );
  }

  if (typeof value === 'bigint' || typeof value === 'symbol') {
    throw new Error(`Evaluation locks cannot include ${typeof value} values`);
  }

  if (isRuntimeApiProvider(value)) {
    return canonicalize(toSerializableProviderRef(value), ancestors);
  }

  if (Buffer.isBuffer(value)) {
    return { $binary: value.toString('base64') };
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (ancestors.has(value)) {
    throw new Error('Evaluation locks cannot include circular test data');
  }
  ancestors.add(value);

  try {
    if (Array.isArray(value)) {
      return value.map((entry) => canonicalize(entry, ancestors) ?? null);
    }

    const record = value as Record<string, unknown>;
    const entries = Object.keys(record)
      .sort()
      .flatMap((key) => {
        const normalized = canonicalize(record[key], ancestors);
        return normalized === undefined ? [] : ([[key, normalized]] as [string, unknown][]);
      });
    return Object.fromEntries(entries);
  } finally {
    ancestors.delete(value);
  }
}

export function canonicalJson(value: unknown): string {
  return JSON.stringify(canonicalize(value, new Set()));
}

export function createEvalBar(
  testSuite: EvalBarSource,
  execution: { repeat: number; filterRange?: string },
): EvalBar {
  if (Array.isArray(testSuite.extensions) && testSuite.extensions.length > 0) {
    throw new Error(
      'Evaluation locks do not support extension hooks because hooks can mutate tests after verification',
    );
  }

  const runtimeProviders = Array.isArray(testSuite.providers)
    ? testSuite.providers.filter(isRuntimeApiProvider)
    : [];
  const providerMap = buildConfiguredProviderMap(
    runtimeProviders as Parameters<typeof buildConfiguredProviderMap>[0],
  );
  const snapshot = (value: unknown) =>
    snapshotGradingProviderReferences(value, providerMap, new Set());

  return {
    version: 1,
    defaultTest: snapshot(testSuite.defaultTest ?? null),
    tests: snapshot(testSuite.tests ?? []),
    scenarios: snapshot(testSuite.scenarios ?? null),
    execution: {
      repeat: execution.repeat,
      filterRange: execution.filterRange ?? null,
    },
  };
}

export function hashEvalBar(bar: EvalBar): string {
  return sha256(canonicalJson(bar));
}

export function hashManifest(manifest: Record<string, unknown>): string {
  return sha256(canonicalPrml(manifest));
}

export function createEvalLock(bar: EvalBar, thresholdPercent: number): EvalLockFile {
  if (!Number.isFinite(thresholdPercent) || thresholdPercent < 0 || thresholdPercent > 100) {
    throw new Error('PROMPTFOO_PASS_RATE_THRESHOLD must be between 0 and 100 to create a lock');
  }

  const manifest: PrmlManifest = {
    version: 'prml/0.1',
    claim_id: uuidV7(),
    created_at: new Date().toISOString(),
    metric: 'pass_rate',
    comparator: '>=',
    threshold: thresholdPercent / 100,
    dataset: {
      id: 'promptfoo-resolved-eval-bar-v1',
      hash: hashEvalBar(bar),
    },
    seed: null,
    producer: { id: 'promptfoo' },
  };

  return { manifest, locked: hashManifest(manifest) };
}

export async function writeEvalLock(
  lockPath: string,
  bar: EvalBar,
  thresholdPercent: number,
): Promise<EvalLockFile> {
  const lock = createEvalLock(bar, thresholdPercent);
  const resolvedPath = path.resolve(process.cwd(), lockPath);
  try {
    await fs.writeFile(resolvedPath, `${JSON.stringify(lock, null, 2)}\n`, {
      encoding: 'utf8',
      flag: 'wx',
    });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'EEXIST') {
      throw new Error(
        `Evaluation lock already exists at ${resolvedPath}. Refusing to overwrite a pre-registered bar.`,
      );
    }
    throw error;
  }
  return lock;
}

export async function verifyEvalLock(lockPath: string, bar: EvalBar): Promise<EvalLockFile> {
  const resolvedPath = path.resolve(process.cwd(), lockPath);
  let parsed: unknown;
  try {
    parsed = JSON.parse(await fs.readFile(resolvedPath, 'utf8'));
  } catch (error) {
    throw new Error(
      `Could not read evaluation lock at ${resolvedPath}: ${error instanceof Error ? error.message : error}`,
    );
  }

  const result = EvalLockFileSchema.safeParse(parsed);
  if (!result.success) {
    throw new Error(
      `Evaluation lock at ${resolvedPath} is invalid: ${z.prettifyError(result.error)}`,
    );
  }

  const lock = result.data;
  if (hashManifest(lock.manifest) !== lock.locked) {
    throw new Error('Evaluation lock manifest has changed since it was created');
  }
  if (hashEvalBar(bar) !== lock.manifest.dataset.hash) {
    throw new Error(
      'Resolved tests, assertions, or execution policy do not match the evaluation lock',
    );
  }
  return lock;
}

export function lockedThresholdPercent(lock: EvalLockFile): number {
  return lock.manifest.threshold * 100;
}
