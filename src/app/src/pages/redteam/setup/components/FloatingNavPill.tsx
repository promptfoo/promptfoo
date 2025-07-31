import React, { useState } from 'react';

import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import CloseIcon from '@mui/icons-material/Close';
import MenuIcon from '@mui/icons-material/Menu';
import NavigateBeforeIcon from '@mui/icons-material/NavigateBefore';
import NavigateNextIcon from '@mui/icons-material/NavigateNext';
import SaveIcon from '@mui/icons-material/Save';
import Box from '@mui/material/Box';
import CircularProgress from '@mui/material/CircularProgress';
import Collapse from '@mui/material/Collapse';
import Fab from '@mui/material/Fab';
import IconButton from '@mui/material/IconButton';
import Paper from '@mui/material/Paper';
import { alpha, styled } from '@mui/material/styles';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import Zoom from '@mui/material/Zoom';

interface NavSection {
  id: string;
  label: string;
  icon: React.ReactNode;
  completed?: boolean;
  inProgress?: boolean;
}

interface FloatingNavPillProps {
  sections: NavSection[];
  activeSection: number;
  onSectionChange: (index: number) => void;
  configName?: string;
  hasUnsavedChanges?: boolean;
  onSave: () => void;
  autoSaving?: boolean;
}

const FloatingContainer = styled(Box)(({ theme }) => ({
  position: 'fixed',
  bottom: 24,
  left: '50%',
  transform: 'translateX(-50%)',
  zIndex: 1200,
}));

const NavPill = styled(Paper)(({ theme }) => ({
  display: 'flex',
  alignItems: 'center',
  padding: theme.spacing(0.5),
  borderRadius: 40,
  backgroundColor:
    theme.palette.mode === 'dark'
      ? alpha(theme.palette.background.paper, 0.95)
      : theme.palette.background.paper,
  backdropFilter: 'blur(20px)',
  boxShadow: theme.shadows[8],
  gap: theme.spacing(0.5),
  transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
}));

const StepDots = styled(Box)(({ theme }) => ({
  display: 'flex',
  alignItems: 'center',
  gap: theme.spacing(0.75),
  padding: theme.spacing(0, 1.5),
}));

const StepDot = styled(Box)<{ active?: boolean; completed?: boolean }>(
  ({ theme, active, completed }) => ({
    width: 8,
    height: 8,
    borderRadius: '50%',
    backgroundColor: completed
      ? theme.palette.success.main
      : active
        ? theme.palette.primary.main
        : alpha(theme.palette.action.disabled, 0.3),
    transition: 'all 0.2s ease',
    cursor: 'pointer',
    position: 'relative',
    '&:hover': {
      transform: 'scale(1.5)',
    },
    '&::after': {
      content: '""',
      position: 'absolute',
      top: '50%',
      left: '50%',
      transform: 'translate(-50%, -50%)',
      width: active ? 16 : 0,
      height: active ? 16 : 0,
      borderRadius: '50%',
      border: `2px solid ${theme.palette.primary.main}`,
      transition: 'all 0.2s ease',
    },
  }),
);

const NavButton = styled(IconButton)(({ theme }) => ({
  width: 36,
  height: 36,
  '&:hover': {
    backgroundColor: alpha(theme.palette.action.hover, 0.8),
  },
}));

const SaveButton = styled(Fab)(({ theme }) => ({
  width: 36,
  height: 36,
  minHeight: 36,
  backgroundColor: theme.palette.warning.main,
  color: theme.palette.warning.contrastText,
  '&:hover': {
    backgroundColor: theme.palette.warning.dark,
  },
}));

const ExpandedView = styled(Paper)(({ theme }) => ({
  position: 'absolute',
  bottom: 60,
  left: '50%',
  transform: 'translateX(-50%)',
  padding: theme.spacing(2),
  borderRadius: theme.shape.borderRadius,
  backgroundColor:
    theme.palette.mode === 'dark'
      ? alpha(theme.palette.background.paper, 0.95)
      : theme.palette.background.paper,
  backdropFilter: 'blur(20px)',
  boxShadow: theme.shadows[12],
  minWidth: 300,
}));

const SectionGrid = styled(Box)(({ theme }) => ({
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))',
  gap: theme.spacing(1),
  marginTop: theme.spacing(2),
}));

const SectionCard = styled(Box)<{ active?: boolean; completed?: boolean }>(
  ({ theme, active, completed }) => ({
    padding: theme.spacing(1.5),
    borderRadius: theme.shape.borderRadius,
    border: `1px solid ${
      active
        ? theme.palette.primary.main
        : completed
          ? alpha(theme.palette.success.main, 0.3)
          : alpha(theme.palette.divider, 0.2)
    }`,
    backgroundColor: active ? alpha(theme.palette.primary.main, 0.1) : 'transparent',
    cursor: 'pointer',
    transition: 'all 0.2s ease',
    textAlign: 'center',
    '&:hover': {
      backgroundColor: alpha(theme.palette.action.hover, 0.8),
      transform: 'translateY(-2px)',
      boxShadow: theme.shadows[2],
    },
    '& .MuiSvgIcon-root': {
      fontSize: 24,
      marginBottom: theme.spacing(0.5),
      color: completed
        ? theme.palette.success.main
        : active
          ? theme.palette.primary.main
          : theme.palette.text.secondary,
    },
  }),
);

export default function FloatingNavPill({
  sections,
  activeSection,
  onSectionChange,
  configName = 'New Configuration',
  hasUnsavedChanges = false,
  onSave,
  autoSaving = false,
}: FloatingNavPillProps) {
  const [expanded, setExpanded] = useState(false);

  const currentSection = sections[activeSection];
  const canGoBack = activeSection > 0;
  const canGoNext = activeSection < sections.length - 1;
  const completedSections = sections.filter((s) => s.completed).length;

  const handlePrevious = () => {
    if (canGoBack) {
      onSectionChange(activeSection - 1);
    }
  };

  const handleNext = () => {
    if (canGoNext) {
      onSectionChange(activeSection + 1);
    }
  };

  return (
    <FloatingContainer>
      <Collapse in={expanded}>
        <ExpandedView>
          <Box
            sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}
          >
            <Typography variant="subtitle2" fontWeight={600}>
              {configName}
            </Typography>
            <IconButton size="small" onClick={() => setExpanded(false)}>
              <CloseIcon fontSize="small" />
            </IconButton>
          </Box>

          <Typography variant="caption" color="text.secondary">
            Progress: {completedSections}/{sections.length} completed
          </Typography>

          <SectionGrid>
            {sections.map((section, index) => (
              <Tooltip key={section.id} title={`${section.label} (⌘${index + 1})`}>
                <SectionCard
                  active={activeSection === index}
                  completed={section.completed}
                  onClick={() => {
                    onSectionChange(index);
                    setExpanded(false);
                  }}
                >
                  {section.inProgress ? (
                    <CircularProgress size={24} thickness={4} />
                  ) : section.completed ? (
                    <CheckCircleIcon />
                  ) : (
                    section.icon
                  )}
                  <Typography variant="caption" display="block">
                    {section.label}
                  </Typography>
                </SectionCard>
              </Tooltip>
            ))}
          </SectionGrid>
        </ExpandedView>
      </Collapse>

      <NavPill>
        <Tooltip title="Menu">
          <NavButton size="small" onClick={() => setExpanded(!expanded)}>
            <MenuIcon fontSize="small" />
          </NavButton>
        </Tooltip>

        <Tooltip title="Previous section">
          <span>
            <NavButton size="small" onClick={handlePrevious} disabled={!canGoBack}>
              <NavigateBeforeIcon fontSize="small" />
            </NavButton>
          </span>
        </Tooltip>

        <StepDots>
          {sections.map((section, index) => (
            <Tooltip key={section.id} title={section.label} TransitionComponent={Zoom}>
              <StepDot
                active={activeSection === index}
                completed={section.completed}
                onClick={() => onSectionChange(index)}
              />
            </Tooltip>
          ))}
        </StepDots>

        <Tooltip title="Next section">
          <span>
            <NavButton size="small" onClick={handleNext} disabled={!canGoNext}>
              <NavigateNextIcon fontSize="small" />
            </NavButton>
          </span>
        </Tooltip>

        {hasUnsavedChanges && (
          <Tooltip title="Save changes (⌘S)">
            <SaveButton size="small" onClick={onSave} disabled={autoSaving}>
              {autoSaving ? (
                <CircularProgress size={20} thickness={4} color="inherit" />
              ) : (
                <SaveIcon sx={{ fontSize: 18 }} />
              )}
            </SaveButton>
          </Tooltip>
        )}

        <Box sx={{ px: 1.5 }}>
          <Typography variant="caption" fontWeight={500} noWrap>
            {currentSection?.label}
          </Typography>
        </Box>
      </NavPill>
    </FloatingContainer>
  );
}
