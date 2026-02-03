import React, { useCallback, useEffect, useRef, useState } from 'react';

import CheckIcon from '@mui/icons-material/Check';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import KeyIcon from '@mui/icons-material/Key';
import SendIcon from '@mui/icons-material/Send';
import VisibilityIcon from '@mui/icons-material/Visibility';
import VisibilityOffIcon from '@mui/icons-material/VisibilityOff';
import {
  alpha,
  Box,
  Button,
  IconButton,
  InputAdornment,
  keyframes,
  Paper,
  TextField,
  Tooltip,
  Typography,
  useTheme,
} from '@mui/material';
import type { Theme } from '@mui/material';

import type { AgentMessage, DiscoveredConfig } from '../../hooks/useConfigAgent';

// Animation keyframes
const fadeSlideIn = keyframes`
  from {
    opacity: 0;
    transform: translateY(8px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
`;

const pulse = keyframes`
  0%, 80%, 100% {
    opacity: 0.3;
    transform: scale(0.8);
  }
  40% {
    opacity: 1;
    transform: scale(1);
  }
`;

interface ConfigAgentChatProps {
  messages: AgentMessage[];
  isLoading: boolean;
  onSendMessage: (message: string) => void;
  onSelectOption: (optionId: string) => void;
  onSubmitApiKey: (apiKey: string, field?: string) => void;
}

/**
 * Chat interface for the configuration agent
 * Design: Technical assistant aesthetic with clear visual hierarchy
 */
export default function ConfigAgentChat({
  messages,
  isLoading,
  onSendMessage,
  onSelectOption,
  onSubmitApiKey,
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
  // biome-ignore lint/correctness/useExhaustiveDependencies: intentional trigger on message count change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

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

  const handleKeyDown = useCallback(
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

  const isApiKeyMode = inputRequest?.type === 'api_key';

  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        backgroundColor: alpha(theme.palette.background.default, 0.5),
      }}
    >
      {/* Messages Area */}
      <Box
        sx={{
          flex: 1,
          overflowY: 'auto',
          p: 2,
          display: 'flex',
          flexDirection: 'column',
          gap: 1.5,
        }}
      >
        {messages.map((message, index) => (
          <MessageBubble key={message.id} message={message} theme={theme} index={index} />
        ))}

        {/* Typing Indicator */}
        {isLoading && <TypingIndicator theme={theme} />}

        <div ref={messagesEndRef} />
      </Box>

      {/* Quick Options */}
      {quickOptions && quickOptions.length > 0 && (
        <Box
          sx={{
            px: 2,
            pb: 1.5,
            display: 'flex',
            flexWrap: 'wrap',
            gap: 1,
          }}
        >
          {quickOptions.map((option, index) => (
            <Button
              key={option.id}
              size="small"
              variant={option.primary ? 'contained' : 'outlined'}
              onClick={() => onSelectOption(option.id)}
              sx={{
                borderRadius: '20px',
                textTransform: 'none',
                fontWeight: 500,
                fontSize: '0.8125rem',
                px: 2,
                py: 0.75,
                animation: `${fadeSlideIn} 0.3s ease-out`,
                animationDelay: `${index * 0.05}s`,
                animationFillMode: 'backwards',
                ...(option.primary
                  ? {
                      background: `linear-gradient(135deg, ${theme.palette.primary.main} 0%, ${theme.palette.primary.dark} 100%)`,
                      boxShadow: `0 2px 8px ${alpha(theme.palette.primary.main, 0.3)}`,
                      '&:hover': {
                        boxShadow: `0 4px 12px ${alpha(theme.palette.primary.main, 0.4)}`,
                      },
                    }
                  : {
                      borderColor: alpha(theme.palette.divider, 0.8),
                      '&:hover': {
                        borderColor: theme.palette.primary.main,
                        backgroundColor: alpha(theme.palette.primary.main, 0.04),
                      },
                    }),
              }}
            >
              {option.label}
            </Button>
          ))}
        </Box>
      )}

      {/* Input Area */}
      <Box
        sx={{
          p: 2,
          borderTop: `1px solid ${theme.palette.divider}`,
          backgroundColor: theme.palette.background.paper,
          ...(isApiKeyMode && {
            backgroundColor: alpha(theme.palette.warning.main, 0.04),
            borderTop: `1px solid ${alpha(theme.palette.warning.main, 0.2)}`,
          }),
        }}
      >
        {/* API Key Mode Label */}
        {isApiKeyMode && (
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: 0.75,
              mb: 1,
              color: theme.palette.warning.dark,
            }}
          >
            <KeyIcon sx={{ fontSize: 14 }} />
            <Typography variant="caption" fontWeight={600}>
              Secure Input Mode
            </Typography>
          </Box>
        )}

        <TextField
          fullWidth
          size="small"
          type={isApiKeyMode && !showApiKey ? 'password' : 'text'}
          placeholder={
            isApiKeyMode
              ? inputRequest.placeholder || 'Enter API key...'
              : 'Type a message... (Enter to send)'
          }
          value={isApiKeyMode ? apiKeyValue : inputValue}
          onChange={(e) =>
            isApiKeyMode ? setApiKeyValue(e.target.value) : setInputValue(e.target.value)
          }
          onKeyDown={handleKeyDown}
          disabled={isLoading}
          autoComplete="off"
          sx={{
            '& .MuiOutlinedInput-root': {
              borderRadius: '24px',
              backgroundColor: theme.palette.background.default,
              transition: 'all 0.2s ease',
              '&:hover': {
                backgroundColor: alpha(theme.palette.background.default, 0.8),
              },
              '&.Mui-focused': {
                backgroundColor: theme.palette.background.paper,
                boxShadow: `0 0 0 2px ${alpha(theme.palette.primary.main, 0.2)}`,
              },
              ...(isApiKeyMode && {
                backgroundColor: alpha(theme.palette.warning.main, 0.08),
                '&.Mui-focused': {
                  boxShadow: `0 0 0 2px ${alpha(theme.palette.warning.main, 0.2)}`,
                },
              }),
            },
            '& .MuiOutlinedInput-notchedOutline': {
              borderColor: 'transparent',
            },
            '& .MuiOutlinedInput-root:hover .MuiOutlinedInput-notchedOutline': {
              borderColor: 'transparent',
            },
            '& .MuiOutlinedInput-root.Mui-focused .MuiOutlinedInput-notchedOutline': {
              borderColor: 'transparent',
            },
          }}
          InputProps={{
            endAdornment: (
              <InputAdornment position="end" sx={{ gap: 0.5 }}>
                {isApiKeyMode && (
                  <Tooltip title={showApiKey ? 'Hide' : 'Show'}>
                    <IconButton
                      size="small"
                      onClick={() => setShowApiKey(!showApiKey)}
                      edge="end"
                      sx={{ color: theme.palette.text.secondary }}
                    >
                      {showApiKey ? (
                        <VisibilityOffIcon fontSize="small" />
                      ) : (
                        <VisibilityIcon fontSize="small" />
                      )}
                    </IconButton>
                  </Tooltip>
                )}
                <Tooltip title="Send (Enter)">
                  <span>
                    <IconButton
                      size="small"
                      onClick={isApiKeyMode ? handleSubmitApiKey : handleSendMessage}
                      disabled={
                        isLoading || (isApiKeyMode ? !apiKeyValue.trim() : !inputValue.trim())
                      }
                      sx={{
                        backgroundColor: theme.palette.primary.main,
                        color: theme.palette.primary.contrastText,
                        width: 32,
                        height: 32,
                        '&:hover': {
                          backgroundColor: theme.palette.primary.dark,
                        },
                        '&.Mui-disabled': {
                          backgroundColor: alpha(theme.palette.action.disabled, 0.12),
                          color: theme.palette.action.disabled,
                        },
                      }}
                    >
                      <SendIcon sx={{ fontSize: 16 }} />
                    </IconButton>
                  </span>
                </Tooltip>
              </InputAdornment>
            ),
          }}
        />
      </Box>
    </Box>
  );
}

/**
 * Typing indicator with animated dots
 */
function TypingIndicator({ theme }: { theme: Theme }) {
  return (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 1,
        pl: 1,
        animation: `${fadeSlideIn} 0.3s ease-out`,
      }}
    >
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 0.5,
          px: 1.5,
          py: 1,
          borderRadius: '16px',
          backgroundColor: alpha(theme.palette.primary.main, 0.08),
        }}
      >
        {[0, 1, 2].map((i) => (
          <Box
            key={i}
            sx={{
              width: 6,
              height: 6,
              borderRadius: '50%',
              backgroundColor: theme.palette.primary.main,
              animation: `${pulse} 1.4s infinite ease-in-out`,
              animationDelay: `${i * 0.16}s`,
            }}
          />
        ))}
      </Box>
      <Typography
        variant="caption"
        sx={{
          color: theme.palette.text.secondary,
          fontFamily: 'monospace',
          fontSize: '0.7rem',
          letterSpacing: '0.05em',
        }}
      >
        analyzing...
      </Typography>
    </Box>
  );
}

interface MessageBubbleProps {
  message: AgentMessage;
  theme: Theme;
  index: number;
}

function MessageBubble({ message, theme, index }: MessageBubbleProps) {
  const isUser = message.type === 'user';
  const isStatus = message.type === 'status';
  const isDiscovery = message.type === 'discovery';
  const isSuccess = message.type === 'success';
  const isError = message.type === 'error';

  // Status messages are compact single-line
  if (isStatus) {
    return (
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 1,
          py: 0.5,
          animation: `${fadeSlideIn} 0.3s ease-out`,
        }}
      >
        <Box
          sx={{
            width: 4,
            height: 4,
            borderRadius: '50%',
            backgroundColor: theme.palette.primary.main,
            animation: `${pulse} 2s infinite`,
          }}
        />
        <Typography
          variant="caption"
          sx={{
            color: theme.palette.text.secondary,
            fontFamily: '"JetBrains Mono", "Fira Code", monospace',
            fontSize: '0.75rem',
            letterSpacing: '0.02em',
          }}
        >
          {message.content}
        </Typography>
      </Box>
    );
  }

  // Get accent color for message type
  const getAccentColor = () => {
    if (isSuccess) {
      return theme.palette.success.main;
    }
    if (isError) {
      return theme.palette.error.main;
    }
    if (isDiscovery) {
      return theme.palette.info.main;
    }
    if (isUser) {
      return theme.palette.primary.main;
    }
    return 'transparent';
  };

  const getBackgroundColor = () => {
    if (isUser) {
      return alpha(theme.palette.primary.main, 0.08);
    }
    if (isSuccess) {
      return alpha(theme.palette.success.main, 0.06);
    }
    if (isError) {
      return alpha(theme.palette.error.main, 0.06);
    }
    if (isDiscovery) {
      return alpha(theme.palette.info.main, 0.06);
    }
    return alpha(theme.palette.background.paper, 0.8);
  };

  return (
    <Box
      sx={{
        display: 'flex',
        justifyContent: isUser ? 'flex-end' : 'flex-start',
        animation: `${fadeSlideIn} 0.3s ease-out`,
        animationDelay: `${Math.min(index * 0.05, 0.2)}s`,
        animationFillMode: 'backwards',
      }}
    >
      <Paper
        elevation={0}
        sx={{
          position: 'relative',
          p: 1.5,
          maxWidth: '88%',
          backgroundColor: getBackgroundColor(),
          borderRadius: '12px',
          border: `1px solid ${alpha(getAccentColor(), 0.2)}`,
          borderLeft: isUser ? undefined : `3px solid ${getAccentColor()}`,
          borderRight: isUser ? `3px solid ${getAccentColor()}` : undefined,
          ...(isDiscovery && {
            background: `linear-gradient(135deg, ${alpha(theme.palette.info.main, 0.08)} 0%, ${alpha(theme.palette.info.main, 0.02)} 100%)`,
          }),
          ...(isSuccess && {
            background: `linear-gradient(135deg, ${alpha(theme.palette.success.main, 0.1)} 0%, ${alpha(theme.palette.success.main, 0.04)} 100%)`,
          }),
        }}
      >
        {/* Message Label */}
        {!isUser && (isDiscovery || isSuccess || isError) && (
          <Typography
            variant="caption"
            sx={{
              display: 'block',
              mb: 0.5,
              fontWeight: 600,
              fontSize: '0.65rem',
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
              color: getAccentColor(),
            }}
          >
            {isDiscovery && '✓ Discovery'}
            {isSuccess && '✓ Success'}
            {isError && '✕ Error'}
          </Typography>
        )}

        {/* Message Content */}
        <Typography
          variant="body2"
          component="div"
          sx={{
            fontSize: '0.875rem',
            lineHeight: 1.5,
            color: isUser ? theme.palette.text.primary : theme.palette.text.primary,
            whiteSpace: 'pre-wrap',
            '& strong': {
              fontWeight: 600,
              color: theme.palette.text.primary,
            },
          }}
        >
          {renderFormattedText(message.content, theme)}
        </Typography>

        {/* Config Preview */}
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
  const [expanded, setExpanded] = useState(true);
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(JSON.stringify(config, null, 2));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Ignore clipboard errors
    }
  }, [config]);

  const configJson = JSON.stringify(config, null, 2);

  return (
    <Box sx={{ mt: 2 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
        <Button
          size="small"
          onClick={() => setExpanded(!expanded)}
          sx={{
            textTransform: 'none',
            fontWeight: 500,
            fontSize: '0.75rem',
            color: theme.palette.text.secondary,
            p: 0,
            minWidth: 'auto',
            '&:hover': {
              backgroundColor: 'transparent',
              color: theme.palette.primary.main,
            },
          }}
        >
          {expanded ? '▼' : '▶'} Configuration
        </Button>

        {expanded && (
          <Tooltip title={copied ? 'Copied!' : 'Copy JSON'}>
            <IconButton size="small" onClick={handleCopy} sx={{ p: 0.5 }}>
              {copied ? (
                <CheckIcon sx={{ fontSize: 14, color: theme.palette.success.main }} />
              ) : (
                <ContentCopyIcon sx={{ fontSize: 14, color: theme.palette.text.secondary }} />
              )}
            </IconButton>
          </Tooltip>
        )}
      </Box>

      {expanded && (
        <Box
          sx={{
            position: 'relative',
            borderRadius: '8px',
            overflow: 'hidden',
            border: `1px solid ${alpha(theme.palette.divider, 0.5)}`,
          }}
        >
          {/* Header bar */}
          <Box
            sx={{
              px: 1.5,
              py: 0.75,
              backgroundColor: alpha(theme.palette.background.default, 0.8),
              borderBottom: `1px solid ${alpha(theme.palette.divider, 0.5)}`,
              display: 'flex',
              alignItems: 'center',
              gap: 1,
            }}
          >
            <Box
              sx={{
                display: 'flex',
                gap: 0.5,
              }}
            >
              {['#ff5f56', '#ffbd2e', '#27ca40'].map((color) => (
                <Box
                  key={color}
                  sx={{
                    width: 8,
                    height: 8,
                    borderRadius: '50%',
                    backgroundColor: color,
                    opacity: 0.8,
                  }}
                />
              ))}
            </Box>
            <Typography
              variant="caption"
              sx={{
                fontFamily: '"JetBrains Mono", monospace',
                fontSize: '0.65rem',
                color: theme.palette.text.secondary,
                letterSpacing: '0.02em',
              }}
            >
              config.json
            </Typography>
          </Box>

          {/* Code content */}
          <Box
            component="pre"
            sx={{
              m: 0,
              p: 1.5,
              backgroundColor:
                theme.palette.mode === 'dark'
                  ? alpha('#0d1117', 0.8)
                  : alpha(theme.palette.grey[50], 0.8),
              fontFamily: '"JetBrains Mono", "Fira Code", "Consolas", monospace',
              fontSize: '0.7rem',
              lineHeight: 1.6,
              overflow: 'auto',
              maxHeight: 240,
              color: theme.palette.mode === 'dark' ? '#e6edf3' : theme.palette.text.primary,
              '&::-webkit-scrollbar': {
                width: 6,
                height: 6,
              },
              '&::-webkit-scrollbar-thumb': {
                backgroundColor: alpha(theme.palette.text.primary, 0.2),
                borderRadius: 3,
              },
            }}
          >
            <SyntaxHighlightedJson json={configJson} theme={theme} />
          </Box>
        </Box>
      )}
    </Box>
  );
}

/**
 * Simple JSON syntax highlighting
 */
function SyntaxHighlightedJson({ json, theme }: { json: string; theme: Theme }) {
  const isDark = theme.palette.mode === 'dark';

  const colors = {
    key: isDark ? '#79c0ff' : '#0550ae',
    string: isDark ? '#a5d6ff' : '#0a3069',
    number: isDark ? '#a5d6ff' : '#0550ae',
    boolean: isDark ? '#ff7b72' : '#cf222e',
    null: isDark ? '#ff7b72' : '#cf222e',
    punctuation: isDark ? '#8b949e' : '#57606a',
  };

  // Simple regex-based highlighting
  const highlighted = json
    .replace(/"([^"]+)":/g, `<span style="color: ${colors.key}">"$1"</span>:`)
    .replace(/: "([^"]*)"([,\n])/g, `: <span style="color: ${colors.string}">"$1"</span>$2`)
    .replace(/: (\d+)([,\n])/g, `: <span style="color: ${colors.number}">$1</span>$2`)
    .replace(/: (true|false)([,\n])/g, `: <span style="color: ${colors.boolean}">$1</span>$2`)
    .replace(/: (null)([,\n])/g, `: <span style="color: ${colors.null}">$1</span>$2`);

  return <code dangerouslySetInnerHTML={{ __html: highlighted }} />;
}

/**
 * Safely render formatted text without dangerouslySetInnerHTML
 * Supports: **bold**, `code`, and newlines
 */
function renderFormattedText(text: string, theme: Theme): React.ReactNode {
  if (!text) {
    return null;
  }

  const lines = text.split('\n');

  return lines.map((line, lineIndex) => {
    const parts: React.ReactNode[] = [];
    let remaining = line;
    let keyIndex = 0;

    while (remaining.length > 0) {
      const boldMatch = remaining.match(/\*\*(.+?)\*\*/);
      const codeMatch = remaining.match(/`(.+?)`/);

      const boldIndex = boldMatch ? remaining.indexOf(boldMatch[0]) : -1;
      const codeIndex = codeMatch ? remaining.indexOf(codeMatch[0]) : -1;

      if (boldIndex === -1 && codeIndex === -1) {
        if (remaining) {
          parts.push(remaining);
        }
        break;
      }

      const usesBold = boldIndex !== -1 && (codeIndex === -1 || boldIndex < codeIndex);
      const matchIndex = usesBold ? boldIndex : codeIndex;
      const match = usesBold ? boldMatch! : codeMatch!;

      if (matchIndex > 0) {
        parts.push(remaining.slice(0, matchIndex));
      }

      if (usesBold) {
        parts.push(<strong key={`b-${lineIndex}-${keyIndex++}`}>{match[1]}</strong>);
      } else {
        parts.push(
          <code
            key={`c-${lineIndex}-${keyIndex++}`}
            style={{
              backgroundColor: alpha(theme.palette.primary.main, 0.1),
              padding: '2px 6px',
              borderRadius: 4,
              fontFamily: '"JetBrains Mono", "Fira Code", monospace',
              fontSize: '0.8em',
              fontWeight: 500,
            }}
          >
            {match[1]}
          </code>,
        );
      }

      remaining = remaining.slice(matchIndex + match[0].length);
    }

    if (lineIndex < lines.length - 1) {
      parts.push(<br key={`br-${lineIndex}`} />);
    }

    return <React.Fragment key={`line-${lineIndex}`}>{parts}</React.Fragment>;
  });
}
