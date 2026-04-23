import * as fs from 'fs';
import * as path from 'path';

import yaml from 'js-yaml';
import cliState from '../cliState';
import logger from '../logger';
import { parseFileUrl } from '../util/functions/loadFunction';

import type { AssertionOrSet } from '../types';

const MAX_DEPTH = 16;
const ASSERTION_FILE_EXTENSIONS = new Set(['.yaml', '.yml', '.json']);

interface ExpandOptions {
  baseDir?: string;
  inProgress?: Set<string>;
  depth?: number;
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
  if (obj.type != null) {
    return false;
  }
  if (!isFileRef(obj.value)) {
    return false;
  }
  const { filePath } = parseFileUrl(obj.value);
  return hasAssertionFileExtension(filePath);
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
 * A cycle is detected by tracking the include chain in `inProgress`. When a
 * cycle or the depth cap of 16 is hit, the remaining include entries are
 * left as literals and a debug/warn message is logged.
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
  const depth = options.depth ?? 0;

  if (depth > MAX_DEPTH) {
    logger.warn(
      `Assertion file-ref expansion exceeded max depth ${MAX_DEPTH}; leaving remaining includes unresolved.`,
    );
    return assertions;
  }

  const expanded: AssertionOrSet[] = [];

  for (const item of assertions) {
    // Narrow shape-first, read `type` as an arbitrary string afterwards:
    // `Assertion.type` is a string-literal union that does NOT include
    // `'assert-set'` (that lives on `AssertionSet`), so TS would reject a
    // direct `(item as Assertion).type === 'assert-set'` comparison with
    // TS2367 "this comparison appears to be unintentional".
    if (item && typeof item === 'object' && !Array.isArray(item)) {
      const maybeType = (item as { type?: unknown }).type;
      if (maybeType === 'assert-set') {
        const assertSet = item as { assert?: unknown };
        // Pass malformed `assert-set` entries through unchanged so the
        // downstream schema validator can surface a helpful error.
        if (!Array.isArray(assertSet.assert)) {
          expanded.push(item);
          continue;
        }
        const expandedChildren = await expandAssertionFileRefs(
          assertSet.assert as AssertionOrSet[],
          {
            baseDir,
            inProgress,
            depth: depth + 1,
          },
        );
        expanded.push({ ...(item as object), assert: expandedChildren ?? [] } as AssertionOrSet);
        continue;
      }
    }

    if (isAssertionFileInclude(item)) {
      const resolvedPath = resolveAssertionFilePath(item.value, baseDir);

      if (inProgress.has(resolvedPath)) {
        logger.debug(
          `Assertion file-ref cycle detected; leaving literal in place: ${item.value} (resolved ${resolvedPath})`,
        );
        expanded.push(item as unknown as AssertionOrSet);
        continue;
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
