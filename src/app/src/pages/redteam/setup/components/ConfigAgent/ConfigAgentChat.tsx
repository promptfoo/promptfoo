import React, { useCallback, useEffect, useRef, useState } from 'react';

import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import ErrorIcon from '@mui/icons-material/Error';
import InfoIcon from '@mui/icons-material/Info';
import SendIcon from '@mui/icons-material/Send';
import SmartToyIcon from '@mui/icons-material/SmartToy';
import VisibilityIcon from '@mui/icons-material/Visibility';
import VisibilityOffIcon from '@mui/icons-material/VisibilityOff';
import {
  alpha,
  Box,
  Button,
  Chip,
  CircularProgress,
  IconButton,
  InputAdornment,
  Paper,
  Stack,
  TextField,
  Typography,
  useTheme,
} from '@mui/material';
import type { Theme } from '@mui/material';

import type { AgentMessage, DiscoveredConfig } from '../../hooks/useConfigAgent';

interface ConfigAgentChatProps {
  messages: AgentMessage[];
  isLoading: boolean;
  onSendMessage: (message: string) => void;
  onSelectOption: (optionId: string) => void;
  onSubmitApiKey: (apiKey: string, field?: string) => void;
  onConfirm: (confirmed: boolean) => void;
}

/**
 * Chat interface for the configuration agent
 */
export default function ConfigAgentChat({
  messages,
  isLoading,
  onSendMessage,
  onSelectOption,
  onSubmitApiKey,
  onConfirm: _onConfirm,
}: ConfigAgentChatProps) {
  const theme = useTheme();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [inputValue, setInputValue] = useState('');
  const [apiKeyValue, setApiKeyValue] = useState('');
  const [showApiKey, setShowApiKey] = useState(false);

  // Get the current input request if any
  const lastMessage = messages[messages.length - 1];
  const inputRequest = lastMessage?.metadata?.inputRequest;
  const quickOptions = lastMessage?.metadata?.options;

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  const handleSendMessage = useCallback(() => {
    if (inputValue.trim()) {
      onSendMessage(inputValue.trim());
      setInputValue('');
    }
  }, [inputValue, onSendMessage]);

  const handleSubmitApiKey = useCallback(() => {
    if (apiKeyValue.trim()) {
      onSubmitApiKey(apiKeyValue.trim(), inputRequest?.field);
      setApiKeyValue('');
      setShowApiKey(false);
    }
  }, [apiKeyValue, inputRequest?.field, onSubmitApiKey]);

  const handleKeyPress = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        if (inputRequest?.type === 'api_key') {
          handleSubmitApiKey();
        } else {
          handleSendMessage();
        }
      }
    },
    [handleSendMessage, handleSubmitApiKey, inputRequest?.type],
  );

  const getMessageIcon = (type: AgentMessage['type']) => {
    switch (type) {
      case 'success':
        return <CheckCircleIcon sx={{ color: theme.palette.success.main }} />;
      case 'error':
        return <ErrorIcon sx={{ color: theme.palette.error.main }} />;
      case 'info':
      case 'question':
        return <InfoIcon sx={{ color: theme.palette.info.main }} />;
      case 'status':
      case 'discovery':
        return <SmartToyIcon sx={{ color: theme.palette.primary.main }} />;
      default:
        return null;
    }
  };

  const getMessageBackground = (type: AgentMessage['type']) => {
    switch (type) {
      case 'user':
        return alpha(theme.palette.primary.main, 0.1);
      case 'success':
        return alpha(theme.palette.success.main, 0.1);
      case 'error':
        return alpha(theme.palette.error.main, 0.1);
      default:
        return alpha(theme.palette.background.paper, 0.5);
    }
  };

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Messages */}
      <Box
        sx={{
          flex: 1,
          overflowY: 'auto',
          p: 2,
          display: 'flex',
          flexDirection: 'column',
          gap: 2,
        }}
      >
        {messages.map((message) => (
          <MessageBubble
            key={message.id}
            message={message}
            icon={getMessageIcon(message.type)}
            background={getMessageBackground(message.type)}
            theme={theme}
          />
        ))}

        {/* Loading indicator */}
        {isLoading && (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, p: 1 }}>
            <CircularProgress size={16} />
            <Typography variant="body2" color="text.secondary">
              Thinking...
            </Typography>
          </Box>
        )}

        <div ref={messagesEndRef} />
      </Box>

      {/* Quick options */}
      {quickOptions && quickOptions.length > 0 && (
        <Box sx={{ px: 2, pb: 1 }}>
          <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
            {quickOptions.map((option) => (
              <Chip
                key={option.id}
                label={option.label}
                onClick={() => onSelectOption(option.id)}
                color={option.primary ? 'primary' : 'default'}
                variant={option.primary ? 'filled' : 'outlined'}
                sx={{ mb: 1 }}
              />
            ))}
          </Stack>
        </Box>
      )}

      {/* Input area */}
      <Box sx={{ p: 2, borderTop: `1px solid ${theme.palette.divider}` }}>
        {inputRequest?.type === 'api_key' ? (
          <TextField
            fullWidth
            size="small"
            type={showApiKey ? 'text' : 'password'}
            placeholder={inputRequest.placeholder || 'Enter API key...'}
            value={apiKeyValue}
            onChange={(e) => setApiKeyValue(e.target.value)}
            onKeyPress={handleKeyPress}
            disabled={isLoading}
            InputProps={{
              endAdornment: (
                <InputAdornment position="end">
                  <IconButton size="small" onClick={() => setShowApiKey(!showApiKey)} edge="end">
                    {showApiKey ? <VisibilityOffIcon /> : <VisibilityIcon />}
                  </IconButton>
                  <IconButton
                    size="small"
                    onClick={handleSubmitApiKey}
                    disabled={!apiKeyValue.trim() || isLoading}
                    color="primary"
                  >
                    <SendIcon />
                  </IconButton>
                </InputAdornment>
              ),
            }}
          />
        ) : (
          <TextField
            fullWidth
            size="small"
            placeholder="Type a message..."
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyPress={handleKeyPress}
            disabled={isLoading}
            InputProps={{
              endAdornment: (
                <InputAdornment position="end">
                  <IconButton
                    size="small"
                    onClick={handleSendMessage}
                    disabled={!inputValue.trim() || isLoading}
                    color="primary"
                  >
                    <SendIcon />
                  </IconButton>
                </InputAdornment>
              ),
            }}
          />
        )}
      </Box>
    </Box>
  );
}

interface MessageBubbleProps {
  message: AgentMessage;
  icon: React.ReactNode;
  background: string;
  theme: Theme;
}

function MessageBubble({ message, icon, background, theme }: MessageBubbleProps) {
  const isUser = message.type === 'user';

  return (
    <Box
      sx={{
        display: 'flex',
        justifyContent: isUser ? 'flex-end' : 'flex-start',
      }}
    >
      <Paper
        elevation={0}
        sx={{
          p: 1.5,
          maxWidth: '85%',
          backgroundColor: background,
          borderRadius: 2,
          ...(isUser && {
            borderBottomRightRadius: 4,
          }),
          ...(!isUser && {
            borderBottomLeftRadius: 4,
          }),
        }}
      >
        {!isUser && icon && (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
            {icon}
            <Typography variant="caption" color="text.secondary" fontWeight={500}>
              {message.type === 'status' && message.metadata?.phase
                ? `${message.metadata.phase}`
                : 'Assistant'}
            </Typography>
          </Box>
        )}

        <Typography
          variant="body2"
          sx={{
            whiteSpace: 'pre-wrap',
            '& strong': { fontWeight: 600 },
            '& code': {
              backgroundColor: alpha(theme.palette.primary.main, 0.1),
              px: 0.5,
              borderRadius: 0.5,
              fontFamily: 'monospace',
              fontSize: '0.85em',
            },
          }}
          dangerouslySetInnerHTML={{
            __html: formatMarkdown(message.content),
          }}
        />

        {/* Show discovered config preview */}
        {message.metadata?.discoveredConfig && (
          <ConfigPreview config={message.metadata.discoveredConfig} theme={theme} />
        )}
      </Paper>
    </Box>
  );
}

interface ConfigPreviewProps {
  config: DiscoveredConfig;
  theme: Theme;
}

function ConfigPreview({ config, theme }: ConfigPreviewProps) {
  const [expanded, setExpanded] = useState(false);

  return (
    <Box sx={{ mt: 1.5 }}>
      <Button
        size="small"
        variant="outlined"
        onClick={() => setExpanded(!expanded)}
        sx={{ mb: expanded ? 1 : 0 }}
      >
        {expanded ? 'Hide' : 'Show'} Configuration
      </Button>

      {expanded && (
        <Paper
          variant="outlined"
          sx={{
            p: 1.5,
            backgroundColor: alpha(theme.palette.background.default, 0.5),
            fontFamily: 'monospace',
            fontSize: '0.75rem',
            overflow: 'auto',
            maxHeight: 200,
          }}
        >
          <pre style={{ margin: 0 }}>{JSON.stringify(config, null, 2)}</pre>
        </Paper>
      )}
    </Box>
  );
}

/**
 * Simple markdown formatting (bold, code, newlines)
 */
function formatMarkdown(text: string): string {
  if (!text) {
    return '';
  }

  return text
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/`(.+?)`/g, '<code>$1</code>')
    .replace(/\n/g, '<br />');
}
