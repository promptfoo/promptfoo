import React from 'react';

import { TooltipProvider } from '@app/components/ui/tooltip';
import { callApi } from '@app/utils/api';
import { act, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import HttpEndpointConfiguration from './HttpEndpointConfiguration';

vi.mock('@app/utils/api', () => ({
  callApi: vi.fn(),
}));

vi.mock('react-simple-code-editor', () => ({
  default: ({ value, onValueChange }: any) => (
    <textarea
      data-testid="code-editor"
      value={value}
      onChange={(e) => onValueChange(e.target.value)}
    />
  ),
}));

vi.mock('./PostmanImportDialog', () => ({
  default: ({
    open,
    onImport,
  }: {
    open: boolean;
    onImport: (config: {
      url: string;
      method: string;
      headers: Record<string, string>;
      body: string;
    }) => void;
  }) =>
    open ? (
      <button
        type="button"
        onClick={() =>
          onImport({
            url: 'https://postman.example.com/chat',
            method: 'PATCH',
            headers: { Authorization: 'Bearer postman' },
            body: '{"message":"{{prompt}}"}',
          })
        }
      >
        Mock Postman Import
      </button>
    ) : null,
}));

// Wrapper component for providing tooltip context
const Wrapper = ({ children }: { children: React.ReactNode }) => (
  <TooltipProvider>{children}</TooltipProvider>
);

const renderWithProviders = (ui: React.ReactElement) => {
  return render(ui, { wrapper: Wrapper });
};

describe('HttpEndpointConfiguration - Header Field Layout', () => {
  let mockUpdateCustomTarget: (field: string, value: unknown) => void;
  let mockSetBodyError: (error: string | React.ReactNode | null) => void;
  let mockSetUrlError: (error: string | null) => void;

  const defaultProps = {
    selectedTarget: {
      id: 'http',
      label: 'Test HTTP Target',
      config: {
        url: 'https://api.example.com/chat',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization:
            'Bearer very-long-token-value-that-could-cause-layout-issues-if-not-handled-properly',
        },
        body: '{"message": "{{prompt}}"}',
      },
    },
    bodyError: null,
    urlError: null,
  };

  beforeEach(() => {
    mockUpdateCustomTarget = vi.fn();
    mockSetBodyError = vi.fn();
    mockSetUrlError = vi.fn();
    vi.clearAllMocks();
  });

  it('should maintain minimum widths for header Name and Value fields on narrow viewports', () => {
    renderWithProviders(
      <div style={{ width: 200 }}>
        <HttpEndpointConfiguration
          {...defaultProps}
          updateCustomTarget={mockUpdateCustomTarget}
          setBodyError={mockSetBodyError}
          urlError={defaultProps.urlError}
          setUrlError={mockSetUrlError}
        />
      </div>,
    );

    const nameFields = screen.getAllByPlaceholderText('Name');
    const valueFields = screen.getAllByPlaceholderText('Value');

    expect(nameFields).toHaveLength(2);
    expect(valueFields).toHaveLength(2);

    const firstNameField = nameFields[0];
    const firstValueField = valueFields[0];

    expect(firstNameField).toBeVisible();
    expect(firstValueField).toBeVisible();
  });

  it('stacks the raw-request toggle above import controls on narrow screens', () => {
    renderWithProviders(
      <HttpEndpointConfiguration
        {...defaultProps}
        updateCustomTarget={mockUpdateCustomTarget}
        setBodyError={mockSetBodyError}
        urlError={defaultProps.urlError}
        setUrlError={mockSetUrlError}
      />,
    );

    expect(screen.getByText('Use Raw HTTP Request').parentElement?.parentElement).toHaveClass(
      'flex-col',
      'sm:flex-row',
    );
  });

  it('stacks the method and URL controls on narrow screens', () => {
    renderWithProviders(
      <HttpEndpointConfiguration
        {...defaultProps}
        updateCustomTarget={mockUpdateCustomTarget}
        setBodyError={mockSetBodyError}
        urlError={defaultProps.urlError}
        setUrlError={mockSetUrlError}
      />,
    );

    const urlInput = screen.getByPlaceholderText('https://example.com/api/chat');
    const controlsRow = urlInput.parentElement;
    const methodTrigger = screen.getByRole('combobox');

    expect(controlsRow).toHaveClass('flex-col', 'sm:flex-row');
    expect(methodTrigger).toHaveClass('w-full', 'sm:w-24', 'sm:shrink-0');
    expect(urlInput).toHaveClass('min-w-0', 'flex-1');
  });

  it('keeps generated configuration actions visible while the dialog body scrolls independently', async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <HttpEndpointConfiguration
        {...defaultProps}
        updateCustomTarget={mockUpdateCustomTarget}
        setBodyError={mockSetBodyError}
        urlError={defaultProps.urlError}
        setUrlError={mockSetUrlError}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Import' }));
    await user.click(screen.getByRole('menuitem', { name: 'Auto-fill from Example' }));

    const dialog = screen.getByRole('dialog');
    const scrollBody = screen.getByText(
      /Paste an example HTTP request and optionally a response/i,
    ).parentElement;
    const footer = screen.getByRole('button', { name: 'Generate' }).parentElement;

    expect(dialog).toHaveClass('flex', 'max-h-[90vh]', 'flex-col', 'overflow-hidden');
    expect(scrollBody).toHaveClass('min-h-0', 'flex-1', 'overflow-y-auto');
    expect(footer).toHaveClass('shrink-0');
  });

  it('should maintain header Name and Value field layout constraints when bodyError state changes', () => {
    const { rerender } = renderWithProviders(
      <HttpEndpointConfiguration
        {...defaultProps}
        updateCustomTarget={mockUpdateCustomTarget}
        setBodyError={mockSetBodyError}
        urlError={defaultProps.urlError}
        setUrlError={mockSetUrlError}
      />,
    );

    const newBodyError = 'Invalid JSON format';
    act(() => {
      rerender(
        <Wrapper>
          <HttpEndpointConfiguration
            {...defaultProps}
            updateCustomTarget={mockUpdateCustomTarget}
            setBodyError={mockSetBodyError}
            bodyError={newBodyError}
            urlError={defaultProps.urlError}
            setUrlError={mockSetUrlError}
          />
        </Wrapper>,
      );
    });

    const nameFields = screen.getAllByPlaceholderText('Name');
    const valueFields = screen.getAllByPlaceholderText('Value');

    expect(nameFields).toHaveLength(2);
    expect(valueFields).toHaveLength(2);

    const firstNameField = nameFields[0];
    const firstValueField = valueFields[0];

    // Fields should remain visible after error state change
    expect(firstNameField).toBeVisible();
    expect(firstValueField).toBeVisible();
  });

  it('should maintain header Name and Value field layout constraints when urlError state changes', () => {
    const { rerender } = renderWithProviders(
      <HttpEndpointConfiguration
        {...defaultProps}
        updateCustomTarget={mockUpdateCustomTarget}
        setBodyError={mockSetBodyError}
        urlError={defaultProps.urlError}
        setUrlError={mockSetUrlError}
      />,
    );

    const newUrlError = 'Invalid URL format';
    act(() => {
      rerender(
        <Wrapper>
          <HttpEndpointConfiguration
            {...defaultProps}
            updateCustomTarget={mockUpdateCustomTarget}
            setBodyError={mockSetBodyError}
            urlError={newUrlError}
            setUrlError={mockSetUrlError}
          />
        </Wrapper>,
      );
    });

    const nameFields = screen.getAllByPlaceholderText('Name');
    const valueFields = screen.getAllByPlaceholderText('Value');

    expect(nameFields).toHaveLength(2);
    expect(valueFields).toHaveLength(2);

    const firstNameField = nameFields[0];
    const firstValueField = valueFields[0];

    // Fields should remain visible after URL error state change
    expect(firstNameField).toBeVisible();
    expect(firstValueField).toBeVisible();
  });

  it('should render header Name and Value fields with correct minimum widths and flex grow, ensuring both fields remain visible and usable for typical header values', () => {
    renderWithProviders(
      <HttpEndpointConfiguration
        {...defaultProps}
        updateCustomTarget={mockUpdateCustomTarget}
        setBodyError={mockSetBodyError}
        urlError={defaultProps.urlError}
        setUrlError={mockSetUrlError}
      />,
    );

    const nameFields = screen.getAllByPlaceholderText('Name');
    const valueFields = screen.getAllByPlaceholderText('Value');

    expect(nameFields).toHaveLength(2);
    expect(valueFields).toHaveLength(2);

    const firstNameField = nameFields[0];
    const firstValueField = valueFields[0];

    expect(firstNameField).toBeVisible();
    expect(firstValueField).toBeVisible();

    expect(firstNameField).toHaveValue('Content-Type');
    expect(firstValueField).toHaveValue('application/json');

    expect(nameFields[1]).toHaveValue('Authorization');
    expect(valueFields[1]).toHaveValue(
      'Bearer very-long-token-value-that-could-cause-layout-issues-if-not-handled-properly',
    );

    expect(valueFields[1]).toBeVisible();
  });

  it('should re-render header fields with correct layout when selectedTarget prop changes', () => {
    const { rerender } = renderWithProviders(
      <HttpEndpointConfiguration
        {...defaultProps}
        updateCustomTarget={mockUpdateCustomTarget}
        setBodyError={mockSetBodyError}
        urlError={defaultProps.urlError}
        setUrlError={mockSetUrlError}
      />,
    );

    const newSelectedTarget = {
      id: 'http2',
      label: 'New Test HTTP Target',
      config: {
        url: 'https://api.example.com/newchat',
        method: 'GET',
        headers: {
          'X-Request-ID': '12345',
          'Accept-Language': 'en-US',
        },
        body: '',
      },
    };

    rerender(
      <Wrapper>
        <HttpEndpointConfiguration
          {...defaultProps}
          selectedTarget={newSelectedTarget}
          updateCustomTarget={mockUpdateCustomTarget}
          setBodyError={mockSetBodyError}
          urlError={defaultProps.urlError}
          setUrlError={mockSetUrlError}
        />
      </Wrapper>,
    );

    const nameFields = screen.getAllByPlaceholderText('Name');
    const valueFields = screen.getAllByPlaceholderText('Value');

    expect(nameFields).toHaveLength(2);
    expect(valueFields).toHaveLength(2);

    const firstNameField = nameFields[0];
    const firstValueField = valueFields[0];

    expect(firstNameField).toBeVisible();
    expect(firstValueField).toBeVisible();

    expect(firstNameField).toHaveValue('X-Request-ID');
    expect(firstValueField).toHaveValue('12345');

    expect(nameFields[1]).toHaveValue('Accept-Language');
    expect(valueFields[1]).toHaveValue('en-US');
  });
});

describe('HttpEndpointConfiguration - Header Management', () => {
  let mockUpdateCustomTarget: (field: string, value: unknown) => void;
  let mockSetBodyError: (error: string | React.ReactNode | null) => void;
  let mockSetUrlError: (error: string | null) => void;

  const defaultProps = {
    selectedTarget: {
      id: 'http',
      label: 'Test HTTP Target',
      config: {
        url: 'https://api.example.com/chat',
        method: 'POST',
        headers: {},
        body: '{"message": "{{prompt}}"}',
      },
    },
    bodyError: null,
    urlError: null,
  };

  beforeEach(() => {
    mockUpdateCustomTarget = vi.fn();
    mockSetBodyError = vi.fn();
    mockSetUrlError = vi.fn();
    vi.clearAllMocks();
  });

  it('should add a new header row with visible Name and Value fields when the Add Header button is clicked', async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <HttpEndpointConfiguration
        {...defaultProps}
        updateCustomTarget={mockUpdateCustomTarget}
        setBodyError={mockSetBodyError}
        urlError={defaultProps.urlError}
        setUrlError={mockSetUrlError}
      />,
    );

    const addHeaderButton = screen.getByText('Add Header');
    await user.click(addHeaderButton);

    const nameFields = screen.getAllByPlaceholderText('Name');
    const valueFields = screen.getAllByPlaceholderText('Value');

    expect(nameFields.length).toBeGreaterThan(
      Object.keys(defaultProps.selectedTarget.config.headers).length,
    );
    expect(valueFields.length).toBeGreaterThan(
      Object.keys(defaultProps.selectedTarget.config.headers).length,
    );

    expect(nameFields[nameFields.length - 1]).toBeVisible();
    expect(valueFields[valueFields.length - 1]).toBeVisible();
    expect(nameFields[nameFields.length - 1].parentElement).toHaveClass(
      'flex-col',
      'items-stretch',
      'sm:flex-row',
      'sm:items-center',
    );
    expect(screen.getByRole('button', { name: 'Remove header 1' })).toBeInTheDocument();
  });
});

describe('HttpEndpointConfiguration - resetState batched config updates', () => {
  let mockUpdateCustomTarget: (field: string, value: unknown) => void;
  let mockSetBodyError: (error: string | React.ReactNode | null) => void;
  let mockSetUrlError: (error: string | null) => void;

  const defaultProps = {
    selectedTarget: {
      id: 'http',
      label: 'Test HTTP Target',
      config: {
        url: 'https://api.example.com/chat',
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{"message": "{{prompt}}"}',
      },
    },
    bodyError: null,
    urlError: null,
  };

  beforeEach(() => {
    mockUpdateCustomTarget = vi.fn();
    mockSetBodyError = vi.fn();
    mockSetUrlError = vi.fn();
    vi.clearAllMocks();
  });

  it('should call updateCustomTarget once with batched config when switching to raw mode', () => {
    renderWithProviders(
      <HttpEndpointConfiguration
        {...defaultProps}
        updateCustomTarget={mockUpdateCustomTarget}
        setBodyError={mockSetBodyError}
        urlError={defaultProps.urlError}
        setUrlError={mockSetUrlError}
      />,
    );

    // Find and click the raw request toggle
    const rawToggle = screen.getByLabelText('Use Raw HTTP Request');
    fireEvent.click(rawToggle);

    // Should call updateCustomTarget once with 'config' field
    expect(mockUpdateCustomTarget).toHaveBeenCalledTimes(1);
    expect(mockUpdateCustomTarget).toHaveBeenCalledWith(
      'config',
      expect.objectContaining({
        request: expect.any(String),
        url: undefined,
        method: undefined,
        headers: undefined,
        body: undefined,
      }),
    );
  });

  it('should call updateCustomTarget once with batched config when switching to structured mode', () => {
    const propsWithRawMode = {
      ...defaultProps,
      selectedTarget: {
        ...defaultProps.selectedTarget,
        config: {
          request: 'POST /api HTTP/1.1\nHost: example.com\n\n{"message": "{{prompt}}"}',
        },
      },
    };

    renderWithProviders(
      <HttpEndpointConfiguration
        {...propsWithRawMode}
        updateCustomTarget={mockUpdateCustomTarget}
        setBodyError={mockSetBodyError}
        urlError={defaultProps.urlError}
        setUrlError={mockSetUrlError}
      />,
    );

    // Find and click the raw request toggle to switch to structured mode
    const rawToggle = screen.getByLabelText('Use Raw HTTP Request');
    fireEvent.click(rawToggle);

    // Should call updateCustomTarget once with 'config' field
    expect(mockUpdateCustomTarget).toHaveBeenCalledTimes(1);
    expect(mockUpdateCustomTarget).toHaveBeenCalledWith(
      'config',
      expect.objectContaining({
        request: undefined,
        url: '',
        method: 'POST',
        headers: {},
        body: '',
        useHttps: false,
      }),
    );
  });

  it('should preserve existing config fields when switching modes with overrides', () => {
    const propsWithTransforms = {
      ...defaultProps,
      selectedTarget: {
        ...defaultProps.selectedTarget,
        config: {
          url: 'https://api.example.com/chat',
          method: 'POST',
          transformResponse: 'json.data',
          sessionParser: 'json.session',
        },
      },
    };

    renderWithProviders(
      <HttpEndpointConfiguration
        {...propsWithTransforms}
        updateCustomTarget={mockUpdateCustomTarget}
        setBodyError={mockSetBodyError}
        urlError={defaultProps.urlError}
        setUrlError={mockSetUrlError}
      />,
    );

    // Switch to raw mode
    const rawToggle = screen.getByLabelText('Use Raw HTTP Request');
    fireEvent.click(rawToggle);

    // Should preserve transformResponse and sessionParser
    expect(mockUpdateCustomTarget).toHaveBeenCalledWith(
      'config',
      expect.objectContaining({
        transformResponse: 'json.data',
        sessionParser: 'json.session',
      }),
    );
  });

  it('should apply config overrides correctly when provided to resetState', () => {
    renderWithProviders(
      <HttpEndpointConfiguration
        {...defaultProps}
        updateCustomTarget={mockUpdateCustomTarget}
        setBodyError={mockSetBodyError}
        urlError={defaultProps.urlError}
        setUrlError={mockSetUrlError}
      />,
    );

    // Switch to raw mode - this should apply example request as override
    const rawToggle = screen.getByLabelText('Use Raw HTTP Request');
    fireEvent.click(rawToggle);

    // Should include the example request in the config
    expect(mockUpdateCustomTarget).toHaveBeenCalledWith(
      'config',
      expect.objectContaining({
        request: expect.stringContaining('POST'),
      }),
    );
  });
});

describe('HttpEndpointConfiguration - handleApply batched updates', () => {
  let mockUpdateCustomTarget: (field: string, value: unknown) => void;
  let mockSetBodyError: (error: string | React.ReactNode | null) => void;
  let mockSetUrlError: (error: string | null) => void;

  const defaultProps = {
    selectedTarget: {
      id: 'http',
      label: 'Test HTTP Target',
      config: {
        url: '',
        method: 'POST',
        headers: {},
        body: '',
      },
    },
    bodyError: null,
    urlError: null,
  };

  beforeEach(() => {
    mockUpdateCustomTarget = vi.fn();
    mockSetBodyError = vi.fn();
    mockSetUrlError = vi.fn();
    vi.mocked(callApi).mockReset();
    vi.clearAllMocks();
  });

  it('applies generated structured config with one batched provider update', async () => {
    const user = userEvent.setup();
    vi.mocked(callApi).mockResolvedValue({
      ok: true,
      json: async () => ({
        id: 'http',
        config: {
          url: 'https://generated.example.com/chat',
          method: 'PUT',
          headers: { Authorization: 'Bearer generated' },
          body: '{"message":"{{prompt}}"}',
          transformRequest: 'requestTransform',
          transformResponse: 'responseTransform',
          sessionParser: 'session.id',
        },
      }),
    } as Response);

    renderWithProviders(
      <HttpEndpointConfiguration
        {...defaultProps}
        updateCustomTarget={mockUpdateCustomTarget}
        setBodyError={mockSetBodyError}
        urlError={defaultProps.urlError}
        setUrlError={mockSetUrlError}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Import' }));
    await user.click(screen.getByRole('menuitem', { name: 'Auto-fill from Example' }));
    await user.click(screen.getByRole('button', { name: 'Generate' }));
    await screen.findByRole('button', { name: 'Apply Configuration' });

    mockUpdateCustomTarget.mockClear();
    await user.click(screen.getByRole('button', { name: 'Apply Configuration' }));

    expect(mockUpdateCustomTarget).toHaveBeenCalledTimes(1);
    expect(mockUpdateCustomTarget).toHaveBeenCalledWith(
      'config',
      expect.objectContaining({
        request: undefined,
        url: 'https://generated.example.com/chat',
        method: 'PUT',
        headers: { Authorization: 'Bearer generated' },
        body: '{"message":"{{prompt}}"}',
        transformRequest: 'requestTransform',
        transformResponse: 'responseTransform',
        sessionParser: 'session.id',
      }),
    );
  });
});

describe('HttpEndpointConfiguration - handlePostmanImport batched updates', () => {
  let mockUpdateCustomTarget: (field: string, value: unknown) => void;
  let mockSetBodyError: (error: string | React.ReactNode | null) => void;
  let mockSetUrlError: (error: string | null) => void;

  const defaultProps = {
    selectedTarget: {
      id: 'http',
      label: 'Test HTTP Target',
      config: {
        url: '',
        method: 'POST',
        headers: {},
        body: '',
      },
    },
    bodyError: null,
    urlError: null,
  };

  beforeEach(() => {
    mockUpdateCustomTarget = vi.fn();
    mockSetBodyError = vi.fn();
    mockSetUrlError = vi.fn();
    vi.clearAllMocks();
  });

  it('applies imported Postman config with one batched provider update', async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <HttpEndpointConfiguration
        {...defaultProps}
        updateCustomTarget={mockUpdateCustomTarget}
        setBodyError={mockSetBodyError}
        urlError={defaultProps.urlError}
        setUrlError={mockSetUrlError}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Import' }));
    await user.click(screen.getByRole('menuitem', { name: 'Postman' }));

    mockUpdateCustomTarget.mockClear();
    await user.click(screen.getByRole('button', { name: 'Mock Postman Import' }));

    expect(mockUpdateCustomTarget).toHaveBeenCalledTimes(1);
    expect(mockUpdateCustomTarget).toHaveBeenCalledWith(
      'config',
      expect.objectContaining({
        request: undefined,
        url: 'https://postman.example.com/chat',
        method: 'PATCH',
        headers: { Authorization: 'Bearer postman' },
        body: '{"message":"{{prompt}}"}',
      }),
    );
  });
});

describe('HttpEndpointConfiguration - config immutability', () => {
  let mockUpdateCustomTarget: (field: string, value: unknown) => void;
  let mockSetBodyError: (error: string | React.ReactNode | null) => void;
  let mockSetUrlError: (error: string | null) => void;

  beforeEach(() => {
    mockUpdateCustomTarget = vi.fn();
    mockSetBodyError = vi.fn();
    mockSetUrlError = vi.fn();
    vi.clearAllMocks();
  });

  it('should not mutate selectedTarget.config when switching modes', () => {
    const originalConfig = {
      url: 'https://api.example.com/chat',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{"message": "{{prompt}}"}',
    };

    const props = {
      selectedTarget: {
        id: 'http',
        label: 'Test HTTP Target',
        config: originalConfig,
      },
      bodyError: null,
      urlError: null,
    };

    renderWithProviders(
      <HttpEndpointConfiguration
        {...props}
        updateCustomTarget={mockUpdateCustomTarget}
        setBodyError={mockSetBodyError}
        urlError={props.urlError}
        setUrlError={mockSetUrlError}
      />,
    );

    // Switch to raw mode
    const rawToggle = screen.getByLabelText('Use Raw HTTP Request');
    fireEvent.click(rawToggle);

    // Original config should remain unchanged
    expect(props.selectedTarget.config).toBe(originalConfig);
    expect(props.selectedTarget.config.url).toBe('https://api.example.com/chat');
    expect(props.selectedTarget.config.method).toBe('POST');
  });

  it('should create new config object with spread operator in resetState', () => {
    const originalConfig = {
      url: 'https://api.example.com/chat',
      method: 'POST',
      transformResponse: 'json.data',
    };

    const props = {
      selectedTarget: {
        id: 'http',
        label: 'Test HTTP Target',
        config: originalConfig,
      },
      bodyError: null,
      urlError: null,
    };

    renderWithProviders(
      <HttpEndpointConfiguration
        {...props}
        updateCustomTarget={mockUpdateCustomTarget}
        setBodyError={mockSetBodyError}
        urlError={props.urlError}
        setUrlError={mockSetUrlError}
      />,
    );

    // Switch to raw mode
    const rawToggle = screen.getByLabelText('Use Raw HTTP Request');
    fireEvent.click(rawToggle);

    // updateCustomTarget should be called with a new config object
    expect(mockUpdateCustomTarget).toHaveBeenCalledWith('config', expect.any(Object));
    const newConfig = vi.mocked(mockUpdateCustomTarget).mock.calls[0][1];

    // New config should not be the same reference as original
    expect(newConfig).not.toBe(originalConfig);

    // But should preserve spread fields
    expect(newConfig).toHaveProperty('transformResponse', 'json.data');
  });

  it('should handle rapid mode switches without state mutation', () => {
    const originalConfig = {
      url: 'https://api.example.com/chat',
      method: 'POST',
      headers: {},
      body: '',
    };

    const props = {
      selectedTarget: {
        id: 'http',
        label: 'Test HTTP Target',
        config: originalConfig,
      },
      bodyError: null,
      urlError: null,
    };

    renderWithProviders(
      <HttpEndpointConfiguration
        {...props}
        updateCustomTarget={mockUpdateCustomTarget}
        setBodyError={mockSetBodyError}
        urlError={props.urlError}
        setUrlError={mockSetUrlError}
      />,
    );

    const rawToggle = screen.getByLabelText('Use Raw HTTP Request');

    // Switch to raw mode
    fireEvent.click(rawToggle);
    expect(mockUpdateCustomTarget).toHaveBeenCalledTimes(1);

    // Clear the mock
    vi.mocked(mockUpdateCustomTarget).mockClear();

    // Switch back to structured mode
    fireEvent.click(rawToggle);
    expect(mockUpdateCustomTarget).toHaveBeenCalledTimes(1);

    // Original config should remain unchanged
    expect(props.selectedTarget.config).toBe(originalConfig);
  });
});
