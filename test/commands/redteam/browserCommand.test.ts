import { Command } from 'commander';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { redteamReportCommand } from '../../../src/commands/redteam/report';
import { redteamSetupCommand } from '../../../src/commands/redteam/setup';
import { getDefaultPort } from '../../../src/constants';
import logger from '../../../src/logger';
import { startServer } from '../../../src/server/server';
import telemetry from '../../../src/telemetry';
import { setConfigDirectoryPath } from '../../../src/util/config/manage';
import { setupEnv } from '../../../src/util/index';
import { BrowserBehavior, checkServerRunning, openBrowser } from '../../../src/util/server';

vi.mock('../../../src/logger', () => ({
  default: { warn: vi.fn() },
}));
vi.mock('../../../src/server/server', () => ({
  startServer: vi.fn(),
}));
vi.mock('../../../src/telemetry', () => ({
  default: { record: vi.fn() },
}));
vi.mock('../../../src/util/config/manage', () => ({
  setConfigDirectoryPath: vi.fn(),
}));
vi.mock('../../../src/util/index', () => ({
  setupEnv: vi.fn(),
}));
vi.mock('../../../src/util/server', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../src/util/server')>()),
  checkServerRunning: vi.fn(),
  openBrowser: vi.fn(),
}));

const deprecatedFilterWarning =
  'The --filter-description option is deprecated and not longer supported. The argument will be ignored.';

const commandCases = [
  {
    commandName: 'report',
    commandSignature: 'report [directory]',
    argumentName: 'directory',
    description: 'Start browser UI and open to report',
    telemetryEvent: 'redteam report',
    browserBehavior: BrowserBehavior.OPEN_TO_REPORT,
    register: redteamReportCommand,
  },
  {
    commandName: 'setup',
    commandSignature: 'setup [configDirectory]',
    argumentName: 'configDirectory',
    description: 'Start browser UI and open to redteam setup',
    telemetryEvent: 'redteam setup',
    browserBehavior: BrowserBehavior.OPEN_TO_REDTEAM_CREATE,
    register: redteamSetupCommand,
  },
] as const;

type OrderedMock = {
  mock: {
    invocationCallOrder: number[];
  };
};

function expectCallOrder(...mocks: OrderedMock[]) {
  const invocationOrder = mocks.map((mock) => mock.mock.invocationCallOrder[0]);
  expect(invocationOrder).not.toContain(undefined);
  expect(invocationOrder).toEqual(
    [...invocationOrder].sort((left, right) => (left ?? 0) - (right ?? 0)),
  );
}

function createProgram(commandCase: (typeof commandCases)[number]) {
  const program = new Command();
  commandCase.register(program);
  return program;
}

async function runCommand(commandCase: (typeof commandCases)[number], args: string[] = []) {
  const program = createProgram(commandCase);
  await program.parseAsync(['node', 'test', commandCase.commandName, ...args]);
}

describe('redteam browser commands', () => {
  afterEach(() => {
    vi.resetAllMocks();
  });

  it.each(
    commandCases,
  )('registers $commandSignature with exact arguments and options', (commandCase) => {
    const program = createProgram(commandCase);

    expect(program.commands).toHaveLength(1);
    const command = program.commands[0];
    expect(command.name()).toBe(commandCase.commandName);
    expect(command.usage()).toBe(`[options] [${commandCase.argumentName}]`);
    expect(command.description()).toBe(commandCase.description);
    expect(
      command.registeredArguments.map((argument) => ({
        name: argument.name(),
        required: argument.required,
        variadic: argument.variadic,
      })),
    ).toEqual([
      {
        name: commandCase.argumentName,
        required: false,
        variadic: false,
      },
    ]);
    expect(
      command.options.map((option) => ({
        flags: option.flags,
        short: option.short,
        long: option.long,
        description: option.description,
        defaultValue: option.defaultValue,
        attributeName: option.attributeName(),
      })),
    ).toEqual([
      {
        flags: '-p, --port <number>',
        short: '-p',
        long: '--port',
        description: 'Port number',
        defaultValue: getDefaultPort().toString(),
        attributeName: 'port',
      },
      {
        flags: '--filter-description <pattern>',
        short: undefined,
        long: '--filter-description',
        description: 'Filter evals by description using a regex pattern',
        defaultValue: undefined,
        attributeName: 'filterDescription',
      },
      {
        flags: '--env-file, --env-path <path>',
        short: '--env-file',
        long: '--env-path',
        description: 'Path to .env file',
        defaultValue: undefined,
        attributeName: 'envPath',
      },
    ]);
    expect(command.opts()).toEqual({
      port: getDefaultPort().toString(),
      filterDescription: undefined,
      envPath: undefined,
    });
  });

  it.each(
    commandCases,
  )('runs $commandName in order and starts its destination with a string port', async (commandCase) => {
    vi.mocked(checkServerRunning).mockResolvedValue(false);

    await runCommand(commandCase, [
      'project-dir',
      '--port',
      '3017',
      '--filter-description',
      'legacy.*',
      '--env-file',
      '.env.test',
    ]);

    expect(setupEnv).toHaveBeenCalledExactlyOnceWith('.env.test');
    expect(telemetry.record).toHaveBeenCalledExactlyOnceWith(commandCase.telemetryEvent, {});
    expect(setConfigDirectoryPath).toHaveBeenCalledExactlyOnceWith('project-dir');
    expect(logger.warn).toHaveBeenCalledExactlyOnceWith(deprecatedFilterWarning);
    expect(checkServerRunning).toHaveBeenCalledExactlyOnceWith();
    expect(startServer).toHaveBeenCalledExactlyOnceWith('3017', commandCase.browserBehavior);
    expect(openBrowser).not.toHaveBeenCalled();
    expectCallOrder(
      vi.mocked(setupEnv),
      vi.mocked(telemetry.record),
      vi.mocked(setConfigDirectoryPath),
      vi.mocked(logger.warn),
      vi.mocked(checkServerRunning),
      vi.mocked(startServer),
    );
  });

  it.each(
    commandCases,
  )('opens the $commandName destination when the server is already running', async (commandCase) => {
    vi.mocked(checkServerRunning).mockResolvedValue(true);

    await runCommand(commandCase);

    expect(setupEnv).toHaveBeenCalledExactlyOnceWith(undefined);
    expect(telemetry.record).toHaveBeenCalledExactlyOnceWith(commandCase.telemetryEvent, {});
    expect(setConfigDirectoryPath).not.toHaveBeenCalled();
    expect(logger.warn).not.toHaveBeenCalled();
    expect(checkServerRunning).toHaveBeenCalledExactlyOnceWith();
    expect(openBrowser).toHaveBeenCalledExactlyOnceWith(commandCase.browserBehavior);
    expect(startServer).not.toHaveBeenCalled();
    expectCallOrder(
      vi.mocked(setupEnv),
      vi.mocked(telemetry.record),
      vi.mocked(checkServerRunning),
      vi.mocked(openBrowser),
    );
  });
});
