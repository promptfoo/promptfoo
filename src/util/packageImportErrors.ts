export function isMissingPackageImportError(error: unknown, packageName: string): boolean {
  if (!(error instanceof Error) || !error.message.includes(packageName)) {
    return false;
  }

  const code =
    'code' in error && typeof error.code === 'string' ? error.code : undefined;

  return (
    code === 'MODULE_NOT_FOUND' ||
    code === 'ERR_MODULE_NOT_FOUND' ||
    error.message.includes('Cannot find module') ||
    error.message.includes('Cannot find package')
  );
}
