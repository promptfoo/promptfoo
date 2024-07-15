import { Command } from 'commander';
import fs from 'fs';
import path from 'path';
import { getDirectory } from '../esm';
import logger from '../logger';

export function versionCommand(program: Command) {
  program.option('--version', 'Print version', () => {
    const packageJson = JSON.parse(
      fs.readFileSync(path.join(getDirectory(), '../package.json'), 'utf8'),
    );
    logger.info(packageJson.version);
    process.exit(0);
  });
}
