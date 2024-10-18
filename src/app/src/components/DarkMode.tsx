import React from 'react';
import DarkModeIcon from '@mui/icons-material/DarkMode';
import LightModeIcon from '@mui/icons-material/LightMode';
import IconButton from '@mui/material/IconButton';
import { useTheme } from '@mui/material/styles';
import { styled } from '@mui/material/styles';

const StyledIconButton = styled(IconButton)(({ theme }) => ({
  padding: 8,
  borderRadius: '50%',
  transition: theme.transitions.create(['background-color', 'transform'], {
    duration: theme.transitions.duration.standard,
  }),
  '&:hover': {
    backgroundColor: 'rgba(0, 0, 0, 0.04)',
    transform: 'rotate(15deg)',
  },
}));

const AnimatedIcon = styled('div')(({ theme }) => ({
  display: 'flex',
  transition: theme.transitions.create(['opacity', 'transform'], {
    duration: theme.transitions.duration.standard,
  }),
}));

interface DarkModeToggleProps {
  onToggleDarkMode: () => void;
}

const DarkModeToggle = React.memo(({ onToggleDarkMode }: DarkModeToggleProps) => {
  const theme = useTheme();
  const isDarkMode = theme.palette.mode === 'dark';

  return (
    <StyledIconButton
      onClick={onToggleDarkMode}
      aria-label={isDarkMode ? 'Switch to light mode' : 'Switch to dark mode'}
    >
      <AnimatedIcon
        sx={{
          opacity: isDarkMode ? 1 : 0,
          transform: isDarkMode ? 'rotate(0deg)' : 'rotate(-90deg)',
          position: 'absolute',
        }}
      >
        <DarkModeIcon />
      </AnimatedIcon>
      <AnimatedIcon
        sx={{
          opacity: isDarkMode ? 0 : 1,
          transform: isDarkMode ? 'rotate(90deg)' : 'rotate(0deg)',
        }}
      >
        <LightModeIcon />
      </AnimatedIcon>
    </StyledIconButton>
  );
});

DarkModeToggle.displayName = 'DarkModeToggle';

export default DarkModeToggle;
