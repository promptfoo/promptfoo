import React, { useState, memo } from 'react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Paper from '@mui/material/Paper';
import Typography from '@mui/material/Typography';
import { useTheme } from '@mui/material/styles';

interface Message {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

const ChatMessage = memo(({ message }: { message: Message | null }) => {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const isUser = message?.role === 'user';
  const isAssistant = message?.role === 'assistant';

  if (!message) {
    return null;
  }

  const backgroundColor = isUser
    ? 'linear-gradient(to bottom right, #FF8B96, #FF4B40)'
    : isDark
      ? 'linear-gradient(to bottom right, #3A3A3C, #2C2C2E)'
      : 'linear-gradient(to bottom right, #E9E9EB, #D1D1D6)';

  const textColor = isUser || isDark ? '#FFFFFF' : '#000000';
  const alignSelf = isUser ? 'flex-end' : 'flex-start';
  const borderRadius = isUser ? '20px 20px 5px 20px' : '20px 20px 20px 5px';

  return (
    <Box sx={{ display: 'flex', justifyContent: alignSelf, mb: 1 }}>
      <Paper
        elevation={1}
        sx={{
          p: 1.5,
          maxWidth: '70%',
          background: backgroundColor,
          borderRadius,
          alignSelf,
          boxShadow: isDark ? '0 2px 8px rgba(0, 0, 0, 0.3)' : '0 2px 8px rgba(0, 0, 0, 0.1)',
        }}
        role="alert"
      >
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
        <Typography
          variant="body1"
          sx={{
            whiteSpace: 'pre-wrap',
            color: textColor,
            textShadow: isUser ? '0 1px 2px rgba(0, 0, 0, 0.2)' : 'none',
            fontWeight: isUser ? 500 : 400,
          }}
        >
          {message.content}
        </Typography>
      </Paper>
    </Box>
  );
});

interface ChatMessagesProps {
  title?: string;
  messages: Message[];
}

export default function ChatMessages({ title, messages }: ChatMessagesProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';

  if (!messages || messages.length === 0) {
    return null;
  }

  const minHeight = 200;
  const maxHeight = isExpanded ? 'none' : minHeight;
  const hasMoreMessages = messages.length > 1;

  return (
    <>
      <Typography variant="subtitle1" sx={{ mb: 2, mt: 2 }}>
        {title || 'Messages'}
      </Typography>
      <Box
        mb={2}
        sx={{
          backgroundColor: (theme) =>
            theme.palette.mode === 'dark' ? 'rgba(0, 0, 0, 0.2)' : '#F8F9FA',
          p: 2,
          borderRadius: 2,
          position: 'relative',
          minHeight,
          maxHeight,
          overflow: 'hidden',
          transition: 'max-height 0.3s ease-in-out',
          '&::after':
            !isExpanded && hasMoreMessages
              ? {
                  content: '""',
                  position: 'absolute',
                  bottom: 0,
                  left: 0,
                  right: 0,
                  height: '50px',
                  background: `linear-gradient(to bottom, transparent, ${isDark ? 'rgba(0, 0, 0, 0.2)' : '#F8F9FA'})`,
                  pointerEvents: 'none',
                }
              : {},
        }}
      >
        <Box sx={{ height: '100%', overflowY: 'auto' }}>
          {messages.map((message, index) => (
            <ChatMessage key={index} message={message} />
          ))}
        </Box>
      </Box>
      {hasMoreMessages && (
        <Box sx={{ display: 'flex', justifyContent: 'center' }}>
          <Button
            variant="outlined"
            onClick={() => setIsExpanded(!isExpanded)}
            sx={{
              mt: -1,
              mb: 2,
              minWidth: '160px',
              color: theme.palette.text.secondary,
              '&:hover': {
                backgroundColor: isDark ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.05)',
              },
            }}
          >
            {isExpanded ? 'Show Less' : 'Expand Messages'}
          </Button>
        </Box>
      )}
    </>
  );
}

export type { Message };
