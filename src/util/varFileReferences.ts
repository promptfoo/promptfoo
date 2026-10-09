import * as fs from 'fs';
import * as path from 'path';

import { escape as escapeGlob, hasMagic } from 'glob';

import type { TestCase } from '../types/index';

type FileVars = TestCase['vars'];

/**
 * Map top-level file strings and array entries; strings nested in objects remain data.
 * Return the original vars object when no reference changes.
 */
export function mapVarFileReferences(
  vars: FileVars,
  mapReference: (reference: string) => string,
): FileVars {
  if (!vars || typeof vars !== 'object' || Array.isArray(vars)) {
    return vars;
  }
  let changed = false;
  const prepare = (value: unknown): unknown => {
    if (typeof value !== 'string' || !value.startsWith('file://')) {
      return value;
    }
    const prepared = mapReference(value);
    changed ||= prepared !== value;
    return prepared;
  };
  const prepared = Object.fromEntries(
    Object.entries(vars).map(([name, value]) => [
      name,
      Array.isArray(value) ? value.map(prepare) : prepare(value),
    ]),
  );
  return changed ? (prepared as FileVars) : vars;
}

/** Pin a file var while escaping only the directory injected into an authored glob. */
export function pinVarFileReference(reference: string, basePath: string): string {
  const filePath = reference.slice('file://'.length);
  const resolved = path.resolve(basePath, filePath);
  if (
    fs.existsSync(resolved) ||
    !hasMagic(filePath, { windowsPathsNoEscape: true, magicalBraces: true })
  ) {
    return `file://${resolved}`;
  }
  const literalBase = escapeGlob(path.resolve(basePath), { windowsPathsNoEscape: true });
  return `file://${path.resolve(literalBase, filePath)}`;
}
