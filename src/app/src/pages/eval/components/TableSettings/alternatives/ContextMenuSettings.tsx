import React, { useEffect, useState } from 'react';

import CheckIcon from '@mui/icons-material/Check';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import CodeIcon from '@mui/icons-material/Code';
import FormatAlignLeftIcon from '@mui/icons-material/FormatAlignLeft';
import ImageIcon from '@mui/icons-material/Image';
import RestoreIcon from '@mui/icons-material/Restore';
import SettingsIcon from '@mui/icons-material/Settings';
import SpeedIcon from '@mui/icons-material/Speed';
import TextFieldsIcon from '@mui/icons-material/TextFields';
import VisibilityIcon from '@mui/icons-material/Visibility';
import Box from '@mui/material/Box';
import Divider from '@mui/material/Divider';
import ListItemIcon from '@mui/material/ListItemIcon';
import ListItemText from '@mui/material/ListItemText';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import Slider from '@mui/material/Slider';
import { alpha, useTheme } from '@mui/material/styles';
import Typography from '@mui/material/Typography';
import { useResultsViewSettingsStore } from '../../store';

interface SubmenuState {
  anchorEl: HTMLElement | null;
  type: 'text' | 'image' | 'view' | null;
}

const ContextMenuSettings: React.FC = () => {
  const theme = useTheme();
  const [contextMenu, setContextMenu] = useState<{
    mouseX: number;
    mouseY: number;
  } | null>(null);
  const [submenu, setSubmenu] = useState<SubmenuState>({ anchorEl: null, type: null });

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

  useEffect(() => {
    const handleContextMenu = (event: MouseEvent) => {
      // Check if right-clicking on the table area
      const target = event.target as HTMLElement;
      const isTableArea =
        target.closest('.MuiTable-root') || target.closest('[data-testid="results-table"]');

      if (isTableArea) {
        event.preventDefault();
        setContextMenu({
          mouseX: event.clientX - 2,
          mouseY: event.clientY - 4,
        });
      }
    };

    document.addEventListener('contextmenu', handleContextMenu);
    return () => document.removeEventListener('contextmenu', handleContextMenu);
  }, []);

  const handleClose = () => {
    setContextMenu(null);
    setSubmenu({ anchorEl: null, type: null });
  };

  const handleSubmenuOpen = (
    event: React.MouseEvent<HTMLElement>,
    type: 'text' | 'image' | 'view',
  ) => {
    setSubmenu({ anchorEl: event.currentTarget, type });
  };

  const handleSubmenuClose = () => {
    setSubmenu({ anchorEl: null, type: null });
  };

  const resetToDefaults = () => {
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
    handleClose();
  };

  const viewMode =
    maxTextLength <= 100
      ? 'Compact'
      : maxTextLength <= 250
        ? 'Normal'
        : maxTextLength <= 500
          ? 'Detailed'
          : 'Full';

  return (
    <>
      {/* Main Context Menu */}
      <Menu
        open={contextMenu !== null}
        onClose={handleClose}
        anchorReference="anchorPosition"
        anchorPosition={
          contextMenu !== null ? { top: contextMenu.mouseY, left: contextMenu.mouseX } : undefined
        }
        PaperProps={{
          sx: {
            minWidth: 240,
            borderRadius: 2,
            boxShadow: theme.shadows[8],
            backgroundColor: alpha(theme.palette.background.paper, 0.98),
            backdropFilter: 'blur(20px)',
          },
        }}
      >
        <MenuItem dense disabled sx={{ opacity: 1 }}>
          <ListItemIcon>
            <SettingsIcon fontSize="small" color="primary" />
          </ListItemIcon>
          <ListItemText>
            <Typography variant="caption" fontWeight={600} color="primary">
              TABLE SETTINGS
            </Typography>
          </ListItemText>
        </MenuItem>

        <Divider sx={{ my: 0.5 }} />

        {/* View Mode */}
        <MenuItem onMouseEnter={(e) => handleSubmenuOpen(e, 'view')}>
          <ListItemIcon>
            <VisibilityIcon fontSize="small" />
          </ListItemIcon>
          <ListItemText>View Mode</ListItemText>
          <Typography variant="caption" color="text.secondary" sx={{ ml: 2 }}>
            {viewMode}
          </Typography>
          <ChevronRightIcon fontSize="small" sx={{ ml: 1 }} />
        </MenuItem>

        {/* Text Settings */}
        <MenuItem onMouseEnter={(e) => handleSubmenuOpen(e, 'text')}>
          <ListItemIcon>
            <FormatAlignLeftIcon fontSize="small" />
          </ListItemIcon>
          <ListItemText>Text Settings</ListItemText>
          <ChevronRightIcon fontSize="small" sx={{ ml: 1 }} />
        </MenuItem>

        {/* Image Settings */}
        <MenuItem onMouseEnter={(e) => handleSubmenuOpen(e, 'image')}>
          <ListItemIcon>
            <ImageIcon fontSize="small" />
          </ListItemIcon>
          <ListItemText>Image Settings</ListItemText>
          <ChevronRightIcon fontSize="small" sx={{ ml: 1 }} />
        </MenuItem>

        <Divider sx={{ my: 0.5 }} />

        {/* Quick Toggles */}
        <MenuItem
          onClick={() => {
            setStickyHeader(!stickyHeader);
          }}
        >
          <ListItemIcon>
            {stickyHeader && <CheckIcon fontSize="small" color="primary" />}
          </ListItemIcon>
          <ListItemText inset={!stickyHeader}>Sticky Header</ListItemText>
        </MenuItem>

        <MenuItem
          onClick={() => {
            setShowPrompts(!showPrompts);
          }}
        >
          <ListItemIcon>
            {showPrompts && <CheckIcon fontSize="small" color="primary" />}
          </ListItemIcon>
          <ListItemText inset={!showPrompts}>Show Prompts</ListItemText>
        </MenuItem>

        <MenuItem
          onClick={() => {
            setShowPassFail(!showPassFail);
          }}
        >
          <ListItemIcon>
            {showPassFail && <CheckIcon fontSize="small" color="primary" />}
          </ListItemIcon>
          <ListItemText inset={!showPassFail}>Pass/Fail Indicators</ListItemText>
        </MenuItem>

        <MenuItem
          onClick={() => {
            setShowInferenceDetails(!showInferenceDetails);
          }}
        >
          <ListItemIcon>
            {showInferenceDetails && <CheckIcon fontSize="small" color="primary" />}
          </ListItemIcon>
          <ListItemText inset={!showInferenceDetails}>Inference Details</ListItemText>
        </MenuItem>

        <MenuItem
          onClick={() => {
            setRenderMarkdown(!renderMarkdown);
          }}
        >
          <ListItemIcon>
            {renderMarkdown && <CheckIcon fontSize="small" color="primary" />}
          </ListItemIcon>
          <ListItemText inset={!renderMarkdown}>Render Markdown</ListItemText>
        </MenuItem>

        <MenuItem
          onClick={() => {
            setPrettifyJson(!prettifyJson);
          }}
        >
          <ListItemIcon>
            {prettifyJson && <CheckIcon fontSize="small" color="primary" />}
          </ListItemIcon>
          <ListItemText inset={!prettifyJson}>Prettify JSON</ListItemText>
        </MenuItem>

        <Divider sx={{ my: 0.5 }} />

        <MenuItem onClick={resetToDefaults}>
          <ListItemIcon>
            <RestoreIcon fontSize="small" />
          </ListItemIcon>
          <ListItemText>Reset to Defaults</ListItemText>
        </MenuItem>
      </Menu>

      {/* View Mode Submenu */}
      <Menu
        open={submenu.type === 'view'}
        onClose={handleSubmenuClose}
        anchorEl={submenu.anchorEl}
        anchorOrigin={{ vertical: 'top', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'left' }}
        PaperProps={{
          sx: {
            ml: 0.5,
            minWidth: 180,
            borderRadius: 2,
            boxShadow: theme.shadows[4],
          },
        }}
        onMouseLeave={handleSubmenuClose}
      >
        {[
          { label: 'Compact', value: 100 },
          { label: 'Normal', value: 250 },
          { label: 'Detailed', value: 500 },
          { label: 'Full', value: Number.POSITIVE_INFINITY },
        ].map((mode) => (
          <MenuItem
            key={mode.label}
            onClick={() => {
              setMaxTextLength(mode.value);
              handleClose();
            }}
            selected={
              (mode.value === Number.POSITIVE_INFINITY &&
                maxTextLength === Number.POSITIVE_INFINITY) ||
              (mode.value !== Number.POSITIVE_INFINITY &&
                maxTextLength <= mode.value &&
                maxTextLength >
                  (mode.value === 100
                    ? 0
                    : [100, 250, 500][['Compact', 'Normal', 'Detailed'].indexOf(mode.label) - 1]))
            }
          >
            <ListItemText>{mode.label}</ListItemText>
            <Typography variant="caption" color="text.secondary" sx={{ ml: 2 }}>
              {mode.value === Number.POSITIVE_INFINITY ? 'Unlimited' : `${mode.value} chars`}
            </Typography>
          </MenuItem>
        ))}
      </Menu>

      {/* Text Settings Submenu */}
      <Menu
        open={submenu.type === 'text'}
        onClose={handleSubmenuClose}
        anchorEl={submenu.anchorEl}
        anchorOrigin={{ vertical: 'top', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'left' }}
        PaperProps={{
          sx: {
            ml: 0.5,
            p: 2,
            minWidth: 280,
            borderRadius: 2,
            boxShadow: theme.shadows[4],
          },
        }}
        onMouseLeave={handleSubmenuClose}
      >
        <Box sx={{ mb: 2 }}>
          <Typography variant="body2" fontWeight={500} gutterBottom>
            Maximum Text Length
          </Typography>
          <Typography
            variant="caption"
            color="text.secondary"
            gutterBottom
            display="block"
            sx={{ mb: 1 }}
          >
            {maxTextLength === Number.POSITIVE_INFINITY
              ? 'Unlimited'
              : `${maxTextLength} characters`}
          </Typography>
          <Slider
            value={maxTextLength === Number.POSITIVE_INFINITY ? 1001 : maxTextLength}
            onChange={(_, value) => {
              const newValue = value as number;
              setMaxTextLength(newValue === 1001 ? Number.POSITIVE_INFINITY : newValue);
            }}
            min={25}
            max={1001}
            step={25}
            marks={[
              { value: 100, label: '100' },
              { value: 500, label: '500' },
              { value: 1001, label: '∞' },
            ]}
          />
        </Box>

        <Divider sx={{ my: 2 }} />

        <MenuItem
          dense
          onClick={() => setWordBreak(wordBreak === 'break-all' ? 'break-word' : 'break-all')}
        >
          <ListItemIcon>
            {wordBreak === 'break-all' && <CheckIcon fontSize="small" color="primary" />}
          </ListItemIcon>
          <ListItemText inset={wordBreak !== 'break-all'}>
            Force line breaks at any character
          </ListItemText>
        </MenuItem>
      </Menu>

      {/* Image Settings Submenu */}
      <Menu
        open={submenu.type === 'image'}
        onClose={handleSubmenuClose}
        anchorEl={submenu.anchorEl}
        anchorOrigin={{ vertical: 'top', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'left' }}
        PaperProps={{
          sx: {
            ml: 0.5,
            p: 2,
            minWidth: 280,
            borderRadius: 2,
            boxShadow: theme.shadows[4],
          },
        }}
        onMouseLeave={handleSubmenuClose}
      >
        <Box sx={{ mb: 3 }}>
          <Typography variant="body2" fontWeight={500} gutterBottom>
            Maximum Width
          </Typography>
          <Typography
            variant="caption"
            color="text.secondary"
            gutterBottom
            display="block"
            sx={{ mb: 1 }}
          >
            {maxImageWidth}px
          </Typography>
          <Slider
            value={maxImageWidth}
            onChange={(_, value) => setMaxImageWidth(value as number)}
            min={100}
            max={1000}
            step={50}
            marks={[
              { value: 100, label: '100' },
              { value: 500, label: '500' },
              { value: 1000, label: '1000' },
            ]}
          />
        </Box>

        <Box>
          <Typography variant="body2" fontWeight={500} gutterBottom>
            Maximum Height
          </Typography>
          <Typography
            variant="caption"
            color="text.secondary"
            gutterBottom
            display="block"
            sx={{ mb: 1 }}
          >
            {maxImageHeight}px
          </Typography>
          <Slider
            value={maxImageHeight}
            onChange={(_, value) => setMaxImageHeight(value as number)}
            min={100}
            max={1000}
            step={50}
            marks={[
              { value: 100, label: '100' },
              { value: 500, label: '500' },
              { value: 1000, label: '1000' },
            ]}
          />
        </Box>
      </Menu>
    </>
  );
};

export default React.memo(ContextMenuSettings);
