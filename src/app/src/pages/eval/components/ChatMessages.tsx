import { useMemo } from 'react';

import { cn } from '@app/lib/utils';
import { resolveAudioSource, resolveImageSource } from '@app/utils/media';
import invariant from 'tiny-invariant';

interface BaseMessage {
  role: 'user' | 'assistant' | 'system';
}

export interface LoadedMessage extends BaseMessage {
  content: string;
  contentType?: 'text' | 'image' | 'audio' | 'video';
  audio?: { data?: string; format?: string; blobRef?: { uri: string } };
  image?: { data?: string; format?: string; blobRef?: { uri: string } };
  loading?: false;
}

export interface LoadingMessage extends BaseMessage {
  content: null;
  loading: true;
}

export type Message = LoadedMessage | LoadingMessage;

const ChatMessage = ({ message, index }: { message: Message; index: number }) => {
  const isUser = message?.role === 'user';
  const isAssistant = message?.role === 'assistant';

  const bubbleClasses = cn(
    'p-3 max-w-[70%] overflow-hidden shadow-sm',
    isUser
      ? 'bg-red-500 rounded-[20px_20px_5px_20px] self-end shadow-[0_2px_8px_rgba(0,0,0,0.1)] dark:shadow-[0_2px_8px_rgba(0,0,0,0.3)]'
      : 'bg-gray-200 dark:bg-gray-800 rounded-[20px_20px_20px_5px] self-start shadow-[0_2px_8px_rgba(0,0,0,0.1)] dark:shadow-[0_2px_8px_rgba(0,0,0,0.3)]',
  );

  const textClasses = cn(
    'text-sm whitespace-pre-wrap break-words',
    isUser ? 'text-white font-medium [text-shadow:0_1px_2px_rgba(0,0,0,0.2)]' : 'dark:text-white',
  );

  /**
   * Renders the content of the message based on the contentType.
   */
  // biome-ignore lint/correctness/useExhaustiveDependencies: intentional
  const content = useMemo(() => {
    if (message.loading || !message.content) {
      return null;
    }

    const loadedMessage = message as LoadedMessage;
    const contentType = loadedMessage?.contentType ?? 'text';

    switch (contentType) {
      case 'audio': {
        const audioSource = resolveAudioSource(loadedMessage.audio, loadedMessage.content);
        if (!audioSource) {
          return null;
        }

        return (
          <div>
            <audio controls style={{ width: '500px' }} data-testid="audio">
              <source src={audioSource.src} type={audioSource.type || 'audio/mpeg'} />
              Your browser does not support the audio element.
            </audio>
          </div>
        );
      }
      case 'image': {
        const imageSrc = resolveImageSource(loadedMessage.image || loadedMessage.content);
        if (!imageSrc) {
          return null;
        }

        return (
          <div
            role="img"
            data-testid="image"
            className="w-full min-w-[500px] min-h-[300px] bg-contain bg-no-repeat bg-left"
            style={{ backgroundImage: `url(${imageSrc})` }}
          />
        );
      }
      case 'video': {
        return (
          <div className="w-[500px] flex justify-center">
            <video controls style={{ maxHeight: '200px' }} data-testid="video">
              <source
                src={
                  loadedMessage?.content.startsWith('data:')
                    ? loadedMessage?.content
                    : `data:video/mp4;base64,${loadedMessage?.content}`
                }
                type="video/mp4"
              />
              Your browser does not support the video element.
            </video>
          </div>
        );
      }
      case 'text': {
        const audioSource = resolveAudioSource(loadedMessage.audio);
        const imageSrc = resolveImageSource(loadedMessage.image);
        const hasAudio = Boolean(audioSource);
        const hasImage = Boolean(imageSrc);

        // If we have audio or image data, render them alongside the transcript
        if (hasAudio || hasImage) {
          return (
            <div>
              {hasAudio && (
                <div className="mb-2">
                  <audio
                    controls
                    style={{ width: '100%', maxWidth: '400px', height: '36px' }}
                    data-testid="audio-with-transcript"
                  >
                    <source src={audioSource?.src} type={audioSource?.type || 'audio/mpeg'} />
                    Your browser does not support the audio element.
                  </audio>
                </div>
              )}
              {hasImage && (
                <div className="mb-2">
                  <img src={imageSrc} alt="Input" className="max-w-full max-h-[300px] rounded-lg" />
                </div>
              )}
              <p className={textClasses}>{loadedMessage.content}</p>
            </div>
          );
        }

        // Plain text without media
        return <p className={textClasses}>{loadedMessage.content}</p>;
      }
    }
  }, [
    (message as LoadedMessage)?.contentType,
    message?.content,
    (message as LoadedMessage)?.audio,
    (message as LoadedMessage)?.image,
    textClasses,
  ]);

  return (
    <div
      className={cn('flex', isUser ? 'justify-end' : 'justify-start')}
      data-testid={`chat-message-${index}`}
    >
      {message.loading ? (
        <div
          className={cn(bubbleClasses, 'flex items-center justify-center py-3 px-5 max-w-none')}
          data-testid="loading-indicator"
        >
          <div className="flex gap-1.5">
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                className="size-1.5 bg-white rounded-full animate-bounce"
                style={{ animationDelay: `${i * 0.16}s` }}
              />
            ))}
          </div>
        </div>
      ) : (
        <div className={bubbleClasses} role="alert">
          <div className="flex items-center mb-2">
            {isUser && (
              <span role="img" aria-label="attacker" className="mr-2">
                ⚔️
              </span>
            )}
            {isAssistant && (
              <span role="img" aria-label="target" className="mr-2">
                🎯
              </span>
            )}
          </div>
          {content}
        </div>
      )}
    </div>
  );
};

interface ChatMessagesProps {
  messages: Message[];
  displayTurnCount?: boolean;
  maxTurns?: number;
}

export default function ChatMessages({
  messages,
  displayTurnCount = false,
  maxTurns = 1,
}: ChatMessagesProps) {
  if (!messages || messages.length === 0) {
    return null;
  }

  invariant(
    !displayTurnCount || maxTurns !== undefined,
    'maxTurns must be defined when displayTurnCount is true',
  );

  return (
    <div className="flex flex-col gap-4 p-4 bg-[#F8F9FA] dark:bg-black/20">
      {messages.map((message, index) => {
        const msg = <ChatMessage key={index} message={message} index={index} />;
        const shouldDisplayTurnCount = displayTurnCount && index % 2 === 0;

        return shouldDisplayTurnCount ? (
          <div key={index}>
            <div className="flex items-center w-full text-center my-4 text-xs font-semibold text-gray-400 dark:text-gray-800">
              <div className="flex-1 border-b border-border mr-4" />
              {index / 2 + 1}/{maxTurns}
              <div className="flex-1 border-b border-border ml-4" />
            </div>
            {msg}
          </div>
        ) : (
          msg
        );
      })}
    </div>
  );
}
