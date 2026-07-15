import { TooltipProvider } from '@app/components/ui/tooltip';
import ProviderConfigEditor from '@app/pages/redteam/setup/components/Targets/ProviderConfigEditor';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import AddProviderDialog from './AddProviderDialog';
import type { ProviderOptions } from '@app/pages/redteam/setup/types';

vi.mock('@app/pages/redteam/setup/hooks/useRedTeamConfig', () => ({
  useRedTeamConfig: () => ({ config: {}, updateConfig: vi.fn() }),
}));

vi.mock('@app/pages/redteam/setup/components/Targets/ProviderTypeSelector', () => ({
  default: ({
    setProvider,
  }: {
    setProvider: (provider: ProviderOptions, type: string) => void;
  }) => (
    <div>
      <button
        type="button"
        onClick={() =>
          setProvider(
            { id: 'openinterpreter', config: { sandbox_mode: 'danger-full-access' } },
            'openinterpreter',
          )
        }
      >
        Choose Open Interpreter
      </button>
      <button
        type="button"
        onClick={() => setProvider({ id: 'openai:gpt-4.1', config: {} }, 'openai')}
      >
        Choose OpenAI
      </button>
    </div>
  ),
}));

vi.mock('react-simple-code-editor', () => ({
  default: ({ value, onValueChange }: any) => (
    <textarea
      data-testid="code-editor"
      value={value}
      onChange={(event) => onValueChange(event.target.value)}
    />
  ),
}));

vi.mock('@app/pages/redteam/setup/components/Targets/HttpEndpointConfiguration', () => ({
  default: ({
    updateCustomTarget,
  }: {
    updateCustomTarget: (field: string, value: unknown) => void;
  }) => (
    <button type="button" onClick={() => updateCustomTarget('body', 'plain evaluation input')}>
      Set plain request body
    </button>
  ),
}));

vi.mock('@app/pages/redteam/setup/components/Targets/CommonConfigurationOptions', () => ({
  default: () => <div>common configuration</div>,
}));

const renderDialog = (url: string, body = '{{prompt}}') => {
  const onSave = vi.fn();
  render(
    <TooltipProvider>
      <AddProviderDialog
        open
        onClose={vi.fn()}
        onSave={onSave}
        initialProvider={{ id: 'http', config: { url, body } }}
      />
    </TooltipProvider>,
  );
  return onSave;
};

describe('AddProviderDialog HTTP validation', () => {
  it('re-enables Add Provider after backing out of malformed JSON and selecting a valid provider', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    render(
      <TooltipProvider>
        <AddProviderDialog open onClose={vi.fn()} onSave={onSave} />
      </TooltipProvider>,
    );

    await user.click(screen.getByRole('button', { name: 'Choose Open Interpreter' }));
    await user.clear(screen.getByTestId('code-editor'));
    await user.type(screen.getByTestId('code-editor'), '{{"sandbox_mode":"read-only",}}');
    expect(screen.getByRole('button', { name: 'Add Provider' })).toBeDisabled();

    await user.click(screen.getByRole('button', { name: 'Back' }));
    await user.click(screen.getByRole('button', { name: 'Choose OpenAI' }));

    const save = screen.getByRole('button', { name: 'Add Provider' });
    expect(save).toBeEnabled();
    await user.click(save);
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ id: 'openai:gpt-4.1' }));
  });

  it.each([
    '{{ env.MODEL_ARMOR_URL }}',
    'https://modelarmor.{{ env.MODEL_ARMOR_LOCATION }}.rep.googleapis.com/v1',
  ])('saves an eval HTTP provider with the supported URL template %s', async (url) => {
    const user = userEvent.setup();
    const onSave = renderDialog(url);

    await user.click(screen.getByRole('button', { name: 'Save Changes' }));

    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({ config: expect.objectContaining({ url }) }),
    );
  });

  it('saves an eval HTTP provider whose edited body does not use the redteam prompt template', async () => {
    const user = userEvent.setup();
    const onSave = renderDialog('https://api.example.com/eval', 'initial body');

    await user.click(screen.getByRole('button', { name: 'Set plain request body' }));
    await user.click(screen.getByRole('button', { name: 'Save Changes' }));

    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({
        config: expect.objectContaining({
          url: 'https://api.example.com/eval',
          body: 'plain evaluation input',
        }),
      }),
    );
  });

  it('continues to reject malformed literal HTTP URLs', async () => {
    const user = userEvent.setup();
    const onSave = renderDialog('not a url');

    await user.click(screen.getByRole('button', { name: 'Save Changes' }));

    expect(onSave).not.toHaveBeenCalled();
  });

  it('continues to require the prompt template for edited redteam HTTP request bodies', async () => {
    const user = userEvent.setup();
    const setError = vi.fn();
    let validate: (() => boolean) | null = null;

    render(
      <ProviderConfigEditor
        provider={
          {
            id: 'http',
            config: { url: 'https://api.example.com/redteam', body: '{{prompt}}' },
          } as ProviderOptions
        }
        setProvider={vi.fn()}
        setError={setError}
        onValidationRequest={(validator) => {
          validate = validator;
        }}
        providerType="http"
        mode="redteam"
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Set plain request body' }));

    expect(validate!()).toBe(false);
    expect(setError).toHaveBeenLastCalledWith('Validation failed');
  });
});
