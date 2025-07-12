#!/usr/bin/env node
import { Command } from 'commander';
import { version } from '../package.json';
import { checkNodeVersion } from './checkNodeVersion';
import logger, { setLogLevel } from './logger';
import { runDbMigrations } from './migrate';
import { checkForUpdates } from './updates';
import { setupEnv } from './util';

// Commands that require database access
const COMMANDS_REQUIRING_DB = new Set([
  'eval',
  'view',
  'list',
  'show',
  'delete',
  'import',
  'export',
  'share',
]);

// Commands that should skip update checking
const COMMANDS_SKIP_UPDATE_CHECK = new Set([
  'init',
  'cache',
  'config',
  'debug',
  'feedback',
  'auth',
  'validate',
]);

/**
 * Adds verbose and env-file options to all commands recursively
 */
export function addCommonOptionsRecursively(command: Command) {
  const hasVerboseOption = command.options.some(
    (option) => option.short === '-v' || option.long === '--verbose',
  );
  if (!hasVerboseOption) {
    command.option('-v, --verbose', 'Show debug logs', false);
  }

  const hasEnvFileOption = command.options.some(
    (option) => option.long === '--env-file' || option.long === '--env-path',
  );
  if (!hasEnvFileOption) {
    command.option('--env-file, --env-path <path>', 'Path to .env file');
  }

  command.hook('preAction', (thisCommand) => {
    if (thisCommand.opts().verbose) {
      setLogLevel('debug');
      logger.debug('Verbose mode enabled via --verbose flag');
    }

    const envPath = thisCommand.opts().envFile || thisCommand.opts().envPath;
    if (envPath) {
      setupEnv(envPath);
      logger.debug(`Loading environment from ${envPath}`);
    }
  });

  command.commands.forEach((subCommand) => {
    addCommonOptionsRecursively(subCommand);
  });
}

/**
 * Check if we should run database migrations based on the command
 */
function shouldRunMigrations(args: string[]): boolean {
  if (args.length === 0) {
    return false;
  }
  
  // Check if it's a help command
  if (args.includes('--help') || args.includes('-h')) {
    return false;
  }
  
  // Get the main command
  const mainCommand = args[0];
  
  // Check if it's a subcommand that needs DB
  if (mainCommand === 'redteam' && args.length > 1) {
    const subCommand = args[1];
    return ['run', 'report'].includes(subCommand);
  }
  
  return COMMANDS_REQUIRING_DB.has(mainCommand);
}

/**
 * Check if we should check for updates based on the command
 */
function shouldCheckUpdates(args: string[]): boolean {
  if (args.length === 0) {
    return false;
  }
  
  // Never check for help commands
  if (args.includes('--help') || args.includes('-h')) {
    return false;
  }
  
  // Check if --skip-update-check flag is present
  if (args.includes('--skip-update-check')) {
    return false;
  }
  
  const mainCommand = args[0];
  return !COMMANDS_SKIP_UPDATE_CHECK.has(mainCommand);
}

async function main() {
  // Early exit for version and help - before any heavy operations
  const args = process.argv.slice(2);
  
  // Check for --version or -V
  if (args.includes('--version') || args.includes('-V')) {
    console.log(version);
    process.exit(0);
  }
  
  // Check for --help or -h (and no other arguments)
  if ((args.includes('--help') || args.includes('-h')) && args.length === 1) {
    // Print basic help without loading commander
    console.log(`promptfoo v${version} - LLM evaluation framework`);
    console.log('\nUsage: promptfoo [command] [options]');
    console.log('\nCommands:');
    console.log('  eval          Evaluate prompts and models');
    console.log('  init          Initialize a new promptfoo project');
    console.log('  view          Start the web UI');
    console.log('  cache         Manage cache');
    console.log('  config        Manage configuration');
    console.log('  list          List various resources');
    console.log('  show          Show details of a resource');
    console.log('  share         Create a shareable URL');
    console.log('  generate      Generate synthetic data');
    console.log('  redteam       Red team LLM applications');
    console.log('  export        Export an eval to JSON');
    console.log('  import        Import an eval from JSON');
    console.log('\nFor more help, run: promptfoo [command] --help');
    process.exit(0);
  }

  // Conditional update checking
  if (shouldCheckUpdates(args)) {
    // Fire and forget - don't block on update check
    checkForUpdates().catch(() => {
      // Silently ignore update check failures
    });
  }
  
  // Conditional database migrations
  if (shouldRunMigrations(args)) {
    await runDbMigrations();
  }

  const program = new Command('promptfoo');
  program
    .version(version)
    .showHelpAfterError()
    .showSuggestionAfterError()
    .option('--skip-update-check', 'Skip checking for updates')
    .on('option:*', function () {
      logger.error('Invalid option(s)');
      program.help();
      process.exitCode = 1;
    });

  // Main commands - use placeholders and load on demand
  program
    .command('eval')
    .description('Evaluate prompts')
    .allowUnknownOption()
    .action(async () => {
      const { loadDefaultConfig } = await import('./util/config/default');
      const { evalCommand } = await import('./commands/eval');
      const { defaultConfig, defaultConfigPath } = await loadDefaultConfig();
      
      evalCommand(program, defaultConfig, defaultConfigPath);
      // Clear the action to prevent double execution
      const evalCmd = program.commands.find(cmd => cmd.name() === 'eval');
      if (evalCmd) {
        evalCmd.action(() => {});
      }
      program.parse(process.argv);
    });
    
  program
    .command('init')
    .description('Initialize project with dummy files or download an example')
    .allowUnknownOption()
    .action(async () => {
      const { initCommand } = await import('./commands/init');
      initCommand(program);
      const initCmd = program.commands.find(cmd => cmd.name() === 'init');
      if (initCmd) {
        initCmd.action(() => {});
      }
      program.parse(process.argv);
    });
    
  program
    .command('view')
    .description('Start browser UI')
    .allowUnknownOption()
    .action(async () => {
      const { viewCommand } = await import('./commands/view');
      viewCommand(program);
      const viewCmd = program.commands.find(cmd => cmd.name() === 'view');
      if (viewCmd) {
        viewCmd.action(() => {});
      }
      program.parse(process.argv);
    });
  
  program
    .command('share')
    .description('Create a shareable URL')
    .allowUnknownOption()
    .action(async () => {
      const { shareCommand } = await import('./commands/share');
      shareCommand(program);
      const shareCmd = program.commands.find(cmd => cmd.name() === 'share');
      if (shareCmd) {
        shareCmd.action(() => {});
      }
      program.parse(process.argv);
    });

  // Alphabetical order
  program
    .command('auth')
    .description('Authenticate with Promptfoo')
    .allowUnknownOption()
    .action(async () => {
      const { authCommand } = await import('./commands/auth');
      authCommand(program);
      const authCmd = program.commands.find(cmd => cmd.name() === 'auth');
      if (authCmd) {
        authCmd.action(() => {});
      }
      program.parse(process.argv);
    });
    
  program
    .command('cache')
    .description('Manage cache')
    .allowUnknownOption()
    .action(async () => {
      const { cacheCommand } = await import('./commands/cache');
      cacheCommand(program);
      const cacheCmd = program.commands.find(cmd => cmd.name() === 'cache');
      if (cacheCmd) {
        cacheCmd.action(() => {});
      }
      program.parse(process.argv);
    });
    
  program
    .command('config')
    .description('Manage configuration')
    .allowUnknownOption()
    .action(async () => {
      const { configCommand } = await import('./commands/config');
      configCommand(program);
      const configCmd = program.commands.find(cmd => cmd.name() === 'config');
      if (configCmd) {
        configCmd.action(() => {});
      }
      program.parse(process.argv);
    });
    
  program
    .command('debug')
    .description('Display debug information')
    .allowUnknownOption()
    .action(async () => {
      const { loadDefaultConfig } = await import('./util/config/default');
      const { debugCommand } = await import('./commands/debug');
      const { defaultConfig, defaultConfigPath } = await loadDefaultConfig();
      debugCommand(program, defaultConfig, defaultConfigPath);
      const debugCmd = program.commands.find(cmd => cmd.name() === 'debug');
      if (debugCmd) {
        debugCmd.action(() => {});
      }
      program.parse(process.argv);
    });
    
  program
    .command('delete')
    .description('Delete various resources')
    .allowUnknownOption()
    .action(async () => {
      const { deleteCommand } = await import('./commands/delete');
      deleteCommand(program);
      const deleteCmd = program.commands.find(cmd => cmd.name() === 'delete');
      if (deleteCmd) {
        deleteCmd.action(() => {});
      }
      program.parse(process.argv);
    });
    
  program
    .command('export')
    .description('Export an eval record to a JSON file')
    .allowUnknownOption()
    .action(async () => {
      const { exportCommand } = await import('./commands/export');
      exportCommand(program);
      const exportCmd = program.commands.find(cmd => cmd.name() === 'export');
      if (exportCmd) {
        exportCmd.action(() => {});
      }
      program.parse(process.argv);
    });
    
  program
    .command('feedback')
    .description('Send feedback to the promptfoo developers')
    .allowUnknownOption()
    .action(async () => {
      const { feedbackCommand } = await import('./commands/feedback');
      feedbackCommand(program);
      const feedbackCmd = program.commands.find(cmd => cmd.name() === 'feedback');
      if (feedbackCmd) {
        feedbackCmd.action(() => {});
      }
      program.parse(process.argv);
    });
    
  program
    .command('import')
    .description('Import an eval record from a JSON file')
    .allowUnknownOption()
    .action(async () => {
      const { importCommand } = await import('./commands/import');
      importCommand(program);
      const importCmd = program.commands.find(cmd => cmd.name() === 'import');
      if (importCmd) {
        importCmd.action(() => {});
      }
      program.parse(process.argv);
    });
    
  program
    .command('list')
    .description('List various resources')
    .allowUnknownOption()
    .action(async () => {
      const { listCommand } = await import('./commands/list');
      listCommand(program);
      const listCmd = program.commands.find(cmd => cmd.name() === 'list');
      if (listCmd) {
        listCmd.action(() => {});
      }
      program.parse(process.argv);
    });
    
  program
    .command('scan-model')
    .description('Scan ML models for vulnerabilities')
    .allowUnknownOption()
    .action(async () => {
      const { modelScanCommand } = await import('./commands/modelScan');
      modelScanCommand(program);
      const modelScanCmd = program.commands.find(cmd => cmd.name() === 'scan-model');
      if (modelScanCmd) {
        modelScanCmd.action(() => {});
      }
      program.parse(process.argv);
    });
    
  program
    .command('validate')
    .description('Validate configuration')
    .allowUnknownOption()
    .action(async () => {
      const { loadDefaultConfig } = await import('./util/config/default');
      const { validateCommand } = await import('./commands/validate');
      const { defaultConfig, defaultConfigPath } = await loadDefaultConfig();
      validateCommand(program, defaultConfig, defaultConfigPath);
      const validateCmd = program.commands.find(cmd => cmd.name() === 'validate');
      if (validateCmd) {
        validateCmd.action(() => {});
      }
      program.parse(process.argv);
    });
    
  program
    .command('show')
    .description('Show details of a specific resource')
    .allowUnknownOption()
    .action(async () => {
      const { showCommand } = await import('./commands/show');
      showCommand(program);
      const showCmd = program.commands.find(cmd => cmd.name() === 'show');
      if (showCmd) {
        showCmd.action(() => {});
      }
      program.parse(process.argv);
    });

  // Generate and redteam need special handling
  const generateCommand = program.command('generate').description('Generate synthetic data');
  generateCommand.allowUnknownOption().action(async () => {
    const { loadDefaultConfig } = await import('./util/config/default');
    const [{ generateDatasetCommand }, { generateAssertionsCommand }, { redteamGenerateCommand }] = await Promise.all([
      import('./commands/generate/dataset'),
      import('./commands/generate/assertions'),
      import('./redteam/commands/generate'),
    ]);
    const { defaultConfig, defaultConfigPath } = await loadDefaultConfig();
    
    generateDatasetCommand(generateCommand, defaultConfig, defaultConfigPath);
    generateAssertionsCommand(generateCommand, defaultConfig, defaultConfigPath);
    redteamGenerateCommand(generateCommand, 'redteam', defaultConfig, defaultConfigPath);
    
    // Clear the parent action
    generateCommand.action(() => {});
    program.parse(process.argv);
  });

  const redteamBaseCommand = program.command('redteam').description('Red team LLM applications');
  redteamBaseCommand.allowUnknownOption().action(async () => {
    const { loadDefaultConfig } = await import('./util/config/default');
    
    // Load main config first
    const { defaultConfig, defaultConfigPath } = await loadDefaultConfig();
    
    // Load redteam config
    const { defaultConfig: redteamConfig, defaultConfigPath: redteamConfigPath } = 
      await loadDefaultConfig(undefined, 'redteam');
    
    // Load all redteam commands
    const [
      { initCommand: redteamInitCommand },
      { evalCommand },
      { discoverCommand: redteamDiscoverCommand },
      { redteamGenerateCommand },
      { redteamRunCommand },
      { redteamReportCommand },
      { redteamSetupCommand },
      { pluginsCommand: redteamPluginsCommand },
    ] = await Promise.all([
      import('./redteam/commands/init'),
      import('./commands/eval'),
      import('./redteam/commands/discover'),
      import('./redteam/commands/generate'),
      import('./redteam/commands/run'),
      import('./redteam/commands/report'),
      import('./redteam/commands/setup'),
      import('./redteam/commands/plugins'),
    ]);
    
    redteamInitCommand(redteamBaseCommand);
    evalCommand(
      redteamBaseCommand,
      redteamConfig ?? defaultConfig,
      redteamConfigPath ?? defaultConfigPath,
    );
    redteamDiscoverCommand(redteamBaseCommand, defaultConfig, defaultConfigPath);
    redteamGenerateCommand(redteamBaseCommand, 'generate', defaultConfig, defaultConfigPath);
    redteamRunCommand(redteamBaseCommand);
    redteamReportCommand(redteamBaseCommand);
    redteamSetupCommand(redteamBaseCommand);
    redteamPluginsCommand(redteamBaseCommand);
    
    // Clear the parent action
    redteamBaseCommand.action(() => {});
    program.parse(process.argv);
  });

  // Add common options to all commands recursively
  addCommonOptionsRecursively(program);

  program.parse();
}

if (require.main === module) {
  checkNodeVersion();
  main();
}
