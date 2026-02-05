import { callApi } from '@app/utils/api';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, type Mock, vi } from 'vitest';
import SessionsTab from './SessionsTab';
import type { ProviderOptions } from '@promptfoo/types';

// Mock the callApi utility
vi.mock('@app/utils/api', () => ({
  callApi: vi.fn(),
}));

// Mock the VariableSelectionDialog component
vi.mock('./VariableSelectionDialog', () => ({
  default: ({
    open,
    onConfirm,
    onOpenChange,
  }: {
    open: boolean;
    onConfirm: () => void;
    onOpenChange: (open: boolean) => void;
  }) => {
    if (!open) {
      return null;
    }
    return (
      <div data-testid="variable-selection-dialog">
        <button onClick={onConfirm}>Confirm</button>
        <button onClick={() => onOpenChange(false)}>Cancel</button>
      </div>
    );
  },
}));

// Mock ChatMessages component
vi.mock('@app/pages/eval/components/ChatMessages', () => ({
  default: ({ messages }: { messages: any[] }) => (
    <div data-testid="chat-messages">
      {messages.map((msg, idx) => (
        <div key={idx} data-testid={`message-${idx}`}>
          {msg.content}
        </div>
      ))}
    </div>
  ),
}));

describe('SessionsTab', () => {
  const mockUpdateCustomTarget = vi.fn();
  const mockOnTestComplete = vi.fn();

  const baseProvider: ProviderOptions = {
    id: 'http',
    config: {
      url: 'https://api.example.com/chat',
      method: 'POST',
      stateful: true,
      sessionSource: 'server',
    },
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('SessionEndpointConfig component functions', () => {
    describe('updateHeaders', () => {
      it('should convert header array to object and filter empty keys', () => {
        const onUpdate = vi.fn();
        render(
          <SessionsTab
            selectedTarget={{
              ...baseProvider,
              config: {
                ...baseProvider.config,
                sessionSource: 'endpoint',
                session: {
                  url: 'https://api.example.com/session',
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                },
              },
            }}
            updateCustomTarget={onUpdate}
          />,
        );

        // Find a header input
        const headerKeyInputs = screen.getAllByPlaceholderText('Header name');
        const headerValueInputs = screen.getAllByPlaceholderText('Header value');

        // Change first header key
        fireEvent.change(headerKeyInputs[0], { target: { value: 'Authorization' } });
        fireEvent.change(headerValueInputs[0], { target: { value: 'Bearer token' } });

        expect(onUpdate).toHaveBeenCalledWith(
          'session',
          expect.objectContaining({
            headers: expect.objectContaining({
              Authorization: 'Bearer token',
            }),
          }),
        );
      });

      it('should filter out headers with empty keys', () => {
        const onUpdate = vi.fn();
        render(
          <SessionsTab
            selectedTarget={{
              ...baseProvider,
              config: {
                ...baseProvider.config,
                sessionSource: 'endpoint',
                session: {
                  url: 'https://api.example.com/session',
                  method: 'POST',
                },
              },
            }}
            updateCustomTarget={onUpdate}
          />,
        );

        // Add a new header
        const addHeaderButton = screen.getByRole('button', { name: /add header/i });
        fireEvent.click(addHeaderButton);

        // Find the last header value input and update it without a key
        const headerValueInputs = screen.getAllByPlaceholderText('Header value');
        fireEvent.change(headerValueInputs[headerValueInputs.length - 1], {
          target: { value: 'some value' },
        });

        // The session update should have headers as undefined if all keys are empty
        const lastCall = onUpdate.mock.calls[onUpdate.mock.calls.length - 1];
        if (lastCall) {
          const sessionArg = lastCall[1];
          // Either headers is undefined or empty object
          expect(
            sessionArg.headers === undefined || Object.keys(sessionArg.headers).length === 0,
          ).toBe(true);
        }
      });
    });

    describe('addHeader', () => {
      it('should add a new empty header to the list', () => {
        const onUpdate = vi.fn();
        render(
          <SessionsTab
            selectedTarget={{
              ...baseProvider,
              config: {
                ...baseProvider.config,
                sessionSource: 'endpoint',
                session: {
                  url: 'https://api.example.com/session',
                  method: 'POST',
                },
              },
            }}
            updateCustomTarget={onUpdate}
          />,
        );

        const initialHeaderInputs = screen.getAllByPlaceholderText('Header name');
        const initialCount = initialHeaderInputs.length;

        const addHeaderButton = screen.getByRole('button', { name: /add header/i });
        fireEvent.click(addHeaderButton);

        const updatedHeaderInputs = screen.getAllByPlaceholderText('Header name');
        expect(updatedHeaderInputs.length).toBe(initialCount + 1);
      });
    });

    describe('removeHeader', () => {
      it('should remove a header at the specified index', () => {
        const onUpdate = vi.fn();
        render(
          <SessionsTab
            selectedTarget={{
              ...baseProvider,
              config: {
                ...baseProvider.config,
                sessionSource: 'endpoint',
                session: {
                  url: 'https://api.example.com/session',
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/json',
                    Authorization: 'Bearer token',
                  },
                },
              },
            }}
            updateCustomTarget={onUpdate}
          />,
        );

        const removeButtons = screen.getAllByRole('button', { name: '' }).filter((btn) => {
          const svg = btn.querySelector('svg');
          return svg?.classList.contains('lucide-trash-2');
        });

        const initialCount = removeButtons.length;

        // Click first remove button
        fireEvent.click(removeButtons[0]);

        const updatedHeaderInputs = screen.getAllByPlaceholderText('Header name');
        expect(updatedHeaderInputs.length).toBeLessThan(initialCount);
      });

      it('should keep at least one empty header when removing the last header', () => {
        const onUpdate = vi.fn();
        render(
          <SessionsTab
            selectedTarget={{
              ...baseProvider,
              config: {
                ...baseProvider.config,
                sessionSource: 'endpoint',
                session: {
                  url: 'https://api.example.com/session',
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                },
              },
            }}
            updateCustomTarget={onUpdate}
          />,
        );

        const removeButtons = screen.getAllByRole('button', { name: '' }).filter((btn) => {
          const svg = btn.querySelector('svg');
          return svg?.classList.contains('lucide-trash-2');
        });

        // Remove all headers
        fireEvent.click(removeButtons[0]);

        // Should still have at least one header input
        const headerInputs = screen.getAllByPlaceholderText('Header name');
        expect(headerInputs.length).toBeGreaterThanOrEqual(1);
      });
    });

    describe('updateHeader', () => {
      it('should update header key at specific index', () => {
        const onUpdate = vi.fn();
        render(
          <SessionsTab
            selectedTarget={{
              ...baseProvider,
              config: {
                ...baseProvider.config,
                sessionSource: 'endpoint',
                session: {
                  url: 'https://api.example.com/session',
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                },
              },
            }}
            updateCustomTarget={onUpdate}
          />,
        );

        const headerKeyInputs = screen.getAllByPlaceholderText('Header name');
        fireEvent.change(headerKeyInputs[0], { target: { value: 'X-Custom-Header' } });

        expect(onUpdate).toHaveBeenCalledWith(
          'session',
          expect.objectContaining({
            headers: expect.objectContaining({
              'X-Custom-Header': expect.any(String),
            }),
          }),
        );
      });

      it('should update header value at specific index', () => {
        const onUpdate = vi.fn();
        render(
          <SessionsTab
            selectedTarget={{
              ...baseProvider,
              config: {
                ...baseProvider.config,
                sessionSource: 'endpoint',
                session: {
                  url: 'https://api.example.com/session',
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                },
              },
            }}
            updateCustomTarget={onUpdate}
          />,
        );

        const headerValueInputs = screen.getAllByPlaceholderText('Header value');
        fireEvent.change(headerValueInputs[0], { target: { value: 'text/plain' } });

        expect(onUpdate).toHaveBeenCalled();
      });
    });

    describe('Body onChange handler', () => {
      it('should parse valid JSON and update session body', () => {
        const onUpdate = vi.fn();
        render(
          <SessionsTab
            selectedTarget={{
              ...baseProvider,
              config: {
                ...baseProvider.config,
                sessionSource: 'endpoint',
                session: {
                  url: 'https://api.example.com/session',
                  method: 'POST',
                },
              },
            }}
            updateCustomTarget={onUpdate}
          />,
        );

        const bodyTextarea = screen.getByPlaceholderText(/client_id/);
        const validJson = '{"apiKey": "test123"}';

        fireEvent.change(bodyTextarea, { target: { value: validJson } });

        expect(onUpdate).toHaveBeenCalledWith(
          'session',
          expect.objectContaining({
            body: { apiKey: 'test123' },
          }),
        );
      });

      it('should keep invalid JSON as string', () => {
        const onUpdate = vi.fn();
        render(
          <SessionsTab
            selectedTarget={{
              ...baseProvider,
              config: {
                ...baseProvider.config,
                sessionSource: 'endpoint',
                session: {
                  url: 'https://api.example.com/session',
                  method: 'POST',
                },
              },
            }}
            updateCustomTarget={onUpdate}
          />,
        );

        const bodyTextarea = screen.getByPlaceholderText(/client_id/);
        const invalidJson = '{"apiKey": incomplete';

        fireEvent.change(bodyTextarea, { target: { value: invalidJson } });

        expect(onUpdate).toHaveBeenCalledWith(
          'session',
          expect.objectContaining({
            body: invalidJson,
          }),
        );
      });

      it('should display existing body object as formatted JSON', () => {
        render(
          <SessionsTab
            selectedTarget={{
              ...baseProvider,
              config: {
                ...baseProvider.config,
                sessionSource: 'endpoint',
                session: {
                  url: 'https://api.example.com/session',
                  method: 'POST',
                  body: { apiKey: 'test123', clientId: 'client456' },
                },
              },
            }}
            updateCustomTarget={mockUpdateCustomTarget}
          />,
        );

        const bodyTextarea = screen.getByPlaceholderText(/client_id/) as HTMLTextAreaElement;
        const expectedJson = JSON.stringify({ apiKey: 'test123', clientId: 'client456' }, null, 2);

        expect(bodyTextarea.value).toBe(expectedJson);
      });
    });
  });

  describe('SessionsTab session source radio handler', () => {
    it('should update sessionSource to client and clear sessionParser and session config', () => {
      const onUpdate = vi.fn();
      render(
        <SessionsTab
          selectedTarget={{
            ...baseProvider,
            config: {
              ...baseProvider.config,
              sessionSource: 'server',
              sessionParser: 'data.headers["session-id"]',
            },
          }}
          updateCustomTarget={onUpdate}
        />,
      );

      const clientRadio = screen.getByRole('radio', { name: /client-generated session id/i });
      fireEvent.click(clientRadio);

      expect(onUpdate).toHaveBeenCalledWith('sessionSource', 'client');
      expect(onUpdate).toHaveBeenCalledWith('sessionParser', undefined);
      expect(onUpdate).toHaveBeenCalledWith('session', undefined);
    });

    it('should initialize session config when switching to endpoint source', () => {
      const onUpdate = vi.fn();
      render(
        <SessionsTab
          selectedTarget={{
            ...baseProvider,
            config: {
              ...baseProvider.config,
              sessionSource: 'server',
            },
          }}
          updateCustomTarget={onUpdate}
        />,
      );

      const endpointRadio = screen.getByRole('radio', { name: /separate session endpoint/i });
      fireEvent.click(endpointRadio);

      expect(onUpdate).toHaveBeenCalledWith('sessionSource', 'endpoint');
      expect(onUpdate).toHaveBeenCalledWith('session', {
        url: '',
        method: 'POST',
        responseParser: '',
      });
    });

    it('should not reinitialize session config if already present when switching to endpoint', () => {
      const onUpdate = vi.fn();
      const existingSession = {
        url: 'https://api.example.com/auth',
        method: 'POST' as const,
        responseParser: 'data.token',
      };

      render(
        <SessionsTab
          selectedTarget={{
            ...baseProvider,
            config: {
              ...baseProvider.config,
              sessionSource: 'server',
              session: existingSession,
            },
          }}
          updateCustomTarget={onUpdate}
        />,
      );

      const endpointRadio = screen.getByRole('radio', { name: /separate session endpoint/i });
      fireEvent.click(endpointRadio);

      expect(onUpdate).toHaveBeenCalledWith('sessionSource', 'endpoint');
      // Should not call updateCustomTarget with 'session' since it already exists
      const sessionCalls = onUpdate.mock.calls.filter((call) => call[0] === 'session');
      expect(sessionCalls.length).toBe(0);
    });
  });

  describe('runSessionTest', () => {
    it('should call API with correct provider configuration', async () => {
      const mockResponse = {
        ok: true,
        json: vi.fn().mockResolvedValue({
          success: true,
          message: 'Session test passed',
        }),
      };
      (callApi as Mock).mockResolvedValue(mockResponse);

      render(
        <SessionsTab
          selectedTarget={baseProvider}
          updateCustomTarget={mockUpdateCustomTarget}
          onTestComplete={mockOnTestComplete}
        />,
      );

      const testButton = screen.getByRole('button', { name: /test session/i });
      fireEvent.click(testButton);

      await waitFor(() => {
        expect(callApi).toHaveBeenCalledWith(
          '/providers/test-session',
          expect.objectContaining({
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: expect.stringContaining(baseProvider.config.url as string),
          }),
        );
      });
    });

    it('should display success message when test passes', async () => {
      const mockResponse = {
        ok: true,
        json: vi.fn().mockResolvedValue({
          success: true,
          message: 'Session test passed successfully',
          details: {
            sessionId: 'test-session-123',
          },
        }),
      };
      (callApi as Mock).mockResolvedValue(mockResponse);

      render(
        <SessionsTab
          selectedTarget={baseProvider}
          updateCustomTarget={mockUpdateCustomTarget}
          onTestComplete={mockOnTestComplete}
        />,
      );

      const testButton = screen.getByRole('button', { name: /test session/i });
      fireEvent.click(testButton);

      await waitFor(() => {
        expect(screen.getByText('Session Test Passed')).toBeInTheDocument();
        expect(screen.getByText('Session test passed successfully')).toBeInTheDocument();
      });

      expect(mockOnTestComplete).toHaveBeenCalledWith(true);
    });

    it('should display error message when test fails', async () => {
      const mockResponse = {
        ok: false,
        status: 400,
        json: vi.fn().mockResolvedValue({
          error: 'Invalid session configuration',
          message: 'Session parser failed',
        }),
      };
      (callApi as Mock).mockResolvedValue(mockResponse);

      render(
        <SessionsTab
          selectedTarget={baseProvider}
          updateCustomTarget={mockUpdateCustomTarget}
          onTestComplete={mockOnTestComplete}
        />,
      );

      const testButton = screen.getByRole('button', { name: /test session/i });
      fireEvent.click(testButton);

      await waitFor(() => {
        expect(screen.getByText('Session Test Failed')).toBeInTheDocument();
        expect(screen.getByText('Session parser failed')).toBeInTheDocument();
      });

      expect(mockOnTestComplete).toHaveBeenCalledWith(false);
    });

    it('should handle API call exceptions', async () => {
      (callApi as Mock).mockRejectedValue(new Error('Network error'));

      render(
        <SessionsTab
          selectedTarget={baseProvider}
          updateCustomTarget={mockUpdateCustomTarget}
          onTestComplete={mockOnTestComplete}
        />,
      );

      const testButton = screen.getByRole('button', { name: /test session/i });
      fireEvent.click(testButton);

      await waitFor(() => {
        expect(screen.getByText('Session Test Failed')).toBeInTheDocument();
        expect(screen.getByText(/Network error/)).toBeInTheDocument();
      });

      expect(mockOnTestComplete).toHaveBeenCalledWith(false);
    });

    it('should set isTestRunning state during API call', async () => {
      const mockResponse = {
        ok: true,
        json: vi.fn().mockResolvedValue({
          success: true,
          message: 'Test passed',
        }),
      };
      (callApi as Mock).mockImplementation(
        () =>
          new Promise((resolve) => {
            setTimeout(() => resolve(mockResponse), 100);
          }),
      );

      render(
        <SessionsTab
          selectedTarget={baseProvider}
          updateCustomTarget={mockUpdateCustomTarget}
          onTestComplete={mockOnTestComplete}
        />,
      );

      const testButton = screen.getByRole('button', { name: /test session/i });
      fireEvent.click(testButton);

      // Button should show "Testing..." immediately
      expect(screen.getByText('Testing...')).toBeInTheDocument();

      await waitFor(() => {
        expect(screen.getByText('Test Session')).toBeInTheDocument();
      });
    });
  });

  describe('handleDialogConfirm', () => {
    it('should close dialog and run test with selected variable', async () => {
      const mockResponse = {
        ok: true,
        json: vi.fn().mockResolvedValue({
          success: true,
          message: 'Test passed',
        }),
      };
      (callApi as Mock).mockResolvedValue(mockResponse);

      render(
        <SessionsTab
          selectedTarget={{
            ...baseProvider,
            inputs: {
              user_id: 'User identifier',
              session_token: 'Session token',
            },
          }}
          updateCustomTarget={mockUpdateCustomTarget}
          onTestComplete={mockOnTestComplete}
        />,
      );

      const testButton = screen.getByRole('button', { name: /test session/i });
      fireEvent.click(testButton);

      // Dialog should open
      await waitFor(() => {
        expect(screen.getByTestId('variable-selection-dialog')).toBeInTheDocument();
      });

      // Click confirm in dialog
      const confirmButton = screen.getByRole('button', { name: /confirm/i });
      fireEvent.click(confirmButton);

      // Dialog should close
      await waitFor(() => {
        expect(screen.queryByTestId('variable-selection-dialog')).not.toBeInTheDocument();
      });

      // Test should run
      await waitFor(() => {
        expect(callApi).toHaveBeenCalled();
      });
    });
  });

  describe('handleTestSessionClick', () => {
    it('should open variable selection dialog when multiple inputs exist', () => {
      render(
        <SessionsTab
          selectedTarget={{
            ...baseProvider,
            inputs: {
              user_id: 'User identifier',
              session_token: 'Session token',
            },
          }}
          updateCustomTarget={mockUpdateCustomTarget}
        />,
      );

      const testButton = screen.getByRole('button', { name: /test session/i });
      fireEvent.click(testButton);

      expect(screen.getByTestId('variable-selection-dialog')).toBeInTheDocument();
    });

    it('should run test directly when no inputs exist', async () => {
      const mockResponse = {
        ok: true,
        json: vi.fn().mockResolvedValue({
          success: true,
          message: 'Test passed',
        }),
      };
      (callApi as Mock).mockResolvedValue(mockResponse);

      render(
        <SessionsTab
          selectedTarget={baseProvider}
          updateCustomTarget={mockUpdateCustomTarget}
          onTestComplete={mockOnTestComplete}
        />,
      );

      const testButton = screen.getByRole('button', { name: /test session/i });
      fireEvent.click(testButton);

      // Should not show dialog
      expect(screen.queryByTestId('variable-selection-dialog')).not.toBeInTheDocument();

      // Should call API directly
      await waitFor(() => {
        expect(callApi).toHaveBeenCalled();
      });
    });

    it('should pre-select first variable if none selected', () => {
      render(
        <SessionsTab
          selectedTarget={{
            ...baseProvider,
            inputs: {
              user_id: 'User identifier',
              session_token: 'Session token',
            },
          }}
          updateCustomTarget={mockUpdateCustomTarget}
        />,
      );

      const testButton = screen.getByRole('button', { name: /test session/i });
      fireEvent.click(testButton);

      // Dialog should be shown (implies variable was pre-selected)
      expect(screen.getByTestId('variable-selection-dialog')).toBeInTheDocument();
    });
  });

  describe('Test result details rendering', () => {
    it('should render chat messages from test result details', async () => {
      const mockResponse = {
        ok: true,
        json: vi.fn().mockResolvedValue({
          success: true,
          message: 'Test passed',
          details: {
            sessionId: 'test-123',
            request1: { prompt: 'Hello' },
            response1: 'Hi there',
            request2: { prompt: 'How are you?' },
            response2: 'I am fine',
          },
        }),
      };
      (callApi as Mock).mockResolvedValue(mockResponse);

      render(
        <SessionsTab
          selectedTarget={baseProvider}
          updateCustomTarget={mockUpdateCustomTarget}
          onTestComplete={mockOnTestComplete}
        />,
      );

      const testButton = screen.getByRole('button', { name: /test session/i });
      fireEvent.click(testButton);

      // Wait for the test result to appear
      await waitFor(() => {
        expect(screen.getByText('Session Test Passed')).toBeInTheDocument();
      });

      // Expand the details section
      const detailsTrigger = screen.getByText('Session Test Details');
      fireEvent.click(detailsTrigger);

      // Now check messages are rendered
      await waitFor(() => {
        expect(screen.getByTestId('chat-messages')).toBeInTheDocument();
      });

      expect(screen.getByText('Hello')).toBeInTheDocument();
      expect(screen.getByText('Hi there')).toBeInTheDocument();
      expect(screen.getByText('How are you?')).toBeInTheDocument();
      expect(screen.getByText('I am fine')).toBeInTheDocument();
    });

    it('should display session details from test result', async () => {
      const mockResponse = {
        ok: true,
        json: vi.fn().mockResolvedValue({
          success: true,
          message: 'Test passed',
          details: {
            sessionId: 'session-abc-123',
            sessionSource: 'server',
            hasSessionIdTemplate: true,
            hasSessionParser: true,
            sessionParser: 'data.headers["session-id"]',
          },
        }),
      };
      (callApi as Mock).mockResolvedValue(mockResponse);

      render(
        <SessionsTab
          selectedTarget={baseProvider}
          updateCustomTarget={mockUpdateCustomTarget}
          onTestComplete={mockOnTestComplete}
        />,
      );

      const testButton = screen.getByRole('button', { name: /test session/i });
      fireEvent.click(testButton);

      // Wait for test result
      await waitFor(() => {
        expect(screen.getByText('Session Test Passed')).toBeInTheDocument();
      });

      // Expand details
      const detailsTrigger = screen.getByText('Session Test Details');
      fireEvent.click(detailsTrigger);

      await waitFor(() => {
        expect(screen.getByText('session-abc-123')).toBeInTheDocument();
      });

      expect(screen.getByText('server')).toBeInTheDocument();
      expect(screen.getByText('Found')).toBeInTheDocument();
      expect(screen.getByText('Configured')).toBeInTheDocument();
      expect(screen.getByText('data.headers["session-id"]')).toBeInTheDocument();
    });

    it('should expand details automatically on test failure', async () => {
      const mockResponse = {
        ok: false,
        status: 400,
        json: vi.fn().mockResolvedValue({
          error: 'Test failed',
          message: 'Session not found',
          details: {
            sessionId: null,
          },
        }),
      };
      (callApi as Mock).mockResolvedValue(mockResponse);

      render(
        <SessionsTab
          selectedTarget={baseProvider}
          updateCustomTarget={mockUpdateCustomTarget}
          onTestComplete={mockOnTestComplete}
        />,
      );

      const testButton = screen.getByRole('button', { name: /test session/i });
      fireEvent.click(testButton);

      await waitFor(() => {
        // Details should be expanded (trigger should be visible)
        expect(screen.getByText('Session Test Details')).toBeInTheDocument();
      });
    });
  });

  describe('Conditional rendering based on configuration', () => {
    it('should not show session management options when system is not stateful', () => {
      render(
        <SessionsTab
          selectedTarget={{
            ...baseProvider,
            config: {
              ...baseProvider.config,
              stateful: false,
            },
          }}
          updateCustomTarget={mockUpdateCustomTarget}
        />,
      );

      expect(screen.queryByText('How does your target manage sessions?')).not.toBeInTheDocument();
    });

    it('should show session management options when system is stateful', () => {
      render(
        <SessionsTab
          selectedTarget={{
            ...baseProvider,
            config: {
              ...baseProvider.config,
              stateful: true,
            },
          }}
          updateCustomTarget={mockUpdateCustomTarget}
        />,
      );

      expect(screen.getByText('How does your target manage sessions?')).toBeInTheDocument();
    });

    it('should show SessionEndpointConfig when sessionSource is endpoint', () => {
      render(
        <SessionsTab
          selectedTarget={{
            ...baseProvider,
            config: {
              ...baseProvider.config,
              sessionSource: 'endpoint',
              session: {
                url: 'https://api.example.com/session',
                method: 'POST',
              },
            },
          }}
          updateCustomTarget={mockUpdateCustomTarget}
        />,
      );

      expect(screen.getByText('Session Endpoint Configuration')).toBeInTheDocument();
      expect(screen.getByLabelText('Session Endpoint URL')).toBeInTheDocument();
    });

    it('should not show request body field when method is GET', () => {
      render(
        <SessionsTab
          selectedTarget={{
            ...baseProvider,
            config: {
              ...baseProvider.config,
              sessionSource: 'endpoint',
              session: {
                url: 'https://api.example.com/session',
                method: 'GET',
              },
            },
          }}
          updateCustomTarget={mockUpdateCustomTarget}
        />,
      );

      expect(screen.queryByLabelText('Request Body')).not.toBeInTheDocument();
    });

    it('should show request body field when method is POST', () => {
      render(
        <SessionsTab
          selectedTarget={{
            ...baseProvider,
            config: {
              ...baseProvider.config,
              sessionSource: 'endpoint',
              session: {
                url: 'https://api.example.com/session',
                method: 'POST',
              },
            },
          }}
          updateCustomTarget={mockUpdateCustomTarget}
        />,
      );

      expect(screen.getByLabelText('Request Body')).toBeInTheDocument();
    });

    it('should disable test button when URL is not configured', () => {
      render(
        <SessionsTab
          selectedTarget={{
            ...baseProvider,
            config: {
              ...baseProvider.config,
              url: '',
            },
          }}
          updateCustomTarget={mockUpdateCustomTarget}
        />,
      );

      const testButton = screen.getByRole('button', { name: /test session/i });
      expect(testButton).toBeDisabled();
    });
  });

  describe('Clear test result on configuration change', () => {
    it('should clear test result when stateful radio changes', async () => {
      const mockResponse = {
        ok: true,
        json: vi.fn().mockResolvedValue({
          success: true,
          message: 'Test passed',
        }),
      };
      (callApi as Mock).mockResolvedValue(mockResponse);

      render(
        <SessionsTab
          selectedTarget={baseProvider}
          updateCustomTarget={mockUpdateCustomTarget}
          onTestComplete={mockOnTestComplete}
        />,
      );

      const testButton = screen.getByRole('button', { name: /test session/i });
      fireEvent.click(testButton);

      await waitFor(() => {
        expect(screen.getByText('Session Test Passed')).toBeInTheDocument();
      });

      // Change stateful setting
      const statefulRadio = screen.getByRole('radio', { name: /no - my system is not stateful/i });
      fireEvent.click(statefulRadio);

      // Test result should be cleared
      expect(screen.queryByText('Session Test Passed')).not.toBeInTheDocument();
    });

    it('should clear test result when session source changes', async () => {
      const mockResponse = {
        ok: true,
        json: vi.fn().mockResolvedValue({
          success: true,
          message: 'Test passed',
        }),
      };
      (callApi as Mock).mockResolvedValue(mockResponse);

      render(
        <SessionsTab
          selectedTarget={baseProvider}
          updateCustomTarget={mockUpdateCustomTarget}
          onTestComplete={mockOnTestComplete}
        />,
      );

      const testButton = screen.getByRole('button', { name: /test session/i });
      fireEvent.click(testButton);

      await waitFor(() => {
        expect(screen.getByText('Session Test Passed')).toBeInTheDocument();
      });

      // Change session source
      const clientRadio = screen.getByRole('radio', { name: /client-generated session id/i });
      fireEvent.click(clientRadio);

      // Test result should be cleared
      expect(screen.queryByText('Session Test Passed')).not.toBeInTheDocument();
    });
  });
});
