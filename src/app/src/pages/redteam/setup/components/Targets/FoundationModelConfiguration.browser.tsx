/// <reference types="@vitest/browser/matchers" />

import { useState } from 'react';
import { flushSync } from 'react-dom';
import { createRoot, type Root } from 'react-dom/client';

import { afterEach, expect, it } from 'vitest';
import { page, userEvent } from 'vitest/browser';
import { DEFAULT_BEDROCK_TARGET_ID } from '../constants';
import FoundationModelConfiguration from './FoundationModelConfiguration';

import type { ProviderOptions } from '../../types';

let root: Root | undefined;
let container: HTMLDivElement | undefined;

function Editor({ initial }: { initial: ProviderOptions }) {
  const [target, setTarget] = useState(initial);
  return (
    <>
      <FoundationModelConfiguration
        selectedTarget={target}
        providerType="bedrock"
        updateCustomTarget={(field, value) => {
          setTarget((previous) => {
            if (field === 'id') {
              return { ...previous, id: value as string };
            }
            if (field === 'config') {
              return { ...previous, config: value as ProviderOptions['config'] };
            }
            return { ...previous, config: { ...previous.config, [field]: value } };
          });
        }}
      />
      <output data-testid="saved-target">{JSON.stringify(target)}</output>
    </>
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
        config: { max_tokens: 512 },
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
