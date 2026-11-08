/// <reference types="@vitest/browser/matchers" />

import { useState } from 'react';
import { flushSync } from 'react-dom';
import { createRoot, type Root } from 'react-dom/client';

import { TooltipProvider } from '@app/components/ui/tooltip';
import { afterEach, expect, it, vi } from 'vitest';
import { page, userEvent } from 'vitest/browser';
import { DEFAULT_BEDROCK_TARGET_ID } from '../constants';
import ProviderConfigEditor from './ProviderConfigEditor';

import type { ProviderOptions } from '../../types';

// Keep the parent editor's config updates real while isolating application services.
vi.mock('../../hooks/useRedTeamConfig', () => ({
  useRedTeamConfig: () => ({ config: {}, updateConfig: vi.fn() }),
}));
vi.mock('../../hooks/useRedTeamTargetConfigValidation', () => ({
  useRedTeamTargetConfigValidation: () => ({
    targetConfigError: null,
    targetConfigDraft: null,
    clearTargetConfigValidation: vi.fn(),
  }),
}));
vi.mock('@app/utils/api', () => ({
  callApi: vi.fn(() => {
    throw new Error('Unexpected app API request in provider editor test');
  }),
  getApiBaseUrl: () => '',
  fetchUserEmail: vi.fn(),
  fetchUserId: vi.fn(),
  updateEvalAuthor: vi.fn(),
}));
vi.mock('@app/hooks/useTelemetry', () => ({
  useTelemetry: () => ({ recordEvent: vi.fn() }),
}));
vi.mock('@app/stores/userStore', () => ({
  useUserStore: () => ({ email: null, isLoading: false, fetchEmail: vi.fn(), setEmail: vi.fn() }),
}));

let root: Root | undefined;
let container: HTMLDivElement | undefined;

function Editor({ initial }: { initial: ProviderOptions }) {
  const [target, setTarget] = useState(initial);
  return (
    <TooltipProvider>
      <ProviderConfigEditor provider={target} setProvider={setTarget} providerType="bedrock" />
      <output data-testid="saved-target">{JSON.stringify(target)}</output>
    </TooltipProvider>
  );
}

function renderEditor(initial: ProviderOptions) {
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  flushSync(() => root?.render(<Editor initial={initial} />));
}

afterEach(() => {
  flushSync(() => root?.unmount());
  container?.remove();
  root = undefined;
  container = undefined;
});

it('starts a new Bedrock target on Responses with the OpenAI Models label', async () => {
  renderEditor({ id: DEFAULT_BEDROCK_TARGET_ID, config: {} });
  await expect
    .element(page.getByLabelText('Bedrock API', { exact: false }))
    .toHaveValue('responses');
  await expect
    .element(page.getByRole('option', { name: 'Responses API (OpenAI Models)', exact: true }))
    .toBeEnabled();
  await expect
    .element(page.getByLabelText('Model ID', { exact: false }))
    .toHaveValue('openai.gpt-5.6-sol');
  await expect.element(page.getByRole('alert')).not.toBeInTheDocument();
  await page.getByRole('button', { name: /Advanced Configuration/ }).click();
  await expect.element(page.getByLabelText('Max Output Tokens')).toBeVisible();
});

it('groups authentication under Bedrock Settings and persists only the selected credentials', async () => {
  renderEditor({
    id: 'bedrock:responses:openai.gpt-5.6-sol',
    config: { region: 'us-east-2', apiKey: 'old-token' },
  });
  await expect.element(page.getByLabelText('Bedrock Bearer Token')).toHaveValue('old-token');
  const auth = page.getByLabelText('Authentication', { exact: true });
  await auth.selectOptions('keys');
  await page.getByLabelText('AWS Access Key ID').fill('test-access');
  await page.getByLabelText('AWS Secret Access Key').fill('test-secret');
  await page.getByLabelText('AWS Session Token (optional)').fill('test-session');
  await expect.element(page.getByRole('alert')).not.toBeInTheDocument();
  await expect.element(page.getByTestId('saved-target')).toHaveTextContent(
    JSON.stringify({
      id: 'bedrock:responses:openai.gpt-5.6-sol',
      config: {
        region: 'us-east-2',
        accessKeyId: 'test-access',
        secretAccessKey: 'test-secret',
        sessionToken: 'test-session',
      },
    }),
  );
  await page.getByLabelText('Bedrock API', { exact: false }).selectOptions('chat');
  await expect.element(auth).toHaveValue('keys');
  await auth.selectOptions('profile');
  await page.getByLabelText('AWS Profile').fill('work');
  await expect.element(page.getByTestId('saved-target')).toHaveTextContent(
    JSON.stringify({
      id: 'bedrock:mantle:openai.gpt-5.6-sol',
      config: { region: 'us-east-2', profile: 'work' },
    }),
  );
  await auth.selectOptions('bearer');
  await page.getByLabelText('Bedrock Bearer Token').fill('new-token');
  await page.getByRole('button', { name: /Bedrock Settings/ }).click();
  await page.getByRole('button', { name: /Advanced Configuration/ }).click();
  await expect.element(page.getByLabelText('Bedrock Bearer Token')).not.toBeInTheDocument();
  await page.getByRole('button', { name: /Bedrock Settings/ }).click();
  await auth.selectOptions('default');
  await expect.element(page.getByTestId('saved-target')).toHaveTextContent(
    JSON.stringify({
      id: 'bedrock:mantle:openai.gpt-5.6-sol',
      config: { region: 'us-east-2' },
    }),
  );
});

it('allows selecting an API before fixing its model ID', async () => {
  const initial = { id: 'bedrock:global.anthropic.claude-sonnet-5', config: { max_tokens: 512 } };
  renderEditor(initial);
  await expect
    .element(page.getByRole('option', { name: 'Responses API (OpenAI Models)' }))
    .toBeEnabled();
  await expect.element(page.getByRole('option', { name: 'Anthropic Messages' })).toBeEnabled();
  await expect.element(page.getByTestId('saved-target')).toHaveTextContent(JSON.stringify(initial));
  await page.getByLabelText('Bedrock API', { exact: false }).selectOptions('responses');
  await expect.element(page.getByRole('alert')).toBeVisible();
  await page.getByLabelText('Model ID', { exact: false }).fill('');
  await userEvent.type(page.getByLabelText('Model ID', { exact: false }), 'gpt-5.6-sol');
  await expect
    .element(page.getByLabelText('Model ID', { exact: false }))
    .toHaveValue('gpt-5.6-sol');
  await expect
    .element(page.getByLabelText('Bedrock API', { exact: false }))
    .toHaveValue('responses');
  await expect.element(page.getByRole('alert')).not.toBeInTheDocument();
  await expect.element(page.getByTestId('saved-target')).toHaveTextContent(
    JSON.stringify({
      id: 'bedrock:responses:openai.gpt-5.6-sol',
      config: { max_output_tokens: 512 },
    }),
  );
});

it('shows an invalid saved target and clears the error only after an explicit edit', async () => {
  const initial = {
    id: 'bedrock:responses:global.anthropic.claude-sonnet-5',
    config: { max_output_tokens: 512, profile: 'work' },
  };
  renderEditor(initial);
  await expect
    .element(page.getByRole('alert'))
    .toHaveTextContent(
      'Responses requires a bare OpenAI frontier or Grok ID, or a GPT OSS ID without -1:0.',
    );
  await expect.element(page.getByTestId('saved-target')).toHaveTextContent(JSON.stringify(initial));
  await page.getByLabelText('Model ID', { exact: false }).fill('openai.gpt-oss-120b');
  await expect.element(page.getByRole('alert')).not.toBeInTheDocument();
  await expect
    .element(page.getByTestId('saved-target'))
    .toHaveTextContent(JSON.stringify({ ...initial, id: 'bedrock:responses:openai.gpt-oss-120b' }));
});

it.each(['openai.gpt-oss-120b-1:0', 'gpt-oss-120b-1:0'])(
  'keeps InvokeModel selected while typing %s character by character',
  async (model) => {
    renderEditor({ id: 'bedrock:amazon.nova-pro-v1:0', config: { max_tokens: 512 } });
    const input = page.getByLabelText('Model ID', { exact: false });
    await input.fill('');
    await userEvent.type(input, model);
    await expect.element(input).toHaveValue(model);
    await expect
      .element(page.getByLabelText('Bedrock API', { exact: false }))
      .toHaveValue('invoke');
    await expect.element(page.getByRole('alert')).not.toBeInTheDocument();
    await expect.element(page.getByTestId('saved-target')).toHaveTextContent(
      JSON.stringify({
        id: 'bedrock:openai.gpt-oss-120b-1:0',
        config: { max_completion_tokens: 512 },
      }),
    );
  },
);

it('keeps an explicitly chosen incompatible API selected until the user changes it', async () => {
  renderEditor({ id: 'bedrock:responses:openai.gpt-5.6-sol', config: { max_output_tokens: 512 } });
  const api = page.getByLabelText('Bedrock API', { exact: false });
  await api.selectOptions('converse');
  await expect.element(api).toHaveValue('converse');
  await expect.element(page.getByRole('alert')).toBeVisible();
  await page.getByLabelText('Model ID', { exact: false }).fill('amazon.nova-pro-v1:0');
  await expect.element(api).toHaveValue('converse');
  await expect.element(page.getByRole('alert')).not.toBeInTheDocument();
  await expect.element(page.getByTestId('saved-target')).toHaveTextContent(
    JSON.stringify({
      id: 'bedrock:converse:amazon.nova-pro-v1:0',
      config: { max_tokens: 512 },
    }),
  );
});

it('validates GPT shorthand against Messages without changing the selected API', async () => {
  renderEditor({ id: 'bedrock:messages:anthropic.claude-fable-5', config: {} });
  await page.getByLabelText('Model ID', { exact: false }).fill('gpt-5.6-sol');
  await expect
    .element(page.getByLabelText('Bedrock API', { exact: false }))
    .toHaveValue('messages');
  await expect.element(page.getByRole('alert')).toBeVisible();
  await expect.element(page.getByTestId('saved-target')).toHaveTextContent(
    JSON.stringify({
      id: 'bedrock:messages:openai.gpt-5.6-sol',
      config: {},
    }),
  );
});

it('round-trips native, Responses, and Chat Completions configuration in a real browser', async () => {
  const config = { max_tokens: 512, region: 'us-west-2', profile: 'work' };
  await renderEditor({ id: 'bedrock:openai.gpt-oss-120b-1:0', config });
  const api = page.getByLabelText('Bedrock API', { exact: false });
  await api.selectOptions('responses');
  await expect.element(page.getByTestId('saved-target')).toHaveTextContent(
    JSON.stringify({
      id: 'bedrock:responses:openai.gpt-oss-120b',
      config: { region: 'us-west-2', profile: 'work', max_output_tokens: 512 },
    }),
  );
  await page.getByRole('button', { name: /Advanced Configuration/ }).click();
  await page.getByLabelText('Max Output Tokens').fill('2048');
  await api.selectOptions('chat');
  await expect.element(page.getByLabelText('Max Tokens')).toHaveValue(2048);
  await expect
    .element(page.getByLabelText('Model ID', { exact: false }))
    .toHaveValue('openai.gpt-oss-120b');
  await expect.element(page.getByTestId('saved-target')).toHaveTextContent(
    JSON.stringify({
      id: 'bedrock:mantle:openai.gpt-oss-120b',
      config: { region: 'us-west-2', profile: 'work', max_tokens: 2048 },
    }),
  );
  await api.selectOptions('converse');
  await expect.element(page.getByLabelText('Max Tokens')).toHaveValue(2048);
  await expect.element(page.getByTestId('saved-target')).toHaveTextContent(
    JSON.stringify({
      id: 'bedrock:converse:openai.gpt-oss-120b-1:0',
      config: { region: 'us-west-2', profile: 'work', max_tokens: 2048 },
    }),
  );
  await expect.element(page.getByLabelText('API Base URL')).not.toBeInTheDocument();
  await api.selectOptions('invoke');
  await expect.element(page.getByLabelText('Max Tokens')).toHaveValue(2048);
  await expect.element(page.getByTestId('saved-target')).toHaveTextContent(
    JSON.stringify({
      id: 'bedrock:openai.gpt-oss-120b-1:0',
      config: { region: 'us-west-2', profile: 'work', max_completion_tokens: 2048 },
    }),
  );
});

it('resolves a legacy Responses alias without rewriting the saved provider', async () => {
  const initial = { id: 'bedrock:converse:openai.gpt-5.5', config: { max_output_tokens: 512 } };
  await renderEditor(initial);
  await expect
    .element(page.getByLabelText('Bedrock API', { exact: false }))
    .toHaveValue('responses');
  await expect.element(page.getByTestId('saved-target')).toHaveTextContent(JSON.stringify(initial));
  await expect.element(page.getByRole('option', { name: 'Converse' })).toBeEnabled();
  await page.getByRole('button', { name: /Advanced Configuration/ }).click();
  await expect.element(page.getByLabelText('Max Output Tokens')).toHaveValue(512);
  await page.getByLabelText('Model ID', { exact: false }).fill('openai.gpt-5.4');
  await expect.element(page.getByTestId('saved-target')).toHaveTextContent(
    JSON.stringify({
      id: 'bedrock:responses:openai.gpt-5.4',
      config: { max_output_tokens: 512 },
    }),
  );
});

it('preserves Messages routing while editing the model and credential profile', async () => {
  await renderEditor({
    id: 'bedrock:messages:us.anthropic.claude-fable-5-1',
    config: { profile: 'work' },
  });
  await expect
    .element(page.getByLabelText('Bedrock API', { exact: false }))
    .toHaveValue('messages');
  await page.getByLabelText('Model ID', { exact: false }).fill('global.anthropic.claude-fable-5-1');
  await page.getByLabelText('AWS Profile').fill('production');
  await expect.element(page.getByTestId('saved-target')).toHaveTextContent(
    JSON.stringify({
      id: 'bedrock:messages:global.anthropic.claude-fable-5-1',
      config: { profile: 'production' },
    }),
  );
  await expect.element(page.getByLabelText('Inference Model Type')).not.toBeInTheDocument();
});

it.each(
  [
    {
      name: 'InvokeModel GPT OSS',
      id: 'bedrock:openai.gpt-oss-120b-1:0',
      mode: 'invoke',
      canonical: 'max_completion_tokens',
      targetMode: 'responses',
      targetId: 'bedrock:responses:openai.gpt-oss-120b',
      targetKey: 'max_output_tokens',
    },
    {
      name: 'Runtime Chat',
      id: 'bedrock:runtime:chat:us.openai.gpt-6-sol',
      mode: 'runtime-chat',
      canonical: 'max_completion_tokens',
      targetMode: 'runtime-responses',
      targetId: 'bedrock:runtime:responses:us.openai.gpt-6-sol',
      targetKey: 'max_output_tokens',
    },
    {
      name: 'Converse',
      id: 'bedrock:converse:openai.gpt-oss-120b-1:0',
      mode: 'converse',
      canonical: 'maxTokens',
      targetMode: 'runtime-chat',
      targetId: 'bedrock:runtime:chat:openai.gpt-oss-120b-1:0',
      targetKey: 'max_completion_tokens',
    },
  ].flatMap((route) =>
    [
      { values: { max_tokens: 512 }, expected: 512 },
      { values: { max_tokens: 0 }, expected: 0 },
      { values: { max_tokens: 512, [route.canonical]: 128 }, expected: 128 },
      { values: { max_tokens: 512, [route.canonical]: 0 }, expected: 0 },
      {
        values: { max_tokens: 512, [route.canonical]: null },
        // Converse's request builder falls through null; Runtime and Invoke preserve it.
        expected: route.mode === 'converse' ? 512 : null,
      },
    ].map((testCase) => ({ ...route, ...testCase })),
  ),
)(
  'preserves $name token caps across API changes: $values',
  async ({ id, mode, canonical, targetMode, targetId, targetKey, values, expected }) => {
    renderEditor({ id, config: values });
    await page.getByRole('button', { name: /Advanced Configuration/ }).click();
    await expect.element(page.getByLabelText('Max Tokens')).toHaveValue(expected);
    const api = page.getByLabelText('Bedrock API', { exact: false });
    await api.selectOptions(targetMode);
    await expect
      .element(page.getByTestId('saved-target'))
      .toHaveTextContent(JSON.stringify({ id: targetId, config: { [targetKey]: expected } }));
    await api.selectOptions(mode);
    const writeKey = canonical === 'maxTokens' ? 'max_tokens' : canonical;
    await expect
      .element(page.getByTestId('saved-target'))
      .toHaveTextContent(JSON.stringify({ id, config: { [writeKey]: expected } }));
    await page.getByLabelText('Max Tokens').fill('0');
    await expect.element(page.getByLabelText('Max Tokens')).toHaveValue(0);
    await expect
      .element(page.getByTestId('saved-target'))
      .toHaveTextContent(JSON.stringify({ id, config: { [writeKey]: 0 } }));
    await page.getByLabelText('Max Tokens').fill('');
    await expect
      .element(page.getByTestId('saved-target'))
      .toHaveTextContent(JSON.stringify({ id, config: {} }));
  },
);

it.each([128, 0, null, undefined])(
  'preserves the Runtime Responses output cap over unrelated cap fields: %s',
  async (value) => {
    renderEditor({
      id: 'bedrock:runtime:responses:us.openai.gpt-6-sol',
      config: {
        max_output_tokens: value,
        max_completion_tokens: 256,
        max_tokens: 512,
        region: 'us-east-1',
      },
    });
    await page.getByRole('button', { name: /Advanced Configuration/ }).click();
    await expect.element(page.getByLabelText('Max Output Tokens')).toHaveValue(value ?? null);
    await page.getByLabelText('Bedrock API', { exact: false }).selectOptions('runtime-chat');
    await expect.element(page.getByTestId('saved-target')).toHaveTextContent(
      JSON.stringify({
        id: 'bedrock:runtime:chat:us.openai.gpt-6-sol',
        config: { region: 'us-east-1', max_completion_tokens: value },
      }),
    );
  },
);

it.each([
  { mode: 'runtime-responses', target: 'runtime-chat', config: { max_completion_tokens: 512 } },
  { mode: 'runtime-responses', target: 'runtime-chat', config: { max_tokens: 512 } },
  { mode: 'runtime-chat', target: 'runtime-responses', config: { max_output_tokens: 512 } },
])(
  'retains no cap when switching $mode to $target with stale fields: $config',
  async ({ mode, target, config }) => {
    const model = 'us.openai.gpt-6-sol';
    renderEditor({
      id: `bedrock:runtime:${mode === 'runtime-chat' ? 'chat' : 'responses'}:${model}`,
      config: { ...config, region: 'us-east-1' },
    });
    await page.getByRole('button', { name: /Advanced Configuration/ }).click();
    await expect
      .element(page.getByRole('spinbutton', { name: /^Max (Output )?Tokens$/ }))
      .toHaveValue(null);
    const api = page.getByLabelText('Bedrock API', { exact: false });
    await api.selectOptions(target);
    await expect.element(page.getByTestId('saved-target')).toHaveTextContent(
      JSON.stringify({
        id: `bedrock:runtime:${target === 'runtime-chat' ? 'chat' : 'responses'}:${model}`,
        config: { region: 'us-east-1' },
      }),
    );
    await expect
      .element(page.getByRole('spinbutton', { name: /^Max (Output )?Tokens$/ }))
      .toHaveValue(null);
  },
);

it('retains no cap when changing InvokeModel to a model with a stale cap field', async () => {
  renderEditor({
    id: 'bedrock:amazon.nova-pro-v1:0',
    config: { max_completion_tokens: 512, region: 'us-east-1' },
  });
  await page.getByRole('button', { name: /Advanced Configuration/ }).click();
  await expect.element(page.getByLabelText('Max Tokens')).toHaveValue(null);
  await page.getByLabelText('Model ID', { exact: false }).fill('openai.gpt-oss-120b-1:0');
  await expect
    .element(page.getByTestId('saved-target'))
    .toHaveTextContent(
      JSON.stringify({ id: 'bedrock:openai.gpt-oss-120b-1:0', config: { region: 'us-east-1' } }),
    );
  await expect.element(page.getByLabelText('Max Tokens')).toHaveValue(null);
});

it('uses native input validity for nonnegative Bedrock caps and an empty cap', async () => {
  const id = 'bedrock:runtime:chat:us.openai.gpt-6-sol';
  renderEditor({ id, config: { max_completion_tokens: null } });
  await page.getByRole('button', { name: /Advanced Configuration/ }).click();
  const input = document.getElementById('max-tokens') as HTMLInputElement;
  expect(input.checkValidity()).toBe(true);
  for (const value of [0, -1, 128, undefined]) {
    await page.getByLabelText('Max Tokens').fill(value === undefined ? '' : String(value));
    await expect.element(page.getByLabelText('Max Tokens')).toHaveValue(value ?? null);
    expect(input.checkValidity()).toBe(value !== -1);
    expect(input.validity.rangeUnderflow).toBe(value === -1);
    await expect
      .element(page.getByTestId('saved-target'))
      .toHaveTextContent(JSON.stringify({ id, config: { max_completion_tokens: value } }));
  }
});

it('preserves a non-reasoning Runtime Chat max_tokens cap when switching to InvokeModel', async () => {
  renderEditor({
    id: 'bedrock:runtime:chat:mistral.mistral-large-2407-v1:0',
    config: { max_tokens: 512 },
  });
  await page.getByRole('button', { name: /Advanced Configuration/ }).click();
  await expect.element(page.getByLabelText('Max Tokens')).toHaveValue(512);
  await page.getByLabelText('Bedrock API', { exact: false }).selectOptions('invoke');
  await expect.element(page.getByTestId('saved-target')).toHaveTextContent(
    JSON.stringify({
      id: 'bedrock:mistral.mistral-large-2407-v1:0',
      config: { max_tokens: 512 },
    }),
  );
});

it('canonicalizes an edited legacy GPT OSS cap without retaining its stale alias', async () => {
  const id = 'bedrock:openai.gpt-oss-120b-1:0';
  renderEditor({ id, config: { max_tokens: 512, region: 'us-west-2' } });
  await page.getByRole('button', { name: /Advanced Configuration/ }).click();
  await expect.element(page.getByLabelText('Max Tokens')).toHaveValue(512);
  await page.getByLabelText('Max Tokens').fill('256');
  await expect
    .element(page.getByTestId('saved-target'))
    .toHaveTextContent(
      JSON.stringify({ id, config: { region: 'us-west-2', max_completion_tokens: 256 } }),
    );
});

it.each([
  { source: 'bedrock:', target: 'converse', prefix: 'bedrock:converse:', expected: 512 },
  { source: 'bedrock:converse:', target: 'invoke', prefix: 'bedrock:', expected: 128 },
])(
  'uses the source cap when $source and $target share the same UI field',
  async ({ source, target, prefix, expected }) => {
    const model = 'mistral.mistral-large-2407-v1:0';
    renderEditor({ id: source + model, config: { max_tokens: 512, maxTokens: 128 } });
    await page.getByLabelText('Bedrock API', { exact: false }).selectOptions(target);
    await expect
      .element(page.getByTestId('saved-target'))
      .toHaveTextContent(JSON.stringify({ id: prefix + model, config: { max_tokens: expected } }));
  },
);

it.each([512, 0])(
  'preserves the backend Converse null fallback %s across model and API edits',
  async (cap) => {
    renderEditor({
      id: 'bedrock:converse:openai.gpt-oss-120b-1:0',
      config: { maxTokens: null, max_tokens: cap, region: 'us-east-1' },
    });
    await page.getByRole('button', { name: /Advanced Configuration/ }).click();
    await expect.element(page.getByLabelText('Max Tokens')).toHaveValue(cap);
    await page.getByLabelText('Model ID', { exact: false }).fill('openai.gpt-oss-20b-1:0');
    await expect.element(page.getByTestId('saved-target')).toHaveTextContent(
      JSON.stringify({
        id: 'bedrock:converse:openai.gpt-oss-20b-1:0',
        config: { region: 'us-east-1', max_tokens: cap },
      }),
    );
    await page.getByLabelText('Bedrock API', { exact: false }).selectOptions('runtime-chat');
    await expect.element(page.getByTestId('saved-target')).toHaveTextContent(
      JSON.stringify({
        id: 'bedrock:runtime:chat:openai.gpt-oss-20b-1:0',
        config: { region: 'us-east-1', max_completion_tokens: cap },
      }),
    );
  },
);

it('leaves two null Converse limits unset until the user enters a cap', async () => {
  const id = 'bedrock:converse:openai.gpt-oss-120b-1:0';
  renderEditor({ id, config: { maxTokens: null, max_tokens: null } });
  await page.getByRole('button', { name: /Advanced Configuration/ }).click();
  await expect.element(page.getByLabelText('Max Tokens')).toHaveValue(null);
  await page.getByLabelText('Max Tokens').fill('64');
  await expect
    .element(page.getByTestId('saved-target'))
    .toHaveTextContent(JSON.stringify({ id, config: { max_tokens: 64 } }));
});

const mcpConfig = {
  enabled: true,
  servers: [{ name: 'local-fixture', url: 'http://127.0.0.1:1/mcp' }],
};

it.each([
  {
    mode: 'runtime-chat',
    id: 'bedrock:runtime:chat:qwen.qwen3-coder-next',
    converseId: 'bedrock:converse:qwen.qwen3-coder-next',
    capKey: 'max_completion_tokens',
  },
  {
    mode: 'chat',
    id: 'bedrock:mantle:openai.gpt-oss-120b',
    converseId: 'bedrock:converse:openai.gpt-oss-120b-1:0',
    capKey: 'max_tokens',
  },
  {
    mode: 'messages',
    id: 'bedrock:messages:us.anthropic.claude-fable-5-1',
    converseId: 'bedrock:converse:us.anthropic.claude-fable-5-1',
    capKey: 'max_tokens',
  },
])(
  'keeps MCP configured across $mode and Converse switches in the parent editor',
  async ({ mode, id, converseId, capKey }) => {
    const config = { region: 'us-west-2', mcp: mcpConfig, [capKey]: 128 };
    renderEditor({ id, config });
    const serverUrl = page.getByLabelText('URL', { exact: true });
    expect(document.getElementById('mcp-server-0-url')).not.toBeNull();
    await expect.element(serverUrl).toHaveValue(mcpConfig.servers[0].url);
    const api = page.getByLabelText('Bedrock API', { exact: false });
    await api.selectOptions('converse');
    await expect.element(api).toHaveValue('converse');
    expect(JSON.parse(page.getByTestId('saved-target').element().textContent!)).toEqual({
      id: converseId,
      config: { region: 'us-west-2', mcp: mcpConfig, max_tokens: 128 },
    });
    await api.selectOptions(mode);
    await expect.element(api).toHaveValue(mode);
    expect(JSON.parse(page.getByTestId('saved-target').element().textContent!)).toEqual({
      id,
      config,
    });
    await serverUrl.fill('http://127.0.0.1:2/mcp');
    expect(JSON.parse(page.getByTestId('saved-target').element().textContent!)).toEqual({
      id,
      config: {
        ...config,
        mcp: { enabled: true, servers: [{ name: 'local-fixture', url: 'http://127.0.0.1:2/mcp' }] },
      },
    });
  },
);

it.each([
  {
    mode: 'invoke',
    source: 'bedrock:runtime:chat:openai.gpt-oss-120b-1:0',
    destination: 'bedrock:openai.gpt-oss-120b-1:0',
  },
  {
    mode: 'responses',
    source: 'bedrock:mantle:openai.gpt-oss-120b',
    destination: 'bedrock:responses:openai.gpt-oss-120b',
  },
  {
    mode: 'runtime-responses',
    source: 'bedrock:runtime:chat:us.openai.gpt-5.6-sol',
    destination: 'bedrock:runtime:responses:us.openai.gpt-5.6-sol',
  },
])(
  'removes client MCP only when switching to unsupported $mode in the parent editor',
  async ({ mode, source, destination }) => {
    renderEditor({ id: source, config: { region: 'us-east-1', mcp: mcpConfig } });
    await page.getByLabelText('Bedrock API', { exact: false }).selectOptions(mode);
    expect(JSON.parse(page.getByTestId('saved-target').element().textContent!)).toEqual({
      id: destination,
      config: { region: 'us-east-1' },
    });
    await expect.element(page.getByRole('button', { name: /MCP Servers/ })).not.toBeInTheDocument();
  },
);

it('preserves MCP while typing a Converse model ID', async () => {
  const config = { region: 'us-west-2', mcp: mcpConfig, max_tokens: 128 };
  renderEditor({ id: 'bedrock:converse:qwen.qwen3-coder-next', config });
  const model = page.getByLabelText('Model ID', { exact: false });
  await model.fill('');
  await userEvent.type(model, 'openai.gpt-oss-120b-1:0');
  await expect
    .element(page.getByLabelText('Bedrock API', { exact: false }))
    .toHaveValue('converse');
  expect(JSON.parse(page.getByTestId('saved-target').element().textContent!)).toEqual({
    id: 'bedrock:converse:openai.gpt-oss-120b-1:0',
    config,
  });
});
