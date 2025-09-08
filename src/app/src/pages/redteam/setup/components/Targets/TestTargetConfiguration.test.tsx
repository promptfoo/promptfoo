import React from 'react';

import { createTheme, ThemeProvider } from '@mui/material/styles';
import { render, screen, queryByText } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { ProviderOptions } from '../../types';
import TestTargetConfiguration from './TestTargetConfiguration';

const renderWithTheme = (ui: React.ReactElement) => {
  const theme = createTheme({ palette: { mode: 'light' } });
  return render(<ThemeProvider theme={theme}>{ui}</ThemeProvider>);
};

describe('TestTargetConfiguration', () => {
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
  });
});
