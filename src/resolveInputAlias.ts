// src/resolveInputAlias.ts
import { getBaselinePointer } from './baseline/pointer';
import { getLastRunPointer } from './store/lastRun';

export async function resolveInputAlias(arg?: string): Promise<string | undefined> {
  if (!arg) {
    return undefined;
  }
  if (arg === '@baseline') {
    return (await getBaselinePointer('global')) ?? undefined;
  }
  if (arg === '@last') {
    return (await getLastRunPointer()) ?? undefined;
  }
  return arg; // plain file/dir path
}
