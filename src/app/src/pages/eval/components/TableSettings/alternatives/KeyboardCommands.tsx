import React, { useState, useEffect, useRef } from 'react';

import Box from '@mui/material/Box';
import Fade from '@mui/material/Fade';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import { alpha, useTheme } from '@mui/material/styles';
import Typography from '@mui/material/Typography';
import { useResultsViewSettingsStore } from '../../store';

interface Command {
  key: string;
  description: string;
  action: () => void;
  category: 'view' | 'navigation' | 'toggle' | 'text';
}

interface CommandSequence {
  keys: string[];
  timeout: NodeJS.Timeout | null;
}

const KeyboardCommands: React.FC = () => {
  const theme = useTheme();
  const [isActive, setIsActive] = useState(false);
  const [commandSequence, setCommandSequence] = useState<CommandSequence>({
    keys: [],
    timeout: null,
  });
  const [feedback, setFeedback] = useState<string>('');
  const [showHelp, setShowHelp] = useState(false);

  const {
    maxTextLength,
    setMaxTextLength,
    showPrompts,
    setShowPrompts,
    showInferenceDetails,
    setShowInferenceDetails,
    renderMarkdown,
    setRenderMarkdown,
    prettifyJson,
    setPrettifyJson,
    stickyHeader,
    setStickyHeader,
    showPassFail,
    setShowPassFail,
  } = useResultsViewSettingsStore();

  const commands: Command[] = [
    // View commands
    { key: 'v', description: 'View mode', action: () => {}, category: 'view' },
    {
      key: 'vc',
      description: 'Compact view',
      action: () => setMaxTextLength(100),
      category: 'view',
    },
    {
      key: 'vn',
      description: 'Normal view',
      action: () => setMaxTextLength(250),
      category: 'view',
    },
    {
      key: 'vf',
      description: 'Full view',
      action: () => setMaxTextLength(Number.POSITIVE_INFINITY),
      category: 'view',
    },

    // Toggle commands
    { key: 't', description: 'Toggle mode', action: () => {}, category: 'toggle' },
    {
      key: 'tp',
      description: 'Toggle prompts',
      action: () => {
        setShowPrompts(!showPrompts);
        showFeedback('Prompts: ' + (!showPrompts ? 'ON' : 'OFF'));
      },
      category: 'toggle',
    },
    {
      key: 'td',
      description: 'Toggle details',
      action: () => {
        setShowInferenceDetails(!showInferenceDetails);
        showFeedback('Details: ' + (!showInferenceDetails ? 'ON' : 'OFF'));
      },
      category: 'toggle',
    },
    {
      key: 'tm',
      description: 'Toggle markdown',
      action: () => {
        setRenderMarkdown(!renderMarkdown);
        showFeedback('Markdown: ' + (!renderMarkdown ? 'ON' : 'OFF'));
      },
      category: 'toggle',
    },
    {
      key: 'tj',
      description: 'Toggle JSON formatting',
      action: () => {
        setPrettifyJson(!prettifyJson);
        showFeedback('JSON: ' + (!prettifyJson ? 'ON' : 'OFF'));
      },
      category: 'toggle',
    },
    {
      key: 'th',
      description: 'Toggle sticky header',
      action: () => {
        setStickyHeader(!stickyHeader);
        showFeedback('Header: ' + (!stickyHeader ? 'STICKY' : 'NORMAL'));
      },
      category: 'toggle',
    },
    {
      key: 'tf',
      description: 'Toggle pass/fail',
      action: () => {
        setShowPassFail(!showPassFail);
        showFeedback('Pass/Fail: ' + (!showPassFail ? 'ON' : 'OFF'));
      },
      category: 'toggle',
    },

    // Text length commands
    {
      key: '+',
      description: 'Increase text',
      action: () => {
        const current = maxTextLength === Number.POSITIVE_INFINITY ? 500 : maxTextLength;
        const newVal = Math.min(1000, current + 100);
        setMaxTextLength(newVal === 1000 ? Number.POSITIVE_INFINITY : newVal);
        showFeedback(`Text: ${newVal === 1000 ? '∞' : newVal}`);
      },
      category: 'text',
    },
    {
      key: '-',
      description: 'Decrease text',
      action: () => {
        const current = maxTextLength === Number.POSITIVE_INFINITY ? 1000 : maxTextLength;
        const newVal = Math.max(50, current - 100);
        setMaxTextLength(newVal);
        showFeedback(`Text: ${newVal}`);
      },
      category: 'text',
    },

    // Help
    {
      key: '?',
      description: 'Show help',
      action: () => setShowHelp(!showHelp),
      category: 'navigation',
    },
    {
      key: 'Escape',
      description: 'Exit command mode',
      action: () => {
        setIsActive(false);
        setCommandSequence({ keys: [], timeout: null });
      },
      category: 'navigation',
    },
  ];

  const showFeedback = (message: string) => {
    setFeedback(message);
    setTimeout(() => setFeedback(''), 1500);
  };

  const executeCommand = (sequence: string[]) => {
    const commandKey = sequence.join('');
    const command = commands.find((c) => c.key === commandKey);

    if (command && command.action) {
      command.action();
      setCommandSequence({ keys: [], timeout: null });

      // Don't exit command mode for multi-key commands
      if (!['v', 't'].includes(commandKey)) {
        setTimeout(() => setIsActive(false), 100);
      }
    }
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Activate with forward slash
      if (
        e.key === '/' &&
        !isActive &&
        !(e.target instanceof HTMLInputElement) &&
        !(e.target instanceof HTMLTextAreaElement)
      ) {
        e.preventDefault();
        setIsActive(true);
        showFeedback('Command mode');
        return;
      }

      if (!isActive) return;

      // Handle escape
      if (e.key === 'Escape') {
        setIsActive(false);
        setCommandSequence({ keys: [], timeout: null });
        setShowHelp(false);
        return;
      }

      // Prevent default for all keys in command mode
      if (!/^F\d+$/.test(e.key)) {
        e.preventDefault();
      }

      // Build command sequence
      const newSequence = [...commandSequence.keys, e.key];

      // Clear previous timeout
      if (commandSequence.timeout) {
        clearTimeout(commandSequence.timeout);
      }

      // Check if this could be a multi-key command
      const potentialCommands = commands.filter((c) => c.key.startsWith(newSequence.join('')));

      if (potentialCommands.length > 0) {
        if (potentialCommands.some((c) => c.key === newSequence.join(''))) {
          // Exact match found
          executeCommand(newSequence);
        } else {
          // Partial match, wait for more keys
          const timeout = setTimeout(() => {
            setCommandSequence({ keys: [], timeout: null });
          }, 1000);

          setCommandSequence({ keys: newSequence, timeout });
        }
      } else {
        // No match, reset
        setCommandSequence({ keys: [], timeout: null });
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isActive, commandSequence, commands]);

  const commandsByCategory = commands.reduce(
    (acc, cmd) => {
      if (!acc[cmd.category]) acc[cmd.category] = [];
      acc[cmd.category].push(cmd);
      return acc;
    },
    {} as Record<string, Command[]>,
  );

  return (
    <>
      {/* Command mode indicator */}
      {isActive && (
        <Fade in>
          <Box
            sx={{
              position: 'fixed',
              bottom: 24,
              left: 24,
              zIndex: 1400,
            }}
          >
            <Paper
              sx={{
                px: 2,
                py: 1,
                backgroundColor: alpha(theme.palette.primary.main, 0.9),
                color: 'white',
                borderRadius: 1,
                display: 'flex',
                alignItems: 'center',
                gap: 1,
              }}
            >
              <Typography variant="caption" fontWeight={600}>
                COMMAND
              </Typography>
              {commandSequence.keys.length > 0 && (
                <>
                  <Box sx={{ width: 1, height: 16, backgroundColor: 'rgba(255,255,255,0.3)' }} />
                  <Typography variant="caption" fontFamily="monospace">
                    {commandSequence.keys.join('')}
                  </Typography>
                </>
              )}
              <Typography variant="caption" sx={{ opacity: 0.7, ml: 1 }}>
                ? for help
              </Typography>
            </Paper>
          </Box>
        </Fade>
      )}

      {/* Feedback */}
      {feedback && (
        <Fade in>
          <Paper
            sx={{
              position: 'fixed',
              top: '50%',
              left: '50%',
              transform: 'translate(-50%, -50%)',
              px: 3,
              py: 1.5,
              backgroundColor: alpha(theme.palette.background.paper, 0.95),
              backdropFilter: 'blur(10px)',
              borderRadius: 2,
              boxShadow: theme.shadows[12],
              zIndex: 1500,
            }}
          >
            <Typography variant="body1" fontWeight={500}>
              {feedback}
            </Typography>
          </Paper>
        </Fade>
      )}

      {/* Help overlay */}
      {showHelp && isActive && (
        <Fade in>
          <Box
            onClick={() => setShowHelp(false)}
            sx={{
              position: 'fixed',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              backgroundColor: alpha(theme.palette.background.default, 0.8),
              backdropFilter: 'blur(4px)',
              zIndex: 1300,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Paper
              sx={{
                p: 4,
                maxWidth: 600,
                maxHeight: '80vh',
                overflow: 'auto',
                borderRadius: 2,
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <Typography variant="h6" gutterBottom>
                Keyboard Commands
              </Typography>

              {Object.entries(commandsByCategory).map(([category, cmds]) => (
                <Box key={category} sx={{ mb: 3 }}>
                  <Typography
                    variant="overline"
                    sx={{
                      color: theme.palette.text.secondary,
                      display: 'block',
                      mb: 1,
                    }}
                  >
                    {category}
                  </Typography>
                  {cmds.map((cmd) => (
                    <Stack
                      key={cmd.key}
                      direction="row"
                      alignItems="center"
                      spacing={2}
                      sx={{ mb: 0.5 }}
                    >
                      <Typography
                        variant="body2"
                        sx={{
                          fontFamily: 'monospace',
                          backgroundColor: alpha(theme.palette.text.primary, 0.08),
                          px: 1,
                          py: 0.5,
                          borderRadius: 1,
                          minWidth: 40,
                          textAlign: 'center',
                        }}
                      >
                        {cmd.key}
                      </Typography>
                      <Typography variant="body2">{cmd.description}</Typography>
                    </Stack>
                  ))}
                </Box>
              ))}
            </Paper>
          </Box>
        </Fade>
      )}

      {/* Activation hint */}
      {!isActive && (
        <Box
          sx={{
            position: 'fixed',
            bottom: 24,
            right: 24,
            opacity: 0.4,
            transition: 'opacity 0.2s ease',
            '&:hover': {
              opacity: 0.8,
            },
          }}
        >
          <Typography variant="caption">
            Press{' '}
            <kbd
              style={{
                padding: '2px 6px',
                backgroundColor: alpha(theme.palette.text.primary, 0.08),
                borderRadius: '3px',
                fontFamily: 'monospace',
              }}
            >
              /
            </kbd>{' '}
            for commands
          </Typography>
        </Box>
      )}
    </>
  );
};

export default React.memo(KeyboardCommands);
