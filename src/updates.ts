import chalk from 'chalk';
import ora from 'ora';
import latestVersion from 'latest-version';
import semverGt from 'semver/functions/gt';
import { execa } from 'execa';

import packageJson from '../package.json';

const VERSION = packageJson.version;

export async function checkForUpdates() {
  // Based on https://github.com/npm/cli/issues/2329#issuecomment-873487338
  const spinner = ora().start('Checking for latest version');
  const latestVer = await latestVersion('promptfoo');
  if (semverGt(latestVer, VERSION)) {
    spinner.info(
      `The current version of promptfoo [${chalk.keyword('brown')(
        VERSION,
      )}] is lower than the latest available version [${chalk.yellow(
        latestVer,
      )}]. Recalling promptfoo with @latest...`,
    );
    const rawProgramArgs = process.argv.slice(2);
    await execa('npx', ['promptfoo@latest', '--no-check-latest', ...rawProgramArgs], {
      env: {
        npm_config_yes: 'true', // https://github.com/npm/cli/issues/2226#issuecomment-732475247
      },
    });
    return;
  } else {
    // Same version. We are running the latest one!
    spinner.succeed();
  }
}
