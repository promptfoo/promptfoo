import chalk from 'chalk';

type NativeAddonVersionMismatchDetails = {
  addonAbi: string;
  nodeAbi: string;
};

const nativeAddonAbiPattern =
  /NODE_MODULE_VERSION\s+(\d+)[\s\S]*?requires\s+NODE_MODULE_VERSION\s+(\d+)/i;

/** Currently only matches better-sqlite3 ABI mismatches. */
export function getNativeAddonVersionMismatchDetails(
  error: unknown,
): NativeAddonVersionMismatchDetails | undefined {
  const message = error instanceof Error ? error.message : undefined;
  if (!message || !message.includes('better_sqlite3.node')) {
    return undefined;
  }

  const match = nativeAddonAbiPattern.exec(message);
  return match ? { addonAbi: match[1], nodeAbi: match[2] } : undefined;
}

export function formatNativeAddonVersionMismatchMessage(error: unknown): string | undefined {
  const details = getNativeAddonVersionMismatchDetails(error);
  if (!details) {
    return undefined;
  }

  return chalk.yellow(
    [
      'promptfoo could not load its SQLite dependency because it was built for a different Node.js version.',
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
      'More help: https://www.promptfoo.dev/docs/usage/troubleshooting/#nodejs-version-mismatch-error',
    ].join('\n'),
  );
}
