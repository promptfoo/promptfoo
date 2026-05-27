import * as fs from 'fs';
import * as path from 'path';

import yaml from 'js-yaml';
import cliState from '../cliState';
import { parseFileUrl } from '../util/functions/loadFunction';

import type { AssertionOrSet } from '../types';

const MAX_DEPTH = 16;
const ASSERTION_FILE_EXTENSIONS = new Set(['.yaml', '.yml', '.json']);

interface ExpandOptions {
  baseDir?: string;
  inProgress?: Set<string>;
  includeChain?: string[];
  depth?: number;
}

interface AssertionSetLike {
  type: 'assert-set';
  assert?: unknown;
}

function isFileRef(value: unknown): value is string {
  return typeof value === 'string' && value.startsWith('file://');
}

function hasAssertionFileExtension(filePath: string): boolean {
  return ASSERTION_FILE_EXTENSIONS.has(path.extname(filePath).toLowerCase());
}

function isAssertionFileInclude(item: unknown): item is { value: string } {
  if (!item || typeof item !== 'object' || Array.isArray(item)) {
    return false;
  }
  const obj = item as Record<string, unknown>;
  if (Object.keys(obj).some((key) => key !== 'value')) {
    return false;
  }
  if (!isFileRef(obj.value)) {
    return false;
  }
  const { filePath } = parseFileUrl(obj.value);
  return hasAssertionFileExtension(filePath);
}

function isAssertionSetLike(item: unknown): item is AssertionSetLike {
  return (
    Boolean(item) &&
    typeof item === 'object' &&
    !Array.isArray(item) &&
    (item as { type?: unknown }).type === 'assert-set'
  );
}

function absolutizeFileRefs(value: unknown, baseDir: string): unknown {
  if (typeof value === 'string') {
    if (!isFileRef(value)) {
      return value;
    }
    const { filePath, functionName } = parseFileUrl(value);
    if (path.isAbsolute(filePath)) {
      return value;
    }
    const absolutePath = path.resolve(baseDir, filePath);
    return functionName ? `file://${absolutePath}:${functionName}` : `file://${absolutePath}`;
  }
  if (Array.isArray(value)) {
    return value.map((item) => absolutizeFileRefs(item, baseDir));
  }
  if (value && typeof value === 'object') {
    const result: Record<string, unknown> = {};
    for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
      result[key] = absolutizeFileRefs(nested, baseDir);
    }
    return result;
  }
  return value;
}

function resolveAssertionFilePath(fileRef: string, baseDir: string): string {
  const { filePath } = parseFileUrl(fileRef);
  return path.resolve(baseDir, filePath);
}

function loadAssertionFile(resolvedPath: string): unknown {
  let contents: string;
  try {
    contents = fs.readFileSync(resolvedPath, 'utf8');
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to read assertion file ${resolvedPath}: ${message}`);
  }
  if (resolvedPath.toLowerCase().endsWith('.json')) {
    try {
      return JSON.parse(contents);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to parse JSON assertion file ${resolvedPath}: ${message}`);
    }
  }
  try {
    return yaml.load(contents);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to parse YAML assertion file ${resolvedPath}: ${message}`);
  }
}

async function expandAssertionSet(
  item: AssertionSetLike,
  options: Required<Pick<ExpandOptions, 'baseDir' | 'inProgress' | 'includeChain' | 'depth'>>,
): Promise<AssertionOrSet> {
  if (!Array.isArray(item.assert)) {
    return item as AssertionOrSet;
  }
  const assert = await expandAssertionFileRefs(item.assert as AssertionOrSet[], options);
  return { ...item, assert: assert ?? [] } as AssertionOrSet;
}

/**
 * Expands `file://*.yaml|yml|json` include entries inside an assertion list.
 *
 * An include entry is a bare `{ value: 'file://...yaml' }` object with no
 * `type` field. Its loaded contents replace the entry in place. Any nested
 * `file://` references within the loaded content are rewritten to absolute
 * paths anchored at the loaded file's directory, so downstream runtime
 * loaders (which resolve against `cliState.basePath`) still find them.
 *
 * `assert-set` entries are traversed into their own `assert` array.
 *
 * A cycle is detected by tracking the include chain in `inProgress`. Cyclic
 * includes or include nesting beyond the depth cap fail with an explicit
 * configuration error.
 */
export async function expandAssertionFileRefs(
  assertions: AssertionOrSet[] | undefined,
  options: ExpandOptions = {},
): Promise<AssertionOrSet[] | undefined> {
  // Return the input unchanged when it's missing, empty, or not an array.
  // Callers pass `test.assert` on any truthy value; a malformed config like
  // `assert: { ... }` or `assert: "..."` should fall through to
  // `validateAssertions` so the schema error surfaces, not a TypeError here.
  if (!assertions || !Array.isArray(assertions) || assertions.length === 0) {
    return assertions;
  }

  const baseDir = options.baseDir ?? cliState.basePath ?? process.cwd();
  const inProgress = options.inProgress ?? new Set<string>();
  const includeChain = options.includeChain ?? [];
  const depth = options.depth ?? 0;

  if (depth > MAX_DEPTH) {
    throw new Error(
      `Assertion file include expansion exceeded maximum depth of ${MAX_DEPTH}. Include chain: ${includeChain.join(
        ' -> ',
      )}`,
    );
  }

  const expanded: AssertionOrSet[] = [];

  for (const item of assertions) {
    if (isAssertionSetLike(item)) {
      // Pass malformed sets through so the downstream validator reports them.
      expanded.push(await expandAssertionSet(item, { baseDir, inProgress, includeChain, depth }));
      continue;
    }

    if (isAssertionFileInclude(item)) {
      const resolvedPath = resolveAssertionFilePath(item.value, baseDir);

      if (inProgress.has(resolvedPath)) {
        throw new Error(
          `Cyclic assertion file include detected: ${[...includeChain, resolvedPath].join(' -> ')}`,
        );
      }

      const loaded = loadAssertionFile(resolvedPath);
      if (loaded == null) {
        continue;
      }

      const loadedList = Array.isArray(loaded) ? loaded : [loaded];
      const nestedBaseDir = path.dirname(resolvedPath);
      const rebasedList = loadedList.map((entry) =>
        absolutizeFileRefs(entry, nestedBaseDir),
      ) as AssertionOrSet[];

      inProgress.add(resolvedPath);
      try {
        const childExpanded = await expandAssertionFileRefs(rebasedList, {
          baseDir: nestedBaseDir,
          inProgress,
          includeChain: [...includeChain, resolvedPath],
          depth: depth + 1,
        });
        if (childExpanded) {
          expanded.push(...childExpanded);
        }
      } finally {
        inProgress.delete(resolvedPath);
      }
      continue;
    }

    expanded.push(item);
  }

  return expanded;
}
