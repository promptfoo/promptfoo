import React from 'react';

import { TooltipProvider } from '@app/components/ui/tooltip';
import { callApi } from '@app/utils/api';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import HttpEndpointConfiguration from './HttpEndpointConfiguration';

import type { ProviderOptions } from '../../types';

vi.mock('@app/utils/api', () => ({
  callApi: vi.fn(),
}));

vi.mock('react-simple-code-editor', () => ({
  default: ({ textareaId, value, onValueChange, readOnly }: any) => (
    <textarea
      id={textareaId}
      data-testid="code-editor"
      value={value}
      readOnly={readOnly}
      onChange={(e) => onValueChange(e.target.value)}
    />
  ),
}));

// Wrapper component for providing tooltip context
const Wrapper = ({ children }: { children: React.ReactNode }) => (
  <TooltipProvider>{children}</TooltipProvider>
);

const renderWithProviders = (ui: React.ReactElement) => {
  return render(ui, { wrapper: Wrapper });
};

const ControlledHttpConfiguration = ({ initialTarget }: { initialTarget: ProviderOptions }) => {
  const [selectedTarget, setSelectedTarget] = React.useState(initialTarget);
  const [bodyError, setBodyError] = React.useState<string | React.ReactNode | null>(null);
  const [urlError, setUrlError] = React.useState<string | null>(null);

  const updateCustomTarget = (field: string, value: unknown) => {
    if (field !== 'config') {
      throw new Error(`Mode transitions must replace config atomically, received: ${field}`);
    }
    setSelectedTarget((currentTarget) => ({
      ...currentTarget,
      config: value as ProviderOptions['config'],
    }));
  };

  return (
    <HttpEndpointConfiguration
      selectedTarget={selectedTarget}
      updateCustomTarget={updateCustomTarget}
      bodyError={bodyError}
      setBodyError={setBodyError}
      urlError={urlError}
      setUrlError={setUrlError}
    />
  );
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
    expect(firstNameField).toHaveAccessibleName('Header 1 name');
    expect(firstValueField).toHaveAccessibleName('Header 1 value');
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
    expect(urlInput).toBeRequired();
  });

  it('switches between structured and raw HTTP setup without leaving inactive fields behind', async () => {
    const user = userEvent.setup();

    renderWithProviders(
      <ControlledHttpConfiguration
        initialTarget={defaultProps.selectedTarget as ProviderOptions}
      />,
    );

    await user.click(screen.getByRole('switch', { name: 'Use Raw HTTP Request' }));

    expect(
      (screen.getByRole('textbox', { name: 'Raw HTTP request' }) as HTMLTextAreaElement).value,
    ).toContain('{{prompt}}');
    expect(screen.queryByPlaceholderText('https://example.com/api/chat')).not.toBeInTheDocument();

    await user.click(screen.getByRole('switch', { name: 'Use Raw HTTP Request' }));

    expect(screen.getByPlaceholderText('https://example.com/api/chat')).toBeInTheDocument();
    expect(screen.queryByRole('textbox', { name: 'Raw HTTP request' })).not.toBeInTheDocument();
  });

  it('applies generated structured setup when editing an existing raw request', async () => {
    const user = userEvent.setup();
    vi.mocked(callApi).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        id: 'http',
        config: {
          url: 'https://generated.example.com/chat',
          method: 'POST',
          body: '{"message":"{{prompt}}"}',
        },
      }),
    } as Response);

    renderWithProviders(
      <ControlledHttpConfiguration
        initialTarget={{
          id: 'http',
          config: { request: 'POST /chat HTTP/1.1\n\n{"message":"{{prompt}}"}' },
        }}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Import' }));
    await user.click(screen.getByRole('menuitem', { name: 'Auto-fill from Example' }));
    await user.click(screen.getByRole('button', { name: 'Generate' }));
    await user.click(await screen.findByRole('button', { name: 'Apply Configuration' }));

    expect(screen.getByPlaceholderText('https://example.com/api/chat')).toHaveValue(
      'https://generated.example.com/chat',
    );
    expect(screen.queryByRole('textbox', { name: 'Raw HTTP request' })).not.toBeInTheDocument();
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
    expect(screen.getByLabelText(/Example Request/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Example Response/)).toBeInTheDocument();
  });

  it('labels generated configuration and announces generation errors', async () => {
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

    vi.mocked(callApi).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        id: 'http',
        config: { url: 'https://api.example.com/chat', method: 'POST' },
      }),
    } as Response);
    await user.click(screen.getByRole('button', { name: 'Generate' }));

    expect(await screen.findByLabelText('Generated Configuration')).toHaveAttribute('readonly');

    vi.mocked(callApi).mockResolvedValueOnce({
      ok: false,
      status: 400,
      json: async () => ({ error: 'Example request could not be parsed' }),
    } as Response);
    await user.click(screen.getByRole('button', { name: 'Generate' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Error: Example request could not be parsed',
    );
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
    const bodyField = screen.getByLabelText('Request Body');

    // Fields should remain visible after error state change
    expect(firstNameField).toBeVisible();
    expect(firstValueField).toBeVisible();
    expect(bodyField).toHaveAttribute('aria-invalid', 'true');
    expect(bodyField).toHaveAccessibleDescription(newBodyError);
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
    const urlInput = screen.getByLabelText(/URL/);

    // Fields should remain visible after URL error state change
    expect(firstNameField).toBeVisible();
    expect(firstValueField).toBeVisible();
    expect(urlInput).toHaveAttribute('aria-invalid', 'true');
    expect(urlInput).toHaveAccessibleDescription(newUrlError);
  });

  it('exposes request body format selection and response parser labels', () => {
    renderWithProviders(
      <HttpEndpointConfiguration
        {...defaultProps}
        updateCustomTarget={mockUpdateCustomTarget}
        setBodyError={mockSetBodyError}
        urlError={defaultProps.urlError}
        setUrlError={mockSetUrlError}
      />,
    );

    const formatGroup = screen.getByRole('group', { name: 'Request body format' });
    expect(formatGroup).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'JSON' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Text' })).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByLabelText('Response Parser')).toBeInTheDocument();
  });

  it('connects raw request validation feedback to the raw request field', () => {
    renderWithProviders(
      <HttpEndpointConfiguration
        {...defaultProps}
        selectedTarget={{
          ...defaultProps.selectedTarget,
          config: {
            ...defaultProps.selectedTarget.config,
            request: 'POST /chat HTTP/1.1',
          },
        }}
        updateCustomTarget={mockUpdateCustomTarget}
        setBodyError={mockSetBodyError}
        bodyError="Raw request must contain {{prompt}} template variable"
        urlError={defaultProps.urlError}
        setUrlError={mockSetUrlError}
      />,
    );

    const rawRequestField = screen.getByRole('textbox', { name: 'Raw HTTP request' });
    expect(rawRequestField).toBeRequired();
    expect(rawRequestField).toHaveAttribute('aria-invalid', 'true');
    expect(rawRequestField).toHaveAccessibleDescription(
      'Raw request must contain {{prompt}} template variable',
    );
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
