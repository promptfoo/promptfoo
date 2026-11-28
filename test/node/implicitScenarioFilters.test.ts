import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import cliState from '../../src/cliState';
import { evaluate } from '../../src/evaluator';
import { runDbMigrations } from '../../src/migrate';
import Eval from '../../src/models/eval';
import { resolveConfigs } from '../../src/util/config/load';

import type { CommandLineOptions, Scenario, UnifiedConfig } from '../../src/types/index';

vi.mock('../../src/logger');
vi.mock('../../src/telemetry', () => ({
  default: { record: vi.fn(), send: vi.fn(), recordAndSendOnce: vi.fn() },
}));

describe('implicit scenario tests in legacy and programmatic configurations', () => {
  let originalState: Pick<typeof cliState, 'config' | 'basePath' | 'selectedProviderConfigs'>;

  beforeAll(async () => {
    await runDbMigrations();
  });

  beforeEach(() => {
    originalState = {
      config: cliState.config,
      basePath: cliState.basePath,
      selectedProviderConfigs: cliState.selectedProviderConfigs,
    };
  });

  afterEach(() => {
    Object.assign(cliState, originalState);
    vi.resetAllMocks();
  });

  function configuration(commandLineOptions: Partial<CommandLineOptions>, tests?: []) {
    return {
      prompts: ['{{prefix}} {{name}}'],
      providers: ['echo'],
      defaultTest: { vars: { prefix: 'Hello' } },
      scenarios: [
        {
          config: [{ vars: { name: 'Ada' } }, { vars: { name: 'Bea' } }],
          ...(tests === undefined ? {} : { tests }),
        } as Scenario,
      ],
      commandLineOptions,
    } satisfies Partial<UnifiedConfig>;
  }

  it.each([{}, { filterFirstN: 1 }])(
    'evaluates one implicit test per scenario config with %j and preserves replay',
    async (configured) => {
      const authored = configuration(configured);
      const resolved = await resolveConfigs({}, authored, 'Evaluation');
      const record = await Eval.create(resolved.config, resolved.testSuite.prompts);

      await evaluate(resolved.testSuite, record, { cache: false, showProgressBar: false });

      expect(
        (await record.toEvaluateSummary()).results.map((result) => result.response?.output),
      ).toEqual(['Hello Ada', 'Hello Bea']);
      expect(resolved.config.scenarios).toMatchObject([{ tests: [expect.any(Object)] }]);
      expect(authored.scenarios[0]).not.toHaveProperty('tests');

      const replay = await resolveConfigs({}, resolved.config);
      const replayRecord = await Eval.create(replay.config, replay.testSuite.prompts);
      await evaluate(replay.testSuite, replayRecord, { cache: false, showProgressBar: false });
      expect(
        (await replayRecord.toEvaluateSummary()).results.map((result) => result.response?.output),
      ).toEqual(['Hello Ada', 'Hello Bea']);
    },
  );

  it('keeps an explicitly empty scenario test list empty', async () => {
    const resolved = await resolveConfigs({}, configuration({ filterFirstN: 1 }, []), 'Evaluation');
    const record = await Eval.create(resolved.config, resolved.testSuite.prompts);
    await evaluate(resolved.testSuite, record, { cache: false, showProgressBar: false });
    expect((await record.toEvaluateSummary()).results).toEqual([]);
    expect(resolved.config.scenarios).toMatchObject([{ tests: [] }]);
  });

  it('lets a nonmatching pattern remove the implicit scenario test', async () => {
    const resolved = await resolveConfigs(
      {},
      configuration({ filterPattern: '^missing$' }),
      'Evaluation',
    );
    const record = await Eval.create(resolved.config, resolved.testSuite.prompts);
    await evaluate(resolved.testSuite, record, { cache: false, showProgressBar: false });
    expect((await record.toEvaluateSummary()).results).toEqual([]);
    expect(resolved.config.scenarios).toMatchObject([{ tests: [] }]);
  });
});
