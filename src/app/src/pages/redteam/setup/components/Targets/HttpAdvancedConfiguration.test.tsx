import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import type { ProviderOptions } from '@promptfoo/types';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import HttpAdvancedConfiguration from './HttpAdvancedConfiguration';

vi.mock('@app/hooks/useToast', () => ({
  useToast: () => ({
    showToast: vi.fn(),
  }),
}));

vi.mock('prismjs/components/prism-core', () => ({
  highlight: vi.fn((code: string) => code),
  languages: {
    javascript: {},
    json: {},
    http: {},
    yaml: {},
    text: {},
    clike: {},
  },
}));
vi.mock('prismjs/themes/prism.css', () => ({
  default: {},
}));
vi.mock('prismjs/components/prism-clike', () => ({}));
vi.mock('prismjs/components/prism-javascript', () => ({}));

const renderWithTheme = (ui: React.ReactElement) => {
  const theme = createTheme({ palette: { mode: 'light' } });
  return render(<ThemeProvider theme={theme}>{ui}</ThemeProvider>);
};

describe('HttpAdvancedConfiguration', () => {
  let mockUpdateCustomTarget: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockUpdateCustomTarget = vi.fn();
  });

  describe('Token Estimation Accordion Initial State', () => {
    const testCases: Array<{
      description: string;
      config: Partial<ProviderOptions['config']>;
      expectedChecked: boolean;
    }> = [
      {
        description: 'tokenEstimation.enabled is true',
        config: { tokenEstimation: { enabled: true, multiplier: 1.3 } },
        expectedChecked: true,
      },
      {
        description: 'tokenEstimation.enabled is false',
        config: { tokenEstimation: { enabled: false } },
        expectedChecked: false,
      },
      {
        description: 'tokenEstimation object is undefined',
        config: {},
        expectedChecked: false,
      },
      {
        description:
          'tokenEstimation.enabled is undefined (tokenEstimation object exists but enabled is missing)',
        config: { tokenEstimation: {} as any },
        expectedChecked: false,
      },
    ];

    it.each(testCases)(
      'should render toggle switch as $expectedChecked when $description',
      ({ config, expectedChecked }) => {
        const selectedTarget: ProviderOptions = {
          id: 'http-provider',
          config: config as ProviderOptions['config'],
        };

        renderWithTheme(
          <HttpAdvancedConfiguration
            selectedTarget={selectedTarget}
            updateCustomTarget={mockUpdateCustomTarget}
          />,
        );

        const accordionHeader = screen.getByRole('button', { name: /Token Estimation/i });
        expect(accordionHeader).toBeInTheDocument();

        const toggleSwitch = screen.getByLabelText('Enable token estimation') as HTMLInputElement;
        expect(toggleSwitch).toBeInTheDocument();

        expect(toggleSwitch.checked).toBe(expectedChecked);
      },
    );
  });

  it("should update selectedTarget.config.tokenEstimation to { enabled: true, multiplier: 1.3 } when the 'Enable token estimation' switch is toggled on", () => {
    const selectedTarget: ProviderOptions = {
      id: 'http-provider',
      config: { tokenEstimation: { enabled: false } },
    };

    renderWithTheme(
      <HttpAdvancedConfiguration
        selectedTarget={selectedTarget}
        updateCustomTarget={mockUpdateCustomTarget}
      />,
    );

    const toggleSwitch = screen.getByLabelText('Enable token estimation') as HTMLInputElement;
    fireEvent.click(toggleSwitch);

    expect(mockUpdateCustomTarget).toHaveBeenCalledWith('tokenEstimation', {
      enabled: true,
      multiplier: 1.3,
    });
  });

  it("should update selectedTarget.config.tokenEstimation to { enabled: false } when the 'Enable token estimation' switch is toggled off", () => {
    const selectedTarget: ProviderOptions = {
      id: 'http-provider',
      config: { tokenEstimation: { enabled: true, multiplier: 1.3 } },
    };

    renderWithTheme(
      <HttpAdvancedConfiguration
        selectedTarget={selectedTarget}
        updateCustomTarget={mockUpdateCustomTarget}
      />,
    );

    const toggleSwitch = screen.getByLabelText('Enable token estimation') as HTMLInputElement;
    fireEvent.click(toggleSwitch);

    expect(mockUpdateCustomTarget).toHaveBeenCalledWith('tokenEstimation', { enabled: false });
  });

  it('should display a warning that the multiplier cannot be customized and an input field should be added', () => {
    const selectedTarget: ProviderOptions = {
      id: 'http-provider',
      config: {
        tokenEstimation: {
          enabled: true,
          multiplier: 1.3,
        },
      },
    };

    renderWithTheme(
      <HttpAdvancedConfiguration
        selectedTarget={selectedTarget}
        updateCustomTarget={mockUpdateCustomTarget}
      />,
    );

    const accordionHeader = screen.getByRole('button', { name: /Token Estimation/i });
    expect(accordionHeader).toBeInTheDocument();

    const toggleSwitch = screen.getByLabelText('Enable token estimation') as HTMLInputElement;
    expect(toggleSwitch).toBeInTheDocument();

    const multiplierInput = screen.queryByLabelText('Token estimation multiplier');
    expect(multiplierInput).toBeNull();
  });
});
