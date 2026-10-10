import fs from 'node:fs';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import cliState from '../../src/cliState';
import { getGradingProvider } from '../../src/matchers/providers';
import { createTempDir, mockProcessEnv, removeTempDir } from '../util/utils';

import type { OpenAiGenericProvider } from '../../src/providers/openai/index';
import type { EnvOverrides, GradingConfig, ProviderType } from '../../src/types/index';

describe('grading provider file environment precedence', () => {
  let directory: string;
  let restoreEnv: () => void;
  const fileProvider = 'file://grader.yaml';
  const evaluationEnv = {
    OPENAI_API_KEY: 'evaluation-fixture-key',
    OPENAI_API_BASE_URL: 'https://evaluation.fixture.test/v1',
  };

  beforeEach(() => {
    restoreEnv = mockProcessEnv({}, { clear: true });
    directory = createTempDir('promptfoo-grader-env-');
    fs.writeFileSync(
      path.join(directory, 'grader.yaml'),
      [
        'id: openai:embedding:text-embedding-3-small',
        'env:',
        '  OPENAI_API_KEY: file-fixture-key',
        '  OPENAI_API_BASE_URL: https://file.fixture.test/v1',
        '',
      ].join('\n'),
    );
  });

  afterEach(() => {
    restoreEnv();
    removeTempDir(directory);
  });

  function loadFallback(
    type: ProviderType,
    provider: GradingConfig['provider'],
    root: boolean,
    env: EnvOverrides = evaluationEnv,
  ) {
    return cliState.withBasePath(directory, () =>
      cliState.withConfig(
        { env, defaultTest: root ? { provider } : { options: { provider } } },
        () => getGradingProvider(type, undefined, null),
      ),
    );
  }

  it.each(
    (['embedding', 'classification'] as const).flatMap((type) =>
      [false, true].flatMap((root) => [false, true].map((object) => ({ type, root, object }))),
    ),
  )(
    'keeps evaluation overrides for $type maps (root=$root, object=$object)',
    async ({ type, root, object }) => {
      const provider = (await loadFallback(
        type,
        { [type]: object ? { id: fileProvider } : fileProvider },
        root,
      )) as OpenAiGenericProvider;
      expect(provider.getApiKey()).toBe(evaluationEnv.OPENAI_API_KEY);
      expect(provider.getApiUrl()).toBe(evaluationEnv.OPENAI_API_BASE_URL);
    },
  );

  it.each([false, true])(
    'keeps typed environment precedence for root text maps (object=%s)',
    async (object) => {
      const provider = (await loadFallback(
        'text',
        { text: object ? { id: fileProvider } : fileProvider },
        true,
      )) as OpenAiGenericProvider;
      expect(provider.getApiKey()).toBe(evaluationEnv.OPENAI_API_KEY);
      expect(provider.getApiUrl()).toBe(evaluationEnv.OPENAI_API_BASE_URL);
    },
  );

  it.each([false, true])(
    'preserves the special options.provider.text file precedence (object=%s)',
    async (object) => {
      const provider = (await loadFallback(
        'text',
        { text: object ? { id: fileProvider } : fileProvider },
        false,
      )) as OpenAiGenericProvider;
      expect(provider.getApiKey()).toBe('file-fixture-key');
      expect(provider.getApiUrl()).toBe('https://file.fixture.test/v1');
    },
  );

  it.each([false, true])('preserves bare-string file precedence (root=%s)', async (root) => {
    const provider = (await loadFallback('embedding', fileProvider, root)) as OpenAiGenericProvider;
    expect(provider.getApiKey()).toBe('file-fixture-key');
    expect(provider.getApiUrl()).toBe('https://file.fixture.test/v1');
  });

  it('reads each evaluation environment without retaining it in a reused modality map', async () => {
    const providerMap = Object.freeze({
      text: 'promptfoo:simulated-voice-user',
      embedding: fileProvider,
    });
    const first = (await loadFallback('embedding', providerMap, false)) as OpenAiGenericProvider;
    const second = (await loadFallback('embedding', providerMap, false, {
      OPENAI_API_KEY: 'second-evaluation-key',
      OPENAI_API_BASE_URL: 'https://second.fixture.test/v1',
    })) as OpenAiGenericProvider;
    const withoutOverrides = (await loadFallback(
      'embedding',
      providerMap,
      false,
      {},
    )) as OpenAiGenericProvider;

    expect(first.getApiKey()).toBe('evaluation-fixture-key');
    expect(first.getApiUrl()).toBe('https://evaluation.fixture.test/v1');
    expect(second.getApiKey()).toBe('second-evaluation-key');
    expect(second.getApiUrl()).toBe('https://second.fixture.test/v1');
    expect(withoutOverrides.getApiKey()).toBe('file-fixture-key');
    expect(withoutOverrides.getApiUrl()).toBe('https://file.fixture.test/v1');
    expect(await loadFallback('text', providerMap, false)).toBeNull();
    expect(await loadFallback('moderation', providerMap, false)).toBeNull();
    expect(providerMap).toEqual({
      text: 'promptfoo:simulated-voice-user',
      embedding: fileProvider,
    });
  });
});
