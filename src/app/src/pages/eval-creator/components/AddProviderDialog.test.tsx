import { TooltipProvider } from '@app/components/ui/tooltip';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import AddProviderDialog, { getProviderTypeFromId } from './AddProviderDialog';

let providerValidationError: string | null = null;

vi.mock('@app/pages/redteam/setup/components/Targets/ProviderTypeSelector', () => ({
  default: ({
    setProvider,
    mode,
  }: {
    setProvider: (provider: { id: string; config: Record<string, never> }, type: string) => void;
    mode?: 'eval' | 'redteam';
  }) => (
    <div data-testid="provider-type-selector" data-mode={mode}>
      provider type selector
      <button
        type="button"
        onClick={() => setProvider({ id: 'openai:gpt-5.5', config: {} }, 'openai')}
      >
        Choose OpenAI
      </button>
    </div>
  ),
}));

vi.mock('@app/pages/redteam/setup/components/Targets/ProviderConfigEditor', () => ({
  default: ({
    onValidationRequest,
    setError,
    setProvider,
  }: {
    onValidationRequest?: (validator: () => boolean) => void;
    setError?: (error: string | null) => void;
    setProvider?: (provider: { id: string; config: { temperature: number } }) => void;
  }) => {
    onValidationRequest?.(() => {
      setError?.(providerValidationError);
      return providerValidationError === null;
    });
    return (
      <div>
        provider config editor
        <button
          type="button"
          onClick={() => setProvider?.({ id: 'openai:gpt-5.5', config: { temperature: 0.4 } })}
        >
          Change Provider Settings
        </button>
      </div>
    );
  },
}));

afterEach(() => {
  providerValidationError = null;
  vi.resetAllMocks();
});

describe('getProviderTypeFromId', () => {
  it('returns undefined for undefined or empty input', () => {
    expect(getProviderTypeFromId(undefined)).toBeUndefined();
    expect(getProviderTypeFromId('')).toBeUndefined();
  });

  it.each([
    ['openai:gpt-4', 'openai'],
    ['anthropic:claude-3', 'anthropic'],
    ['bedrock:model-id', 'bedrock'],
    ['bedrock-agent:agent-id', 'bedrock-agent'],
    ['azure:deployment-name', 'azure'],
    ['vertex:model-name', 'vertex'],
    ['google:gemini-pro', 'google'],
    ['mistral:model-id', 'mistral'],
    ['openrouter:model-id', 'openrouter'],
    ['groq:model-id', 'groq'],
    ['deepseek:model-id', 'deepseek'],
    ['perplexity:model-id', 'perplexity'],
  ])('detects prefix-based provider %s as %s', (id, expected) => {
    expect(getProviderTypeFromId(id)).toBe(expected);
  });

  it.each([
    ['http', 'http'],
    ['websocket', 'websocket'],
    ['browser', 'browser'],
    ['mcp', 'mcp'],
  ])('detects exact match provider %s as %s', (id, expected) => {
    expect(getProviderTypeFromId(id)).toBe(expected);
  });

  it('detects exec provider', () => {
    expect(getProviderTypeFromId('exec:./script.sh')).toBe('exec');
  });

  it.each([
    ['file://script.py', 'python'],
    ['file://script.js', 'javascript'],
    ['file://script.go', 'go'],
  ])('detects file:// language %s as %s', (id, expected) => {
    expect(getProviderTypeFromId(id)).toBe(expected);
  });

  it.each([
    ['file://path/langchain/agent', 'langchain'],
    ['file://path/autogen/agent', 'autogen'],
    ['file://path/crewai/agent', 'crewai'],
    ['file://path/llamaindex/agent', 'llamaindex'],
    ['file://path/langgraph/agent', 'langgraph'],
    ['file://path/openai_agents/agent', 'openai-agents-sdk'],
    ['file://path/openai-agents/agent', 'openai-agents-sdk'],
    ['file://path/pydantic_ai/agent', 'pydantic-ai'],
    ['file://path/pydantic-ai/agent', 'pydantic-ai'],
    ['file://path/google_adk/agent', 'google-adk'],
    ['file://path/google-adk/agent', 'google-adk'],
  ])('detects file:// framework %s as %s', (id, expected) => {
    expect(getProviderTypeFromId(id)).toBe(expected);
  });

  it('prioritizes file extension over framework name', () => {
    expect(getProviderTypeFromId('file://path/langchain/script.py')).toBe('python');
  });

  it('returns generic-agent for file:// without specific markers', () => {
    expect(getProviderTypeFromId('file://path/to/agent.txt')).toBe('generic-agent');
  });

  it('returns custom for unrecognized provider ids', () => {
    expect(getProviderTypeFromId('unknown-provider')).toBe('custom');
  });
});

describe('AddProviderDialog layout', () => {
  it('keeps the dialog footer visible while the body scrolls', () => {
    render(<AddProviderDialog open onClose={vi.fn()} onSave={vi.fn()} />);

    const dialog = screen.getByRole('dialog');
    const scrollBody = screen.getByTestId('add-provider-dialog-scroll-body');
    const footer = screen.getByTestId('add-provider-dialog-footer');

    expect(dialog).toHaveClass('flex', 'max-h-[90vh]', 'flex-col', 'overflow-hidden');
    expect(scrollBody).toHaveClass('min-h-0', 'flex-1', 'overflow-y-auto');
    expect(footer).toHaveClass('shrink-0');
    expect(screen.getByText('Step 1 of 2')).toBeInTheDocument();
    expect(screen.getByText(/a provider is a model, agent, or endpoint/i)).toBeInTheDocument();
    expect(screen.getByTestId('provider-type-selector')).toHaveAttribute('data-mode', 'eval');
  });

  it('resets the scroll position when moving into provider configuration', async () => {
    const user = userEvent.setup();
    render(
      <TooltipProvider>
        <AddProviderDialog open onClose={vi.fn()} onSave={vi.fn()} />
      </TooltipProvider>,
    );

    const scrollBody = screen.getByTestId('add-provider-dialog-scroll-body');
    expect(scrollBody).toBeDefined();

    scrollBody!.scrollTop = 240;
    await user.click(screen.getByRole('button', { name: 'Choose OpenAI' }));

    await screen.findByText('provider config editor');
    const nextScrollBody = screen.getByTestId('add-provider-dialog-scroll-body');

    expect(nextScrollBody).toBeDefined();
    expect(nextScrollBody).not.toBe(scrollBody);
    expect(nextScrollBody).toHaveProperty('scrollTop', 0);
    expect(screen.getByText('Step 2 of 2')).toBeInTheDocument();
    expect(screen.getByText(/add more providers later to compare outputs/i)).toBeInTheDocument();
  });

  it('uses focused copy without add-flow steps when editing a provider', () => {
    render(
      <AddProviderDialog
        open
        onClose={vi.fn()}
        onSave={vi.fn()}
        initialProvider={{ id: 'openai:gpt-5.5' }}
      />,
    );

    expect(screen.getByText('Edit Provider')).toBeInTheDocument();
    expect(
      screen.getByText(/update the connection and model settings used for this evaluation/i),
    ).toBeInTheDocument();
    expect(screen.queryByText(/Step \d of 2/)).not.toBeInTheDocument();
  });

  it('closes an untouched add flow without a discard warning', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();

    render(<AddProviderDialog open onClose={onClose} onSave={vi.fn()} />);

    await user.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(screen.queryByText('Discard provider changes?')).toBeNull();
  });

  it('confirms before returning to type selection with a selected provider', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();

    render(
      <TooltipProvider>
        <AddProviderDialog open onClose={onClose} onSave={vi.fn()} />
      </TooltipProvider>,
    );

    await user.click(screen.getByRole('button', { name: 'Choose OpenAI' }));
    await user.click(screen.getByRole('button', { name: 'Back' }));

    expect(screen.getByText('Discard provider changes?')).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: 'Continue editing' }));
    expect(screen.getByText('Configure Provider')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Back' }));
    await user.click(screen.getByRole('button', { name: 'Discard and choose type' }));
    expect(screen.getByText('Select Provider Type')).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('confirms before discarding edits to an existing provider', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();

    render(
      <AddProviderDialog
        open
        onClose={onClose}
        onSave={vi.fn()}
        initialProvider={{ id: 'openai:gpt-5.5', config: {} }}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Change Provider Settings' }));
    await user.click(screen.getByRole('button', { name: 'Back' }));

    expect(screen.getByText('Discard provider changes?')).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('requires valid provider configuration before saving and keeps recovery available', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    providerValidationError = 'Valid URL is required';

    render(
      <TooltipProvider>
        <AddProviderDialog open onClose={vi.fn()} onSave={onSave} />
      </TooltipProvider>,
    );

    await user.click(screen.getByRole('button', { name: 'Choose OpenAI' }));
    await user.click(screen.getByRole('button', { name: 'Add Provider' }));

    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent('Valid URL is required');
    expect(screen.getByRole('button', { name: 'Add Provider' })).not.toBeDisabled();

    providerValidationError = null;
    await user.click(screen.getByRole('button', { name: 'Add Provider' }));

    expect(onSave).toHaveBeenCalledTimes(1);
  });
});
