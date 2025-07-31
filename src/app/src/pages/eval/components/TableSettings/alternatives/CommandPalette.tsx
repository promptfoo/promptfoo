import React, { useCallback, useEffect, useState } from 'react';

import CheckIcon from '@mui/icons-material/Check';
import SearchIcon from '@mui/icons-material/Search';
import Box from '@mui/material/Box';
import Dialog from '@mui/material/Dialog';
import DialogContent from '@mui/material/DialogContent';
import InputAdornment from '@mui/material/InputAdornment';
import List from '@mui/material/List';
import ListItem from '@mui/material/ListItem';
import ListItemIcon from '@mui/material/ListItemIcon';
import ListItemText from '@mui/material/ListItemText';
import Paper from '@mui/material/Paper';
import TextField from '@mui/material/TextField';
import { alpha, useTheme } from '@mui/material/styles';
import Typography from '@mui/material/Typography';
import { useResultsViewSettingsStore } from '../../store';

interface Command {
  id: string;
  label: string;
  description?: string;
  category: string;
  action: () => void;
  getValue?: () => string | boolean | number;
  keywords: string[];
}

const CommandPalette: React.FC = () => {
  const theme = useTheme();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);

  const {
    maxTextLength,
    setMaxTextLength,
    showPrompts,
    setShowPrompts,
    showInferenceDetails,
    setShowInferenceDetails,
    renderMarkdown,
    setRenderMarkdown,
    showPassFail,
    setShowPassFail,
    stickyHeader,
    setStickyHeader,
    prettifyJson,
    setPrettifyJson,
    wordBreak,
    setWordBreak,
    maxImageWidth,
    setMaxImageWidth,
    maxImageHeight,
    setMaxImageHeight,
  } = useResultsViewSettingsStore();

  const commands: Command[] = [
    // Toggle Commands
    {
      id: 'toggle-sticky',
      label: 'Toggle Sticky Header',
      description: stickyHeader ? 'Currently enabled' : 'Currently disabled',
      category: 'Layout',
      action: () => setStickyHeader(!stickyHeader),
      getValue: () => stickyHeader,
      keywords: ['sticky', 'header', 'fixed', 'scroll'],
    },
    {
      id: 'toggle-prompts',
      label: 'Toggle Show Prompts',
      description: showPrompts ? 'Currently showing' : 'Currently hidden',
      category: 'Visibility',
      action: () => setShowPrompts(!showPrompts),
      getValue: () => showPrompts,
      keywords: ['prompts', 'show', 'hide', 'display'],
    },
    {
      id: 'toggle-pass-fail',
      label: 'Toggle Pass/Fail Indicators',
      description: showPassFail ? 'Currently showing' : 'Currently hidden',
      category: 'Visibility',
      action: () => setShowPassFail(!showPassFail),
      getValue: () => showPassFail,
      keywords: ['pass', 'fail', 'status', 'indicators'],
    },
    {
      id: 'toggle-inference',
      label: 'Toggle Inference Details',
      description: showInferenceDetails ? 'Currently showing' : 'Currently hidden',
      category: 'Visibility',
      action: () => setShowInferenceDetails(!showInferenceDetails),
      getValue: () => showInferenceDetails,
      keywords: ['inference', 'details', 'latency', 'tokens', 'cost'],
    },
    {
      id: 'toggle-markdown',
      label: 'Toggle Markdown Rendering',
      description: renderMarkdown ? 'Currently enabled' : 'Currently disabled',
      category: 'Formatting',
      action: () => setRenderMarkdown(!renderMarkdown),
      getValue: () => renderMarkdown,
      keywords: ['markdown', 'render', 'format'],
    },
    {
      id: 'toggle-json',
      label: 'Toggle JSON Prettification',
      description: prettifyJson ? 'Currently enabled' : 'Currently disabled',
      category: 'Formatting',
      action: () => setPrettifyJson(!prettifyJson),
      getValue: () => prettifyJson,
      keywords: ['json', 'prettify', 'format', 'indent'],
    },
    {
      id: 'toggle-word-break',
      label: 'Toggle Force Line Breaks',
      description:
        wordBreak === 'break-all' ? 'Breaking at any character' : 'Breaking at word boundaries',
      category: 'Text',
      action: () => setWordBreak(wordBreak === 'break-all' ? 'break-word' : 'break-all'),
      getValue: () => wordBreak === 'break-all',
      keywords: ['line', 'break', 'wrap', 'text'],
    },

    // Preset Commands
    {
      id: 'preset-compact',
      label: 'Apply Compact View',
      description: 'Minimal details, 100 char limit',
      category: 'Presets',
      action: () => {
        setMaxTextLength(100);
        setShowPrompts(false);
        setShowInferenceDetails(false);
        setRenderMarkdown(false);
      },
      keywords: ['compact', 'minimal', 'small', 'preset'],
    },
    {
      id: 'preset-normal',
      label: 'Apply Normal View',
      description: 'Balanced view, 250 char limit',
      category: 'Presets',
      action: () => {
        setMaxTextLength(250);
        setShowPrompts(false);
        setShowInferenceDetails(true);
        setRenderMarkdown(true);
      },
      keywords: ['normal', 'default', 'balanced', 'preset'],
    },
    {
      id: 'preset-detailed',
      label: 'Apply Detailed View',
      description: 'More details, 500 char limit',
      category: 'Presets',
      action: () => {
        setMaxTextLength(500);
        setShowPrompts(true);
        setShowInferenceDetails(true);
        setRenderMarkdown(true);
      },
      keywords: ['detailed', 'expanded', 'full', 'preset'],
    },
    {
      id: 'preset-unlimited',
      label: 'Apply Unlimited View',
      description: 'Show everything, no limits',
      category: 'Presets',
      action: () => {
        setMaxTextLength(Number.POSITIVE_INFINITY);
        setShowPrompts(true);
        setShowInferenceDetails(true);
        setRenderMarkdown(true);
      },
      keywords: ['unlimited', 'full', 'all', 'everything', 'preset'],
    },

    // Text Length Commands
    {
      id: 'text-100',
      label: 'Set Text Length to 100',
      category: 'Text Length',
      action: () => setMaxTextLength(100),
      keywords: ['text', 'length', '100', 'short'],
    },
    {
      id: 'text-250',
      label: 'Set Text Length to 250',
      category: 'Text Length',
      action: () => setMaxTextLength(250),
      keywords: ['text', 'length', '250', 'medium'],
    },
    {
      id: 'text-500',
      label: 'Set Text Length to 500',
      category: 'Text Length',
      action: () => setMaxTextLength(500),
      keywords: ['text', 'length', '500', 'long'],
    },
    {
      id: 'text-unlimited',
      label: 'Set Text Length to Unlimited',
      category: 'Text Length',
      action: () => setMaxTextLength(Number.POSITIVE_INFINITY),
      keywords: ['text', 'length', 'unlimited', 'infinite', 'all'],
    },

    // Reset Command
    {
      id: 'reset-defaults',
      label: 'Reset All Settings to Defaults',
      description: 'Restore all settings to their default values',
      category: 'System',
      action: () => {
        setStickyHeader(true);
        setWordBreak('break-word');
        setRenderMarkdown(true);
        setPrettifyJson(true);
        setShowPrompts(false);
        setShowPassFail(true);
        setShowInferenceDetails(true);
        setMaxTextLength(500);
        setMaxImageWidth(500);
        setMaxImageHeight(300);
      },
      keywords: ['reset', 'defaults', 'restore', 'original'],
    },
  ];

  const filteredCommands = commands.filter((cmd) => {
    const searchLower = search.toLowerCase();
    return (
      cmd.label.toLowerCase().includes(searchLower) ||
      cmd.keywords.some((k) => k.includes(searchLower)) ||
      cmd.category.toLowerCase().includes(searchLower) ||
      (cmd.description && cmd.description.toLowerCase().includes(searchLower))
    );
  });

  const groupedCommands = filteredCommands.reduce(
    (acc, cmd) => {
      if (!acc[cmd.category]) {
        acc[cmd.category] = [];
      }
      acc[cmd.category].push(cmd);
      return acc;
    },
    {} as Record<string, Command[]>,
  );

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
      e.preventDefault();
      setOpen(true);
    }
  }, []);

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  const handleCommandExecute = (command: Command) => {
    command.action();
    setOpen(false);
    setSearch('');
    setSelectedIndex(0);
  };

  const handleDialogKeyDown = (e: React.KeyboardEvent) => {
    const commands = filteredCommands;

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setSelectedIndex((prev) => Math.min(prev + 1, commands.length - 1));
        break;
      case 'ArrowUp':
        e.preventDefault();
        setSelectedIndex((prev) => Math.max(prev - 1, 0));
        break;
      case 'Enter':
        e.preventDefault();
        if (commands[selectedIndex]) {
          handleCommandExecute(commands[selectedIndex]);
        }
        break;
      case 'Escape':
        e.preventDefault();
        setOpen(false);
        setSearch('');
        setSelectedIndex(0);
        break;
    }
  };

  useEffect(() => {
    setSelectedIndex(0);
  }, [search]);

  let commandIndex = 0;

  return (
    <>
      <Box
        sx={{
          position: 'fixed',
          bottom: 20,
          right: 20,
          display: 'flex',
          alignItems: 'center',
          gap: 1,
          backgroundColor: alpha(theme.palette.background.paper, 0.9),
          backdropFilter: 'blur(8px)',
          borderRadius: 2,
          px: 2,
          py: 1,
          boxShadow: theme.shadows[4],
          cursor: 'pointer',
          transition: 'all 0.2s ease',
          '&:hover': {
            transform: 'translateY(-2px)',
            boxShadow: theme.shadows[8],
          },
        }}
        onClick={() => setOpen(true)}
      >
        <Typography variant="caption" sx={{ opacity: 0.7 }}>
          Press
        </Typography>
        <Paper
          elevation={0}
          sx={{
            px: 1,
            py: 0.5,
            backgroundColor: alpha(theme.palette.primary.main, 0.1),
            borderRadius: 1,
          }}
        >
          <Typography variant="caption" fontWeight={600}>
            ⌘K
          </Typography>
        </Paper>
        <Typography variant="caption" sx={{ opacity: 0.7 }}>
          for settings
        </Typography>
      </Box>

      <Dialog
        open={open}
        onClose={() => {
          setOpen(false);
          setSearch('');
          setSelectedIndex(0);
        }}
        maxWidth="sm"
        fullWidth
        PaperProps={{
          sx: {
            borderRadius: 3,
            overflow: 'hidden',
            backgroundColor: alpha(theme.palette.background.paper, 0.98),
            backdropFilter: 'blur(20px)',
          },
        }}
      >
        <Box sx={{ p: 2, pb: 0 }}>
          <TextField
            fullWidth
            placeholder="Search settings..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={handleDialogKeyDown}
            autoFocus
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon />
                </InputAdornment>
              ),
              sx: {
                borderRadius: 2,
                backgroundColor: alpha(theme.palette.background.default, 0.4),
              },
            }}
            variant="outlined"
          />
        </Box>

        <DialogContent sx={{ p: 2, maxHeight: 400 }}>
          {Object.entries(groupedCommands).map(([category, commands]) => (
            <Box key={category} sx={{ mb: 2 }}>
              <Typography
                variant="caption"
                sx={{
                  display: 'block',
                  mb: 1,
                  px: 2,
                  color: theme.palette.text.secondary,
                  fontWeight: 600,
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                }}
              >
                {category}
              </Typography>
              <List dense sx={{ p: 0 }}>
                {commands.map((cmd) => {
                  const isSelected = commandIndex === selectedIndex;
                  const currentIndex = commandIndex++;

                  return (
                    <ListItem
                      key={cmd.id}
                      onClick={() => handleCommandExecute(cmd)}
                      sx={{
                        borderRadius: 2,
                        mb: 0.5,
                        cursor: 'pointer',
                        backgroundColor: isSelected
                          ? alpha(theme.palette.primary.main, 0.08)
                          : 'transparent',
                        '&:hover': {
                          backgroundColor: alpha(theme.palette.primary.main, 0.04),
                        },
                      }}
                    >
                      {cmd.getValue && typeof cmd.getValue() === 'boolean' && (
                        <ListItemIcon sx={{ minWidth: 36 }}>
                          {cmd.getValue() && <CheckIcon fontSize="small" color="primary" />}
                        </ListItemIcon>
                      )}
                      <ListItemText
                        primary={cmd.label}
                        secondary={cmd.description}
                        primaryTypographyProps={{
                          variant: 'body2',
                          fontWeight: isSelected ? 500 : 400,
                        }}
                        secondaryTypographyProps={{
                          variant: 'caption',
                        }}
                      />
                    </ListItem>
                  );
                })}
              </List>
            </Box>
          ))}
        </DialogContent>
      </Dialog>
    </>
  );
};

export default React.memo(CommandPalette);
