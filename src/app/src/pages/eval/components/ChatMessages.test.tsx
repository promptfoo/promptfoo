import { createTheme, ThemeProvider } from '@mui/material/styles';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import ChatMessages, { type Message } from './ChatMessages';

const renderWithTheme = (component: React.ReactNode) => {
  const theme = createTheme({
    palette: { mode: 'light' },
  });
  return render(<ThemeProvider theme={theme}>{component}</ThemeProvider>);
};

describe('ChatMessages', () => {
  it('should render a ChatMessage for each message when messages is a non-empty array', () => {
    const mockMessages: Message[] = [
      { role: 'user', content: 'Hello, this is a user message.' },
      { role: 'assistant', content: 'This is the assistant responding.' },
      { role: 'system', content: 'System instruction.' },
    ];

    renderWithTheme(<ChatMessages messages={mockMessages} />);

    expect(screen.getByText('Hello, this is a user message.')).toBeInTheDocument();
    expect(screen.getByText('This is the assistant responding.')).toBeInTheDocument();
    expect(screen.getByText('System instruction.')).toBeInTheDocument();

    const messageElements = screen.getAllByRole('alert');
    expect(messageElements).toHaveLength(mockMessages.length);
  });

  it('should render null when messages is undefined', () => {
    const messages: any = [];

    const { container } = renderWithTheme(<ChatMessages messages={messages} />);

    expect(container.firstChild).toBeNull();
  });

  it('should preserve the order of messages when rendering', () => {
    const mockMessages: Message[] = [
      { role: 'user', content: 'First message.' },
      { role: 'assistant', content: 'Second message.' },
      { role: 'system', content: 'Third message.' },
    ];

    renderWithTheme(<ChatMessages messages={mockMessages} />);

    const messageElements = screen.getAllByRole('alert');
    expect(messageElements).toHaveLength(mockMessages.length);
    expect(messageElements[0]).toHaveTextContent('First message.');
    expect(messageElements[1]).toHaveTextContent('Second message.');
    expect(messageElements[2]).toHaveTextContent('Third message.');
  });

  it('should handle messages with extremely long content', () => {
    const longMessageContent = 'This is a very long message. '.repeat(1000);
    const mockMessages: Message[] = [{ role: 'assistant', content: longMessageContent }];

    renderWithTheme(<ChatMessages messages={mockMessages} />);

    expect(
      screen.getByText((_content, element) => {
        return element?.textContent?.startsWith('This is a very long message.') ?? false;
      }),
    ).toBeInTheDocument();
  });
});
