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
  default: ({ value, onValueChange, placeholder, textareaId }: any) => (
    <textarea
      data-testid="code-editor"
      id={textareaId}
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
    mockCallApi.mockReset();
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

  it('applies a validated response parser suggestion and invalidates the old result', async () => {
    mockCallApi.mockResolvedValue(
      createSuccessfulTestResponse({
        testResult: {
          changes_needed: true,
          message: 'Changes needed',
          configuration_change_suggestion: { transformResponse: 'json.response' },
        },
        providerResponse: {},
      }),
    );
    const user = userEvent.setup();

    renderTarget();

    await user.click(screen.getByRole('button', { name: /Test Target/i }));
    expect(await screen.findByText('Configuration Changes Needed')).toBeInTheDocument();
    const applyButton = screen.getByRole('button', { name: 'Apply response parser suggestion' });
    applyButton.focus();
    expect(applyButton).toHaveFocus();
    await user.keyboard('{Enter}');

    expect(mockUpdateCustomTarget).toHaveBeenCalledOnce();
    expect(mockUpdateCustomTarget).toHaveBeenCalledWith('transformResponse', 'json.response');
    expect(screen.getByLabelText('Response Parser')).toHaveFocus();
    expect(screen.getByRole('status')).toHaveTextContent('Response parser suggestion applied');
    await waitFor(() => {
      expect(screen.queryByText('Configuration Changes Needed')).not.toBeInTheDocument();
    });
  });

  it('ignores a late suggestion after the target changes', async () => {
    let resolveResponse: (response: Response) => void = () => {};
    mockCallApi.mockReturnValue(
      new Promise<Response>((resolve) => {
        resolveResponse = resolve;
      }),
    );
    const user = userEvent.setup();
    const rendered = renderTarget();

    await user.click(screen.getByRole('button', { name: /Test Target/i }));
    expect(mockCallApi).toHaveBeenCalledOnce();

    const changedTarget: ProviderOptions = {
      ...defaultHttpTarget,
      config: { ...defaultHttpTarget.config, url: 'https://api.example.com/changed' },
    };
    rendered.rerender(
      <HttpEndpointConfiguration
        selectedTarget={changedTarget}
        updateCustomTarget={mockUpdateCustomTarget}
        bodyError={null}
        setBodyError={mockSetBodyError}
        urlError={null}
        setUrlError={mockSetUrlError}
      />,
    );

    await act(async () => {
      resolveResponse(
        createSuccessfulTestResponse({
          testResult: {
            changes_needed: true,
            message: 'Stale changes',
            configuration_change_suggestion: { transformResponse: 'json.stale' },
          },
          providerResponse: {},
        }),
      );
      await Promise.resolve();
    });

    expect(screen.queryByText('Stale changes')).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Apply response parser suggestion' }),
    ).not.toBeInTheDocument();
    expect(mockUpdateCustomTarget).not.toHaveBeenCalled();
  });
});
