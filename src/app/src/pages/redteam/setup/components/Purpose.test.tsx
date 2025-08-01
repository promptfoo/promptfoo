import { callApi } from '@app/utils/api';
import { createTheme, ThemeProvider } from '@mui/material/styles';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import Purpose from './Purpose';

const mockUpdateApplicationDefinition = vi.fn();
const mockUpdateConfig = vi.fn();
const mockUseRedTeamConfig = vi.fn();
const mockRecordEvent = vi.fn();
const mockCheckHealth = vi.fn();

vi.mock('../hooks/useRedTeamConfig', () => ({
  useRedTeamConfig: () => mockUseRedTeamConfig(),
  DEFAULT_HTTP_TARGET: { id: 'http', config: {} },
}));

vi.mock('@app/hooks/useTelemetry', () => ({
  useTelemetry: () => ({
    recordEvent: mockRecordEvent,
  }),
}));

vi.mock('@app/hooks/useApiHealth', () => ({
  useApiHealth: () => ({
    status: 'connected',
    checkHealth: mockCheckHealth,
  }),
}));

vi.mock('@app/utils/api', () => ({
  callApi: vi.fn(),
}));

describe('Purpose Component', () => {
  const theme = createTheme();

  const renderComponent = (props: any) => {
    return render(
      <ThemeProvider theme={theme}>
        <Purpose {...props} />
      </ThemeProvider>,
    );
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockUseRedTeamConfig.mockReturnValue({
      config: {
        applicationDefinition: {
          purpose: 'A test purpose to enable the next button',
        },
        target: {},
        testGenerationInstructions: '',
      },
      updateApplicationDefinition: mockUpdateApplicationDefinition,
      updateConfig: mockUpdateConfig,
    });
  });

  describe('Navigation', () => {
    it("should render a 'Back' button and call the provided onBack callback when clicked", () => {
      const onBackMock = vi.fn();
      const onNextMock = vi.fn();

      renderComponent({ onNext: onNextMock, onBack: onBackMock });

      const backButton = screen.getByRole('button', { name: /back/i });
      expect(backButton).toBeInTheDocument();

      fireEvent.click(backButton);

      expect(onBackMock).toHaveBeenCalledTimes(1);

      expect(onNextMock).not.toHaveBeenCalled();
    });

    it('should render an empty Box when onBack is undefined', () => {
      const onNextMock = vi.fn();
      renderComponent({ onNext: onNextMock });

      const backButton = screen.queryByRole('button', { name: /back/i });
      expect(backButton).toBeNull();

      const nextButton = screen.getByRole('button', { name: /next/i });
      expect(nextButton).toBeInTheDocument();
    });
  });

  it('should enable the Next button when testMode is "model" and purpose is empty', () => {
    mockUseRedTeamConfig.mockReturnValue({
      config: {
        applicationDefinition: {
          purpose: '',
        },
        target: {},
        testGenerationInstructions: '',
      },
      updateApplicationDefinition: mockUpdateApplicationDefinition,
      updateConfig: mockUpdateConfig,
    });

    renderComponent({ onNext: vi.fn() });

    const modelButton = screen.getByRole('button', { name: /test model/i });
    fireEvent.click(modelButton);

    const nextButton = screen.getByRole('button', { name: /next/i });
    expect(nextButton).toBeEnabled();
  });

  it('should preserve form field values when navigating away and returning', () => {
    const testPurpose = 'Updated test purpose';
    renderComponent({ onNext: vi.fn() });

    const purposeTextField = screen.getByPlaceholderText(/e\.g\. Assist healthcare professionals/i);
    expect(purposeTextField).toBeInTheDocument();

    fireEvent.change(purposeTextField, { target: { value: testPurpose } });

    expect(mockUpdateApplicationDefinition).toHaveBeenCalledTimes(1);
    expect(mockUpdateApplicationDefinition).toHaveBeenCalledWith('purpose', testPurpose);
  });

  describe('Long Text Input', () => {
    it('should handle extremely long text input in the purpose field without breaking the UI or validation logic', () => {
      const longText = 'This is a very long text input. '.repeat(200);
      const onNextMock = vi.fn();

      mockUseRedTeamConfig.mockReturnValue({
        config: {
          applicationDefinition: {
            purpose: '',
          },
          target: {},
          testGenerationInstructions: '',
        },
        updateApplicationDefinition: mockUpdateApplicationDefinition,
        updateConfig: mockUpdateConfig,
      });

      renderComponent({ onNext: onNextMock });

      const purposeTextField = screen.getByPlaceholderText(/e.g. Assist healthcare professionals/i);
      expect(purposeTextField).toBeInTheDocument();

      fireEvent.change(purposeTextField, { target: { value: longText } });

      expect(mockUpdateApplicationDefinition).toHaveBeenCalledTimes(1);
      expect(mockUpdateApplicationDefinition).toHaveBeenCalledWith('purpose', longText);
    });
  });

  describe('Target Purpose Discovery', () => {
    it('should display an error message when the target purpose discovery API call fails', async () => {
      const errorMessage = 'Failed to discover target purpose';
      const mockCallApi = vi.mocked(callApi);
      mockCallApi.mockRejectedValue(new Error(errorMessage));

      mockUseRedTeamConfig.mockReturnValue({
        config: {
          applicationDefinition: {
            purpose: 'A test purpose to enable the next button',
          },
          target: {
            id: 'http',
            config: {
              url: 'http://example.com',
            },
          },
          testGenerationInstructions: '',
        },
        updateApplicationDefinition: mockUpdateApplicationDefinition,
        updateConfig: mockUpdateConfig,
      });

      renderComponent({ onNext: vi.fn() });

      const discoverButton = screen.getByRole('button', { name: /discover/i });
      fireEvent.click(discoverButton);

      await waitFor(() => {
        expect(screen.getByText(errorMessage)).toBeInTheDocument();
      });
    });
  });
});
