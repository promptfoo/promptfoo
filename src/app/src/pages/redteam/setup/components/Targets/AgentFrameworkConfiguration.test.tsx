import { mockClipboard } from '@app/tests/browserMocks';
import { renderWithProviders } from '@app/utils/testutils';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import AgentFrameworkConfiguration from './AgentFrameworkConfiguration';

import type { ProviderOptions } from '../../types';

vi.mock('../../../hooks/useTelemetry', () => ({
  useTelemetry: () => ({
    recordEvent: vi.fn(),
  }),
}));

describe('AgentFrameworkConfiguration', () => {
  it('should call updateCustomTarget with the correct field and value when the Provider ID input is changed by the user', async () => {
    const user = userEvent.setup();
    const mockUpdateCustomTarget = vi.fn();
    const selectedTarget: ProviderOptions = {
      id: '',
      config: {},
    };
    const agentType = 'langchain';
    const newPath = 'file:///path/to/my_agent.py';

    renderWithProviders(
      <AgentFrameworkConfiguration
        selectedTarget={selectedTarget}
        updateCustomTarget={mockUpdateCustomTarget}
        agentType={agentType}
      />,
    );

    const providerIdInput = screen.getByRole('textbox', {
      name: /Provider ID \(Python file path\)/i,
    });
    await user.click(providerIdInput);
    await user.keyboard('{Control>}a{/Control}');
    await user.paste(newPath);

    expect(mockUpdateCustomTarget).toHaveBeenCalledTimes(1);
    expect(mockUpdateCustomTarget).toHaveBeenCalledWith('id', newPath);
  });

  it('should display fallback framework name and description when an invalid agentType is provided', () => {
    const mockUpdateCustomTarget = vi.fn();
    const selectedTarget: ProviderOptions = {
      id: '',
      config: {},
    };
    const invalidAgentType = 'invalid-agent-type';

    renderWithProviders(
      <AgentFrameworkConfiguration
        selectedTarget={selectedTarget}
        updateCustomTarget={mockUpdateCustomTarget}
        agentType={invalidAgentType}
      />,
    );

    const alertElement = screen.getByText(`${invalidAgentType} Agent Configuration`);

    expect(alertElement).toBeInTheDocument();
  });

  it('should handle clipboard API unavailability gracefully', async () => {
    const user = userEvent.setup();
    const mockUpdateCustomTarget = vi.fn();
    const selectedTarget: ProviderOptions = {
      id: '',
      config: {},
    };
    const agentType = 'langchain';

    const writeTextMock = vi.fn().mockRejectedValue(new Error('Clipboard API not available'));
    mockClipboard({ writeText: writeTextMock as Clipboard['writeText'] });

    renderWithProviders(
      <AgentFrameworkConfiguration
        selectedTarget={selectedTarget}
        updateCustomTarget={mockUpdateCustomTarget}
        agentType={agentType}
      />,
    );

    const generateButton = screen.getByRole('button', { name: /Generate Template File/i });
    await user.click(generateButton);

    const copyButton = await screen.findByRole('button', { name: /Copy Template/i });
    await user.click(copyButton);

    expect(writeTextMock).toHaveBeenCalledTimes(1);
  });

  it('should call updateCustomTarget even with an invalid Provider ID format', async () => {
    const user = userEvent.setup();
    const mockUpdateCustomTarget = vi.fn();
    const selectedTarget: ProviderOptions = {
      id: '',
      config: {},
    };
    const agentType = 'langchain';
    const invalidPath = '/path/to/my_agent.py';

    renderWithProviders(
      <AgentFrameworkConfiguration
        selectedTarget={selectedTarget}
        updateCustomTarget={mockUpdateCustomTarget}
        agentType={agentType}
      />,
    );

    const providerIdInput = screen.getByRole('textbox', {
      name: /Provider ID \(Python file path\)/i,
    });
    await user.click(providerIdInput);
    await user.keyboard('{Control>}a{/Control}');
    await user.paste(invalidPath);

    expect(mockUpdateCustomTarget).toHaveBeenCalledTimes(1);
    expect(mockUpdateCustomTarget).toHaveBeenCalledWith('id', invalidPath);
  });

  it('should call updateCustomTarget with the provided invalid file path when the Provider ID input is changed', async () => {
    const user = userEvent.setup();
    const mockUpdateCustomTarget = vi.fn();
    const selectedTarget: ProviderOptions = {
      id: '',
      config: {},
    };
    const agentType = 'langchain';
    const invalidPath = 'file:///path/to/nonexistent_file.py';

    renderWithProviders(
      <AgentFrameworkConfiguration
        selectedTarget={selectedTarget}
        updateCustomTarget={mockUpdateCustomTarget}
        agentType={agentType}
      />,
    );

    const providerIdInput = screen.getByRole('textbox', {
      name: /Provider ID \(Python file path\)/i,
    });
    await user.click(providerIdInput);
    await user.keyboard('{Control>}a{/Control}');
    await user.paste(invalidPath);

    expect(mockUpdateCustomTarget).toHaveBeenCalledTimes(1);
    expect(mockUpdateCustomTarget).toHaveBeenCalledWith('id', invalidPath);
  });
});
