import { TooltipProvider } from '@app/components/ui/tooltip';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import AddProviderDialog, { getProviderTypeFromId } from './AddProviderDialog';

vi.mock('@app/pages/redteam/setup/components/Targets/ProviderTypeSelector', () => ({
  default: ({
    setProvider,
  }: {
    setProvider: (provider: { id: string; config: Record<string, never> }, type: string) => void;
  }) => (
    <div>
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
  default: () => <div>provider config editor</div>,
}));

afterEach(() => {
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
  });
});
