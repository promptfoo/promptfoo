import { useState } from 'react';
import CloseIcon from '@mui/icons-material/Close';
import Box from '@mui/material/Box';
import Chip from '@mui/material/Chip';
import Divider from '@mui/material/Divider';
import Fade from '@mui/material/Fade';
import IconButton from '@mui/material/IconButton';
import Paper from '@mui/material/Paper';
import Popper from '@mui/material/Popper';
import { alpha } from '@mui/material/styles';
import Typography from '@mui/material/Typography';
import {
  categoryAliases,
  displayNameOverrides,
  type Plugin,
  subCategoryDescriptions,
} from '@promptfoo/redteam/constants';

interface SelectedPluginsPanelProps {
  selectedPlugins: Set<Plugin>;
  onRemovePlugin: (plugin: Plugin) => void;
  getPluginExamples: (plugin: Plugin) => string[];
}

export default function SelectedPluginsPanel({
  selectedPlugins,
  onRemovePlugin,
  getPluginExamples,
}: SelectedPluginsPanelProps) {
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);
  const [hoveredPlugin, setHoveredPlugin] = useState<Plugin | null>(null);

  const handleMouseEnter = (event: React.MouseEvent<HTMLElement>, plugin: Plugin) => {
    setAnchorEl(event.currentTarget);
    setHoveredPlugin(plugin);
  };

  const handleMouseLeave = () => {
    setAnchorEl(null);
    setHoveredPlugin(null);
  };

  if (selectedPlugins.size === 0) {
    return null;
  }

  return (
    <Paper
      elevation={4}
      sx={{
        position: 'fixed',
        right: 24,
        top: '50%',
        transform: 'translateY(-50%)',
        width: 320,
        maxHeight: '80vh',
        overflow: 'hidden',
        backgroundColor: 'background.paper',
        borderRadius: 2,
        border: (theme) => `1px solid ${alpha(theme.palette.divider, 0.1)}`,
        display: 'flex',
        flexDirection: 'column',
        zIndex: 1200,
      }}
    >
      <Box
        sx={{
          p: 2,
          backgroundColor: (theme) => alpha(theme.palette.primary.main, 0.04),
          borderBottom: (theme) => `1px solid ${theme.palette.divider}`,
        }}
      >
        <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
          Selected Plugins ({selectedPlugins.size})
        </Typography>
      </Box>

      <Box
        sx={{
          flex: 1,
          overflowY: 'auto',
          p: 2,
          '&::-webkit-scrollbar': {
            width: '8px',
          },
          '&::-webkit-scrollbar-track': {
            backgroundColor: 'action.hover',
            borderRadius: '4px',
          },
          '&::-webkit-scrollbar-thumb': {
            backgroundColor: 'action.disabled',
            borderRadius: '4px',
            '&:hover': {
              backgroundColor: 'action.selected',
            },
          },
        }}
      >
        {Array.from(selectedPlugins).map((plugin, index) => (
          <Box key={plugin}>
            {index > 0 && <Divider sx={{ my: 1.5 }} />}
            <Box
              sx={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: 1,
                py: 0.5,
                position: 'relative',
                '&:hover': {
                  '& .remove-button': {
                    opacity: 1,
                  },
                },
              }}
              onMouseEnter={(e) => handleMouseEnter(e, plugin)}
              onMouseLeave={handleMouseLeave}
            >
              <Box sx={{ flex: 1 }}>
                <Typography
                  variant="body2"
                  sx={{
                    fontWeight: 500,
                    mb: 0.5,
                    cursor: 'pointer',
                    '&:hover': {
                      color: 'primary.main',
                    },
                  }}
                >
                  {displayNameOverrides[plugin] || categoryAliases[plugin] || plugin}
                </Typography>
                <Typography
                  variant="caption"
                  sx={{
                    color: 'text.secondary',
                    display: 'block',
                    lineHeight: 1.4,
                    fontSize: '0.75rem',
                  }}
                >
                  {subCategoryDescriptions[plugin]}
                </Typography>
              </Box>
              <IconButton
                size="small"
                onClick={() => onRemovePlugin(plugin)}
                className="remove-button"
                sx={{
                  opacity: 0,
                  transition: 'opacity 0.2s',
                  padding: 0.5,
                  '&:hover': {
                    backgroundColor: (theme) => alpha(theme.palette.error.main, 0.08),
                    color: 'error.main',
                  },
                }}
              >
                <CloseIcon fontSize="small" />
              </IconButton>
            </Box>
          </Box>
        ))}
      </Box>

      <Popper
        open={Boolean(anchorEl) && hoveredPlugin !== null}
        anchorEl={anchorEl}
        placement="left"
        transition
        modifiers={[
          {
            name: 'offset',
            options: {
              offset: [0, 8],
            },
          },
        ]}
      >
        {({ TransitionProps }) => (
          <Fade {...TransitionProps} timeout={200}>
            <Paper
              elevation={8}
              sx={{
                p: 2,
                maxWidth: 400,
                backgroundColor: 'background.paper',
                border: (theme) => `1px solid ${alpha(theme.palette.divider, 0.1)}`,
              }}
            >
              <Typography variant="subtitle2" sx={{ mb: 1, fontWeight: 600 }}>
                Example Test Cases
              </Typography>
              {hoveredPlugin && (
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                  {getPluginExamples(hoveredPlugin).map((example, idx) => (
                    <Box
                      key={idx}
                      sx={{
                        p: 1.5,
                        backgroundColor: (theme) => alpha(theme.palette.action.hover, 0.5),
                        borderRadius: 1,
                        border: (theme) => `1px solid ${alpha(theme.palette.divider, 0.1)}`,
                      }}
                    >
                      <Typography
                        variant="caption"
                        sx={{
                          fontFamily: 'monospace',
                          fontSize: '0.8rem',
                          color: 'text.secondary',
                          display: 'block',
                          whiteSpace: 'pre-wrap',
                          wordBreak: 'break-word',
                        }}
                      >
                        {example}
                      </Typography>
                    </Box>
                  ))}
                </Box>
              )}
            </Paper>
          </Fade>
        )}
      </Popper>
    </Paper>
  );
}