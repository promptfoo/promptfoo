import React, { forwardRef, useImperativeHandle } from 'react';
import { createTheme, ThemeProvider } from '@mui/material/styles';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

import TargetConfiguration from './TargetConfiguration';

vi.mock('@app/hooks/useTelemetry', () => ({
  useTelemetry: () => ({
    recordEvent: vi.fn(),
  }),
}));

const mockUpdateConfig = vi.fn();
const mockUseRedTeamConfig = vi.fn();
vi.mock('../../hooks/useRedTeamConfig', () => ({
  useRedTeamConfig: () => mockUseRedTeamConfig(),
  DEFAULT_HTTP_TARGET: { id: 'http', label: 'Default HTTP Target', config: {} },
}));

const mockValidate = vi.fn();
vi.mock('./ProviderConfigEditor', () => ({
  default: forwardRef((_props, ref) => {
    useImperativeHandle(ref, () => ({
      validate: mockValidate,
    }));
    return <div data-testid="mock-provider-config-editor" />;
  }),
}));

vi.mock('../LoadExampleButton', () => ({
  default: () => <div data-testid="mock-load-example-button" />,
}));

vi.mock('../Prompts', () => ({
  default: () => <div data-testid="mock-prompts" />,
}));

vi.mock('./TestTargetConfiguration', () => ({
  default: () => <div data-testid="mock-test-target-configuration" />,
}));

const renderWithTheme = (ui: React.ReactElement) => {
  const theme = createTheme();
  return render(<ThemeProvider theme={theme}>{ui}</ThemeProvider>);
};

describe('TargetConfiguration', () => {
  let onNextMock: ReturnType<typeof vi.fn>;
  let onBackMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    onNextMock = vi.fn();
    onBackMock = vi.fn();

    mockUseRedTeamConfig.mockReturnValue({
      config: {
        target: { id: 'test-provider', label: 'Test Provider', config: {} },
        extensions: [],
        prompts: [],
      },
      updateConfig: mockUpdateConfig,
    });
  });

  describe('Navigation', () => {
    it("should call onNext when 'Next' is clicked, provider is valid, and there are no validation errors", () => {
      mockValidate.mockReturnValue(true);

      renderWithTheme(
        <TargetConfiguration onNext={onNextMock} onBack={onBackMock} setupModalOpen={false} />,
      );

      const nextButton = screen.getByRole('button', { name: /Next/i });

      expect(nextButton).not.toBeDisabled();

      fireEvent.click(nextButton);

      expect(mockValidate).toHaveBeenCalledTimes(1);
      expect(onNextMock).toHaveBeenCalledTimes(1);
      expect(onBackMock).not.toHaveBeenCalled();
    });
  });
});
