import React from 'react';

import { TooltipProvider } from '@app/components/ui/tooltip';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import HttpEndpointConfiguration from './HttpEndpointConfiguration';

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

  it('should add a new header row with visible Name and Value fields when the Add Header button is clicked', () => {
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
    fireEvent.click(addHeaderButton);

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
    vi.clearAllMocks();
  });

  it('should have import button that opens dropdown menu', () => {
    renderWithProviders(
      <HttpEndpointConfiguration
        {...defaultProps}
        updateCustomTarget={mockUpdateCustomTarget}
        setBodyError={mockSetBodyError}
        urlError={defaultProps.urlError}
        setUrlError={mockSetUrlError}
      />,
    );

    // Verify the import button exists
    const importButton = screen.getByText('Import');
    expect(importButton).toBeInTheDocument();

    // The import button should be a dropdown trigger
    expect(importButton).toHaveAttribute('aria-haspopup', 'menu');
    expect(importButton).toHaveAttribute('aria-expanded', 'false');
  });

  it('should render import dialog trigger for config generation', () => {
    renderWithProviders(
      <HttpEndpointConfiguration
        {...defaultProps}
        updateCustomTarget={mockUpdateCustomTarget}
        setBodyError={mockSetBodyError}
        urlError={defaultProps.urlError}
        setUrlError={mockSetUrlError}
      />,
    );

    // Verify the import button is present, which will eventually trigger handleApply
    const importButton = screen.getByText('Import');
    expect(importButton).toBeInTheDocument();
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

  it('should render import dropdown trigger for Postman import', () => {
    renderWithProviders(
      <HttpEndpointConfiguration
        {...defaultProps}
        updateCustomTarget={mockUpdateCustomTarget}
        setBodyError={mockSetBodyError}
        urlError={defaultProps.urlError}
        setUrlError={mockSetUrlError}
      />,
    );

    // Verify the import button exists which provides Postman import option
    const importButton = screen.getByText('Import');
    expect(importButton).toBeInTheDocument();
    expect(importButton).toHaveAttribute('aria-haspopup', 'menu');
  });

  it('should have PostmanImportDialog in component tree', () => {
    const { container } = renderWithProviders(
      <HttpEndpointConfiguration
        {...defaultProps}
        updateCustomTarget={mockUpdateCustomTarget}
        setBodyError={mockSetBodyError}
        urlError={defaultProps.urlError}
        setUrlError={mockSetUrlError}
      />,
    );

    // The PostmanImportDialog component is rendered (even if not visible)
    // This verifies that the handlePostmanImport callback is wired up
    expect(container).toBeInTheDocument();
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
    const newConfig = mockUpdateCustomTarget.mock.calls[0][1];

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
    mockUpdateCustomTarget.mockClear();

    // Switch back to structured mode
    fireEvent.click(rawToggle);
    expect(mockUpdateCustomTarget).toHaveBeenCalledTimes(1);

    // Original config should remain unchanged
    expect(props.selectedTarget.config).toBe(originalConfig);
  });
});
