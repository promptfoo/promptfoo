import { memo } from 'react';

import Box from '@mui/material/Box';
import Paper from '@mui/material/Paper';
import { useTheme } from '@mui/material/styles';
import Typography from '@mui/material/Typography';

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
        <ChatMessage key={index} message={message} />
      ))}
    </Box>
  );
}

export type { Message };
