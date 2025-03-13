import chalk from 'chalk';
import type { Command } from 'commander';
import * as fs from 'fs';
import * as os from 'os';
import { version } from '../../package.json';
import logger from '../logger';
import type { UnifiedConfig } from '../types';
import { printBorder } from '../util';
import { resolveConfigs } from '../util/config/load';

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
      NODE_ENV: process.env.NODE_ENV,
      httpProxy: process.env.HTTP_PROXY || process.env.http_proxy,
      httpsProxy: process.env.HTTPS_PROXY || process.env.https_proxy,
      allProxy: process.env.ALL_PROXY || process.env.all_proxy,
      noProxy: process.env.NO_PROXY || process.env.no_proxy,
      nodeExtra: process.env.NODE_EXTRA_CA_CERTS,
      nodeTls: process.env.NODE_TLS_REJECT_UNAUTHORIZED,
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
