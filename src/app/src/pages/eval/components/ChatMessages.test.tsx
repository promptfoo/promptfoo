import { act, fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import ChatMessages, { type Message } from './ChatMessages';

const FAKE_IMAGE_DATA_URL = `data:image/png;base64,${'a'.repeat(80)}`;

describe('ChatMessages', () => {
  it('should render a ChatMessage for each message when messages is a non-empty array', () => {
    const mockMessages: Message[] = [
      { role: 'user', content: 'Hello, this is a user message.' },
      { role: 'assistant', content: 'This is the assistant responding.' },
      { role: 'system', content: 'System instruction.' },
    ];

    render(<ChatMessages messages={mockMessages} />);

    expect(screen.getByText('Hello, this is a user message.')).toBeInTheDocument();
    expect(screen.getByText('This is the assistant responding.')).toBeInTheDocument();
    expect(screen.getByText('System instruction.')).toBeInTheDocument();

    const messageElements = screen.getAllByRole('alert');
    expect(messageElements).toHaveLength(mockMessages.length);
  });

  it('should render null when messages is undefined', () => {
    const messages: any = [];

    const { container } = render(<ChatMessages messages={messages} />);

    expect(container.firstChild).toBeNull();
  });

  it('should preserve the order of messages when rendering', () => {
    const mockMessages: Message[] = [
      { role: 'user', content: 'First message.' },
      { role: 'assistant', content: 'Second message.' },
      { role: 'system', content: 'Third message.' },
    ];

    render(<ChatMessages messages={mockMessages} />);

    const messageElements = screen.getAllByRole('alert');
    expect(messageElements).toHaveLength(mockMessages.length);
    expect(messageElements[0]).toHaveTextContent('First message.');
    expect(messageElements[1]).toHaveTextContent('Second message.');
    expect(messageElements[2]).toHaveTextContent('Third message.');
  });

  it('should handle messages with extremely long content', () => {
    const longMessageContent = 'This is a very long message. '.repeat(1000);
    const mockMessages: Message[] = [{ role: 'assistant', content: longMessageContent }];

    render(<ChatMessages messages={mockMessages} />);

    const alert = screen.getByRole('alert');
    expect(alert.textContent?.startsWith('This is a very long message.')).toBe(true);
  });

  it('should render audio player when message has audio data', () => {
    const mockMessages: Message[] = [
      {
        role: 'user',
        content: 'This is the transcript',
        audio: { data: 'base64audiodata', format: 'mp3' },
      },
    ];

    render(<ChatMessages messages={mockMessages} />);

    const audioElement = screen.getByTestId('audio-with-transcript');
    expect(audioElement).toBeInTheDocument();
    expect(screen.getByText('This is the transcript')).toBeInTheDocument();

    const sourceElement = audioElement.querySelector('source');
    expect(sourceElement).toHaveAttribute('src', 'data:audio/mp3;base64,base64audiodata');
  });

  it('should render image when message has image data', () => {
    const mockMessages: Message[] = [
      {
        role: 'user',
        content: 'This is the image description',
        image: { data: FAKE_IMAGE_DATA_URL, format: 'png' },
      },
    ];

    render(<ChatMessages messages={mockMessages} />);

    // Find img element by its src attribute
    const imageElement = screen.getByAltText('Input');
    expect(imageElement).toBeInTheDocument();
    expect(imageElement).toHaveAttribute('src', FAKE_IMAGE_DATA_URL);
    expect(screen.getByText('This is the image description')).toBeInTheDocument();
  });

  it('should render both audio and image when message has both', () => {
    const mockMessages: Message[] = [
      {
        role: 'user',
        content: 'Multi-modal message',
        audio: { data: 'audiodata', format: 'wav' },
        image: { data: FAKE_IMAGE_DATA_URL, format: 'jpeg' },
      },
    ];

    render(<ChatMessages messages={mockMessages} />);

    expect(screen.getByTestId('audio-with-transcript')).toBeInTheDocument();
    expect(screen.getByAltText('Input')).toBeInTheDocument();
    expect(screen.getByText('Multi-modal message')).toBeInTheDocument();
  });

  it('should use default audio format when format is not specified', () => {
    const mockMessages: Message[] = [
      {
        role: 'user',
        content: 'Audio without format',
        audio: { data: 'base64audiodata' },
      },
    ];

    render(<ChatMessages messages={mockMessages} />);

    const audioElement = screen.getByTestId('audio-with-transcript');
    const sourceElement = audioElement.querySelector('source');
    expect(sourceElement).toHaveAttribute('src', 'data:audio/mp3;base64,base64audiodata');
    expect(sourceElement).toHaveAttribute('type', 'audio/mp3');
  });

  it('should use default image format when format is not specified', () => {
    const mockMessages: Message[] = [
      {
        role: 'user',
        content: 'Image without format',
        image: { data: FAKE_IMAGE_DATA_URL },
      },
    ];

    render(<ChatMessages messages={mockMessages} />);

    const imageElement = screen.getByAltText('Input');
    expect(imageElement).toHaveAttribute('src', FAKE_IMAGE_DATA_URL);
  });

  it('should render contentType audio as dedicated audio player', () => {
    const mockMessages: Message[] = [
      {
        role: 'assistant',
        content: 'base64audiocontent',
        contentType: 'audio',
      },
    ];

    render(<ChatMessages messages={mockMessages} />);

    const audioElement = screen.getByTestId('audio');
    expect(audioElement).toBeInTheDocument();
    expect(audioElement).toHaveClass('w-full', 'max-w-[500px]');
  });

  it('should render contentType image as image element', () => {
    const mockMessages: Message[] = [
      {
        role: 'assistant',
        content: FAKE_IMAGE_DATA_URL,
        contentType: 'image',
      },
    ];

    render(<ChatMessages messages={mockMessages} />);

    const imageElement = screen.getByRole('img', { name: 'Assistant message image' });
    expect(imageElement).toBeInTheDocument();
    expect(imageElement).toHaveClass(
      'w-[min(500px,70vw)]',
      'max-w-full',
      'h-[180px]',
      'sm:h-[300px]',
    );
    expect(imageElement).not.toHaveClass('min-w-[500px]');
  });

  it('should render contentType video as video element', () => {
    const mockMessages: Message[] = [
      {
        role: 'assistant',
        content: 'base64videocontent',
        contentType: 'video',
      },
    ];

    render(<ChatMessages messages={mockMessages} />);

    const videoElement = screen.getByTestId('video');
    expect(videoElement).toBeInTheDocument();
    expect(videoElement).toHaveClass('max-w-full');
    expect(videoElement.parentElement).toHaveClass('w-full', 'max-w-[500px]');
  });

  it('resolves contentType video blob references without allowing external URLs', () => {
    const blobHash = '1'.repeat(64);
    const { rerender } = render(
      <ChatMessages
        messages={[
          {
            role: 'assistant',
            content: `promptfoo://blob/${blobHash}`,
            contentType: 'video',
          },
        ]}
      />,
    );
    expect(screen.getByTestId('video').querySelector('source')).toHaveAttribute(
      'src',
      `/api/blobs/${blobHash}`,
    );

    rerender(
      <ChatMessages
        messages={[
          {
            role: 'assistant',
            content: 'http://127.0.0.1/private-endpoint',
            contentType: 'video',
          },
        ]}
      />,
    );
    const externalSource = screen.getByTestId('video').querySelector('source');
    expect(externalSource?.getAttribute('src')).toBe(
      'data:video/mp4;base64,http://127.0.0.1/private-endpoint',
    );
    expect(externalSource?.getAttribute('src')).not.toMatch(/^https?:/);
  });

  it('remounts a failed blob image when the eval row refreshes', () => {
    const blobHash = 'b'.repeat(64);
    const messages: Message[] = [
      {
        role: 'user',
        content: 'Blob image',
        image: { blobRef: { uri: `promptfoo://blob/${blobHash}` } },
      },
    ];
    const initialRefresh = {};
    const { rerender } = render(
      <ChatMessages messages={messages} mediaRefreshToken={initialRefresh} />,
    );
    const firstImage = screen.getByAltText('Input');
    fireEvent.error(firstImage);

    rerender(<ChatMessages messages={messages} mediaRefreshToken={{}} />);

    const refreshedImage = screen.getByAltText('Input');
    expect(refreshedImage).not.toBe(firstImage);
    expect(refreshedImage).toHaveAttribute('src', `/api/blobs/${blobHash}`);
  });

  it('retries when a blob failure arrives after the eval row refresh', () => {
    vi.useFakeTimers();
    try {
      const blobHash = 'c'.repeat(64);
      const messages: Message[] = [
        {
          role: 'user',
          content: 'Late blob failure',
          image: { blobRef: { uri: `promptfoo://blob/${blobHash}` } },
        },
      ];
      const { rerender } = render(<ChatMessages messages={messages} mediaRefreshToken={{}} />);
      const image = screen.getByAltText('Input');

      rerender(<ChatMessages messages={messages} mediaRefreshToken={{}} />);
      fireEvent.error(image);
      act(() => {
        vi.advanceTimersByTime(250);
      });

      expect(image.getAttribute('src')).toContain('promptfoo_media_retry=');
    } finally {
      vi.useRealTimers();
    }
  });

  it('does not let a pending retry overwrite a newly rendered blob source', () => {
    vi.useFakeTimers();
    try {
      const firstHash = 'e'.repeat(64);
      const secondHash = 'f'.repeat(64);
      const createMessages = (hash: string): Message[] => [
        {
          role: 'user',
          content: 'Changing blob image',
          image: { blobRef: { uri: `promptfoo://blob/${hash}` } },
        },
      ];
      const { rerender } = render(
        <ChatMessages messages={createMessages(firstHash)} mediaRefreshToken={{}} />,
      );
      const firstImage = screen.getByAltText('Input');
      fireEvent.error(firstImage);

      rerender(<ChatMessages messages={createMessages(secondHash)} mediaRefreshToken={{}} />);
      const secondImage = screen.getByAltText('Input');
      expect(secondImage).not.toBe(firstImage);
      act(() => {
        vi.advanceTimersByTime(250);
      });

      expect(secondImage).toHaveAttribute('src', `/api/blobs/${secondHash}`);
      expect(secondImage.getAttribute('src')).not.toContain(firstHash);
    } finally {
      vi.useRealTimers();
    }
  });

  it('keeps successfully resolved media mounted when the eval row refreshes', () => {
    const messages: Message[] = [
      {
        role: 'user',
        content: 'Inline image',
        image: { data: FAKE_IMAGE_DATA_URL },
      },
    ];
    const { rerender } = render(<ChatMessages messages={messages} mediaRefreshToken={{}} />);
    const firstImage = screen.getByAltText('Input');

    rerender(<ChatMessages messages={messages} mediaRefreshToken={{}} />);

    expect(screen.getByAltText('Input')).toBe(firstImage);
  });
});
