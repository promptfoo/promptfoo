#!/usr/bin/env node
import { Command } from 'commander';
import { version } from '../package.json';
import { checkNodeVersion } from './checkNodeVersion';
import logger, { setLogLevel } from './logger';
import { setupEnv } from './util';

// Lazy load expensive operations
let dbMigrationsRun = false;
let updateCheckRun = false;

async function ensureDbMigrations() {
  if (!dbMigrationsRun) {
    const { runDbMigrations } = await import('./migrate');
    await runDbMigrations();
    dbMigrationsRun = true;
  }
}

async function ensureUpdateCheck() {
  if (!updateCheckRun) {
    const { checkForUpdates } = await import('./updates');
    await checkForUpdates();
    updateCheckRun = true;
  }
}

// Lazy load config only when needed
let defaultConfigCache: { defaultConfig: any; defaultConfigPath: string } | null = null;
async function getDefaultConfig(): Promise<{ defaultConfig: any; defaultConfigPath: string }> {
  if (!defaultConfigCache) {
    const { loadDefaultConfig } = await import('./util/config/default');
    const result = await loadDefaultConfig();
    // Ensure we have both properties
    if (!result.defaultConfigPath) {
      throw new Error('defaultConfigPath is required');
    }
    defaultConfigCache = {
      defaultConfig: result.defaultConfig,
      defaultConfigPath: result.defaultConfigPath
    };
  }
  return defaultConfigCache;
}

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

// Command loader functions - only load when needed
const commandLoaders: Record<string, (program: Command) => Promise<void>> = {
  eval: async (program: Command) => {
    await ensureUpdateCheck();
    await ensureDbMigrations();
    const { defaultConfig, defaultConfigPath } = await getDefaultConfig();
    const { evalCommand } = await import('./commands/eval');
    evalCommand(program, defaultConfig, defaultConfigPath);
  },
  init: async (program: Command) => {
    const { initCommand } = await import('./commands/init');
    initCommand(program);
  },
  view: async (program: Command) => {
    await ensureDbMigrations();
    const { viewCommand } = await import('./commands/view');
    viewCommand(program);
  },
  share: async (program: Command) => {
    await ensureDbMigrations();
    const { shareCommand } = await import('./commands/share');
    shareCommand(program);
  },
  auth: async (program: Command) => {
    const { authCommand } = await import('./commands/auth');
    authCommand(program);
  },
  cache: async (program: Command) => {
    const { cacheCommand } = await import('./commands/cache');
    cacheCommand(program);
  },
  config: async (program: Command) => {
    const { configCommand } = await import('./commands/config');
    configCommand(program);
  },
  debug: async (program: Command) => {
    const { defaultConfig, defaultConfigPath } = await getDefaultConfig();
    const { debugCommand } = await import('./commands/debug');
    debugCommand(program, defaultConfig, defaultConfigPath);
  },
  delete: async (program: Command) => {
    await ensureDbMigrations();
    const { deleteCommand } = await import('./commands/delete');
    deleteCommand(program);
  },
  export: async (program: Command) => {
    await ensureDbMigrations();
    const { exportCommand } = await import('./commands/export');
    exportCommand(program);
  },
  feedback: async (program: Command) => {
    const { feedbackCommand } = await import('./commands/feedback');
    feedbackCommand(program);
  },
  import: async (program: Command) => {
    await ensureDbMigrations();
    const { importCommand } = await import('./commands/import');
    importCommand(program);
  },
  list: async (program: Command) => {
    await ensureDbMigrations();
    const { listCommand } = await import('./commands/list');
    listCommand(program);
  },
  'model-scan': async (program: Command) => {
    const { modelScanCommand } = await import('./commands/modelScan');
    modelScanCommand(program);
  },
  validate: async (program: Command) => {
    const { defaultConfig, defaultConfigPath } = await getDefaultConfig();
    const { validateCommand } = await import('./commands/validate');
    validateCommand(program, defaultConfig, defaultConfigPath);
  },
  show: async (program: Command) => {
    await ensureDbMigrations();
    const { showCommand } = await import('./commands/show');
    showCommand(program);
  },
};

// Fallback function to load all commands (used for unknown commands)
async function loadAllCommands(program: Command) {
  await ensureUpdateCheck();
  await ensureDbMigrations();
  const { defaultConfig, defaultConfigPath } = await getDefaultConfig();
  
  // Import all commands
  const [
    { evalCommand },
    { initCommand },
    { viewCommand },
    { shareCommand },
    { authCommand },
    { cacheCommand },
    { configCommand },
    { debugCommand },
    { deleteCommand },
    { exportCommand },
    { feedbackCommand },
    { importCommand },
    { listCommand },
    { modelScanCommand },
    { validateCommand },
    { showCommand },
  ] = await Promise.all([
    import('./commands/eval'),
    import('./commands/init'),
    import('./commands/view'),
    import('./commands/share'),
    import('./commands/auth'),
    import('./commands/cache'),
    import('./commands/config'),
    import('./commands/debug'),
    import('./commands/delete'),
    import('./commands/export'),
    import('./commands/feedback'),
    import('./commands/import'),
    import('./commands/list'),
    import('./commands/modelScan'),
    import('./commands/validate'),
    import('./commands/show'),
  ]);
  
  // Register all commands
  evalCommand(program, defaultConfig, defaultConfigPath);
  initCommand(program);
  viewCommand(program);
  shareCommand(program);
  authCommand(program);
  cacheCommand(program);
  configCommand(program);
  debugCommand(program, defaultConfig, defaultConfigPath);
  deleteCommand(program);
  exportCommand(program);
  feedbackCommand(program);
  importCommand(program);
  listCommand(program);
  modelScanCommand(program);
  validateCommand(program, defaultConfig, defaultConfigPath);
  showCommand(program);
  
  // Handle generate and redteam commands
  const generateCommand = program.command('generate').description('Generate synthetic data');
  const redteamBaseCommand = program.command('redteam').description('Red team LLM applications');
  
  const [
    { generateDatasetCommand },
    { generateAssertionsCommand },
    { redteamGenerateCommand },
    { initCommand: redteamInitCommand },
    { discoverCommand: redteamDiscoverCommand },
    { redteamRunCommand },
    { redteamReportCommand },
    { redteamSetupCommand },
    { pluginsCommand: redteamPluginsCommand },
  ] = await Promise.all([
    import('./commands/generate/dataset'),
    import('./commands/generate/assertions'),
    import('./redteam/commands/generate'),
    import('./redteam/commands/init'),
    import('./redteam/commands/discover'),
    import('./redteam/commands/run'),
    import('./redteam/commands/report'),
    import('./redteam/commands/setup'),
    import('./redteam/commands/plugins'),
  ]);
  
  generateDatasetCommand(generateCommand, defaultConfig, defaultConfigPath);
  generateAssertionsCommand(generateCommand, defaultConfig, defaultConfigPath);
  redteamGenerateCommand(generateCommand, 'redteam', defaultConfig, defaultConfigPath);
  
  const { loadDefaultConfig } = await import('./util/config/default');
  const { defaultConfig: redteamConfig, defaultConfigPath: redteamConfigPath } = 
    await loadDefaultConfig(undefined, 'redteam');
  
  redteamInitCommand(redteamBaseCommand);
  evalCommand(redteamBaseCommand, redteamConfig ?? defaultConfig, redteamConfigPath ?? defaultConfigPath);
  redteamDiscoverCommand(redteamBaseCommand, defaultConfig, defaultConfigPath);
  redteamGenerateCommand(redteamBaseCommand, 'generate', defaultConfig, defaultConfigPath);
  redteamRunCommand(redteamBaseCommand);
  redteamReportCommand(redteamBaseCommand);
  redteamSetupCommand(redteamBaseCommand);
  redteamPluginsCommand(redteamBaseCommand);
}

async function main() {
  // Skip expensive operations for help/version commands
  const args = process.argv.slice(2);
  const isHelpOrVersion = args.includes('--help') || args.includes('-h') || 
                         args.includes('--version') || args.includes('-V') ||
                         args.length === 0;

  const program = new Command('promptfoo');
  program
    .version(version)
    .showHelpAfterError()
    .showSuggestionAfterError()
    .on('option:*', function () {
      logger.error('Invalid option(s)');
      program.help();
      process.exitCode = 1;
    });

  // For simple help/version, skip all command registration
  if (isHelpOrVersion) {
    // Register command stubs for help display
    program.command('eval').description('Evaluate prompts and models');
    program.command('init').description('Initialize a new promptfoo project');
    program.command('view').description('View evaluation results');
    program.command('redteam').description('Red team LLM applications');
    program.command('share').description('Share evaluation results');
    program.command('auth').description('Authenticate with promptfoo');
    program.command('cache').description('Manage cache');
    program.command('config').description('Manage configuration');
    program.command('debug').description('Debug promptfoo');
    program.command('delete').description('Delete resources');
    program.command('export').description('Export evaluation results');
    program.command('generate').description('Generate synthetic data');
    program.command('feedback').description('Provide feedback');
    program.command('import').description('Import data');
    program.command('list').description('List resources');
    program.command('model-scan').description('Scan models');
    program.command('validate').description('Validate configuration');
    program.command('show').description('Show resources');
    
    addCommonOptionsRecursively(program);
    program.parse();
    return;
  }

  // For actual command execution, load only what's needed
  const commandName = args[0];
  
  // Main commands - load on demand
  if (commandName === 'eval') {
    await commandLoaders.eval(program);
  } else if (commandName === 'init') {
    await commandLoaders.init(program);
  } else if (commandName === 'view') {
    await commandLoaders.view(program);
  } else if (commandName === 'share') {
    await commandLoaders.share(program);
  } else if (commandName === 'redteam') {
    // Handle redteam commands specially
    const redteamBaseCommand = program.command('redteam').description('Red team LLM applications');
    
    // Lazy load redteam subcommands based on args[1]
    const redteamSubcommand = args[1];
    if (redteamSubcommand) {
      await ensureUpdateCheck();
      await ensureDbMigrations();
      
      if (redteamSubcommand === 'init') {
        const { initCommand: redteamInitCommand } = await import('./redteam/commands/init');
        redteamInitCommand(redteamBaseCommand);
      } else if (redteamSubcommand === 'eval') {
        const { loadDefaultConfig } = await import('./util/config/default');
        const { defaultConfig: redteamConfig, defaultConfigPath: redteamConfigPath } = 
          await loadDefaultConfig(undefined, 'redteam');
        const { evalCommand } = await import('./commands/eval');
        evalCommand(redteamBaseCommand, redteamConfig, redteamConfigPath);
      } else if (redteamSubcommand === 'discover') {
        const { defaultConfig, defaultConfigPath } = await getDefaultConfig();
        const { discoverCommand: redteamDiscoverCommand } = await import('./redteam/commands/discover');
        redteamDiscoverCommand(redteamBaseCommand, defaultConfig, defaultConfigPath);
      } else if (redteamSubcommand === 'generate') {
        const { defaultConfig, defaultConfigPath } = await getDefaultConfig();
        const { redteamGenerateCommand } = await import('./redteam/commands/generate');
        redteamGenerateCommand(redteamBaseCommand, 'generate', defaultConfig, defaultConfigPath);
      } else if (redteamSubcommand === 'run') {
        const { redteamRunCommand } = await import('./redteam/commands/run');
        redteamRunCommand(redteamBaseCommand);
      } else if (redteamSubcommand === 'report') {
        const { redteamReportCommand } = await import('./redteam/commands/report');
        redteamReportCommand(redteamBaseCommand);
      } else if (redteamSubcommand === 'setup') {
        const { redteamSetupCommand } = await import('./redteam/commands/setup');
        redteamSetupCommand(redteamBaseCommand);
      } else if (redteamSubcommand === 'plugins') {
        const { pluginsCommand: redteamPluginsCommand } = await import('./redteam/commands/plugins');
        redteamPluginsCommand(redteamBaseCommand);
      }
    }
  } else if (commandName === 'generate') {
    const generateCommand = program.command('generate').description('Generate synthetic data');
    const generateSubcommand = args[1];
    
    if (generateSubcommand) {
      await ensureUpdateCheck();
      await ensureDbMigrations();
      const { defaultConfig, defaultConfigPath } = await getDefaultConfig();
      
      if (generateSubcommand === 'dataset') {
        const { generateDatasetCommand } = await import('./commands/generate/dataset');
        generateDatasetCommand(generateCommand, defaultConfig, defaultConfigPath);
      } else if (generateSubcommand === 'assertions') {
        const { generateAssertionsCommand } = await import('./commands/generate/assertions');
        generateAssertionsCommand(generateCommand, defaultConfig, defaultConfigPath);
      } else if (generateSubcommand === 'redteam') {
        const { redteamGenerateCommand } = await import('./redteam/commands/generate');
        redteamGenerateCommand(generateCommand, 'redteam', defaultConfig, defaultConfigPath);
      }
    }
  } else {
    // Load other commands on demand
    if (commandLoaders[commandName]) {
      await commandLoaders[commandName](program);
    } else {
      // For unknown commands, load all commands (fallback)
      await loadAllCommands(program);
    }
  }

  // Add common options to all commands recursively
  addCommonOptionsRecursively(program);

  program.parse();
}

if (require.main === module) {
  checkNodeVersion();
  main();
}
