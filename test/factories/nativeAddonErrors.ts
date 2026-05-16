export function createNativeAddonVersionMismatchError({
  addonAbi = '115',
  nodeAbi = '137',
}: {
  addonAbi?: string;
  nodeAbi?: string;
} = {}): Error {
  return new Error(
    [
      "The module '/tmp/node_modules/better-sqlite3/build/Release/better_sqlite3.node'",
      'was compiled against a different Node.js version using',
      `NODE_MODULE_VERSION ${addonAbi}. This version of Node.js requires`,
      `NODE_MODULE_VERSION ${nodeAbi}. Please try re-compiling or re-installing`,
      'the module (for instance, using `npm rebuild` or `npm install`).',
    ].join('\n'),
  );
}
