import React, { useState } from 'react';
import type { LinkProps } from 'react-router-dom';
import { Link, useLocation } from 'react-router-dom';
import { IS_RUNNING_LOCALLY } from '@app/constants';
import EngineeringIcon from '@mui/icons-material/Engineering';
import InfoIcon from '@mui/icons-material/Info';
import type { ButtonProps } from '@mui/material';
import { AppBar, Toolbar, Button, IconButton, Box, Tooltip } from '@mui/material';
import { styled } from '@mui/material/styles';
import ApiSettingsModal from './ApiSettingsModal';
import DarkMode from './DarkMode';
import InfoModal from './InfoModal';
import Logo from './Logo';
import './Navigation.css';

const NavButton = styled(Button)<ButtonProps & LinkProps>(({ theme }) => ({
  color: theme.palette.text.primary,
  '&:hover': {
    backgroundColor: theme.palette.action.hover,
  },
  '&.active': {
    backgroundColor: theme.palette.action.selected,
  },
}));

const StyledAppBar = styled(AppBar)(({ theme }) => ({
  backgroundColor: theme.palette.background.paper,
  color: theme.palette.text.primary,
  boxShadow: theme.shadows[1],
  marginBottom: theme.spacing(2),
}));

const NavToolbar = styled(Toolbar)({
  justifyContent: 'space-between',
});

const NavSection = styled(Box)({
  display: 'flex',
  alignItems: 'center',
  gap: '1rem',
});

function NavLink({ href, label }: { href: string; label: string }) {
  const location = useLocation();
  const isActive = location.pathname.startsWith(href);

  return (
    <NavButton component={Link} to={href} className={isActive ? 'active' : ''}>
      {label}
    </NavButton>
  );
}

export default function Navigation({
  darkMode,
  onToggleDarkMode,
}: {
  darkMode: boolean;
  onToggleDarkMode: () => void;
}) {
  const [showInfoModal, setShowInfoModal] = useState<boolean>(false);
  const [showApiSettingsModal, setShowApiSettingsModal] = useState<boolean>(false);

  const handleModalToggle = () => setShowInfoModal((prevState) => !prevState);
  const handleApiSettingsModalToggle = () => setShowApiSettingsModal((prevState) => !prevState);

  return (
    <>
      <StyledAppBar position="static" elevation={0}>
        <NavToolbar>
          <NavSection>
            <Logo />
            <NavLink href="/setup" label="Create" />
            <NavLink href="/eval" label="Evals" />
            <NavLink href="/prompts" label="Prompts" />
            <NavLink href="/datasets" label="Datasets" />
            <NavLink href="/progress" label="Progress" />
            <NavLink href="https://promptfoo.dev/careers" label="Careers" />
          </NavSection>
          <NavSection>
            <IconButton onClick={handleModalToggle} color="inherit">
              <InfoIcon />
            </IconButton>
            {IS_RUNNING_LOCALLY && (
              <Tooltip title="API and Sharing Settings">
                <IconButton onClick={handleApiSettingsModalToggle} color="inherit">
                  <EngineeringIcon />
                </IconButton>
              </Tooltip>
            )}
            <DarkMode onToggleDarkMode={onToggleDarkMode} />
          </NavSection>
        </NavToolbar>
      </StyledAppBar>
      <InfoModal open={showInfoModal} onClose={handleModalToggle} />
      <ApiSettingsModal open={showApiSettingsModal} onClose={handleApiSettingsModalToggle} />
    </>
  );
}
