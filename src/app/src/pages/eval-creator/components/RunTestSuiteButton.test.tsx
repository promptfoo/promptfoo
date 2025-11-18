import React from 'react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, act, fireEvent, waitFor } from '@testing-library/react';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import userEvent from '@testing-library/user-event';

import RunTestSuiteButton from './RunTestSuiteButton';
import { useStore } from '@app/stores/evalConfig';
import { callApi } from '@app/utils/api';

vi.mock('react-router-dom', () => ({
  useNavigate: () => vi.fn(),
}));

vi.mock('@app/utils/api', () => ({
  callApi: vi.fn(),
}));

const renderWithTheme = (component: React.ReactNode) => {
  const theme = createTheme({ palette: { mode: 'light' } });
  return render(<ThemeProvider theme={theme}>{component}</ThemeProvider>);
};

describe('RunTestSuiteButton', () => {
  beforeEach(() => {
    useStore.getState().reset();
    vi.clearAllMocks();
  });

  it('should be disabled when there are no prompts or tests', () => {
    renderWithTheme(<RunTestSuiteButton />);
    const button = screen.getByRole('button', { name: 'Run Eval' });
    expect(button).toBeDisabled();
  });

  it('should be disabled when there are prompts but no tests', () => {
    useStore.getState().updateConfig({ prompts: ['prompt 1'] });
    renderWithTheme(<RunTestSuiteButton />);
    const button = screen.getByRole('button', { name: 'Run Eval' });
    expect(button).toBeDisabled();
  });

  it('should be disabled when there are tests but no prompts', () => {
    useStore.getState().updateConfig({ tests: [{ vars: { foo: 'bar' } }] });
    renderWithTheme(<RunTestSuiteButton />);
    const button = screen.getByRole('button', { name: 'Run Eval' });
    expect(button).toBeDisabled();
  });

  it('should be enabled when there is at least one prompt and one test', () => {
    useStore.getState().updateConfig({
      prompts: ['prompt 1'],
      tests: [{ vars: { foo: 'bar' } }],
    });
    renderWithTheme(<RunTestSuiteButton />);
    const button = screen.getByRole('button', { name: 'Run Eval' });
    expect(button).not.toBeDisabled();
  });

  it('should handle progress API failure after job creation', async () => {
    const mockJobId = '123';
    const mockCallApi = vi.mocked(callApi);
    const mockAlert = vi.spyOn(window, 'alert').mockImplementation(() => {});

    mockCallApi
      .mockResolvedValueOnce({ ok: true, json: async () => ({ id: mockJobId }) } as any)
      .mockResolvedValueOnce({
        ok: false,
        status: 500,
        json: async () => ({ message: 'Progress API failed' }),
      } as any);

    useStore.getState().updateConfig({
      prompts: ['prompt 1'],
      tests: [{ vars: { foo: 'bar' } }],
    });

    renderWithTheme(<RunTestSuiteButton />);
    const button = screen.getByRole('button', { name: 'Run Eval' });
    expect(button).not.toBeDisabled();

    await act(async () => {
      await userEvent.click(button);
    });

    await new Promise((resolve) => setTimeout(resolve, 2000));

    expect(mockAlert).toHaveBeenCalledWith(`An error occurred: HTTP error! status: 500`);

    mockAlert.mockRestore();
  });

  it('should revert to non-running state and display an error message when the initial API call fails', async () => {
    const errorMessage = 'Failed to submit test suite';
    (callApi as ReturnType<typeof vi.fn>).mockRejectedValue(new Error(errorMessage));

    useStore.getState().updateConfig({
      prompts: ['prompt 1'],
      tests: [{ vars: { foo: 'bar' } }],
    });

    const alertMock = vi.spyOn(window, 'alert').mockImplementation(() => {});

    renderWithTheme(<RunTestSuiteButton />);
    const button = screen.getByRole('button', { name: 'Run Eval' });
    fireEvent.click(button);

    await waitFor(() => {
      expect(alertMock).toHaveBeenCalledWith(`An error occurred: ${errorMessage}`);
      expect(screen.getByRole('button', { name: 'Run Eval' })).toBeInTheDocument();
    });

    alertMock.mockRestore();
  });
});
