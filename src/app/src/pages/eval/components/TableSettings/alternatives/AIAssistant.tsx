import React, { useState, useRef, useEffect } from 'react';

import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import MicIcon from '@mui/icons-material/Mic';
import SendIcon from '@mui/icons-material/Send';
import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import Chip from '@mui/material/Chip';
import Fade from '@mui/material/Fade';
import IconButton from '@mui/material/IconButton';
import InputBase from '@mui/material/InputBase';
import Stack from '@mui/material/Stack';
import { alpha, useTheme } from '@mui/material/styles';
import Typography from '@mui/material/Typography';
import { useResultsViewSettingsStore } from '../../store';

interface Message {
  text: string;
  sender: 'user' | 'ai';
  timestamp: Date;
}

const AIAssistant: React.FC = () => {
  const theme = useTheme();
  const [isOpen, setIsOpen] = useState(false);
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [isListening, setIsListening] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

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
  } = useResultsViewSettingsStore();

  // Natural language processing
  const processCommand = (text: string) => {
    const lower = text.toLowerCase();
    let response = '';
    let understood = true;

    // Text length commands
    if (lower.includes('show more') || lower.includes('expand')) {
      setMaxTextLength(Number.POSITIVE_INFINITY);
      response = "I've expanded the text to show everything.";
    } else if (lower.includes('show less') || lower.includes('compact')) {
      setMaxTextLength(100);
      response = "I've made the view more compact.";
    } else if (lower.includes('normal view')) {
      setMaxTextLength(250);
      response = 'Set to normal view with 250 character limit.';
    }

    // Feature toggles
    else if (lower.includes('show prompt') || lower.includes('display prompt')) {
      setShowPrompts(true);
      response = 'Now showing prompts in the output cells.';
    } else if (lower.includes('hide prompt')) {
      setShowPrompts(false);
      response = 'Prompts are now hidden.';
    } else if (lower.includes('format') && lower.includes('json')) {
      setPrettifyJson(true);
      response = 'JSON formatting enabled.';
    } else if (lower.includes('raw json')) {
      setPrettifyJson(false);
      response = 'Showing raw JSON without formatting.';
    } else if (lower.includes('markdown')) {
      setRenderMarkdown(!renderMarkdown);
      response = renderMarkdown ? 'Markdown rendering disabled.' : 'Markdown rendering enabled.';
    } else if (lower.includes('sticky') || lower.includes('fix header')) {
      setStickyHeader(true);
      response = 'Header is now sticky.';
    } else if (lower.includes('unstick') || lower.includes('normal header')) {
      setStickyHeader(false);
      response = 'Header scrolls normally now.';
    } else if (lower.includes('detail') || lower.includes('stats')) {
      setShowInferenceDetails(!showInferenceDetails);
      response = showInferenceDetails ? 'Hiding inference details.' : 'Showing inference details.';
    }

    // Complex queries
    else if (lower.includes('make it easier to read')) {
      setMaxTextLength(500);
      setRenderMarkdown(true);
      setPrettifyJson(true);
      response =
        "I've optimized the display for readability with expanded text, markdown rendering, and JSON formatting.";
    } else if (lower.includes('focus on results')) {
      setShowPrompts(false);
      setShowInferenceDetails(false);
      setMaxTextLength(250);
      response = 'Focused view: hiding prompts and details, showing just the results.';
    } else if (lower.includes('debug mode') || lower.includes('developer view')) {
      setShowPrompts(true);
      setShowInferenceDetails(true);
      setPrettifyJson(true);
      setMaxTextLength(Number.POSITIVE_INFINITY);
      response =
        'Debug mode activated: showing all information including prompts, inference details, and full text.';
    } else {
      understood = false;
      response =
        'I can help you adjust the view. Try saying "show more text", "hide prompts", "format JSON", or "make it easier to read".';
    }

    return { response, understood };
  };

  const handleSend = () => {
    if (!input.trim()) return;

    const userMessage: Message = {
      text: input,
      sender: 'user',
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);

    // Process the command
    const { response } = processCommand(input);

    setTimeout(() => {
      const aiMessage: Message = {
        text: response,
        sender: 'ai',
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, aiMessage]);
    }, 300);

    setInput('');
  };

  // Keyboard shortcut
  useEffect(() => {
    const handleKeyPress = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === '/') {
        e.preventDefault();
        setIsOpen(!isOpen);
        if (!isOpen) {
          setTimeout(() => inputRef.current?.focus(), 100);
        }
      }
    };

    document.addEventListener('keydown', handleKeyPress);
    return () => document.removeEventListener('keydown', handleKeyPress);
  }, [isOpen]);

  const quickCommands = ['Show more text', 'Make it compact', 'Debug mode', 'Focus on results'];

  return (
    <>
      {/* Floating trigger */}
      <Box
        onClick={() => {
          setIsOpen(true);
          setTimeout(() => inputRef.current?.focus(), 100);
        }}
        sx={{
          position: 'fixed',
          bottom: 24,
          right: 24,
          width: 56,
          height: 56,
          borderRadius: '50%',
          backgroundColor: theme.palette.primary.main,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'pointer',
          boxShadow: theme.shadows[6],
          transition: 'all 0.3s ease',
          '&:hover': {
            transform: 'scale(1.1)',
            boxShadow: theme.shadows[12],
          },
        }}
      >
        <AutoAwesomeIcon sx={{ color: 'white' }} />
      </Box>

      {/* Assistant dialog */}
      <Fade in={isOpen}>
        <Card
          sx={{
            position: 'fixed',
            bottom: 100,
            right: 24,
            width: 380,
            maxHeight: 500,
            display: isOpen ? 'flex' : 'none',
            flexDirection: 'column',
            boxShadow: theme.shadows[16],
            borderRadius: 3,
            overflow: 'hidden',
            backgroundColor: alpha(theme.palette.background.paper, 0.98),
            backdropFilter: 'blur(20px)',
          }}
        >
          {/* Header */}
          <Box
            sx={{
              p: 2,
              borderBottom: `1px solid ${alpha(theme.palette.divider, 0.1)}`,
              backgroundColor: alpha(theme.palette.primary.main, 0.04),
            }}
          >
            <Stack direction="row" alignItems="center" spacing={1}>
              <AutoAwesomeIcon color="primary" />
              <Typography variant="h6" fontWeight={600}>
                Settings Assistant
              </Typography>
              <Typography variant="caption" color="text.secondary" sx={{ ml: 'auto' }}>
                ⌘/
              </Typography>
            </Stack>
          </Box>

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
            {messages.length === 0 && (
              <Box>
                <Typography variant="body2" color="text.secondary" gutterBottom>
                  Try these commands:
                </Typography>
                <Stack direction="row" flexWrap="wrap" gap={1}>
                  {quickCommands.map((cmd) => (
                    <Chip
                      key={cmd}
                      label={cmd}
                      size="small"
                      onClick={() => setInput(cmd)}
                      sx={{ cursor: 'pointer' }}
                    />
                  ))}
                </Stack>
              </Box>
            )}

            {messages.map((msg, idx) => (
              <Box
                key={idx}
                sx={{
                  alignSelf: msg.sender === 'user' ? 'flex-end' : 'flex-start',
                  maxWidth: '80%',
                }}
              >
                <Paper
                  sx={{
                    px: 2,
                    py: 1,
                    backgroundColor:
                      msg.sender === 'user'
                        ? alpha(theme.palette.primary.main, 0.1)
                        : alpha(theme.palette.background.default, 0.5),
                    borderRadius: 2,
                  }}
                >
                  <Typography variant="body2">{msg.text}</Typography>
                </Paper>
              </Box>
            ))}
          </Box>

          {/* Input */}
          <Box
            sx={{
              p: 2,
              borderTop: `1px solid ${alpha(theme.palette.divider, 0.1)}`,
            }}
          >
            <Stack direction="row" spacing={1}>
              <InputBase
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && handleSend()}
                placeholder="Tell me what you want to see..."
                sx={{
                  flex: 1,
                  px: 2,
                  py: 1,
                  borderRadius: 2,
                  backgroundColor: alpha(theme.palette.background.default, 0.4),
                }}
              />
              <IconButton onClick={() => setIsListening(!isListening)} color="primary">
                <MicIcon />
              </IconButton>
              <IconButton onClick={handleSend} color="primary">
                <SendIcon />
              </IconButton>
            </Stack>
          </Box>
        </Card>
      </Fade>
    </>
  );
};

export default React.memo(AIAssistant);
