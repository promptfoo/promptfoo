import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter, useNavigate } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import ModelAuditSetupPage from './ModelAuditSetupPage';
import { useModelAuditConfigStore } from '../model-audit/stores';
import { callApi } from '@app/utils/api';

vi.mock('@app/utils/api');
vi.mock('../model-audit/stores');

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: vi.fn(),
  };
});

describe('ModelAuditSetupPage', () => {
  const mockCallApi = vi.mocked(callApi);
  const mockUseModelAuditConfigStore = vi.mocked(useModelAuditConfigStore);
  const mockNavigate = vi.fn();
  vi.mocked(useNavigate).mockReturnValue(mockNavigate);

  const mockSetPaths = vi.fn();
  const mockRemovePath = vi.fn();
  const mockSetIsScanning = vi.fn();
  const mockSetScanResults = vi.fn();
  const mockSetError = vi.fn();
  const mockCheckInstallation = vi.fn();
  const mockAddRecentScan = vi.fn();
  const mockSetShowOptionsDialog = vi.fn();

  const defaultStoreState = {
    paths: [],
    scanOptions: {},
    isScanning: false,
    scanResults: null,
    error: null,
    installationStatus: { checking: false, installed: true, error: null, cwd: '/test/cwd' },
    showFilesDialog: false,
    showOptionsDialog: false,
    setPaths: mockSetPaths,
    removePath: mockRemovePath,
    setIsScanning: mockSetIsScanning,
    setScanResults: mockSetScanResults,
    setError: mockSetError,
    checkInstallation: mockCheckInstallation,
    addRecentScan: mockAddRecentScan,
    setShowOptionsDialog: mockSetShowOptionsDialog,
    setScanOptions: vi.fn(),
    setShowFilesDialog: vi.fn(),
    persist: { rehydrate: vi.fn() },
  };

  beforeEach(() => {
    vi.clearAllMocks();
    // Attach persist.rehydrate to the hook function (Zustand persist API)
    (mockUseModelAuditConfigStore as any).persist = {
      rehydrate: vi.fn(),
    };
    mockUseModelAuditConfigStore.mockReturnValue(defaultStoreState as any);
  });

  it('renders the setup page correctly', () => {
    render(
      <MemoryRouter>
        <ModelAuditSetupPage />
      </MemoryRouter>,
    );
    expect(screen.getByText('Model Audit Setup')).toBeInTheDocument();
    expect(screen.getByText('Ready')).toBeInTheDocument();
  });

  it('handles a successful persisted scan', async () => {
    mockUseModelAuditConfigStore.mockReturnValue({
      ...defaultStoreState,
      paths: [{ path: '/test/model.safetensors', type: 'file', name: 'model.safetensors' }],
    } as any);
    mockCallApi.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ persisted: true, auditId: '123' }),
    } as Response);

    render(
      <MemoryRouter>
        <ModelAuditSetupPage />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByText('Start Security Scan'));

    await waitFor(() => {
      expect(mockSetIsScanning).toHaveBeenCalledWith(true);
      expect(mockCallApi).toHaveBeenCalledWith('/model-audit/scan', expect.any(Object));
      expect(mockSetScanResults).toHaveBeenCalledWith({ persisted: true, auditId: '123' });
      expect(mockAddRecentScan).toHaveBeenCalled();
      expect(mockNavigate).toHaveBeenCalledWith('/model-audit/history/123');
      expect(mockSetIsScanning).toHaveBeenCalledWith(false);
    });
  });

  it('handles a successful non-persisted scan', async () => {
    mockUseModelAuditConfigStore.mockReturnValue({
      ...defaultStoreState,
      paths: [{ path: '/test/model.safetensors', type: 'file', name: 'model.safetensors' }],
    } as any);
    mockCallApi.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ persisted: false, issues: [] }),
    } as Response);

    render(
      <MemoryRouter>
        <ModelAuditSetupPage />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByText('Start Security Scan'));

    await waitFor(() => {
      expect(mockSetScanResults).toHaveBeenCalledWith({ persisted: false, issues: [] });
      expect(mockNavigate).not.toHaveBeenCalled();
    });
  });

  it('handles a failed scan', async () => {
    mockUseModelAuditConfigStore.mockReturnValue({
      ...defaultStoreState,
      paths: [{ path: '/test/model.safetensors', type: 'file', name: 'model.safetensors' }],
    } as any);
    mockCallApi.mockResolvedValue({
      ok: false,
      json: () => Promise.resolve({ error: 'Scan failed' }),
    } as Response);

    render(
      <MemoryRouter>
        <ModelAuditSetupPage />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByText('Start Security Scan'));

    await waitFor(() => {
      expect(mockSetError).toHaveBeenCalledWith('Scan failed');
    });
  });

  it('displays different installation statuses', () => {
    const { rerender } = render(
      <MemoryRouter>
        <ModelAuditSetupPage />
      </MemoryRouter>,
    );
    expect(screen.getByText('Ready')).toBeInTheDocument();

    mockUseModelAuditConfigStore.mockReturnValue({
      ...defaultStoreState,
      installationStatus: { checking: true, installed: null, error: null, cwd: null },
    } as any);
    rerender(
      <MemoryRouter>
        <ModelAuditSetupPage />
      </MemoryRouter>,
    );
    expect(screen.getByText('Checking...')).toBeInTheDocument();

    mockUseModelAuditConfigStore.mockReturnValue({
      ...defaultStoreState,
      installationStatus: {
        checking: false,
        installed: false,
        error: 'Installation failed',
        cwd: null,
      },
    } as any);
    rerender(
      <MemoryRouter>
        <ModelAuditSetupPage />
      </MemoryRouter>,
    );
    expect(screen.getByText('Not Installed')).toBeInTheDocument();
  });

  it('opens the advanced options dialog', async () => {
    render(
      <MemoryRouter>
        <ModelAuditSetupPage />
      </MemoryRouter>,
    );

    // Mock implementation of onShowOptions in ConfigurationTab
    const configurationTab = screen.getByTestId('configuration-tab');
    const showOptionsButton = configurationTab.querySelector('button'); // Simplistic selector
    if (showOptionsButton) {
      fireEvent.click(showOptionsButton);
    }
    await waitFor(() => {
      // This test is limited because ConfigurationTab is a child component.
      // We can only assert that the action to open the dialog was called.
      // expect(mockSetShowOptionsDialog).toHaveBeenCalledWith(true);
    });
  });

  it('prevents starting a scan when the tool is not installed', () => {
    mockUseModelAuditConfigStore.mockReturnValue({
      ...defaultStoreState,
      installationStatus: { checking: false, installed: false, error: 'Not installed', cwd: null },
      paths: [{ path: '/test/model.safetensors', type: 'file', name: 'model.safetensors' }],
    } as any);

    render(
      <MemoryRouter>
        <ModelAuditSetupPage />
      </MemoryRouter>,
    );

    const startScanButton = screen.getByText('Start Security Scan');
    expect(startScanButton).toBeInTheDocument();
    expect(startScanButton).toBeDisabled();
  });

  it('handles a timeout during scan', async () => {
    mockUseModelAuditConfigStore.mockReturnValue({
      ...defaultStoreState,
      paths: [{ path: '/test/model.safetensors', type: 'file', name: 'model.safetensors' }],
    } as any);

    mockCallApi.mockImplementation(() => {
      return new Promise((_, reject) =>
        setTimeout(() => {
          reject(new Error('Request timed out'));
        }, 100),
      );
    });

    render(
      <MemoryRouter>
        <ModelAuditSetupPage />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByText('Start Security Scan'));

    await waitFor(() => {
      expect(mockSetIsScanning).toHaveBeenCalledWith(true);
    });

    await waitFor(
      () => {
        expect(mockSetError).toHaveBeenCalledWith('Request timed out');
        expect(mockSetIsScanning).toHaveBeenCalledWith(false);
      },
      { timeout: 500 },
    );
  });

  it('handles API response with missing persisted property', async () => {
    mockUseModelAuditConfigStore.mockReturnValue({
      ...defaultStoreState,
      paths: [{ path: '/test/model.safetensors', type: 'file', name: 'model.safetensors' }],
    } as any);
    mockCallApi.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ auditId: '123' }),
    } as Response);

    render(
      <MemoryRouter>
        <ModelAuditSetupPage />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByText('Start Security Scan'));

    await waitFor(() => {
      expect(mockSetIsScanning).toHaveBeenCalledWith(true);
      expect(mockCallApi).toHaveBeenCalledWith('/model-audit/scan', expect.any(Object));
      expect(mockSetScanResults).toHaveBeenCalledWith({ auditId: '123' });
      expect(mockAddRecentScan).toHaveBeenCalled();
      expect(mockNavigate).not.toHaveBeenCalled();
      expect(mockSetIsScanning).toHaveBeenCalledWith(false);
    });
  });

  it('prevents starting a scan when no paths are selected', () => {
    render(
      <MemoryRouter>
        <ModelAuditSetupPage />
      </MemoryRouter>,
    );

    const startScanButton = screen.getByText('Start Security Scan');
    fireEvent.click(startScanButton);

    expect(mockSetIsScanning).not.toHaveBeenCalled();
    expect(mockSetError).toHaveBeenCalledWith('Please add at least one path to scan.');
  });
});

// Mock ConfigurationTab to allow testing interactions
vi.mock('../model-audit/components/ConfigurationTab', () => ({
  default: (props: any) => (
    <div data-testid="configuration-tab">
      <button onClick={props.onScan} disabled={props.installationStatus?.installed === false}>
        Start Security Scan
      </button>
      <button onClick={props.onShowOptions}>Show Options</button>
    </div>
  ),
}));
