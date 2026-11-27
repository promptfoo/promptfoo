import { useState } from 'react';

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import VertexConfiguration from './VertexConfiguration';

import type { ProviderOptions } from '../../types';

function Editor({ initial }: { initial: ProviderOptions }) {
  const [target, setTarget] = useState(initial);

  const updateTarget = (field: string, value: unknown) => {
    setTarget((current) => {
      if (field === 'id' || field === 'config') {
        return { ...current, [field]: value };
      }
      return { ...current, config: { ...current.config, [field]: value } };
    });
  };

  return (
    <>
      <VertexConfiguration selectedTarget={target} updateCustomTarget={updateTarget} />
      <output data-testid="saved-vertex-target">{JSON.stringify(target)}</output>
    </>
  );
}

function savedTarget(): ProviderOptions {
  return JSON.parse(screen.getByTestId('saved-vertex-target').textContent ?? '');
}

async function replaceText(
  user: ReturnType<typeof userEvent.setup>,
  input: HTMLElement,
  value: string,
) {
  await user.click(input);
  await user.keyboard('{Control>}a{/Control}');
  await user.paste(value);
}

describe('VertexConfiguration', () => {
  it('preserves Google OAuth identity and maps the token limit in both directions', async () => {
    const user = userEvent.setup();
    const shared = {
      projectId: 'preview-project',
      credentials: 'file://fixture.json',
      keyFilename: '/fixture-key.json',
      googleAuthOptions: { quotaProjectId: 'quota-project' },
      scopes: ['https://www.googleapis.com/auth/cloud-platform'],
    };
    render(
      <Editor
        initial={{
          id: 'vertex:claude-sonnet-5-5',
          config: {
            ...shared,
            googleAuthOptions: { ...shared.googleAuthOptions, apiKey: 'fixture' },
            apiBaseUrl: 'https://example.com/v1',
            tools: [{ type: 'web_search' }],
            max_tokens: 48,
            region: 'us-central1',
          },
        }}
      />,
    );

    await user.selectOptions(screen.getByLabelText('Vertex AI API'), 'responses');
    expect(screen.getByRole('alert')).toHaveTextContent(/model ID/i);
    await user.type(screen.getByLabelText(/Model ID/), 'gpt-6-luna');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(savedTarget()).toEqual({
      id: 'vertex:responses:gpt-6-luna',
      config: { ...shared, region: 'global', max_output_tokens: 48, store: false },
    });

    await user.selectOptions(screen.getByLabelText('Vertex AI API'), 'vertex');
    expect(savedTarget()).toEqual({
      id: 'vertex:gemini-3.8-flash',
      config: { ...shared, region: 'global', max_tokens: 48 },
    });
  });

  it('keeps native IDs on the existing route and switches on a full Responses ID', async () => {
    const user = userEvent.setup();
    render(<Editor initial={{ id: 'vertex:gemini-3.8-flash', config: {} }} />);

    const model = screen.getByLabelText(/Model ID/);
    await replaceText(user, model, 'vertex:claude-sonnet-5-5');
    expect(screen.getByLabelText('Vertex AI API')).toHaveValue('vertex');
    expect(savedTarget()).toEqual({ id: 'vertex:claude-sonnet-5-5', config: {} });

    await replaceText(user, model, 'vertex:responses:gpt-6-luna');
    expect(screen.getByLabelText('Vertex AI API')).toHaveValue('responses');
    expect(screen.getByLabelText(/Model ID/)).toHaveValue('gpt-6-luna');
    expect(savedTarget()).toEqual({
      id: 'vertex:responses:gpt-6-luna',
      config: { region: 'global', store: false },
    });
  });

  it('edits a saved Responses target, including clearing optional values', async () => {
    const user = userEvent.setup();
    render(
      <Editor
        initial={{
          id: 'vertex:responses:gpt-6-luna',
          config: {
            projectId: 'preview-project',
            apiBaseUrl: 'https://example.com/v1',
            max_output_tokens: 48,
          },
        }}
      />,
    );

    expect(screen.getByText(/Google OAuth credentials are sent to that endpoint/)).toBeVisible();
    const model = screen.getByLabelText(/Model ID/);
    await replaceText(user, model, 'vertex:gemini-3.8-flash');
    expect(model).toHaveAttribute('aria-invalid', 'true');
    await replaceText(user, model, ' vertex:responses:gpt-6.2-sol ');
    expect(model).toHaveValue('gpt-6.2-sol');
    expect(model).toHaveAttribute('aria-invalid', 'false');

    const project = screen.getByLabelText('Google Cloud Project ID');
    await replaceText(user, project, ' another-project ');
    expect(savedTarget().config.projectId).toBe('another-project');
    await user.clear(project);

    await user.click(screen.getByRole('button', { name: /Advanced Configuration/ }));
    const cap = screen.getByRole('spinbutton', { name: 'Max Output Tokens' });
    expect(cap).toHaveValue(48);
    await user.clear(cap);
    await user.type(cap, '64');
    expect(savedTarget().config.max_output_tokens).toBe(64);
    await user.clear(cap);

    expect(savedTarget()).toEqual({
      id: 'vertex:responses:gpt-6.2-sol',
      config: { apiBaseUrl: 'https://example.com/v1' },
    });
  });
});
