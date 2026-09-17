/// <reference types="@vitest/browser/matchers" />

import { useState } from 'react';
import { flushSync } from 'react-dom';
import { createRoot, type Root } from 'react-dom/client';

import { afterEach, expect, it } from 'vitest';
import { page } from 'vitest/browser';
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
  await expect.element(page.getByRole('option', { name: 'Converse' })).toBeDisabled();
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
