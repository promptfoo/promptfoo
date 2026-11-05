import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ProvidersListSection } from './ProvidersListSection';
import type { ProviderOptions } from '@promptfoo/types';

vi.mock('./AddProviderDialog', () => ({
  default: vi.fn(() => null),
}));

describe('ProvidersListSection', () => {
  const providers: ProviderOptions[] = [
    { id: 'openai:gpt-4.1', label: 'Primary model' },
    { id: 'anthropic:messages:claude-sonnet-4', label: 'Comparison model' },
  ];
  const onChange = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('asks for confirmation before deleting a provider', async () => {
    const user = userEvent.setup();
    render(<ProvidersListSection providers={providers} onChange={onChange} />);

    await user.click(screen.getByRole('button', { name: 'Delete Primary model' }));

    expect(screen.getByRole('dialog', { name: 'Delete provider?' })).toBeInTheDocument();
    expect(onChange).not.toHaveBeenCalled();
  });

  it('removes the provider after deletion is confirmed', async () => {
    const user = userEvent.setup();
    render(<ProvidersListSection providers={providers} onChange={onChange} />);

    await user.click(screen.getByRole('button', { name: 'Delete Primary model' }));
    await user.click(screen.getByRole('button', { name: 'Delete' }));

    expect(onChange).toHaveBeenCalledWith([providers[1]]);
  });

  it('labels native Codex Security providers separately from OpenAI foundation models', () => {
    render(
      <ProvidersListSection
        providers={[
          {
            id: 'openai:codex-security:gpt-5.6-luna',
            label: 'Deep repository scan',
            config: { operation: 'deep-security-scan' },
          },
        ]}
        onChange={onChange}
      />,
    );

    expect(screen.getByText('Codex Security SDK')).toBeInTheDocument();
    expect(screen.queryByText('OpenAI')).not.toBeInTheDocument();
  });

  it('identifies saved reports without presenting retained SDK settings as report facts', () => {
    render(
      <ProvidersListSection
        providers={[
          {
            id: 'openai:codex-security:gpt-5.6-sol',
            label: 'Left report',
            config: {
              report_file: '/reports/left.json',
              operation: 'deep-security-scan',
              model_reasoning_effort: 'high',
            },
          },
          { id: 'openai:codex-security', config: { report_file: '' } },
        ]}
        onChange={onChange}
      />,
    );
    expect(screen.getByText('Saved report · /reports/left.json')).toBeInTheDocument();
    expect(screen.getByText('Saved report · Select a report file')).toBeInTheDocument();
    expect(screen.queryByText(/Deep security scan/)).not.toBeInTheDocument();
    expect(screen.queryByText(/high reasoning/)).not.toBeInTheDocument();
  });

  it('distinguishes security comparisons with the same model and label', () => {
    render(
      <ProvidersListSection
        providers={[
          {
            id: 'openai:codex-security:gpt-5.6-sol',
            label: 'Codex Security SDK',
            config: { operation: 'security-scan', model_reasoning_effort: 'high' },
          },
          {
            id: 'openai:codex-security:gpt-5.6-sol',
            label: 'Codex Security SDK',
            config: { operation: 'deep-security-scan', model_reasoning_effort: 'max' },
          },
        ]}
        onChange={onChange}
      />,
    );

    expect(
      screen.getByText('Standard security scan · gpt-5.6-sol · high reasoning'),
    ).toBeInTheDocument();
    expect(
      screen.getByText('Deep security scan · gpt-5.6-sol · max reasoning'),
    ).toBeInTheDocument();
  });

  it('summarizes shorthand defaults and legacy model/reasoning settings accurately', () => {
    render(
      <ProvidersListSection
        providers={[
          { id: 'openai:codex-security' },
          {
            id: 'openai:codex-security',
            config: { operation: 'validation', model: 'gpt-5.6-sol', reasoning_effort: 'low' },
          },
        ]}
        onChange={onChange}
      />,
    );

    expect(
      screen.getByText('Standard security scan · SDK default model · SDK default reasoning'),
    ).toBeInTheDocument();
    expect(
      screen.getByText('Validate a finding · gpt-5.6-sol · low reasoning'),
    ).toBeInTheDocument();
  });
});
