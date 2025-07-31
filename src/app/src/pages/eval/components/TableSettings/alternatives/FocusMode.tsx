import React, { useState, useEffect } from 'react';

import CenterFocusStrongIcon from '@mui/icons-material/CenterFocusStrong';
import CloseIcon from '@mui/icons-material/Close';
import Box from '@mui/material/Box';
import Fab from '@mui/material/Fab';
import Fade from '@mui/material/Fade';
import IconButton from '@mui/material/IconButton';
import { alpha, useTheme } from '@mui/material/styles';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import { useResultsViewSettingsStore } from '../../store';

const FocusMode: React.FC = () => {
  const theme = useTheme();
  const [focusedCell, setFocusedCell] = useState<HTMLElement | null>(null);
  const [isFocusMode, setIsFocusMode] = useState(false);

  const { setMaxTextLength, setRenderMarkdown, setPrettifyJson } = useResultsViewSettingsStore();

  useEffect(() => {
    if (!isFocusMode) return;

    const handleCellClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      const cell = target.closest('td');

      if (cell && cell.textContent && cell.textContent.length > 50) {
        e.preventDefault();
        e.stopPropagation();
        setFocusedCell(cell);
      }
    };

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (focusedCell) {
          setFocusedCell(null);
        } else {
          setIsFocusMode(false);
        }
      }
    };

    // Add focus mode styling
    document.body.style.overflow = 'hidden';
    const tableContainer = document.querySelector('[data-testid="results-table"]')?.parentElement;
    if (tableContainer) {
      (tableContainer as HTMLElement).style.filter = 'blur(0px)';
      (tableContainer as HTMLElement).style.transition = 'filter 0.3s ease';
    }

    document.addEventListener('click', handleCellClick, true);
    document.addEventListener('keydown', handleEscape);

    return () => {
      document.body.style.overflow = 'auto';
      if (tableContainer) {
        (tableContainer as HTMLElement).style.filter = '';
      }
      document.removeEventListener('click', handleCellClick, true);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [isFocusMode, focusedCell]);

  useEffect(() => {
    // Blur background when cell is focused
    const tableContainer = document.querySelector('[data-testid="results-table"]')?.parentElement;
    if (tableContainer) {
      (tableContainer as HTMLElement).style.filter = focusedCell ? 'blur(3px)' : 'blur(0px)';
    }
  }, [focusedCell]);

  const enableFocusMode = () => {
    setIsFocusMode(true);
    // Optimize for reading
    setMaxTextLength(Number.POSITIVE_INFINITY);
    setRenderMarkdown(true);
    setPrettifyJson(true);
  };

  return (
    <>
      {/* Focus Mode Toggle */}
      {!isFocusMode && (
        <Tooltip title="Focus Mode - Click any cell to read (F)">
          <Fab
            color="primary"
            size="small"
            onClick={enableFocusMode}
            sx={{
              position: 'fixed',
              bottom: 24,
              left: 24,
              boxShadow: theme.shadows[4],
            }}
          >
            <CenterFocusStrongIcon />
          </Fab>
        </Tooltip>
      )}

      {/* Focus Mode Indicator */}
      {isFocusMode && !focusedCell && (
        <Fade in>
          <Box
            sx={{
              position: 'fixed',
              top: 24,
              left: '50%',
              transform: 'translateX(-50%)',
              px: 3,
              py: 1.5,
              backgroundColor: alpha(theme.palette.primary.main, 0.9),
              color: 'white',
              borderRadius: 3,
              boxShadow: theme.shadows[8],
              zIndex: 1400,
            }}
          >
            <Typography variant="body2" fontWeight={500}>
              Focus Mode: Click any cell to read • ESC to exit
            </Typography>
          </Box>
        </Fade>
      )}

      {/* Focused Cell Reader */}
      {focusedCell && (
        <Fade in>
          <Box
            sx={{
              position: 'fixed',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              backgroundColor: alpha(theme.palette.background.default, 0.98),
              backdropFilter: 'blur(20px)',
              zIndex: 1500,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              p: 4,
            }}
            onClick={() => setFocusedCell(null)}
          >
            <Box
              onClick={(e) => e.stopPropagation()}
              sx={{
                maxWidth: 800,
                maxHeight: '80vh',
                overflowY: 'auto',
                backgroundColor: theme.palette.background.paper,
                borderRadius: 4,
                p: 6,
                boxShadow: theme.shadows[24],
                position: 'relative',
                '&::-webkit-scrollbar': {
                  width: 12,
                },
                '&::-webkit-scrollbar-thumb': {
                  backgroundColor: alpha(theme.palette.text.primary, 0.2),
                  borderRadius: 6,
                },
              }}
            >
              <IconButton
                onClick={() => setFocusedCell(null)}
                sx={{
                  position: 'absolute',
                  top: 16,
                  right: 16,
                }}
              >
                <CloseIcon />
              </IconButton>

              <Typography
                variant="body1"
                sx={{
                  lineHeight: 1.8,
                  fontSize: '1.1rem',
                  fontFamily: theme.typography.fontFamily,
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word',
                }}
              >
                {focusedCell.textContent}
              </Typography>

              {/* Reading progress indicator */}
              <Box
                sx={{
                  position: 'absolute',
                  bottom: 0,
                  left: 0,
                  right: 0,
                  height: 4,
                  backgroundColor: alpha(theme.palette.primary.main, 0.1),
                }}
              >
                <Box
                  sx={{
                    height: '100%',
                    width: '30%',
                    backgroundColor: theme.palette.primary.main,
                    transition: 'width 0.3s ease',
                  }}
                />
              </Box>
            </Box>
          </Box>
        </Fade>
      )}
    </>
  );
};

export default React.memo(FocusMode);
