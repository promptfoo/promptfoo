const MODULE_NOT_FOUND_CODES = new Set(['MODULE_NOT_FOUND', 'ERR_MODULE_NOT_FOUND']);

/**
 * Extracts the module/package specifier that actually failed to resolve from a
 * Node module-resolution error message, e.g. `foo` from
 * `Cannot find package 'foo' imported from /path/to/importer.js`.
 *
 * Returns null when no quoted specifier is present (older or non-standard
 * message shapes), so callers can fall back to a looser check.
 */
function extractMissingSpecifier(message: string): string | null {
  const match = message.match(/Cannot find (?:module|package)\s+['"]([^'"]+)['"]/);
  return match ? match[1] : null;
}

export function isMissingPackageImportError(error: unknown, packageName: string): boolean {
  if (!(error instanceof Error)) {
    return false;
  }

  const code = 'code' in error && typeof error.code === 'string' ? error.code : undefined;
  const looksLikeModuleResolutionError =
    (code != null && MODULE_NOT_FOUND_CODES.has(code)) ||
    error.message.includes('Cannot find module') ||
    error.message.includes('Cannot find package');
  if (!looksLikeModuleResolutionError) {
    return false;
  }

  // Compare against the specifier that actually failed to resolve, not the whole
  // message. Node includes the importer path too, so a missing *transitive*
  // dependency of an installed optional package produces something like
  // `Cannot find package 'dep' imported from .../node_modules/<pkg>/index.js`,
  // which contains <pkg> in the importer path. A naive `message.includes(pkg)`
  // would misreport that as <pkg> itself being absent and tell the user to
  // install a package they already have.
  const missingSpecifier = extractMissingSpecifier(error.message);
  if (missingSpecifier == null) {
    // No quoted specifier to compare; fall back to the looser substring check so
    // we don't regress detection for non-standard message shapes.
    return error.message.includes(packageName);
  }

  // Match the package itself or a subpath import of it (e.g. `<pkg>/feature`),
  // but not a different package whose path merely mentions <pkg>.
  return missingSpecifier === packageName || missingSpecifier.startsWith(`${packageName}/`);
}
