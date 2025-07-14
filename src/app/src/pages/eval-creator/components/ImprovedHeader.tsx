import React from 'react';
import {
  Box,
  Container,
  Stack,
  Typography,
  Button,
  IconButton,
  ButtonGroup,
  Tooltip,
  Divider,
  Menu,
  MenuItem,
  ListItemIcon,
  ListItemText,
  ToggleButton,
  ToggleButtonGroup,
} from '@mui/material';
import MoreVertIcon from '@mui/icons-material/MoreVert';
import SaveIcon from '@mui/icons-material/Save';
import RestoreIcon from '@mui/icons-material/Restore';
import HelpOutlineIcon from '@mui/icons-material/HelpOutline';
import SettingsIcon from '@mui/icons-material/Settings';
import FolderOpenIcon from '@mui/icons-material/FolderOpen';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import UndoIcon from '@mui/icons-material/Undo';
import RedoIcon from '@mui/icons-material/Redo';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import SchoolIcon from '@mui/icons-material/School';
import SpeedIcon from '@mui/icons-material/Speed';
import { useUserPreferences } from '@app/stores/userPreferences';

interface ImprovedHeaderProps {
  runButton?: React.ReactNode;
  onTemplates: () => void;
  onTutorial: () => void;
  onReset: () => void;
  onConfigureEnv: () => void;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  autoSaveComponent: React.ReactNode;
  savedDataComponent: React.ReactNode;
}

const ImprovedHeader: React.FC<ImprovedHeaderProps> = ({
  runButton,
  onTemplates,
  onTutorial,
  onReset,
  onConfigureEnv,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  autoSaveComponent,
  savedDataComponent,
}) => {
  const [moreMenuAnchor, setMoreMenuAnchor] = React.useState<null | HTMLElement>(null);
  const { experienceMode, setExperienceMode } = useUserPreferences();

  const handleMoreClick = (event: React.MouseEvent<HTMLElement>) => {
    setMoreMenuAnchor(event.currentTarget);
  };

  const handleMoreClose = () => {
    setMoreMenuAnchor(null);
  };

  return (
    <Box
      sx={{
        position: 'sticky',
        top: 0,
        bgcolor: 'background.paper',
        zIndex: 1100,
        borderBottom: '1px solid',
        borderColor: 'divider',
        boxShadow: (theme) => theme.shadows[1],
      }}
    >
      <Container maxWidth="lg">
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            py: 2,
            gap: 3,
          }}
        >
          {/* Left side - Title and status */}
          <Stack direction="row" spacing={2} alignItems="baseline">
            <Typography
              variant="h6"
              component="h1"
              sx={{
                fontWeight: 500,
                color: 'text.primary',
              }}
            >
              Create eval
            </Typography>
            {autoSaveComponent}
          </Stack>

          {/* Right side - Actions */}
          <Stack direction="row" spacing={1} alignItems="center">
            {/* Undo/Redo group */}
            <ButtonGroup size="small" variant="outlined">
              <Tooltip title="Undo (Ctrl+Z)">
                <span>
                  <IconButton
                    size="small"
                    onClick={onUndo}
                    disabled={!canUndo}
                    sx={{ border: 'none' }}
                  >
                    <UndoIcon fontSize="small" />
                  </IconButton>
                </span>
              </Tooltip>
              <Tooltip title="Redo (Ctrl+Shift+Z)">
                <span>
                  <IconButton
                    size="small"
                    onClick={onRedo}
                    disabled={!canRedo}
                    sx={{ border: 'none' }}
                  >
                    <RedoIcon fontSize="small" />
                  </IconButton>
                </span>
              </Tooltip>
            </ButtonGroup>

            <Divider orientation="vertical" flexItem sx={{ mx: 1 }} />

            {/* Experience mode toggle */}
            <ToggleButtonGroup
              value={experienceMode}
              exclusive
              onChange={(_, newMode) => {
                if (newMode !== null) {
                  setExperienceMode(newMode);
                }
              }}
              size="small"
              sx={{ height: 32 }}
            >
              <ToggleButton value="beginner" aria-label="Beginner mode">
                <Tooltip title="Show all help text">
                  <SchoolIcon sx={{ fontSize: 18 }} />
                </Tooltip>
              </ToggleButton>
              <ToggleButton value="experienced" aria-label="Experienced mode">
                <Tooltip title="Hide help text">
                  <SpeedIcon sx={{ fontSize: 18 }} />
                </Tooltip>
              </ToggleButton>
            </ToggleButtonGroup>

            <Divider orientation="vertical" flexItem sx={{ mx: 1 }} />

            {/* Quick actions */}
            <Button
              variant="outlined"
              size="small"
              startIcon={<AutoAwesomeIcon />}
              onClick={onTemplates}
              sx={{ textTransform: 'none' }}
            >
              Templates
            </Button>

            {savedDataComponent}

            <Divider orientation="vertical" flexItem sx={{ mx: 1 }} />

            {/* Primary action */}
            {runButton || (
              <Button
                variant="contained"
                color="primary"
                size="medium"
                startIcon={<PlayArrowIcon />}
                disabled
                sx={{
                  textTransform: 'none',
                  fontWeight: 600,
                  px: 3,
                }}
              >
                Run eval
              </Button>
            )}

            {/* More menu for less common actions */}
            <Tooltip title="More options">
              <IconButton onClick={handleMoreClick} size="small" sx={{ ml: 0.5 }}>
                <MoreVertIcon />
              </IconButton>
            </Tooltip>
            <Menu
              anchorEl={moreMenuAnchor}
              open={Boolean(moreMenuAnchor)}
              onClose={handleMoreClose}
              anchorOrigin={{
                vertical: 'bottom',
                horizontal: 'right',
              }}
              transformOrigin={{
                vertical: 'top',
                horizontal: 'right',
              }}
            >
              <MenuItem
                onClick={() => {
                  handleMoreClose();
                  onTutorial();
                }}
              >
                <ListItemIcon>
                  <HelpOutlineIcon fontSize="small" />
                </ListItemIcon>
                <ListItemText>Tutorial</ListItemText>
              </MenuItem>
              <MenuItem
                onClick={() => {
                  handleMoreClose();
                  onConfigureEnv();
                }}
              >
                <ListItemIcon>
                  <SettingsIcon fontSize="small" />
                </ListItemIcon>
                <ListItemText>Configure Environment</ListItemText>
              </MenuItem>
              <Divider />
              <MenuItem
                onClick={() => {
                  handleMoreClose();
                  onReset();
                }}
              >
                <ListItemIcon>
                  <RestoreIcon fontSize="small" />
                </ListItemIcon>
                <ListItemText>Reset All</ListItemText>
              </MenuItem>
            </Menu>
          </Stack>
        </Box>
      </Container>
    </Box>
  );
};

export default React.memo(ImprovedHeader);
