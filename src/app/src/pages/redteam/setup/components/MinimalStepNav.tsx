import React from 'react';

import Box from '@mui/material/Box';
import ButtonBase from '@mui/material/ButtonBase';
import { alpha, styled } from '@mui/material/styles';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';

interface StepSection {
  id: string;
  label: string;
  tooltip?: string;
}

interface MinimalStepNavProps {
  sections: StepSection[];
  activeSection: number;
  onSectionChange: (index: number) => void;
  position?: 'top' | 'bottom';
}

// Ultra-minimal numbered steps (24px height)
const StepContainer = styled(Box)<{ position?: 'top' | 'bottom' }>(
  ({ theme, position = 'top' }) => ({
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: theme.spacing(0.5),
    backgroundColor: alpha(theme.palette.background.paper, 0.8),
    borderTop: position === 'bottom' ? `1px solid ${theme.palette.divider}` : 'none',
    borderBottom: position === 'top' ? `1px solid ${theme.palette.divider}` : 'none',
    gap: theme.spacing(0.5),
    minHeight: 32,
    position: position === 'bottom' ? 'fixed' : 'relative',
    bottom: position === 'bottom' ? 0 : 'auto',
    left: 0,
    right: 0,
    zIndex: 100,
  }),
);

const StepDot = styled(ButtonBase)<{ active?: boolean; completed?: boolean }>(
  ({ theme, active, completed }) => ({
    width: 24,
    height: 24,
    borderRadius: '50%',
    fontSize: '0.75rem',
    fontWeight: 600,
    transition: 'all 0.2s ease',
    border: `2px solid ${
      active
        ? theme.palette.primary.main
        : completed
          ? theme.palette.success.main
          : theme.palette.divider
    }`,
    backgroundColor: active ? theme.palette.primary.main : 'transparent',
    color: active
      ? theme.palette.primary.contrastText
      : completed
        ? theme.palette.success.main
        : theme.palette.text.secondary,
    '&:hover': {
      transform: 'scale(1.1)',
      backgroundColor: active ? theme.palette.primary.dark : alpha(theme.palette.action.hover, 0.8),
    },
  }),
);

const Connector = styled(Box)<{ completed?: boolean }>(({ theme, completed }) => ({
  flex: '1 1 auto',
  height: 2,
  maxWidth: 40,
  backgroundColor: completed ? theme.palette.success.main : theme.palette.divider,
  transition: 'background-color 0.3s ease',
}));

// Even more minimal - just active section name (20px height)
const SingleLineNav = styled(Box)(({ theme }) => ({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: theme.spacing(0.25, 2),
  backgroundColor: alpha(theme.palette.background.default, 0.6),
  borderBottom: `1px solid ${alpha(theme.palette.divider, 0.5)}`,
  minHeight: 28,
  fontSize: '0.8125rem',
  color: theme.palette.text.secondary,
}));

const NavText = styled(ButtonBase)(({ theme }) => ({
  padding: theme.spacing(0.25, 1),
  borderRadius: theme.shape.borderRadius,
  fontSize: '0.8125rem',
  color: theme.palette.text.primary,
  '&:hover': {
    backgroundColor: alpha(theme.palette.action.hover, 0.5),
  },
}));

const StepIndicator = styled(Typography)(({ theme }) => ({
  fontSize: '0.75rem',
  color: theme.palette.text.secondary,
  marginRight: theme.spacing(1),
}));

export function NumberedSteps({
  sections,
  activeSection,
  onSectionChange,
  position = 'top',
}: MinimalStepNavProps) {
  return (
    <StepContainer position={position}>
      {sections.map((section, index) => (
        <React.Fragment key={section.id}>
          {index > 0 && <Connector completed={index <= activeSection} />}
          <Tooltip title={section.tooltip || section.label}>
            <StepDot
              active={activeSection === index}
              completed={index < activeSection}
              onClick={() => onSectionChange(index)}
            >
              {index + 1}
            </StepDot>
          </Tooltip>
        </React.Fragment>
      ))}
    </StepContainer>
  );
}

export function SingleLineNavigation({
  sections,
  activeSection,
  onSectionChange,
}: Omit<MinimalStepNavProps, 'position'>) {
  const [menuAnchor, setMenuAnchor] = React.useState<null | HTMLElement>(null);

  return (
    <SingleLineNav>
      <StepIndicator>
        Step {activeSection + 1} of {sections.length}:
      </StepIndicator>
      <NavText onClick={(e) => setMenuAnchor(e.currentTarget)}>
        {sections[activeSection]?.label} ▼
      </NavText>

      <Box
        component="select"
        sx={{
          position: 'absolute',
          opacity: 0,
          pointerEvents: 'all',
          cursor: 'pointer',
          width: '200px',
          height: '100%',
        }}
        value={activeSection}
        onChange={(e) => onSectionChange(Number(e.target.value))}
      >
        {sections.map((section, index) => (
          <option key={section.id} value={index}>
            {section.label}
          </option>
        ))}
      </Box>
    </SingleLineNav>
  );
}

// Ultra-minimal keyboard-only navigation (0px - no UI)
export function useKeyboardNavigation(
  sections: StepSection[],
  activeSection: number,
  onSectionChange: (index: number) => void,
) {
  React.useEffect(() => {
    const handleKeyPress = (e: KeyboardEvent) => {
      // Alt + number to jump to section
      if (e.altKey && e.key >= '1' && e.key <= '9') {
        const index = parseInt(e.key) - 1;
        if (index < sections.length) {
          e.preventDefault();
          onSectionChange(index);
        }
      }
      // Arrow keys for prev/next
      else if (e.key === 'ArrowLeft' && activeSection > 0) {
        e.preventDefault();
        onSectionChange(activeSection - 1);
      } else if (e.key === 'ArrowRight' && activeSection < sections.length - 1) {
        e.preventDefault();
        onSectionChange(activeSection + 1);
      }
    };

    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, [sections.length, activeSection, onSectionChange]);
}
