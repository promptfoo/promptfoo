import React from 'react';

import { createTheme, ThemeProvider } from '@mui/material/styles';
import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import ProviderResponse from './ProviderResponse';

const renderWithTheme = (ui: React.ReactElement) => {
  const theme = createTheme();
  return render(<ThemeProvider theme={theme}>{ui}</ThemeProvider>);
};

describe('ProviderResponse', () => {
  it('should render the headers table with correct header keys and values when headers are present', () => {
    const mockProviderResponse = {
      metadata: {
        headers: {
          'Content-Type': 'application/json',
          'X-Request-ID': 'abc-123-xyz',
        },
      },
      raw: '{"status": "ok"}',
      output: { status: 'ok' },
      sessionId: 'session-id-456',
    };

    renderWithTheme(<ProviderResponse providerResponse={mockProviderResponse} />);

    expect(screen.getByText('Headers:')).toBeInTheDocument();

    expect(screen.getByRole('columnheader', { name: 'Header' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Value' })).toBeInTheDocument();

    expect(screen.getByRole('cell', { name: 'Content-Type' })).toBeInTheDocument();
    expect(screen.getByRole('cell', { name: 'application/json' })).toBeInTheDocument();
    expect(screen.getByRole('cell', { name: 'X-Request-ID' })).toBeInTheDocument();
    expect(screen.getByRole('cell', { name: 'abc-123-xyz' })).toBeInTheDocument();

    const rawResultHeader = screen.getByText('Raw Result:');
    expect(rawResultHeader).toBeInTheDocument();
    const rawResultContainer = rawResultHeader.nextElementSibling as HTMLElement;
    expect(within(rawResultContainer).getByText('{"status": "ok"}')).toBeInTheDocument();

    const parsedResultHeader = screen.getByText('Parsed Result:');
    expect(parsedResultHeader).toBeInTheDocument();
    const parsedResultContainer = parsedResultHeader.nextElementSibling as HTMLElement;
    expect(within(parsedResultContainer).getByText(/"status": "ok"/)).toBeInTheDocument();

    expect(screen.getByText('Session ID:')).toBeInTheDocument();
    expect(screen.getByText('session-id-456')).toBeInTheDocument();
  });

  it('should render the raw result, parsed result, and session ID when providerResponse contains these fields', () => {
    const mockProviderResponse = {
      raw: 'This is a raw result',
      output: 'This is a parsed result',
      sessionId: 'session123',
    };

    renderWithTheme(<ProviderResponse providerResponse={mockProviderResponse} />);

    const rawResultHeader = screen.getByText('Raw Result:');
    expect(rawResultHeader).toBeInTheDocument();
    const rawResultContainer = rawResultHeader.nextElementSibling as HTMLElement;
    expect(within(rawResultContainer).getByText('This is a raw result')).toBeInTheDocument();

    const parsedResultHeader = screen.getByText('Parsed Result:');
    expect(parsedResultHeader).toBeInTheDocument();
    const parsedResultContainer = parsedResultHeader.nextElementSibling as HTMLElement;
    expect(within(parsedResultContainer).getByText('This is a parsed result')).toBeInTheDocument();

    const sessionIdHeader = screen.getByText('Session ID:');
    expect(sessionIdHeader).toBeInTheDocument();
    const sessionIdContainer = sessionIdHeader.nextElementSibling as HTMLElement;
    expect(within(sessionIdContainer).getByText('session123')).toBeInTheDocument();
  });

  it('should render an error alert with the error message from providerResponse.error when providerResponse.raw is undefined', () => {
    const mockProviderResponse = {
      error: 'Provider failed to respond',
    };

    renderWithTheme(<ProviderResponse providerResponse={mockProviderResponse} />);

    const alert = screen.getByRole('alert')!;
    expect(alert).toBeInTheDocument();
    expect(alert).toHaveTextContent('Provider failed to respond');
  });

  it('should render an error alert with a default message when providerResponse.raw and providerResponse.error are undefined', () => {
    const mockProviderResponse = {};

    renderWithTheme(<ProviderResponse providerResponse={mockProviderResponse} />);

    const alert = screen.getByRole('alert')!;
    expect(alert).toBeInTheDocument();
    expect(alert).toHaveTextContent('No response from provider');
  });

  it('should not render the headers table when providerResponse.metadata.headers is undefined, but should still display the raw, parsed, and sessionId sections', () => {
    const mockProviderResponse = {
      metadata: {
        headers: undefined,
      },
      raw: '{"status": "ok"}',
      output: { status: 'ok' },
      sessionId: 'session-id-456',
    };

    renderWithTheme(<ProviderResponse providerResponse={mockProviderResponse} />);

    expect(screen.queryByText('Headers:')).toBeNull();

    const rawResultHeader = screen.getByText('Raw Result:');
    expect(rawResultHeader).toBeInTheDocument();
    const rawResultContainer = rawResultHeader.nextElementSibling as HTMLElement;
    expect(within(rawResultContainer).getByText('{"status": "ok"}')).toBeInTheDocument();

    const parsedResultHeader = screen.getByText('Parsed Result:');
    expect(parsedResultHeader).toBeInTheDocument();
    const parsedResultContainer = parsedResultHeader.nextElementSibling as HTMLElement;
    expect(within(parsedResultContainer).getByText(/"status": "ok"/)).toBeInTheDocument();

    expect(screen.getByText('Session ID:')).toBeInTheDocument();
    expect(screen.getByText('session-id-456')).toBeInTheDocument();
  });

  it('should not render the headers table when providerResponse.metadata.headers is empty, but should still display the raw, parsed, and sessionId sections', () => {
    const mockProviderResponse = {
      metadata: {
        headers: {},
      },
      raw: '{"status": "ok"}',
      output: { status: 'ok' },
      sessionId: 'session-id-456',
    };

    renderWithTheme(<ProviderResponse providerResponse={mockProviderResponse} />);

    expect(screen.queryByText('Headers:')).toBeNull();

    const rawResultHeader = screen.getByText('Raw Result:');
    expect(rawResultHeader).toBeInTheDocument();
    const rawResultContainer = rawResultHeader.nextElementSibling as HTMLElement;
    expect(within(rawResultContainer).getByText('{"status": "ok"}')).toBeInTheDocument();

    const parsedResultHeader = screen.getByText('Parsed Result:');
    expect(parsedResultHeader).toBeInTheDocument();
    const parsedResultContainer = parsedResultHeader.nextElementSibling as HTMLElement;
    expect(within(parsedResultContainer).getByText(/"status": "ok"/)).toBeInTheDocument();

    expect(screen.getByText('Session ID:')).toBeInTheDocument();
    expect(screen.getByText('session-id-456')).toBeInTheDocument();
  });

  it('should render without errors and display raw result when providerResponse.metadata is null', () => {
    const mockProviderResponse = {
      raw: '{"status": "ok"}',
      output: { status: 'ok' },
      sessionId: 'session-id-456',
      metadata: null,
    };

    renderWithTheme(<ProviderResponse providerResponse={mockProviderResponse} />);

    const headersElement = screen.queryByText('Headers:');
    expect(headersElement).toBeNull();

    const rawResultHeader = screen.getByText('Raw Result:');
    expect(rawResultHeader).toBeInTheDocument();
    const rawResultContainer = rawResultHeader.nextElementSibling as HTMLElement;
    expect(within(rawResultContainer).getByText('{"status": "ok"}')).toBeInTheDocument();

    const parsedResultHeader = screen.getByText('Parsed Result:');
    expect(parsedResultHeader).toBeInTheDocument();
    const parsedResultContainer = parsedResultHeader.nextElementSibling as HTMLElement;
    expect(within(parsedResultContainer).getByText(/"status": "ok"/)).toBeInTheDocument();

    expect(screen.getByText('Session ID:')).toBeInTheDocument();
    expect(screen.getByText('session-id-456')).toBeInTheDocument();
  });

  it('should render without errors and display raw result when providerResponse.metadata is undefined', () => {
    const mockProviderResponse = {
      raw: '{"status": "ok"}',
      output: { status: 'ok' },
      sessionId: 'session-id-456',
    };

    renderWithTheme(<ProviderResponse providerResponse={mockProviderResponse} />);

    const headersElement = screen.queryByText('Headers:');
    expect(headersElement).toBeNull();

    const rawResultHeader = screen.getByText('Raw Result:');
    expect(rawResultHeader).toBeInTheDocument();
    const rawResultContainer = rawResultHeader.nextElementSibling as HTMLElement;
    expect(within(rawResultContainer).getByText('{"status": "ok"}')).toBeInTheDocument();

    const parsedResultHeader = screen.getByText('Parsed Result:');
    expect(parsedResultHeader).toBeInTheDocument();
    const parsedResultContainer = parsedResultHeader.nextElementSibling as HTMLElement;
    expect(within(parsedResultContainer).getByText(/"status": "ok"/)).toBeInTheDocument();

    expect(screen.getByText('Session ID:')).toBeInTheDocument();
    expect(screen.getByText('session-id-456')).toBeInTheDocument();
  });

  it('should handle extremely long header values without breaking the UI layout', () => {
    const longHeaderValue = 'A'.repeat(200);
    const mockProviderResponse = {
      metadata: {
        headers: {
          'Very-Long-Header': longHeaderValue,
        },
      },
      raw: '{"status": "ok"}',
      output: { status: 'ok' },
      sessionId: 'session-id-456',
    };

    renderWithTheme(<ProviderResponse providerResponse={mockProviderResponse} />);

    const headerValueCell = screen.getByText(longHeaderValue).closest('td');
    expect(headerValueCell).toBeInTheDocument();

    expect(headerValueCell).toBeVisible();
  });

  it('should render header names with special characters and long names correctly', () => {
    const mockProviderResponse = {
      metadata: {
        headers: {
          'Special-Chars~!@#$%^&*()_+=-`': 'value1',
          'Very-Long-Header-Name-Exceeding-Reasonable-Length': 'value2',
          'Header with spaces': 'value3',
        },
      },
      raw: '{"status": "ok"}',
      output: { status: 'ok' },
      sessionId: 'session-id-456',
    };

    renderWithTheme(<ProviderResponse providerResponse={mockProviderResponse} />);

    expect(screen.getByText('Headers:')).toBeInTheDocument();
    expect(screen.getByRole('cell', { name: 'Special-Chars~!@#$%^&*()_+=-`' })).toBeInTheDocument();
    expect(
      screen.getByRole('cell', { name: 'Very-Long-Header-Name-Exceeding-Reasonable-Length' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('cell', { name: 'Header with spaces' })).toBeInTheDocument();
  });
});
