import React, { useState, useEffect, useRef } from 'react';

import CloseIcon from '@mui/icons-material/Close';
import CompareArrowsIcon from '@mui/icons-material/CompareArrows';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import FindInPageIcon from '@mui/icons-material/FindInPage';
import FullscreenIcon from '@mui/icons-material/Fullscreen';
import Box from '@mui/material/Box';
import Chip from '@mui/material/Chip';
import Fade from '@mui/material/Fade';
import IconButton from '@mui/material/IconButton';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import { alpha, useTheme } from '@mui/material/styles';
import TextField from '@mui/material/TextField';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import { useResultsViewSettingsStore } from '../../store';

interface LensState {
  active: boolean;
  cell: HTMLElement | null;
  content: string;
  position: { row: number; col: number };
  compareWith?: { cell: HTMLElement; content: string; position: { row: number; col: number } };
}

interface ReadingStats {
  wordCount: number;
  charCount: number;
  readingTime: number; // minutes
  complexity: 'simple' | 'moderate' | 'complex';
}

const ReadingLens: React.FC = () => {
  const theme = useTheme();
  const [lens, setLens] = useState<LensState>({
    active: false,
    cell: null,
    content: '',
    position: { row: 0, col: 0 },
  });
  const [searchTerm, setSearchTerm] = useState('');
  const [isFullscreen, setIsFullscreen] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);

  const { setMaxTextLength, setRenderMarkdown, setPrettifyJson } = useResultsViewSettingsStore();

  // Calculate reading statistics
  const getReadingStats = (text: string): ReadingStats => {
    const words = text.trim().split(/\s+/).length;
    const chars = text.length;
    const readingTime = Math.ceil(words / 200); // 200 words per minute

    // Simple complexity heuristic
    const avgWordLength = chars / words;
    const complexity = avgWordLength > 8 ? 'complex' : avgWordLength > 5 ? 'moderate' : 'simple';

    return { wordCount: words, charCount: chars, readingTime, complexity };
  };

  useEffect(() => {
    const handleCellClick = (e: MouseEvent) => {
      if (e.shiftKey || e.metaKey || e.ctrlKey) return;

      const target = e.target as HTMLElement;
      const cell = target.closest('td');

      if (cell && cell.textContent && cell.textContent.length > 50) {
        const row = cell.parentElement;
        const rowIndex = Array.from(row?.parentElement?.children || []).indexOf(row!);
        const colIndex = Array.from(row?.children || []).indexOf(cell);

        // Check if clicking to compare
        if (lens.active && e.altKey) {
          setLens((prev) => ({
            ...prev,
            compareWith: {
              cell,
              content: cell.textContent || '',
              position: { row: rowIndex, col: colIndex },
            },
          }));
        } else {
          // Optimize settings for reading
          setMaxTextLength(Number.POSITIVE_INFINITY);
          setRenderMarkdown(true);
          setPrettifyJson(true);

          setLens({
            active: true,
            cell,
            content: cell.textContent || '',
            position: { row: rowIndex, col: colIndex },
          });
        }
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (!lens.active) return;

      switch (e.key) {
        case 'Escape':
          setLens({ active: false, cell: null, content: '', position: { row: 0, col: 0 } });
          setIsFullscreen(false);
          break;
        case 'f':
          if (e.ctrlKey || e.metaKey) {
            e.preventDefault();
            setSearchTerm('');
            setTimeout(() => {
              document.querySelector<HTMLInputElement>('.lens-search')?.focus();
            }, 100);
          }
          break;
        case 'F11':
          e.preventDefault();
          setIsFullscreen(!isFullscreen);
          break;
      }
    };

    // Add click listener with capture to intercept before other handlers
    document.addEventListener('click', handleCellClick, true);
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('click', handleCellClick, true);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [lens.active, isFullscreen, setMaxTextLength, setRenderMarkdown, setPrettifyJson]);

  // Highlight search terms
  const highlightContent = (text: string) => {
    if (!searchTerm) return text;

    const regex = new RegExp(`(${searchTerm})`, 'gi');
    return text.split(regex).map((part, i) =>
      regex.test(part) ? (
        <mark key={i} style={{ backgroundColor: alpha(theme.palette.warning.main, 0.3) }}>
          {part}
        </mark>
      ) : (
        part
      ),
    );
  };

  if (!lens.active) {
    return (
      <Box
        sx={{
          position: 'fixed',
          bottom: 80,
          right: 24,
          opacity: 0.6,
          transition: 'opacity 0.2s ease',
          '&:hover': { opacity: 1 },
        }}
      >
        <Chip
          icon={<FullscreenIcon />}
          label="Click any cell to read"
          size="small"
          sx={{ cursor: 'pointer' }}
        />
      </Box>
    );
  }

  const stats = getReadingStats(lens.content);
  const compareStats = lens.compareWith ? getReadingStats(lens.compareWith.content) : null;

  return (
    <Fade in>
      <Box
        sx={{
          position: 'fixed',
          top: isFullscreen ? 0 : 100,
          left: isFullscreen ? 0 : '10%',
          right: isFullscreen ? 0 : '10%',
          bottom: isFullscreen ? 0 : 100,
          backgroundColor: alpha(theme.palette.background.default, isFullscreen ? 1 : 0.95),
          backdropFilter: 'blur(10px)',
          borderRadius: isFullscreen ? 0 : 3,
          boxShadow: isFullscreen ? 'none' : theme.shadows[24],
          zIndex: 1400,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        {/* Header */}
        <Stack
          direction="row"
          alignItems="center"
          spacing={2}
          sx={{
            p: 2,
            borderBottom: `1px solid ${alpha(theme.palette.divider, 0.1)}`,
            backgroundColor: alpha(theme.palette.background.paper, 0.5),
          }}
        >
          <Stack direction="row" alignItems="center" spacing={1} sx={{ flex: 1 }}>
            <Typography variant="subtitle1" fontWeight={600}>
              Reading Lens
            </Typography>
            <Chip
              label={`Row ${lens.position.row + 1}, Col ${lens.position.col + 1}`}
              size="small"
              variant="outlined"
            />
            {lens.compareWith && (
              <Chip
                label={`↔ Row ${lens.compareWith.position.row + 1}, Col ${lens.compareWith.position.col + 1}`}
                size="small"
                color="primary"
                variant="outlined"
              />
            )}
          </Stack>

          <TextField
            className="lens-search"
            placeholder="Find in text..."
            size="small"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            InputProps={{
              startAdornment: <FindInPageIcon fontSize="small" sx={{ mr: 1, opacity: 0.5 }} />,
            }}
            sx={{ width: 250 }}
          />

          <Stack direction="row" spacing={1}>
            <Tooltip title="Compare with another cell (Alt+Click)">
              <IconButton size="small">
                <CompareArrowsIcon />
              </IconButton>
            </Tooltip>
            <Tooltip title="Copy content">
              <IconButton size="small" onClick={() => navigator.clipboard.writeText(lens.content)}>
                <ContentCopyIcon />
              </IconButton>
            </Tooltip>
            <Tooltip title="Toggle fullscreen (F11)">
              <IconButton size="small" onClick={() => setIsFullscreen(!isFullscreen)}>
                <FullscreenIcon />
              </IconButton>
            </Tooltip>
            <IconButton
              onClick={() => {
                setLens({ active: false, cell: null, content: '', position: { row: 0, col: 0 } });
                setIsFullscreen(false);
              }}
            >
              <CloseIcon />
            </IconButton>
          </Stack>
        </Stack>

        {/* Content */}
        <Box
          ref={contentRef}
          sx={{
            flex: 1,
            overflow: 'auto',
            p: 4,
            '&::-webkit-scrollbar': {
              width: 12,
            },
            '&::-webkit-scrollbar-thumb': {
              backgroundColor: alpha(theme.palette.text.primary, 0.2),
              borderRadius: 6,
            },
          }}
        >
          <Stack
            direction={lens.compareWith ? 'row' : 'column'}
            spacing={4}
            sx={{ height: '100%' }}
          >
            {/* Main content */}
            <Box sx={{ flex: 1 }}>
              <Typography
                variant="body1"
                sx={{
                  lineHeight: 1.8,
                  fontSize: isFullscreen ? '1.2rem' : '1.1rem',
                  fontFamily: theme.typography.fontFamily,
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word',
                }}
              >
                {highlightContent(lens.content)}
              </Typography>
            </Box>

            {/* Comparison content */}
            {lens.compareWith && (
              <>
                <Box sx={{ width: 2, backgroundColor: alpha(theme.palette.divider, 0.2) }} />
                <Box sx={{ flex: 1 }}>
                  <Typography
                    variant="body1"
                    sx={{
                      lineHeight: 1.8,
                      fontSize: isFullscreen ? '1.2rem' : '1.1rem',
                      fontFamily: theme.typography.fontFamily,
                      whiteSpace: 'pre-wrap',
                      wordBreak: 'break-word',
                    }}
                  >
                    {highlightContent(lens.compareWith.content)}
                  </Typography>
                </Box>
              </>
            )}
          </Stack>
        </Box>

        {/* Footer with stats */}
        <Stack
          direction="row"
          alignItems="center"
          spacing={3}
          sx={{
            p: 2,
            borderTop: `1px solid ${alpha(theme.palette.divider, 0.1)}`,
            backgroundColor: alpha(theme.palette.background.paper, 0.5),
          }}
        >
          <Typography variant="caption" color="text.secondary">
            {stats.wordCount} words • {stats.charCount} chars • ~{stats.readingTime} min read
          </Typography>
          <Chip
            label={stats.complexity}
            size="small"
            color={
              stats.complexity === 'complex'
                ? 'error'
                : stats.complexity === 'moderate'
                  ? 'warning'
                  : 'success'
            }
            variant="outlined"
          />
          {compareStats && (
            <>
              <Box
                sx={{ width: 1, height: 20, backgroundColor: alpha(theme.palette.divider, 0.2) }}
              />
              <Typography variant="caption" color="text.secondary">
                Compare: {compareStats.wordCount} words • {compareStats.charCount} chars
              </Typography>
            </>
          )}
          <Box sx={{ flex: 1 }} />
          <Typography variant="caption" color="text.secondary">
            ESC to close • Ctrl+F to search • Alt+Click to compare
          </Typography>
        </Stack>
      </Box>
    </Fade>
  );
};

export default React.memo(ReadingLens);
