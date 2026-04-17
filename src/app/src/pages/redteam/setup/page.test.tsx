import { useTelemetry } from '@app/hooks/useTelemetry';
import { useToast } from '@app/hooks/useToast';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, type Mock, vi } from 'vitest';
import { useRedTeamConfig } from './hooks/useRedTeamConfig';
import { useSetupState } from './hooks/useSetupState';
import RedTeamSetupPage from './page';

// Define these variables outside the test
const mockNavigate = vi.fn();
const mockLocation = {
  pathname: '/redteam/setup',
  search: '',
  hash: '',
  state: null,
  key: 'default',
};

// Mock react-router-dom
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
    useLocation: () => mockLocation,
  };
});

// Mock hooks (but NOT useRedTeamConfig — use the real Zustand store)
vi.mock('@app/hooks/useTelemetry', () => ({ useTelemetry: vi.fn() }));
vi.mock('@app/hooks/useToast', () => ({ useToast: vi.fn() }));
vi.mock('./hooks/useSetupState', () => ({ useSetupState: vi.fn() }));
vi.mock('@app/utils/api', () => ({
  callApi: vi.fn(),
  fetchUserEmail: vi.fn(() => Promise.resolve('test@example.com')),
  fetchUserId: vi.fn(() => Promise.resolve('test-user-id')),
  updateEvalAuthor: vi.fn(() => Promise.resolve({})),
}));

// Mock child components to isolate the page component
vi.mock('@app/components/PylonChat', () => ({ default: () => <div>PylonChat</div> }));
vi.mock('./components/Targets', () => ({ default: () => <div>Targets</div> }));
vi.mock('./components/Targets/TargetTypeSelection', () => ({
  default: () => <div>TargetTypeSelection</div>,
}));
vi.mock('./components/Purpose', () => ({ default: () => <div>Purpose</div> }));
vi.mock('./components/Plugins', () => ({ default: () => <div>Plugins</div> }));
vi.mock('./components/Strategies', () => ({ default: () => <div>Strategies</div> }));
vi.mock('./components/Review', () => ({ default: () => <div>Review</div> }));
vi.mock('./components/Setup', () => ({
  default: () => <div data-testid="setup-modal">Setup</div>,
}));

const mockedUseTelemetry = useTelemetry as Mock;
const mockedUseToast = useToast as Mock;
const mockedUseSetupState = useSetupState as unknown as Mock;

// Capture initial store state for reset
const initialRedTeamState = useRedTeamConfig.getState();

// Add this to handle the window.scrollTo error
vi.stubGlobal('scrollTo', vi.fn());

describe('RedTeamSetupPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Reset the real Zustand store to initial state
    act(() => {
      useRedTeamConfig.setState(initialRedTeamState);
    });

    // Provide default mock implementations for hooks
    mockedUseTelemetry.mockReturnValue({ recordEvent: vi.fn() });
    mockedUseToast.mockReturnValue({ showToast: vi.fn() });
    mockedUseSetupState.mockReturnValue({
      hasSeenSetup: true, // Assume setup has been seen to not render the modal
      markSetupAsSeen: vi.fn(),
    });
  });

  afterEach(() => {
    act(() => {
      useRedTeamConfig.setState(initialRedTeamState);
    });
  });

  describe('Accessibility Fallback', () => {
    it('should display a fallback title when JavaScript is disabled', () => {
      render(
        <MemoryRouter initialEntries={['/redteam/setup']}>
          <RedTeamSetupPage />
        </MemoryRouter>,
      );

      const fallbackTitle = screen.getByText(/New Configuration/i);
      expect(fallbackTitle).toBeInTheDocument();
    });
  });

  describe('URL Hash Updates', () => {
    it('should update the URL hash when the tab state changes', async () => {
      const user = userEvent.setup();
      render(
        <MemoryRouter initialEntries={['/redteam/setup']}>
          <RedTeamSetupPage />
        </MemoryRouter>,
      );

      // Simulate a tab change by clicking the "Plugins" tab (index 3)
      const pluginsTab = screen.getByRole('tab', { name: /Plugins/i });
      await user.click(pluginsTab);

      // Assert that useNavigate is called with the correct hash
      await waitFor(() => {
        expect(mockNavigate).toHaveBeenCalledWith('#3');
      });
    });
  });

  it('should display the setup modal if hasSeenSetup is false', () => {
    mockedUseSetupState.mockReturnValue({
      hasSeenSetup: false,
      markSetupAsSeen: vi.fn(),
    });

    render(
      <MemoryRouter initialEntries={['/redteam/setup']}>
        <RedTeamSetupPage />
      </MemoryRouter>,
    );

    const setupModal = screen.getByTestId('setup-modal');
    expect(setupModal).toBeInTheDocument();
  });

  describe('YAML file import', () => {
    it('should preserve redteam.provider when loading a YAML config', async () => {
      const user = userEvent.setup();
      mockedUseToast.mockReturnValue({ showToast: vi.fn() });

      render(
        <MemoryRouter initialEntries={['/redteam/setup']}>
          <RedTeamSetupPage />
        </MemoryRouter>,
      );

      // Open the load dialog
      const loadButton = screen.getByRole('button', { name: /Load Config/i });
      await user.click(loadButton);

      // Create a YAML file with redteam.provider configured
      const yamlContent = `
description: Test Config
targets:
  - id: openai:chat:gpt-4
prompts:
  - "{{prompt}}"
redteam:
  purpose: Test purpose
  provider:
    id: openai:chat:qwen3
    config:
      apiBaseUrl: http://192.168.1.1:9090/v1
      apiKey: sk-test-key
  plugins:
    - shell-injection
  strategies:
    - jailbreak
`;
      const file = new File([yamlContent], 'config.yaml', { type: 'text/yaml' });

      // Find the hidden file input and upload the file
      const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
      expect(fileInput).toBeTruthy();
      await user.upload(fileInput, file);

      // Verify the store was updated with all redteam fields preserved
      await waitFor(() => {
        const { config } = useRedTeamConfig.getState();
        expect(config.provider).toEqual({
          id: 'openai:chat:qwen3',
          config: {
            apiBaseUrl: 'http://192.168.1.1:9090/v1',
            apiKey: 'sk-test-key',
          },
        });
        expect(config.plugins).toEqual(['shell-injection']);
        expect(config.strategies).toEqual(['jailbreak']);
        expect(config.purpose).toBe('Test purpose');
      });
    });

    it('should handle YAML config without redteam.provider gracefully', async () => {
      const user = userEvent.setup();

      render(
        <MemoryRouter initialEntries={['/redteam/setup']}>
          <RedTeamSetupPage />
        </MemoryRouter>,
      );

      // Open the load dialog
      const loadButton = screen.getByRole('button', { name: /Load Config/i });
      await user.click(loadButton);

      // Create a YAML file without redteam.provider
      const yamlContent = `
description: Test Config
targets:
  - id: openai:chat:gpt-4
prompts:
  - "{{prompt}}"
redteam:
  purpose: Test purpose
  plugins:
    - shell-injection
`;
      const file = new File([yamlContent], 'config.yaml', { type: 'text/yaml' });

      const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
      expect(fileInput).toBeTruthy();
      await user.upload(fileInput, file);

      // Verify the store was updated with provider as undefined
      await waitFor(() => {
        const { config } = useRedTeamConfig.getState();
        expect(config.provider).toBeUndefined();
        expect(config.purpose).toBe('Test purpose');
        expect(config.plugins).toEqual(['shell-injection']);
      });
    });
  });
});
