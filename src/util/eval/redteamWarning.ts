import chalk from 'chalk';
import dedent from 'dedent';
import logger from '../../logger';

import type { TestSuite, UnifiedConfig } from '../../types/index';

export function warnIfRedteamConfigHasNoTests(
  config: Partial<UnifiedConfig>,
  testSuite: TestSuite,
) {
  if (
    config.redteam &&
    (!testSuite.tests || testSuite.tests.length === 0) &&
    (!testSuite.scenarios || testSuite.scenarios.length === 0)
  ) {
    logger.warn(
      chalk.yellow(dedent`
        Warning: Config file has a redteam section but no test cases.
        Did you mean to run ${chalk.bold('promptfoo redteam generate')} instead?
        `),
    );
  }
}
