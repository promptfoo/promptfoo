import fs from 'fs';

import chalk from 'chalk';
import dedent from 'dedent';
import logger from '../../logger';

function errorFileHasContents(filePath: string): boolean {
  try {
    return (
      fs.existsSync(filePath) && fs.statSync(filePath).isFile() && fs.statSync(filePath).size > 0
    );
  } catch (error) {
    logger.debug(`[errorFileHasContents] Error checking if file has contents: ${filePath}`, {
      error,
    });
    return false;
  }
}

export function printErrorInformation(errorLogFile?: string, debugLogFile?: string): void {
  if (errorLogFile && errorFileHasContents(errorLogFile)) {
    logger.info(
      chalk.white(
        `\n${dedent`
        There were some errors during the operation. See logs for more details.
        Error log: ${chalk.green(errorLogFile)}
        ${debugLogFile ? `Debug log: ${chalk.green(debugLogFile)}` : ''}
      `}`,
      ),
    );
  }
}
