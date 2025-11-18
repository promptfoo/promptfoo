import { memo, useMemo } from 'react';

import Box from '@mui/material/Box';
import Paper from '@mui/material/Paper';
import { useTheme } from '@mui/material/styles';
import Typography from '@mui/material/Typography';
import Skeleton from '@mui/material/Skeleton';
import { red, grey } from '@mui/material/colors';

interface BaseMessage {
  role: 'user' | 'assistant' | 'system';
}

export interface LoadedMessage extends BaseMessage {
  content: string;
  contentType?: 'text' | 'image' | 'audio' | 'video';
  loading?: false;
}

export interface LoadingMessage extends BaseMessage {
  content: null;
  loading: true;
}

export type Message = LoadedMessage | LoadingMessage;

const ChatMessage = ({ message, index }: { message: Message, index: number }) => {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const isUser = message?.role === 'user';
  const isAssistant = message?.role === 'assistant';

  const textColor = isUser || isDark ? '#FFFFFF' : '#000000';
  const alignSelf = isUser ? 'flex-end' : 'flex-start';

  const bubbleProps = {
    p: 1.5,
    maxWidth: '70%',
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
        return (
          <Box>
            <audio controls style={{ width: '500px' }} data-testid="audio">
              <source src={`data:audio/wav;base64,${message?.content}`} type="audio/wav" />
              Your browser does not support the audio element.
            </audio>
          </Box>
        );
      }
      case 'image': {
        return (
          <Box
            role="img"
            data-testid="image"
            sx={{
              width: '100%',
              minWidth: '500px',
              minHeight: '300px',
              backgroundImage: `url(data:image/png;base64,${message.content})`,
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
        return (
          <Typography
            variant="body1"
            sx={{
              fontSize: '14px',
              whiteSpace: 'pre-wrap',
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
  }, [(message as LoadedMessage)?.contentType, message?.content]);

  return (
    <Box sx={{ display: 'flex', justifyContent: alignSelf, mb: 1, }}
    data-testid={`chat-message-${index}`}
    >
      {message.loading ? (
        <Skeleton
          variant="rectangular"
          width="100%" // Force max-width
          height={100}
          sx={bubbleProps}
        />
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
}

export default function ChatMessages({ messages }: ChatMessagesProps) {
  if (!messages || messages.length === 0) {
    return null;
  }

  return (
    <Box
      mb={2}
      sx={{
        backgroundColor: (theme) =>
          theme.palette.mode === 'dark' ? 'rgba(0, 0, 0, 0.2)' : '#F8F9FA',
        p: 2,
      }}
    >
      {messages.map((message, index) => (
        <ChatMessage key={index} message={message} index={index}/>
      ))}
    </Box>
  );
}
