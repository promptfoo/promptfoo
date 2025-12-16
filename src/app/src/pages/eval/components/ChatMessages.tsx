import { useMemo } from 'react';

import invariant from 'tiny-invariant';

import { resolveAudioSource, resolveImageSource } from '@app/utils/media';

import Box from '@mui/material/Box';
import { grey, red } from '@mui/material/colors';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import { keyframes, useTheme } from '@mui/material/styles';
import Typography from '@mui/material/Typography';

const bounce = keyframes`
  0%, 100% {
    transform: translateY(0);
  }
  50% {
    transform: translateY(-4px);
  }
`;

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
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const isUser = message?.role === 'user';
  const isAssistant = message?.role === 'assistant';

  const textColor = isUser || isDark ? '#FFFFFF' : '#000000';
  const alignSelf = isUser ? 'flex-end' : 'flex-start';

  const bubbleProps = {
    p: 1.5,
    maxWidth: '70%',
    overflow: 'hidden',
    background: isUser ? red[500] : isDark ? grey[800] : grey[200],
    borderRadius: isUser ? '20px 20px 5px 20px' : '20px 20px 20px 5px',
    alignSelf,
    boxShadow: isDark ? '0 2px 8px rgba(0, 0, 0, 0.3)' : '0 2px 8px rgba(0, 0, 0, 0.1)',
  };

  /**
   * Renders the content of the message based on the contentType.
   */
  const content = useMemo(() => {
    if (message.loading || !message.content) {
      return null;
    }

    message = message as LoadedMessage;

    const contentType = message?.contentType ?? 'text';

    switch (contentType) {
      case 'audio': {
        const audioSource = resolveAudioSource(message.audio, message.content);
        if (!audioSource) {
          return null;
        }

        return (
          <Box>
            <audio controls style={{ width: '500px' }} data-testid="audio">
              <source src={audioSource.src} type={audioSource.type || 'audio/mpeg'} />
              Your browser does not support the audio element.
            </audio>
          </Box>
        );
      }
      case 'image': {
        const imageSrc = resolveImageSource(message.image || message.content);
        if (!imageSrc) {
          return null;
        }

        return (
          <Box
            role="img"
            data-testid="image"
            sx={{
              width: '100%',
              minWidth: '500px',
              minHeight: '300px',
              backgroundImage: `url(${imageSrc})`,
              backgroundSize: 'contain',
              backgroundRepeat: 'no-repeat',
              backgroundPosition: 'start',
            }}
          />
        );
      }
      case 'video': {
        return (
          <Box sx={{ width: '500px', display: 'flex', justifyContent: 'center' }}>
            <video controls style={{ maxHeight: '200px' }} data-testid="video">
              <source
                src={
                  message?.content.startsWith('data:')
                    ? message?.content
                    : `data:video/mp4;base64,${message?.content}`
                }
                type="video/mp4"
              />
              Your browser does not support the video element.
            </video>
          </Box>
        );
      }
      case 'text': {
        const audioSource = resolveAudioSource(message.audio);
        const imageSrc = resolveImageSource(message.image);
        const hasAudio = Boolean(audioSource);
        const hasImage = Boolean(imageSrc);

        // If we have audio or image data, render them alongside the transcript
        if (hasAudio || hasImage) {
          return (
            <Box>
              {hasAudio && (
                <Box sx={{ mb: 1 }}>
                  <audio
                    controls
                    style={{ width: '100%', maxWidth: '400px', height: '36px' }}
                    data-testid="audio-with-transcript"
                  >
                    <source src={audioSource?.src} type={audioSource?.type || 'audio/mpeg'} />
                    Your browser does not support the audio element.
                  </audio>
                </Box>
              )}
              {hasImage && (
                <Box sx={{ mb: 1 }}>
                  <img
                    src={imageSrc}
                    alt="Input"
                    style={{
                      maxWidth: '100%',
                      maxHeight: '300px',
                      borderRadius: '8px',
                    }}
                  />
                </Box>
              )}
              <Typography
                variant="body1"
                sx={{
                  fontSize: '14px',
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word',
                  overflowWrap: 'anywhere',
                  color: textColor,
                  textShadow: isUser ? '0 1px 2px rgba(0, 0, 0, 0.2)' : 'none',
                  fontWeight: isUser ? 500 : 400,
                }}
              >
                {message.content}
              </Typography>
            </Box>
          );
        }

        // Plain text without media
        return (
          <Typography
            variant="body1"
            sx={{
              fontSize: '14px',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
              overflowWrap: 'anywhere',
              color: textColor,
              textShadow: isUser ? '0 1px 2px rgba(0, 0, 0, 0.2)' : 'none',
              fontWeight: isUser ? 500 : 400,
            }}
          >
            {message.content}
          </Typography>
        );
      }
    }
  }, [
    (message as LoadedMessage)?.contentType,
    message?.content,
    (message as LoadedMessage)?.audio,
    (message as LoadedMessage)?.image,
  ]);

  return (
    <Box sx={{ display: 'flex', justifyContent: alignSelf }} data-testid={`chat-message-${index}`}>
      {message.loading ? (
        <Paper
          elevation={1}
          sx={{
            ...bubbleProps,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            py: 1.5,
            px: 2.5,
            maxWidth: 'none',
          }}
          data-testid="loading-indicator"
        >
          <Box sx={{ display: 'flex', gap: 0.75 }}>
            {[0, 1, 2].map((i) => (
              <Box
                key={i}
                sx={{
                  width: 6,
                  height: 6,
                  bgcolor: 'white',
                  borderRadius: '50%',
                  animation: `${bounce} 1.4s infinite ease-in-out both`,
                  animationDelay: `${i * 0.16}s`,
                }}
              />
            ))}
          </Box>
        </Paper>
      ) : (
        <Paper elevation={1} sx={bubbleProps} role="alert">
          <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
            {isUser && (
              <span role="img" aria-label="attacker" style={{ marginRight: '8px' }}>
                ⚔️
              </span>
            )}
            {isAssistant && (
              <span role="img" aria-label="target" style={{ marginRight: '8px' }}>
                🎯
              </span>
            )}
          </Box>
          {content}
        </Paper>
      )}
    </Box>
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

  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';

  return (
    <Stack
      sx={{
        backgroundColor: (theme) =>
          theme.palette.mode === 'dark' ? 'rgba(0, 0, 0, 0.2)' : '#F8F9FA',
        p: 2,
      }}
      direction="column"
      gap={2}
    >
      {messages.map((message, index) => {
        const msg = <ChatMessage key={index} message={message} index={index} />;
        const shouldDisplayTurnCount = displayTurnCount && index % 2 === 0;

        return shouldDisplayTurnCount ? (
          <>
            <Typography
              sx={{
                color: isDark ? grey[800] : grey[400],
                width: '100%',
                textAlign: 'center',
                my: 2,
                fontWeight: 600,
                fontSize: '12px',
                display: 'flex',
                alignItems: 'center',
                '&::before': {
                  content: '""',
                  flex: 1,
                  borderBottom: '1px solid',
                  borderColor: 'divider',
                  marginRight: 2,
                },
                '&::after': {
                  content: '""',
                  flex: 1,
                  borderBottom: '1px solid',
                  borderColor: 'divider',
                  marginLeft: 2,
                },
              }}
            >
              {index / 2 + 1}/{maxTurns}
            </Typography>
            {msg}
          </>
        ) : (
          msg
        );
      })}
    </Stack>
  );
}
