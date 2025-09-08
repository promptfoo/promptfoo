import React from 'react';

<<<<<<< HEAD
import { callApi } from '@app/utils/api';
import { createTheme, ThemeProvider } from '@mui/material/styles';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { Mock, beforeEach, describe, expect, it, vi } from 'vitest';

import TestTargetConfiguration from './TestTargetConfiguration';

vi.mock('@app/utils/api');

=======
import { createTheme, ThemeProvider } from '@mui/material/styles';
import { render, screen, queryByText } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { ProviderOptions } from '../../types';
import TestTargetConfiguration from './TestTargetConfiguration';

>>>>>>> 8800690f7 (Add Tusk tests)
const renderWithTheme = (ui: React.ReactElement) => {
  const theme = createTheme({ palette: { mode: 'light' } });
  return render(<ThemeProvider theme={theme}>{ui}</ThemeProvider>);
};

describe('TestTargetConfiguration', () => {
<<<<<<< HEAD
  const mockCallApi = callApi as Mock;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Happy Path Scenarios', () => {
    it('should display a success message and provider response details for a valid URL configuration', async () => {
      const onTestComplete = vi.fn();
      const selectedTarget = {
        id: 'http',
        label: 'My Test API',
        config: {
          url: 'https://my.api.com/chat',
          headers: { 'X-API-Key': 'test-key' },
        },
      };

      const mockApiResponse = {
        testResult: {
          success: true,
          message: 'Target configuration is valid!',
        },
        providerResponse: {
          raw: '{"message": "Hello from API"}',
          output: 'Hello from API',
          sessionId: 'session-12345',
          metadata: {
            headers: {
              'content-type': 'application/json',
            },
          },
        },
      };

      mockCallApi.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockApiResponse),
      });

      renderWithTheme(
        <TestTargetConfiguration selectedTarget={selectedTarget} onTestComplete={onTestComplete} />,
      );

      const testButton = screen.getByRole('button', { name: /Test Target/i });
      fireEvent.click(testButton);

      expect(screen.getByRole('button', { name: /Testing.../i })).toBeInTheDocument();
      expect(screen.getByRole('progressbar')).toBeInTheDocument();

      await waitFor(() => {
        expect(screen.getByText('Target configuration is valid!')).toBeInTheDocument();
      });

      expect(screen.getByText('Provider Response Details')).toBeInTheDocument();
      expect(screen.getByText('Headers:')).toBeInTheDocument();
      expect(screen.getByRole('cell', { name: 'content-type' })).toBeInTheDocument();
      expect(screen.getByRole('cell', { name: 'application/json' })).toBeInTheDocument();

      expect(screen.getByText('Raw Result:')).toBeInTheDocument();
      expect(screen.getByText('{"message": "Hello from API"}')).toBeInTheDocument();

      expect(screen.getByText('Parsed Result:')).toBeInTheDocument();
      expect(screen.getByText('Hello from API')).toBeInTheDocument();

      expect(screen.getByText('Session ID:')).toBeInTheDocument();
      expect(screen.getByText('session-12345')).toBeInTheDocument();

      expect(onTestComplete).toHaveBeenCalledWith(true);
      expect(onTestComplete).toHaveBeenCalledTimes(1);

      expect(mockCallApi).toHaveBeenCalledWith('/providers/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(selectedTarget),
      });
    });

    it('should display a success message and request details when the user tests a valid target configuration with a custom request function and the API responds with success', async () => {
      const onTestComplete = vi.fn();
      const selectedTarget = {
        id: 'custom',
        label: 'Custom Request API',
        config: {
          request:
            '() => Promise.resolve({ status: 200, data: { message: "Hello from custom API" } })',
        },
      };

      const mockApiResponse = {
        testResult: {
          success: true,
          message: 'Target configuration is valid!',
        },
        providerResponse: {
          raw: '{"message": "Hello from custom API"}',
          output: 'Hello from custom API',
          sessionId: 'custom-session-123',
          metadata: {
            headers: {
              'content-type': 'application/json',
            },
          },
        },
      };

      mockCallApi.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockApiResponse),
      });

      renderWithTheme(
        <TestTargetConfiguration selectedTarget={selectedTarget} onTestComplete={onTestComplete} />,
      );

      const testButton = screen.getByRole('button', { name: /Test Target/i });
      fireEvent.click(testButton);

      expect(screen.getByRole('button', { name: /Testing.../i })).toBeInTheDocument();
      expect(screen.getByRole('progressbar')).toBeInTheDocument();

      await waitFor(() => {
        expect(screen.getByText('Target configuration is valid!')).toBeInTheDocument();
      });

      expect(screen.getByText('Request Details')).toBeInTheDocument();
      expect(screen.getByText('Custom Request Function:')).toBeInTheDocument();
      expect(
        screen.getByText(
          '() => Promise.resolve({ status: 200, data: { message: "Hello from custom API" } })',
        ),
      ).toBeInTheDocument();

      expect(screen.getByText('Provider Response Details')).toBeInTheDocument();
      expect(screen.getByText('Headers:')).toBeInTheDocument();
      expect(screen.getByRole('cell', { name: 'content-type' })).toBeInTheDocument();
      expect(screen.getByRole('cell', { name: 'application/json' })).toBeInTheDocument();

      expect(screen.getByText('Raw Result:')).toBeInTheDocument();
      expect(screen.getByText('{"message": "Hello from custom API"}')).toBeInTheDocument();

      expect(screen.getByText('Parsed Result:')).toBeInTheDocument();
      expect(screen.getByText('Hello from custom API')).toBeInTheDocument();

      expect(screen.getByText('Session ID:')).toBeInTheDocument();
      expect(screen.getByText('custom-session-123')).toBeInTheDocument();

      expect(onTestComplete).toHaveBeenCalledWith(true);
      expect(onTestComplete).toHaveBeenCalledTimes(1);

      expect(mockCallApi).toHaveBeenCalledWith('/providers/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(selectedTarget),
      });
    });

    it('should display suggestions when the API response includes suggestions in the test result', async () => {
      const selectedTarget = {
        id: 'http',
        label: 'My Test API',
        config: {
          url: 'https://my.api.com/chat',
        },
      };

      const mockApiResponse = {
        testResult: {
          success: true,
          message: 'Target configuration is valid!',
          suggestions: ['Suggestion 1', 'Suggestion 2'],
        },
        providerResponse: {},
      };

      mockCallApi.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockApiResponse),
      });

      renderWithTheme(<TestTargetConfiguration selectedTarget={selectedTarget} />);

      const testButton = screen.getByRole('button', { name: /Test Target/i });
      fireEvent.click(testButton);

      await waitFor(() => {
        expect(screen.getByText('Target configuration is valid!')).toBeInTheDocument();
      });

      expect(screen.getByText('Suggestions:')).toBeInTheDocument();
      expect(screen.getByText('Suggestion 1')).toBeInTheDocument();
      expect(screen.getByText('Suggestion 2')).toBeInTheDocument();
    });

    it('should display the transformed prompt in the request details when the test result includes a transformedRequest', async () => {
      const selectedTarget = {
        id: 'http',
        label: 'My Test API',
        config: {
          url: 'https://my.api.com/chat',
        },
      };

      const transformedPrompt = 'This is the transformed prompt.';
      const mockApiResponse = {
        testResult: {
          success: true,
          message: 'Target configuration is valid!',
        },
        transformedRequest: transformedPrompt,
      };

      mockCallApi.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockApiResponse),
      });

      renderWithTheme(<TestTargetConfiguration selectedTarget={selectedTarget} />);

      const testButton = screen.getByRole('button', { name: /Test Target/i });
      fireEvent.click(testButton);

      await waitFor(() => {
        expect(screen.getByText('Target configuration is valid!')).toBeInTheDocument();
      });

      const requestDetailsAccordion = screen.getByText('Request Details');
      fireEvent.click(requestDetailsAccordion);

      await waitFor(() => {
        expect(screen.getByText('Transformed Prompt:')).toBeInTheDocument();
        expect(screen.getByText(transformedPrompt)).toBeInTheDocument();
      });
    });

    it('should display both simple string and OpenAI formatted prompt results when the test result includes redteamProviderResult', async () => {
      const selectedTarget = {
        id: 'http',
        label: 'My Test API',
        config: {
          url: 'https://my.api.com/chat',
        },
      };

      const mockApiResponse = {
        testResult: {
          success: true,
          message: 'Target configuration is valid!',
        },
        providerResponse: {
          raw: '{"message": "Hello from simple string prompt"}',
          output: 'Hello from simple string prompt',
        },
        redteamProviderResult: {
          raw: '{"message": "Hello from OpenAI formatted prompt"}',
          output: 'Hello from OpenAI formatted prompt',
        },
      };

      mockCallApi.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockApiResponse),
      });

      renderWithTheme(<TestTargetConfiguration selectedTarget={selectedTarget} />);

      const testButton = screen.getByRole('button', { name: /Test Target/i });
      fireEvent.click(testButton);

      await waitFor(() => {
        expect(screen.getByText('Simple String Prompt "hello world"')).toBeInTheDocument();
        expect(screen.getByText('Hello from simple string prompt')).toBeInTheDocument();
        expect(screen.getByText('OpenAI Formatted Prompt')).toBeInTheDocument();
        expect(screen.getByText('Hello from OpenAI formatted prompt')).toBeInTheDocument();
      });
    });

    it('should display a success message when redteamProviderResult.output contains curly braces as part of normal text', async () => {
      const selectedTarget = {
        id: 'http',
        label: 'My Test API',
        config: {
          url: 'https://my.api.com/chat',
          headers: { 'X-API-Key': 'test-key' },
        },
      };

      const mockApiResponse = {
        testResult: {
          success: true,
          message: 'Target configuration is valid!',
        },
        providerResponse: {
          raw: '{"message": "Hello from API"}',
          output: 'Hello from API',
          sessionId: 'session-12345',
          metadata: {
            headers: {
              'content-type': 'application/json',
            },
          },
        },
        redteamProviderResult: {
          output: 'This is a test with curly braces {like these}.',
        },
      };

      mockCallApi.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockApiResponse),
      });

      renderWithTheme(<TestTargetConfiguration selectedTarget={selectedTarget} />);

      const testButton = screen.getByRole('button', { name: /Test Target/i });
      fireEvent.click(testButton);

      expect(screen.getByRole('button', { name: /Testing.../i })).toBeInTheDocument();
      expect(screen.getByRole('progressbar')).toBeInTheDocument();

      await waitFor(() => {
        expect(screen.getByText('Target configuration is valid!')).toBeInTheDocument();
      });
    });

    it('should display final request body section when testResult contains providerResponse with metadata.finalRequestBody', async () => {
      const selectedTarget = {
        id: 'http',
        label: 'My Test API',
        config: {
          url: 'https://my.api.com/chat',
        },
      };

      const mockApiResponse = {
        testResult: {
          success: true,
          message: 'Target configuration is valid!',
        },
        providerResponse: {
          metadata: {
            finalRequestBody: { key: 'value' },
          },
        },
      };

      mockCallApi.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockApiResponse),
      });

      renderWithTheme(<TestTargetConfiguration selectedTarget={selectedTarget} />);

      const testButton = screen.getByRole('button', { name: /Test Target/i });
      fireEvent.click(testButton);

      await waitFor(() => {
        expect(screen.getByText('Final Request Body (sent to server):')).toBeInTheDocument();
      });

      const requestDetailsButton = screen.getByRole('button', { name: /Request Details/i });
      fireEvent.click(requestDetailsButton);

      expect(
        screen.getByText((content, element) => {
          return (
            element?.tagName.toLowerCase() === 'pre' &&
            content.includes('"key"') &&
            content.includes('"value"')
          );
        }),
      ).toBeInTheDocument();
    });

    it('should correctly format and display complex transformedRequest objects as JSON', async () => {
      const selectedTarget = {
        id: 'http',
        label: 'My Test API',
        config: {
          url: 'https://my.api.com/chat',
        },
      };

      const mockApiResponse = {
        testResult: {
          success: true,
          message: 'Target configuration is valid!',
        },
        providerResponse: {},
        transformedRequest: {
          prompt: 'Translate to Spanish',
          input: {
            text: 'Hello world',
          },
          options: {
            model: 'GPT-3',
          },
        },
      };

      mockCallApi.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockApiResponse),
      });

      renderWithTheme(<TestTargetConfiguration selectedTarget={selectedTarget} />);

      const testButton = screen.getByRole('button', { name: /Test Target/i });
      fireEvent.click(testButton);

      await waitFor(() => {
        expect(screen.getByText('Target configuration is valid!')).toBeInTheDocument();
      });

      const requestDetailsHeader = screen.getByText('Request Details');
      fireEvent.click(requestDetailsHeader);

      await waitFor(() => {
        expect(
          screen.getByText((content) => content?.includes('"prompt": "Translate to Spanish"')),
        ).toBeInTheDocument();
      });
    });
  });

  describe('Error Handling Scenarios', () => {
    it('should display an error message and call onTestComplete with false when API response is not OK', async () => {
      const onTestComplete = vi.fn();
      const selectedTarget = {
        id: 'http',
        label: 'My Test API',
        config: {
          url: 'https://my.api.com/chat',
          headers: { 'X-API-Key': 'test-key' },
        },
      };

      const mockApiResponse = {
        ok: false,
        json: () => Promise.resolve({ error: 'Failed to validate target configuration' }),
      };

      mockCallApi.mockResolvedValue(mockApiResponse);

      renderWithTheme(
        <TestTargetConfiguration selectedTarget={selectedTarget} onTestComplete={onTestComplete} />,
      );

      const testButton = screen.getByRole('button', { name: /Test Target/i });
      fireEvent.click(testButton);

      expect(screen.getByRole('button', { name: /Testing.../i })).toBeInTheDocument();
      expect(screen.getByRole('progressbar')).toBeInTheDocument();

      await waitFor(() => {
        expect(screen.getByText('Failed to validate target configuration')).toBeInTheDocument();
      });

      expect(onTestComplete).toHaveBeenCalledWith(false);
      expect(onTestComplete).toHaveBeenCalledTimes(1);

      expect(mockCallApi).toHaveBeenCalledWith('/providers/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(selectedTarget),
      });
    });

    it('should handle non-OK response with invalid JSON body', async () => {
      const onTestComplete = vi.fn();
      const selectedTarget = {
        id: 'http',
        label: 'My Test API',
        config: {
          url: 'https://my.api.com/chat',
          headers: { 'X-API-Key': 'test-key' },
        },
      };

      mockCallApi.mockResolvedValue({
        ok: false,
        json: () => Promise.reject(new Error('Unexpected token < in JSON at position 0')),
      });

      renderWithTheme(
        <TestTargetConfiguration selectedTarget={selectedTarget} onTestComplete={onTestComplete} />,
      );

      const testButton = screen.getByRole('button', { name: /Test Target/i });
      fireEvent.click(testButton);

      expect(screen.getByRole('button', { name: /Testing.../i })).toBeInTheDocument();
      expect(screen.getByRole('progressbar')).toBeInTheDocument();

      await waitFor(() => {
        expect(screen.getByText('Unexpected token < in JSON at position 0')).toBeInTheDocument();
      });

      expect(onTestComplete).toHaveBeenCalledWith(false);
      expect(onTestComplete).toHaveBeenCalledTimes(1);

      expect(mockCallApi).toHaveBeenCalledWith('/providers/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(selectedTarget),
      });
    });
  });

  describe('Unaligned Provider Result Scenarios', () => {
    it('should display harmful outputs and info alert when the test result includes unalignedProviderResult with outputs', async () => {
      const selectedTarget = {
        id: 'http',
        label: 'My Test API',
        config: {
          url: 'https://my.api.com/chat',
        },
      };

      const mockApiResponse = {
        testResult: {
          success: true,
          message: 'Target configuration is valid!',
        },
        unalignedProviderResult: {
          outputs: ['Harmful output 1', 'Harmful output 2'],
        },
      };

      mockCallApi.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockApiResponse),
      });

      renderWithTheme(<TestTargetConfiguration selectedTarget={selectedTarget} />);

      const testButton = screen.getByRole('button', { name: /Test Target/i });
      fireEvent.click(testButton);

      await waitFor(() => {
        expect(
          screen.getByText(/The provider appears to be working properly/i),
        ).toBeInTheDocument();
        expect(screen.getByText(/Harmful Outputs:/i)).toBeInTheDocument();
        expect(screen.getByText(/Harmful output 1/i)).toBeInTheDocument();
        expect(screen.getByText(/Harmful output 2/i)).toBeInTheDocument();
      });
    });
=======
  it("should display the 'Request Configuration' section with all fields when a valid HTTP target is tested", () => {
    const mockSelectedTarget: ProviderOptions = {
      id: 'http',
      label: 'Test HTTP Target',
      config: {
        url: 'https://api.example.com/test',
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': 'test-key',
        },
        body: {
          prompt: '{{prompt}}',
          model: 'test-model',
        },
        request: 'This is a raw request template.',
        queryParams: {
          version: '1.0',
          debug: 'true',
        },
      },
    };

    const mockTestResult = {
      success: true,
      message: 'Test successful!',
      providerResponse: {},
    };

    renderWithTheme(
      <TestTargetConfiguration
        testingTarget={false}
        handleTestTarget={vi.fn()}
        selectedTarget={mockSelectedTarget}
        testResult={mockTestResult}
      />,
    );

    expect(screen.getByText('Request Configuration')).toBeInTheDocument();

    const preElement = screen.getByText('URL:').closest('pre');
    expect(preElement).toBeInTheDocument();

    const preElementText = preElement?.textContent;

    expect(preElementText).toContain('URL:\nhttps://api.example.com/test');
    expect(preElementText).toContain('Method:\nPUT');
    expect(preElementText).toContain(
      'Headers:\n' + JSON.stringify(mockSelectedTarget.config.headers, null, 2),
    );
    expect(preElementText).toContain(
      'Body Template:\n' + JSON.stringify(mockSelectedTarget.config.body, null, 2),
    );
    expect(preElementText).toContain('Raw Request Template:\nThis is a raw request template.');
    expect(preElementText).toContain(
      'Query Parameters:\n' + JSON.stringify(mockSelectedTarget.config.queryParams, null, 2),
    );
    expect(preElementText).toContain(
      'Note: This shows the configuration template. The actual request sent uses "Hello, world!" as the test prompt and may have variables replaced.',
    );
  });

  it("should display 'Not configured' for the URL and 'POST' for the method in the 'Request Configuration' section when these fields are not set in selectedTarget.config and a test result is present", () => {
    const mockSelectedTarget: ProviderOptions = {
      id: 'http',
      label: 'Test HTTP Target',
      config: {},
    };

    const mockTestResult = {
      success: true,
      message: 'Test successful!',
      providerResponse: {},
    };

    renderWithTheme(
      <TestTargetConfiguration
        testingTarget={false}
        handleTestTarget={vi.fn()}
        selectedTarget={mockSelectedTarget}
        testResult={mockTestResult}
      />,
    );

    expect(screen.getByText('Request Configuration')).toBeInTheDocument();

    const preElement = screen.getByText('URL:').closest('pre');
    expect(preElement).toBeInTheDocument();

    const preElementText = preElement?.textContent;

    expect(preElementText).toContain('URL:\nNot configured');
    expect(preElementText).toContain('Method:\nPOST');
    expect(preElementText).toContain(
      'Note: This shows the configuration template. The actual request sent uses "Hello, world!" as the test prompt and may have variables replaced.',
    );
  });

  it("should not render the headers, body, request template, or query parameters sections in the 'Request Configuration' display if these fields are not present in selectedTarget.config and a test result is present", () => {
    const mockSelectedTarget: ProviderOptions = {
      id: 'http',
      label: 'Test HTTP Target',
      config: {
        url: 'https://api.example.com/test',
        method: 'PUT',
      },
    };

    const mockTestResult = {
      success: true,
      message: 'Test successful!',
      providerResponse: {},
    };

    renderWithTheme(
      <TestTargetConfiguration
        testingTarget={false}
        handleTestTarget={vi.fn()}
        selectedTarget={mockSelectedTarget}
        testResult={mockTestResult}
      />,
    );

    expect(screen.getByText('Request Configuration')).toBeInTheDocument();

    const preElement = screen.getByText('URL:').closest('pre');
    expect(preElement).toBeInTheDocument();

    const preElementText = preElement?.textContent;

    expect(preElementText).toContain('URL:\nhttps://api.example.com/test');
    expect(preElementText).toContain('Method:\nPUT');

    expect(
      queryByText(
        screen.getByText('Request Configuration').closest('div') as HTMLElement,
        'Headers:',
      ),
    ).toBeNull();
    expect(
      queryByText(
        screen.getByText('Request Configuration').closest('div') as HTMLElement,
        'Body Template:',
      ),
    ).toBeNull();
    expect(
      queryByText(
        screen.getByText('Request Configuration').closest('div') as HTMLElement,
        'Raw Request Template:',
      ),
    ).toBeNull();
    expect(
      queryByText(
        screen.getByText('Request Configuration').closest('div') as HTMLElement,
        'Query Parameters:',
      ),
    ).toBeNull();
  });

  it('should display the Request Configuration section when the API call fails but testResult contains error information', () => {
    const mockSelectedTarget: ProviderOptions = {
      id: 'http',
      label: 'Test HTTP Target',
      config: {
        url: 'https://api.example.com/test',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: {
          prompt: '{{prompt}}',
          model: 'test-model',
        },
      },
    };

    const mockTestResult = {
      success: false,
      message: 'Network error occurred',
      providerResponse: {
        error: 'Failed to fetch',
      },
    };

    renderWithTheme(
      <TestTargetConfiguration
        testingTarget={false}
        handleTestTarget={vi.fn()}
        selectedTarget={mockSelectedTarget}
        testResult={mockTestResult}
      />,
    );

    expect(screen.getByText('Request Configuration')).toBeInTheDocument();

    const preElement = screen.getByText('URL:').closest('pre');
    expect(preElement).toBeInTheDocument();

    const preElementText = preElement?.textContent;

    expect(preElementText).toContain('URL:\nhttps://api.example.com/test');
    expect(preElementText).toContain('Method:\nPOST');
    expect(preElementText).toContain(
      'Body Template:\n' + JSON.stringify(mockSelectedTarget.config.body, null, 2),
    );
    expect(preElementText).toContain(
      'Note: This shows the configuration template. The actual request sent uses "Hello, world!" as the test prompt and may have variables replaced.',
    );
  });

  it('should display an error message when the selectedTarget contains JavaScript transform code with syntax errors', () => {
    const mockSelectedTarget: ProviderOptions = {
      id: 'http',
      label: 'Test HTTP Target with Transform Error',
      config: {
        url: 'https://api.example.com/test',
        requestTransform: 'function transform(data) { return data.invalid // Syntax error }',
      },
    };

    const mockTestResult = {
      success: false,
      message: 'Failed to execute transform: SyntaxError: Unexpected token',
      providerResponse: {},
    };

    renderWithTheme(
      <TestTargetConfiguration
        testingTarget={false}
        handleTestTarget={vi.fn()}
        selectedTarget={mockSelectedTarget}
        testResult={mockTestResult}
      />,
    );

    const alertElements = screen.getAllByRole('alert');
    expect(alertElements[0]).toBeInTheDocument();
    expect(alertElements[0]).toHaveTextContent(mockTestResult.message);
  });

  it('should allow scrolling for extremely long request templates', () => {
    const longRequestTemplate = 'This is a very long request template. '.repeat(100);
    const mockSelectedTarget: ProviderOptions = {
      id: 'http',
      label: 'Test HTTP Target',
      config: {
        request: longRequestTemplate,
      },
    };

    const mockTestResult = {
      success: true,
      message: 'Test successful!',
      providerResponse: {},
    };

    renderWithTheme(
      <TestTargetConfiguration
        testingTarget={false}
        handleTestTarget={vi.fn()}
        selectedTarget={mockSelectedTarget}
        testResult={mockTestResult}
      />,
    );

    const requestConfigurationElement = screen.getByText('Request Configuration');
    expect(requestConfigurationElement).toBeInTheDocument();

    const rawRequestTemplateElement = screen.getByText('Raw Request Template:');
    expect(rawRequestTemplateElement).toBeInTheDocument();

    const paperElement = rawRequestTemplateElement.closest('.MuiPaper-root');

    expect(paperElement).toHaveStyle('overflow: auto');
  });

  it('should handle a malformed providerResponse gracefully', () => {
    const mockSelectedTarget: ProviderOptions = {
      id: 'http',
      label: 'Test HTTP Target',
      config: {
        url: 'https://api.example.com/test',
      },
    };

    const mockTestResult = {
      success: false,
      message: 'Test failed!',
      providerResponse: {
        metadata: {
          headers: {
            'Content-Type': 'application/json',
          },
        },
        output: 'This is the output',
        sessionId: '123',
      },
    };

    renderWithTheme(
      <TestTargetConfiguration
        testingTarget={false}
        handleTestTarget={vi.fn()}
        selectedTarget={mockSelectedTarget}
        testResult={mockTestResult}
      />,
    );

    expect(screen.getByText('Provider Response Details')).toBeInTheDocument();

    expect(screen.getByText('No response from provider')).toBeInTheDocument();
>>>>>>> 8800690f7 (Add Tusk tests)
  });
});
