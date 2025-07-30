import * as fs from 'fs';
import * as os from 'os';

import chalk from 'chalk';
import { version } from '../../package.json';
import { getEnvString } from '../envars';
import logger from '../logger';
import { printBorder } from '../util';
import { resolveConfigs } from '../util/config/load';
import type { Command } from 'commander';

import type { UnifiedConfig } from '../types';

interface DebugOptions {
  config?: string;
  defaultConfig: Partial<UnifiedConfig>;
  defaultConfigPath: string | undefined;
}

async function doDebug(options: DebugOptions): Promise<void> {
  const debugInfo = {
    version,
    platform: {
      os: os.platform(),
      release: os.release(),
      arch: os.arch(),
      nodeVersion: process.version,
    },
    env: {
      NODE_ENV: getEnvString('NODE_ENV'),
      httpProxy: getEnvString('HTTP_PROXY') || getEnvString('http_proxy'),
      httpsProxy: getEnvString('HTTPS_PROXY') || getEnvString('https_proxy'),
      allProxy: getEnvString('ALL_PROXY') || getEnvString('all_proxy'),
      noProxy: getEnvString('NO_PROXY') || getEnvString('no_proxy'),
      nodeExtra: getEnvString('NODE_EXTRA_CA_CERTS'),
      nodeTls: getEnvString('NODE_TLS_REJECT_UNAUTHORIZED'),
    },
    configInfo: {
      defaultConfigPath: options.defaultConfigPath,
      specifiedConfigPath: options.config,
      configExists: false,
      configContent: null as any,
    },
  };

  // Try to load config if available
  const configPath = options.config || options.defaultConfigPath;
  if (configPath && fs.existsSync(configPath)) {
    debugInfo.configInfo.configExists = true;
    try {
      const resolved = await resolveConfigs(
        {
          config: [configPath],
        },
        options.defaultConfig,
      );
      debugInfo.configInfo.configContent = resolved;
    } catch (err) {
      debugInfo.configInfo.configContent = `Error loading config: ${err}`;
    }
  }

  printBorder();
  logger.info(chalk.bold('Promptfoo Debug Information'));
  printBorder();
  logger.info(JSON.stringify(debugInfo, null, 2));
  printBorder();

  logger.info(
    chalk.yellow(
      'Please include this output when reporting issues on GitHub: https://github.com/promptfoo/promptfoo/issues',
    ),
  );
}

export function debugCommand(
  program: Command,
  defaultConfig: Partial<UnifiedConfig>,
  defaultConfigPath: string | undefined,
) {
  program
    .command('debug')
    .description('Display debug information for troubleshooting')
    .option('-c, --config [path]', 'Path to configuration file. Defaults to promptfooconfig.yaml')
    .action((opts) => doDebug({ ...opts, defaultConfig, defaultConfigPath }));
}
