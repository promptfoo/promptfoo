import { TooltipProvider } from '@app/components/ui/tooltip';
import { useTelemetry } from '@app/hooks/useTelemetry';
import { useToast } from '@app/hooks/useToast';
import { callApi } from '@app/utils/api';
import { getUnifiedConfig } from '@promptfoo/redteam/sharedFrontend';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, type Mock, vi } from 'vitest';
import { useRedTeamConfig } from './hooks/useRedTeamConfig';
import { useRedTeamTargetConfigValidation } from './hooks/useRedTeamTargetConfigValidation';
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

// These gates are unrelated to target import/export; the Run Now component and
// both configuration stores below remain real.
const reviewRunGates = vi.hoisted(() => ({
  setJob: vi.fn(),
  clearJob: vi.fn(),
  signalEvalCompleted: vi.fn(),
  checkEmailStatus: vi.fn(),
}));
vi.mock('@app/hooks/useApiHealth', () => ({
  useApiHealth: () => ({ data: { status: 'connected' }, isLoading: false }),
}));
vi.mock('@app/hooks/useEmailVerification', () => ({
  useEmailVerification: () => ({ checkEmailStatus: reviewRunGates.checkEmailStatus }),
}));
vi.mock('@app/hooks/useEvalHistoryRefresh', () => ({
  useEvalHistoryRefresh: () => ({ signalEvalCompleted: reviewRunGates.signalEvalCompleted }),
}));
vi.mock('@app/stores/redteamJobStore', () => ({
  useRedteamJobStore: () => ({
    jobId: null,
    _hasHydrated: true,
    setJob: reviewRunGates.setJob,
    clearJob: reviewRunGates.clearJob,
  }),
}));

// Mock child components to isolate the page component
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
const mockedCallApi = vi.mocked(callApi);

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
      useRedTeamTargetConfigValidation.getState().clearTargetConfigValidation();
    });

    // Provide default mock implementations for hooks
    mockedUseTelemetry.mockReturnValue({ recordEvent: vi.fn() });
    mockedUseToast.mockReturnValue({ showToast: vi.fn() });
    mockedUseSetupState.mockReturnValue({
      hasSeenSetup: true, // Assume setup has been seen to not render the modal
      markSetupAsSeen: vi.fn(),
    });
    mockedCallApi.mockResolvedValue({
      ok: true,
      json: async () => ({ configs: [] }),
    } as Response);
  });

  afterEach(() => {
    act(() => {
      useRedTeamConfig.setState(initialRedTeamState);
      useRedTeamTargetConfigValidation.getState().clearTargetConfigValidation();
    });
  });

  describe('Accessibility Fallback', () => {
    it('should display a fallback title when JavaScript is disabled', () => {
      render(
        <MemoryRouter initialEntries={['/redteam/setup']}>
          <RedTeamSetupPage />
        </MemoryRouter>,
      );

      expect(screen.getAllByText(/New Configuration/i).length).toBeGreaterThan(0);
    });

    it('keeps the sidebar off the mobile layout path', () => {
      render(
        <MemoryRouter initialEntries={['/redteam/setup']}>
          <RedTeamSetupPage />
        </MemoryRouter>,
      );

      expect(screen.getByTestId('redteam-setup-sidebar')).toHaveClass('hidden', 'md:flex');
    });

    it('keeps config management reachable on mobile', async () => {
      const user = userEvent.setup();
      render(
        <MemoryRouter initialEntries={['/redteam/setup']}>
          <RedTeamSetupPage />
        </MemoryRouter>,
      );

      expect(screen.getByTestId('redteam-setup-mobile-actions')).toHaveClass('md:hidden');

      await user.click(screen.getByRole('button', { name: 'Config' }));
      await user.click(screen.getByRole('menuitem', { name: 'Save Config' }));

      expect(screen.getByRole('heading', { name: 'Save Configuration' })).toBeInTheDocument();
    });

    it('disables Save while a target configuration has an invalid JSON edit', async () => {
      const user = userEvent.setup();
      act(() => {
        useRedTeamTargetConfigValidation
          .getState()
          .setTargetConfigError('Invalid JSON configuration');
      });

      render(
        <MemoryRouter initialEntries={['/redteam/setup']}>
          <RedTeamSetupPage />
        </MemoryRouter>,
      );

      await user.click(screen.getByRole('button', { name: 'Config' }));
      await user.click(screen.getByRole('menuitem', { name: 'Save Config' }));
      await user.type(screen.getByLabelText('Configuration Name'), 'Unsafe target config');

      expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
      expect(screen.getByRole('button', { name: 'Export YAML' })).toBeDisabled();
      expect(mockedCallApi).not.toHaveBeenCalledWith('/configs', expect.anything());
    });
  });

  it.each(['network', 'server', 'success'])(
    'updates dirty state for the %s save outcome',
    async (outcome) => {
      const user = userEvent.setup();
      render(
        <MemoryRouter>
          <RedTeamSetupPage />
        </MemoryRouter>,
      );
      const target = {
        id: 'openai:chat:served-custom-model',
        config: {
          type: 'vllm',
          apiBaseUrl: 'https://explicit.example.test/v1',
          apiHost: 'preferred.example.test/tenant',
          apiKey: 'synthetic-inline-key',
          apiKeyEnvar: 'LOCAL_MODEL_KEY',
          apiKeyRequired: true,
          useDefaultApiKey: false,
          model: 'explicit-served-model',
          passthrough: { temperature: 0.25 },
        },
      };
      act(() => useRedTeamConfig.getState().updateConfig('target', target));
      await user.click(screen.getByRole('button', { name: 'Config' }));
      await user.click(screen.getByRole('menuitem', { name: 'Save Config' }));
      await user.type(screen.getByLabelText('Configuration Name'), 'Test config');
      expect(screen.getAllByText(/Unsaved changes/).length).toBeGreaterThan(0);
      if (outcome === 'network') {
        mockedCallApi.mockRejectedValueOnce(new Error('Save failed'));
      } else {
        mockedCallApi.mockResolvedValueOnce({
          ok: outcome === 'success',
          json: async () =>
            outcome === 'success' ? { createdAt: '2026-09-11' } : { error: 'Save failed' },
        } as Response);
      }
      await user.click(screen.getByRole('button', { name: /^Save$/ }));
      await waitFor(() =>
        expect(mockedUseToast().showToast).toHaveBeenCalledWith(
          outcome === 'success' ? 'Configuration saved successfully' : 'Save failed',
          outcome === 'success' ? 'success' : 'error',
        ),
      );
      const saved = mockedCallApi.mock.calls.filter(
        ([url, options]) => url === '/configs' && options?.method === 'POST',
      );
      expect(saved).toHaveLength(1);
      expect(JSON.parse(String(saved[0][1]?.body)).config.target).toEqual(target);
      expect(useRedTeamConfig.getState().config.target).toEqual(target);
      expect(useRedTeamTargetConfigValidation.getState().targetConfigError).toBeNull();
      if (outcome === 'success') {
        expect(screen.queryByText(/Unsaved changes/)).not.toBeInTheDocument();
      } else {
        expect(screen.getAllByText(/Unsaved changes/).length).toBeGreaterThan(0);
      }
    },
  );

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

  describe('strategy sidebar count', () => {
    it('should exclude hidden default strategies from the sidebar count', () => {
      act(() => {
        const current = useRedTeamConfig.getState().config;
        useRedTeamConfig.setState({
          config: {
            ...current,
            strategies: ['basic', 'jailbreak:meta'],
          },
        });
      });

      render(
        <MemoryRouter initialEntries={['/redteam/setup']}>
          <RedTeamSetupPage />
        </MemoryRouter>,
      );

      expect(screen.getByRole('tab', { name: 'Strategies (1)' })).toBeInTheDocument();
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
    it('normalizes an object target with an omitted config while importing YAML', async () => {
      const user = userEvent.setup();
      const showToast = vi.fn();
      mockedUseToast.mockReturnValue({ showToast });

      render(
        <MemoryRouter initialEntries={['/redteam/setup']}>
          <RedTeamSetupPage />
        </MemoryRouter>,
      );
      await user.click(screen.getByRole('button', { name: /Load Config/i }));
      const file = new File(
        [
          'description: Valid shorthand target\ntargets:\n  - id: openai:gpt-5\n    label: customer-service-agent\nredteam:\n  plugins: [default]\n',
        ],
        'config.yaml',
        { type: 'text/yaml' },
      );

      await user.upload(document.querySelector('input[type="file"]') as HTMLInputElement, file);

      await waitFor(() => {
        expect(useRedTeamConfig.getState().config.target).toEqual({
          id: 'openai:gpt-5',
          label: 'customer-service-agent',
          config: {},
        });
        expect(useRedTeamTargetConfigValidation.getState().targetConfigError).toBeNull();
      });
      expect(showToast).toHaveBeenCalledWith('Configuration loaded successfully', 'success');
    });

    it('keeps a YAML timestamp target config blocked after import', async () => {
      const user = userEvent.setup();

      render(
        <MemoryRouter initialEntries={['/redteam/setup']}>
          <RedTeamSetupPage />
        </MemoryRouter>,
      );
      await user.click(screen.getByRole('button', { name: /Load Config/i }));
      const file = new File(
        [
          'description: Invalid timestamp target\ntargets:\n  - id: openinterpreter\n    label: Coding target\n    config: 2024-01-01\nredteam:\n  plugins: [default]\n',
        ],
        'config.yaml',
        { type: 'text/yaml' },
      );

      await user.upload(document.querySelector('input[type="file"]') as HTMLInputElement, file);

      await waitFor(() =>
        expect(useRedTeamTargetConfigValidation.getState().targetConfigError).toBe(
          'Configuration must be a JSON object',
        ),
      );
      expect(useRedTeamTargetConfigValidation.getState().targetConfigDraft).toBe(
        '"2024-01-01T00:00:00.000Z"',
      );
    });

    it.each([
      ['array', '[]', '[]'],
      ['null', 'null', 'null'],
      ['scalar', 'invalid-config', '"invalid-config"'],
      ['timestamp', '2024-01-01', '"2024-01-01T00:00:00.000Z"'],
    ])(
      'keeps a YAML %s target config blocked with a stateful strategy',
      async (_case, yamlConfig, expectedDraft) => {
        const user = userEvent.setup();

        render(
          <MemoryRouter initialEntries={['/redteam/setup']}>
            <RedTeamSetupPage />
          </MemoryRouter>,
        );
        await user.click(screen.getByRole('button', { name: /Load Config/i }));
        const file = new File(
          [
            `description: Invalid stateful target\ntargets:\n  - id: openinterpreter\n    label: Coding target\n    config: ${yamlConfig}\nredteam:\n  plugins: [default]\n  strategies:\n    - id: jailbreak\n      config:\n        stateful: true\n`,
          ],
          'config.yaml',
          { type: 'text/yaml' },
        );

        await user.upload(document.querySelector('input[type="file"]') as HTMLInputElement, file);

        await waitFor(() =>
          expect(useRedTeamTargetConfigValidation.getState().targetConfigError).toBe(
            'Configuration must be a JSON object',
          ),
        );
        expect(useRedTeamTargetConfigValidation.getState().targetConfigDraft).toBe(expectedDraft);
      },
    );

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

    it.each([
      ['vllm', 'http://localhost:8000/v1'],
      ['llamafile', 'http://localhost:8080/v1'],
      ['text-generation-webui', 'http://localhost:5000/v1'],
    ])('normalizes uploaded %s YAML before any target editor event', async (type, apiBaseUrl) => {
      const user = userEvent.setup();
      render(
        <MemoryRouter initialEntries={['/redteam/setup']}>
          <RedTeamSetupPage />
        </MemoryRouter>,
      );
      await user.click(screen.getByRole('button', { name: /Load Config/i }));
      const file = new File(
        [
          `
 description: Direct local import
 targets:
   - id: openai:chat:gpt-4o
     label: Imported local target
     config:
       type: ${type}
 prompts: ['{{prompt}}']
 redteam:
   purpose: Offline normalization control
   plugins: [shell-injection]
   strategies: [basic]
`,
        ],
        'local.yaml',
        { type: 'text/yaml' },
      );
      await user.upload(document.querySelector('input[type="file"]') as HTMLInputElement, file);
      await waitFor(() => {
        expect(useRedTeamConfig.getState().config.target).toEqual({
          id: 'openai:chat:gpt-4o',
          label: 'Imported local target',
          config: { type, apiBaseUrl, apiKeyRequired: false, useDefaultApiKey: false },
        });
      });
      const exported = getUnifiedConfig(useRedTeamConfig.getState().config);
      expect(exported.targets).toEqual([useRedTeamConfig.getState().config.target]);
      expect(useRedTeamTargetConfigValidation.getState().targetConfigError).toBeNull();
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

    it('should preserve legacy GPT-5 target IDs when loading a YAML config', async () => {
      const user = userEvent.setup();

      render(
        <MemoryRouter initialEntries={['/redteam/setup']}>
          <RedTeamSetupPage />
        </MemoryRouter>,
      );

      const loadButton = screen.getByRole('button', { name: /Load Config/i });
      await user.click(loadButton);

      const yamlContent = `
description: Legacy GPT-5 target config
targets:
  - openai:gpt-5-mini
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

      await waitFor(() => {
        const { config, providerType } = useRedTeamConfig.getState();
        expect(config.target.id).toBe('openai:gpt-5-mini');
        expect(config.target.label).toBe('openai:gpt-5-mini');
        expect(providerType).toBe('openai');
      });
    });

    it.each([
      ['vertex:gemini-3.1-pro-preview', 'global'],
      ['vertex:gemini-2.5-pro', undefined],
      ['vertex:gemini-3.6-flash', 'global'],
      ['vertex:gemini-3.7-flash', 'global'],
      ['vertex:gemini-3.8-flash', 'global'],
    ])(
      'should preserve legacy Vertex target ID %s when loading a YAML config',
      async (targetId, region) => {
        const user = userEvent.setup();

        render(
          <MemoryRouter initialEntries={['/redteam/setup']}>
            <RedTeamSetupPage />
          </MemoryRouter>,
        );

        const loadButton = screen.getByRole('button', { name: /Load Config/i });
        await user.click(loadButton);

        const yamlContent = `
description: Legacy Vertex target config
targets:
  - ${targetId}
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

        await waitFor(() => {
          const { config, providerType } = useRedTeamConfig.getState();
          expect(config.target.id).toBe(targetId);
          expect(config.target.label).toBe(targetId);
          expect(config.target.config?.region).toBe(region);
          expect(providerType).toBe('vertex');
        });
      },
    );
  });

  describe('real Review Run Now after direct target import', () => {
    beforeEach(() => {
      reviewRunGates.checkEmailStatus.mockReset();
      reviewRunGates.checkEmailStatus.mockResolvedValue({ canProceed: true });
      reviewRunGates.setJob.mockReset();
      reviewRunGates.clearJob.mockReset();
      reviewRunGates.signalEvalCompleted.mockReset();
      mockedCallApi.mockReset();
      mockedCallApi.mockImplementation(async (url) => {
        if (url === '/redteam/status') {
          return { ok: true, json: async () => ({ hasRunningJob: false }) } as Response;
        }
        if (url === '/redteam/run') {
          return { ok: true, json: async () => ({ id: 'imported-target-job' }) } as Response;
        }
        throw new Error(`Unexpected Review request: ${url}`);
      });
    });

    const mountActualReview = async () => {
      const { default: ActualReview } =
        await vi.importActual<typeof import('./components/Review')>('./components/Review');
      return render(
        <MemoryRouter>
          <TooltipProvider>
            <ActualReview
              navigateToPlugins={vi.fn()}
              navigateToStrategies={vi.fn()}
              navigateToPurpose={vi.fn()}
            />
          </TooltipProvider>
        </MemoryRouter>,
      );
    };

    it.each([
      { type: 'vllm', apiBaseUrl: 'http://localhost:8000/v1' },
      { type: 'llamafile', apiBaseUrl: 'http://localhost:8080/v1' },
      { type: 'text-generation-webui', apiBaseUrl: 'http://localhost:5000/v1' },
    ])('sends normalized $type defaults without an editor event', async ({ type, apiBaseUrl }) => {
      const user = userEvent.setup();
      const target = { id: 'openai:chat:served-custom-model', config: { type } };
      act(() => {
        useRedTeamConfig.getState().setFullConfig({
          ...useRedTeamConfig.getState().config,
          target,
        });
      });
      const view = await mountActualReview();
      await user.click(screen.getByRole('button', { name: 'Run Now' }));
      await waitFor(() =>
        expect(reviewRunGates.setJob).toHaveBeenCalledWith('imported-target-job'),
      );
      const requests = mockedCallApi.mock.calls.filter(([url]) => url === '/redteam/run');
      expect(requests).toHaveLength(1);
      expect(requests[0][1]?.method).toBe('POST');
      const body = JSON.parse(String(requests[0][1]?.body));
      expect(body.config.targets).toEqual([
        {
          id: target.id,
          config: { type, apiBaseUrl, apiKeyRequired: false, useDefaultApiKey: false },
        },
      ]);
      expect(target.config).toEqual({ type });
      view.unmount();
    });

    it.each([false, true])(
      'keeps explicit credentials and selector %s in the run request',
      async (selector) => {
        const user = userEvent.setup();
        const target = {
          id: 'openai:chat:served-custom-model',
          config: {
            type: 'vllm',
            apiHost: 'preferred.example.test/tenant',
            apiBaseUrl: 'https://custom.example.test/v1',
            apiKey: 'synthetic-inline-key',
            apiKeyEnvar: 'LOCAL_MODEL_KEY',
            apiKeyRequired: selector,
            useDefaultApiKey: selector,
            model: 'explicit-served-model',
            stop: ['<end>'],
            passthrough: { temperature: 0.25 },
          },
        };
        act(() => {
          useRedTeamConfig.getState().setFullConfig({
            ...useRedTeamConfig.getState().config,
            target,
          });
        });
        const view = await mountActualReview();
        await user.click(screen.getByRole('button', { name: 'Run Now' }));
        await waitFor(() =>
          expect(reviewRunGates.setJob).toHaveBeenCalledWith('imported-target-job'),
        );
        const requests = mockedCallApi.mock.calls.filter(([url]) => url === '/redteam/run');
        expect(requests).toHaveLength(1);
        expect(JSON.parse(String(requests[0][1]?.body)).config.targets).toEqual([target]);
        view.unmount();
      },
    );

    it('blocks an imported non-object target before the run transport', async () => {
      const user = userEvent.setup();
      act(() => {
        const config = useRedTeamConfig.getState().config;
        useRedTeamConfig.getState().setFullConfig({
          ...config,
          target: {
            id: 'openai:chat:served-custom-model',
            config: [] as unknown as typeof config.target.config,
          },
        });
      });
      const view = await mountActualReview();
      expect(useRedTeamTargetConfigValidation.getState().targetConfigError).toBe(
        'Configuration must be a JSON object',
      );
      const run = screen.getByRole('button', { name: 'Run Now' });
      expect(run).toBeDisabled();
      await user.click(run);
      expect(mockedCallApi.mock.calls.filter(([url]) => url === '/redteam/run')).toHaveLength(0);
      view.unmount();
    });
  });
});
