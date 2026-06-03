import React from 'react';

import { TooltipProvider } from '@app/components/ui/tooltip';
import { callApi } from '@app/utils/api';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import HttpEndpointConfiguration from './HttpEndpointConfiguration';

import type { ProviderOptions } from '../../types';

vi.mock('@app/utils/api');

vi.mock('react-simple-code-editor', () => ({
  default: ({ value, onValueChange, placeholder }: any) => (
    <textarea
      data-testid="code-editor"
      placeholder={placeholder}
      value={value}
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

const defaultHttpTarget: ProviderOptions = {
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
};

const createSuccessfulTestResponse = (body: Record<string, unknown>) =>
  ({
    ok: true,
    json: async () => body,
  }) as Response;

describe('HttpEndpointConfiguration - Header Field Layout', () => {
  let mockUpdateCustomTarget: (field: string, value: unknown) => void;
  let mockSetBodyError: (error: string | React.ReactNode | null) => void;
  let mockSetUrlError: (error: string | null) => void;

  const defaultProps = {
    selectedTarget: defaultHttpTarget,
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

describe('HttpEndpointConfiguration - Configuration Change Suggestions', () => {
  let mockUpdateCustomTarget: (field: string, value: unknown) => void;
  let mockSetBodyError: (error: string | React.ReactNode | null) => void;
  let mockSetUrlError: (error: string | null) => void;
  const mockCallApi = vi.mocked(callApi);

  beforeEach(() => {
    mockUpdateCustomTarget = vi.fn();
    mockSetBodyError = vi.fn();
    mockSetUrlError = vi.fn();
    vi.clearAllMocks();
  });

  const renderTarget = (selectedTarget: ProviderOptions = defaultHttpTarget) =>
    renderWithProviders(
      <HttpEndpointConfiguration
        selectedTarget={selectedTarget}
        updateCustomTarget={mockUpdateCustomTarget}
        bodyError={null}
        setBodyError={mockSetBodyError}
        urlError={null}
        setUrlError={mockSetUrlError}
      />,
    );

  const mockSuggestionsResponse = (suggestion: Record<string, unknown>) => {
    mockCallApi.mockResolvedValue(
      createSuccessfulTestResponse({
        testResult: {
          changes_needed: true,
          message: 'Changes needed',
          configuration_change_suggestion: suggestion,
        },
        providerResponse: {},
      }),
    );
  };

  it('applies all suggested config changes and updates local HTTP form state', async () => {
    const suggestion = {
      headers: { 'X-New-Header': 'new-value', 'Content-Type': 'application/json' },
      body: { new: 'body', prompt: '{{prompt}}' },
    };
    mockSuggestionsResponse(suggestion);
    const user = userEvent.setup();

    renderTarget({
      ...defaultHttpTarget,
      config: {
        ...defaultHttpTarget.config,
        headers: { 'X-Initial-Header': 'initial-value' },
        body: JSON.stringify({ initial: 'body' }),
      },
    });

    await user.click(screen.getByRole('button', { name: /Test Target/i }));

    expect(await screen.findByText('Configuration Changes Needed')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Apply All/i }));

    expect(mockUpdateCustomTarget).toHaveBeenCalledWith('headers', suggestion.headers);
    expect(mockUpdateCustomTarget).toHaveBeenCalledWith('body', suggestion.body);
    expect(screen.queryByDisplayValue('X-Initial-Header')).not.toBeInTheDocument();
    expect(screen.getByDisplayValue('X-New-Header')).toBeInTheDocument();
    expect(screen.getByDisplayValue('new-value')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Content-Type')).toBeInTheDocument();
    expect(screen.getByDisplayValue('application/json')).toBeInTheDocument();
    await waitFor(() => {
      const editorValues = screen
        .getAllByTestId('code-editor')
        .map((editor) => (editor as HTMLTextAreaElement).value);
      expect(editorValues).toContain(JSON.stringify(suggestion.body, null, 2));
    });
  });

  it('normalizes non-string suggested header values before updating config', async () => {
    const suggestion = {
      headers: {
        'X-Number-Header': 123,
        'X-Boolean-Header': true,
        'X-Null-Header': null,
      },
      url: 'https://newexample.com/api',
    };
    mockSuggestionsResponse(suggestion);
    const user = userEvent.setup();

    renderTarget();

    await user.click(screen.getByRole('button', { name: /Test Target/i }));
    expect(await screen.findByText('Configuration Changes Needed')).toBeInTheDocument();

    const applyButtons = screen.getAllByRole('button', { name: /^Apply$/i });
    await user.click(applyButtons[0]);

    expect(mockUpdateCustomTarget).toHaveBeenCalledWith('headers', {
      'X-Number-Header': '123',
      'X-Boolean-Header': 'true',
      'X-Null-Header': 'null',
    });
    expect(screen.getByDisplayValue('123')).toBeInTheDocument();
    expect(screen.getByDisplayValue('true')).toBeInTheDocument();
    expect(screen.getByDisplayValue('null')).toBeInTheDocument();

    await user.click(applyButtons[1]);
    expect(mockUpdateCustomTarget).toHaveBeenCalledWith('url', 'https://newexample.com/api');
  });

  it('passes the latest provider response into the response parser test modal', async () => {
    const mockProviderResponse = {
      raw: JSON.stringify({ message: 'hello world' }),
      output: 'hello world',
    };
    mockCallApi.mockResolvedValue(
      createSuccessfulTestResponse({
        testResult: {
          success: true,
          message: 'Target configuration is valid!',
        },
        providerResponse: mockProviderResponse,
      }),
    );
    const user = userEvent.setup();

    renderTarget({
      ...defaultHttpTarget,
      config: {
        ...defaultHttpTarget.config,
        transformResponse: 'json.message',
      },
    });

    await user.click(screen.getByRole('button', { name: /Test Target/i }));
    await waitFor(() =>
      expect(mockCallApi).toHaveBeenCalledWith('/providers/test', expect.anything()),
    );

    await user.click(screen.getByRole('button', { name: /^Test$/i }));

    expect(
      await screen.findByPlaceholderText('Enter the API response from your endpoint'),
    ).toHaveValue(mockProviderResponse.raw);
  });
});
