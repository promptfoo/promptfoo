/**
 * Import a package at runtime without exposing a literal specifier to consumer bundlers.
 * Optional peers must remain loadable only when their feature is used.
 */
export async function importPackage(packageName: string): Promise<unknown> {
  return import(/* webpackIgnore: true */ packageName);
}
