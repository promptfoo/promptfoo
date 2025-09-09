import React from 'react';

import { createTheme, ThemeProvider } from '@mui/material/styles';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import AgentFrameworkConfiguration from './AgentFrameworkConfiguration';

import type { ProviderOptions } from '../../types';

vi.mock('../../../hooks/useTelemetry', () => ({
  useTelemetry: () => ({
    recordEvent: vi.fn(),
  }),
}));

const renderWithTheme = (ui: React.ReactElement) => {
  const theme = createTheme({ palette: { mode: 'light' } });
  return render(<ThemeProvider theme={theme}>{ui}</ThemeProvider>);
};

describe('AgentFrameworkConfiguration', () => {
  it('should call updateCustomTarget with the correct field and value when the Provider ID input is changed by the user', () => {
    const mockUpdateCustomTarget = vi.fn();
    const selectedTarget: ProviderOptions = {
      id: '',
      config: {},
    };
    const agentType = 'langchain';
    const newPath = 'file:///path/to/my_agent.py';

    renderWithTheme(
      <AgentFrameworkConfiguration
        selectedTarget={selectedTarget}
        updateCustomTarget={mockUpdateCustomTarget}
        agentType={agentType}
      />,
    );

    const providerIdInput = screen.getByRole('textbox', {
      name: /Provider ID \(Python file path\)/i,
    });
    fireEvent.change(providerIdInput, { target: { value: newPath } });

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

    renderWithTheme(
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
    const mockUpdateCustomTarget = vi.fn();
    const selectedTarget: ProviderOptions = {
      id: '',
      config: {},
    };
    const agentType = 'langchain';

    const writeTextMock = vi.fn().mockRejectedValue(new Error('Clipboard API not available'));
    Object.assign(navigator, {
      clipboard: {
        writeText: writeTextMock,
      },
    });

    renderWithTheme(
      <AgentFrameworkConfiguration
        selectedTarget={selectedTarget}
        updateCustomTarget={mockUpdateCustomTarget}
        agentType={agentType}
      />,
    );

    const generateButton = screen.getByRole('button', { name: /Generate Template File/i });
    fireEvent.click(generateButton);

    const copyButton = await screen.findByRole('button', { name: /Copy Template/i });
    fireEvent.click(copyButton);

    expect(writeTextMock).toHaveBeenCalledTimes(1);
  });

  it('should call updateCustomTarget even with an invalid Provider ID format', () => {
    const mockUpdateCustomTarget = vi.fn();
    const selectedTarget: ProviderOptions = {
      id: '',
      config: {},
    };
    const agentType = 'langchain';
    const invalidPath = '/path/to/my_agent.py';

    renderWithTheme(
      <AgentFrameworkConfiguration
        selectedTarget={selectedTarget}
        updateCustomTarget={mockUpdateCustomTarget}
        agentType={agentType}
      />,
    );

    const providerIdInput = screen.getByRole('textbox', {
      name: /Provider ID \(Python file path\)/i,
    });
    fireEvent.change(providerIdInput, { target: { value: invalidPath } });

    expect(mockUpdateCustomTarget).toHaveBeenCalledTimes(1);
    expect(mockUpdateCustomTarget).toHaveBeenCalledWith('id', invalidPath);
  });

  it('should call updateCustomTarget with the provided invalid file path when the Provider ID input is changed', () => {
    const mockUpdateCustomTarget = vi.fn();
    const selectedTarget: ProviderOptions = {
      id: '',
      config: {},
    };
    const agentType = 'langchain';
    const invalidPath = 'file:///path/to/nonexistent_file.py';

    renderWithTheme(
      <AgentFrameworkConfiguration
        selectedTarget={selectedTarget}
        updateCustomTarget={mockUpdateCustomTarget}
        agentType={agentType}
      />,
    );

    const providerIdInput = screen.getByRole('textbox', {
      name: /Provider ID \(Python file path\)/i,
    });
    fireEvent.change(providerIdInput, { target: { value: invalidPath } });

    expect(mockUpdateCustomTarget).toHaveBeenCalledTimes(1);
    expect(mockUpdateCustomTarget).toHaveBeenCalledWith('id', invalidPath);
  });
});
