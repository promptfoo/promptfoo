type NativeAddonVersionMismatchDetails = {
  addonAbi: string;
  nodeAbi: string;
};

const nativeAddonAbiPattern =
  /NODE_MODULE_VERSION\s+(\d+)[\s\S]*?requires\s+NODE_MODULE_VERSION\s+(\d+)/i;

function getErrorMessage(error: unknown): string | undefined {
  return error instanceof Error ? error.message : undefined;
}

export function getNativeAddonVersionMismatchDetails(
  error: unknown,
): NativeAddonVersionMismatchDetails | undefined {
  const message = getErrorMessage(error);
  if (!message || !message.includes('better_sqlite3.node')) {
    return undefined;
  }

  const match = nativeAddonAbiPattern.exec(message);
  if (!match) {
    return undefined;
  }

  return {
    addonAbi: match[1],
    nodeAbi: match[2],
  };
}

export function isNativeAddonVersionMismatchError(error: unknown): boolean {
  return getNativeAddonVersionMismatchDetails(error) !== undefined;
}

export function formatNativeAddonVersionMismatchMessage(error: unknown): string | undefined {
  const details = getNativeAddonVersionMismatchDetails(error);
  if (!details) {
    return undefined;
  }

  return [
    '\x1b[33mpromptfoo could not load its SQLite dependency because it was built for a different Node.js version.',
    '',
    `Detected Node.js: ${process.version}`,
    `Current Node.js ABI: ${details.nodeAbi}`,
    `Installed better-sqlite3 ABI: ${details.addonAbi}`,
    '',
    'If you are working from a project checkout:',
    '  1. Switch to the intended Node.js version.',
    '  2. Run: npm rebuild better-sqlite3',
    '',
    'If promptfoo was installed globally with npm:',
    '  Run: npm install -g promptfoo@latest',
    '',
    'If you are running through npx:',
    '  Remove the cached npx install, then run npx -y promptfoo@latest again.',
    '',
    'More help: https://www.promptfoo.dev/docs/usage/troubleshooting/#nodejs-version-mismatch-error\x1b[0m',
  ].join('\n');
}
