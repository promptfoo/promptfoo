import { Command } from 'commander';
import cliState from '../src/cliState';
import { authCommand } from '../src/commands/auth';
import { cacheCommand } from '../src/commands/cache';
import { configCommand } from '../src/commands/config';
import { debugCommand } from '../src/commands/debug';
import { deleteCommand } from '../src/commands/delete';
import { evalCommand } from '../src/commands/eval';
import { exportCommand } from '../src/commands/export';
import { feedbackCommand } from '../src/commands/feedback';
import { generateDatasetCommand } from '../src/commands/generate/dataset';
import { importCommand } from '../src/commands/import';
import { initCommand } from '../src/commands/init';
import { listCommand } from '../src/commands/list';
import { shareCommand } from '../src/commands/share';
import { showCommand } from '../src/commands/show';
import { viewCommand } from '../src/commands/view';
import { redteamGenerateCommand } from '../src/redteam/commands/generate';
import { initCommand as redteamInitCommand } from '../src/redteam/commands/init';
import { pluginsCommand as redteamPluginsCommand } from '../src/redteam/commands/plugins';
import { redteamReportCommand } from '../src/redteam/commands/report';
import { redteamRunCommand } from '../src/redteam/commands/run';
import { redteamSetupCommand } from '../src/redteam/commands/setup';

jest.mock('../src/updates', () => ({
  checkForUpdates: jest.fn().mockResolvedValue(true),
}));

jest.mock('../src/migrate', () => ({
  runDbMigrations: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../src/util/config/default', () => ({
  loadDefaultConfig: jest.fn().mockResolvedValue({
    defaultConfig: {},
    defaultConfigPath: undefined,
  }),
}));

jest.mock('../src/commands/auth', () => ({
  authCommand: jest.fn(),
}));

jest.mock('../src/commands/cache', () => ({
  cacheCommand: jest.fn(),
}));

jest.mock('../src/commands/config', () => ({
  configCommand: jest.fn(),
}));

jest.mock('../src/commands/debug', () => ({
  debugCommand: jest.fn(),
}));

jest.mock('../src/commands/delete', () => ({
  deleteCommand: jest.fn(),
}));

jest.mock('../src/commands/eval', () => ({
  evalCommand: jest.fn(),
}));

jest.mock('../src/commands/export', () => ({
  exportCommand: jest.fn(),
}));

jest.mock('../src/commands/feedback', () => ({
  feedbackCommand: jest.fn(),
}));

jest.mock('../src/commands/generate/dataset', () => ({
  generateDatasetCommand: jest.fn(),
}));

jest.mock('../src/commands/import', () => ({
  importCommand: jest.fn(),
}));

jest.mock('../src/commands/init', () => ({
  initCommand: jest.fn(),
}));

jest.mock('../src/commands/list', () => ({
  listCommand: jest.fn(),
}));

jest.mock('../src/commands/share', () => ({
  shareCommand: jest.fn(),
}));

jest.mock('../src/commands/show', () => ({
  showCommand: jest.fn(),
}));

jest.mock('../src/commands/view', () => ({
  viewCommand: jest.fn(),
}));

jest.mock('../src/redteam/commands/generate', () => ({
  redteamGenerateCommand: jest.fn(),
}));

jest.mock('../src/redteam/commands/init', () => ({
  initCommand: jest.fn(),
}));

jest.mock('../src/redteam/commands/plugins', () => ({
  pluginsCommand: jest.fn(),
}));

jest.mock('../src/redteam/commands/report', () => ({
  redteamReportCommand: jest.fn(),
}));

jest.mock('../src/redteam/commands/run', () => ({
  redteamRunCommand: jest.fn(),
}));

jest.mock('../src/redteam/commands/setup', () => ({
  redteamSetupCommand: jest.fn(),
}));

describe('main', () => {
  let program: Command;
  let redteamCommand: Command;

  beforeEach(() => {
    program = new Command();
    redteamCommand = new Command('redteam');

    jest.spyOn(program, 'version').mockReturnThis();
    jest.spyOn(program, 'showHelpAfterError').mockReturnThis();
    jest.spyOn(program, 'showSuggestionAfterError').mockReturnThis();
    jest.spyOn(program, 'on').mockReturnThis();
    jest.spyOn(program, 'command').mockReturnValue(redteamCommand);
    jest.spyOn(program, 'parse').mockReturnThis();

    jest.spyOn(redteamCommand, 'description').mockReturnThis();
    jest.spyOn(redteamCommand, 'hook').mockReturnThis();
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  it('should set up redteam command with preAction hook', () => {
    const preActionHook = (command: Command) => {
      cliState.isRedteam = true;
    };

    redteamCommand.hook('preAction', preActionHook);
    preActionHook(redteamCommand);

    expect(cliState.isRedteam).toBe(true);
    expect(redteamCommand.hook).toHaveBeenCalledWith('preAction', expect.any(Function));
  });

  it('should register all commands', () => {
    const redteamBaseCommand = program.command('redteam');

    evalCommand(program, {}, undefined);
    initCommand(program);
    viewCommand(program);
    shareCommand(program);
    authCommand(program);
    cacheCommand(program);
    configCommand(program);
    debugCommand(program, {}, undefined);
    deleteCommand(program);
    exportCommand(program);
    feedbackCommand(program);
    generateDatasetCommand(redteamBaseCommand, {}, undefined);
    importCommand(program);
    listCommand(program);
    showCommand(program);

    expect(evalCommand).toHaveBeenCalledWith(program, {}, undefined);
    expect(initCommand).toHaveBeenCalledWith(program);
    expect(viewCommand).toHaveBeenCalledWith(program);
    expect(shareCommand).toHaveBeenCalledWith(program);
    expect(authCommand).toHaveBeenCalledWith(program);
    expect(cacheCommand).toHaveBeenCalledWith(program);
    expect(configCommand).toHaveBeenCalledWith(program);
    expect(debugCommand).toHaveBeenCalledWith(program, {}, undefined);
    expect(deleteCommand).toHaveBeenCalledWith(program);
    expect(exportCommand).toHaveBeenCalledWith(program);
    expect(feedbackCommand).toHaveBeenCalledWith(program);
    expect(generateDatasetCommand).toHaveBeenCalledWith(redteamBaseCommand, {}, undefined);
    expect(importCommand).toHaveBeenCalledWith(program);
    expect(listCommand).toHaveBeenCalledWith(program);
    expect(showCommand).toHaveBeenCalledWith(program);
  });

  it('should register all redteam commands', () => {
    const redteamBaseCommand = program.command('redteam');

    redteamInitCommand(redteamBaseCommand);
    redteamGenerateCommand(redteamBaseCommand, 'redteam', {}, undefined);
    redteamRunCommand(redteamBaseCommand);
    redteamReportCommand(redteamBaseCommand);
    redteamSetupCommand(redteamBaseCommand);
    redteamPluginsCommand(redteamBaseCommand);

    expect(redteamInitCommand).toHaveBeenCalledWith(redteamBaseCommand);
    expect(redteamGenerateCommand).toHaveBeenCalledWith(
      redteamBaseCommand,
      'redteam',
      {},
      undefined,
    );
    expect(redteamRunCommand).toHaveBeenCalledWith(redteamBaseCommand);
    expect(redteamReportCommand).toHaveBeenCalledWith(redteamBaseCommand);
    expect(redteamSetupCommand).toHaveBeenCalledWith(redteamBaseCommand);
    expect(redteamPluginsCommand).toHaveBeenCalledWith(redteamBaseCommand);
  });
});
