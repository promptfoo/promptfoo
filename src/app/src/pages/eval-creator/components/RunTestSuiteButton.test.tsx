import React from 'react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ThemeProvider, createTheme } from '@mui/material/styles';

import RunTestSuiteButton from './RunTestSuiteButton';
import { useStore } from '@app/stores/evalConfig';

vi.mock('react-router-dom', () => ({
  useNavigate: () => vi.fn(),
}));

const renderWithTheme = (component: React.ReactNode) => {
  const theme = createTheme({ palette: { mode: 'light' } });
  return render(<ThemeProvider theme={theme}>{component}</ThemeProvider>);
};

describe('RunTestSuiteButton', () => {
  beforeEach(() => {
    useStore.getState().reset();
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
});
