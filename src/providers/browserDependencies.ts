import semverSatisfies from 'semver/functions/satisfies.js';
import { isMissingPackageImportError } from '../util/packageImportErrors';

export const CHROMIUM_INSTALL_HINT =
  'Install matching Chromium with npx playwright install chromium in your project, ' +
  'or playwright install chromium for a global installation.';

const PLAYWRIGHT_INSTALL = 'npm install promptfoo "playwright@^1.63.0"';
const BROWSER_INSTALL =
  'npm install promptfoo "playwright@^1.63.0" "playwright-extra@^4.3.6" "puppeteer-extra-plugin-stealth@^2.11.2"';

function installationGuidance(command: string): string {
  return (
    `Install the packages together: ${command}. Then run: npx playwright install chromium. ` +
    `For a global installation, use ${command.replace('npm install ', 'npm install -g ')} ` +
    'and then playwright install chromium.'
  );
}

function checkVersion(name: string, version: string, range: string, command: string): void {
  if (!semverSatisfies(version, range)) {
    throw new Error(
      `The installed ${name} package (${version}) is incompatible; this provider requires ${range}. ` +
        installationGuidance(command),
    );
  }
}

export async function loadPlaywright(command = PLAYWRIGHT_INSTALL) {
  try {
    const { default: metadata } = await import('playwright/package.json', {
      with: { type: 'json' },
    });
    checkVersion('playwright', metadata.version, '^1.63.0', command);
    return await import('playwright');
  } catch (error) {
    if (isMissingPackageImportError(error, 'playwright')) {
      throw new Error(
        `This provider requires the optional Playwright package. ${installationGuidance(command)}`,
      );
    }
    throw error;
  }
}

export async function loadBrowserProviderDependencies() {
  await loadPlaywright(BROWSER_INSTALL);
  try {
    const [{ default: extra }, { default: stealthMetadata }] = await Promise.all([
      import('playwright-extra/package.json', { with: { type: 'json' } }),
      import('puppeteer-extra-plugin-stealth/package.json', { with: { type: 'json' } }),
    ]);
    checkVersion('playwright-extra', extra.version, '^4.3.6', BROWSER_INSTALL);
    checkVersion(
      'puppeteer-extra-plugin-stealth',
      stealthMetadata.version,
      '^2.11.2',
      BROWSER_INSTALL,
    );
    const [{ chromium }, { default: stealth }] = await Promise.all([
      import('playwright-extra'),
      import('puppeteer-extra-plugin-stealth'),
    ]);
    return { chromium, stealth };
  } catch (error) {
    if (
      ['playwright-extra', 'puppeteer-extra-plugin-stealth'].some((name) =>
        isMissingPackageImportError(error, name),
      )
    ) {
      throw new Error(
        `The Browser provider requires optional browser packages. ${installationGuidance(BROWSER_INSTALL)}`,
      );
    }
    throw error;
  }
}
