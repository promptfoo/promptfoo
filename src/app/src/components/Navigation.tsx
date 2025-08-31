import React, { useState } from 'react';
import { IS_RUNNING_LOCALLY } from '@app/constants';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import EngineeringIcon from '@mui/icons-material/Engineering';
import InfoIcon from '@mui/icons-material/Info';
import AppBar from '@mui/material/AppBar';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import IconButton from '@mui/material/IconButton';
import MenuItem from '@mui/material/MenuItem';
import MenuList from '@mui/material/MenuList';
import Paper from '@mui/material/Paper';
import Popper from '@mui/material/Popper';
import { styled } from '@mui/material/styles';
import Toolbar from '@mui/material/Toolbar';
import Tooltip from '@mui/material/Tooltip';
import { Link, useLocation } from 'react-router-dom';
import ApiSettingsModal from './ApiSettingsModal';
import DarkMode from './DarkMode';
import InfoModal from './InfoModal';
import Logo from './Logo';
import type { ButtonProps } from '@mui/material/Button';
import './Navigation.css';

const NavButton = styled(Button)<ButtonProps>(({ theme }) => ({
  color: theme.palette.text.primary,
  padding: theme.spacing(0.5, 1),
  minWidth: 'auto',
  '&:hover': {
    backgroundColor: theme.palette.action.hover,
  },
  '&.active': {
    backgroundColor: theme.palette.action.selected,
  },
  [theme.breakpoints.down('lg')]: {
    fontSize: '0.9rem',
  },
  [theme.breakpoints.down('md')]: {
    fontSize: '0.85rem',
  },
}));

const StyledAppBar = styled(AppBar)(({ theme }) => ({
  backgroundColor: theme.palette.background.paper,
  color: theme.palette.text.primary,
  boxShadow: theme.shadows[1],
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
    <Link to={href} style={{ textDecoration: 'none' }}>
      <NavButton className={isActive ? 'active' : ''}>{label}</NavButton>
    </Link>
  );
}

type ActiveMenu = 'create' | 'evals' | null;

function CreateDropdown({
  activeMenu,
  setActiveMenu,
}: {
  activeMenu: ActiveMenu;
  setActiveMenu: (menu: ActiveMenu) => void;
}) {
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const location = useLocation();

  const handleClick = (event: React.MouseEvent<HTMLElement>) => {
    setAnchorEl(event.currentTarget);
    setActiveMenu('create');
  };

  const handleClose = () => {
    setActiveMenu(null);
  };

  const handleMouseEnter = (event: React.MouseEvent<HTMLElement>) => {
    setAnchorEl(event.currentTarget);
    setActiveMenu('create');
  };

  const handleMouseLeave = () => {
    setActiveMenu(null);
  };

  const isActive = ['/setup', '/redteam/setup'].some((route) =>
    location.pathname.startsWith(route),
  );

  const menuItems = [
    {
      href: '/setup',
      label: 'Eval',
      description: 'Create and configure evaluation tests',
    },
    {
      href: '/redteam/setup',
      label: 'Red Team',
      description: 'Set up security testing scenarios',
    },
  ];

  const isOpen = activeMenu === 'create';

  return (
    <>
      <Button
        onClick={handleClick}
        onMouseEnter={handleMouseEnter}
        endIcon={
          <ExpandMoreIcon
            sx={{
              transform: isOpen ? 'rotate(180deg)' : 'none',
              transition: 'transform 0.3s',
              fontSize: '1rem',
              opacity: 0.5,
            }}
          />
        }
        sx={{
          color: 'text.primary',
          position: 'relative',
          borderRadius: isOpen ? '4px 4px 0 0' : '4px',
          transition: 'all 0.2s ease',
          '&:hover': {
            backgroundColor: 'action.hover',
          },
          ...(isOpen && {
            backgroundColor: 'background.paper',
            boxShadow: (theme) =>
              `0 -2px 8px ${theme.palette.mode === 'dark' ? 'rgba(0,0,0,0.3)' : 'rgba(0,0,0,0.1)'}`,
            zIndex: 1301,
          }),
          ...(isActive && {
            backgroundColor: 'action.selected',
          }),
        }}
      >
        Create
      </Button>
      <Popper
        anchorEl={anchorEl}
        open={isOpen}
        placement="bottom-start"
        onMouseLeave={handleMouseLeave}
        sx={{ zIndex: 1300 }}
        modifiers={[
          {
            name: 'offset',
            options: {
              offset: [0, -1],
            },
          },
        ]}
      >
        <Box sx={{ pt: 1 }}>
          <Paper
            elevation={3}
            sx={{
              width: 320,
              maxWidth: '90vw',
              borderRadius: '0 0 8px 8px',
              overflow: 'hidden',
              position: 'relative',
              boxShadow: (theme) =>
                `0 4px 20px ${theme.palette.mode === 'dark' ? 'rgba(0,0,0,0.5)' : 'rgba(0,0,0,0.15)'}`,
            }}
          >
            <MenuList sx={{ py: 1 }}>
              {menuItems.map((item) => (
                <MenuItem
                  key={item.href}
                  onClick={handleClose}
                  sx={{
                    py: 1.5,
                    px: 2.5,
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'flex-start',
                    minHeight: 'auto',
                    whiteSpace: 'normal',
                    transition: 'background-color 0.2s ease',
                    '&:hover': {
                      backgroundColor: 'action.hover',
                    },
                    '&:not(:last-child)': {
                      borderBottom: '1px solid',
                      borderBottomColor: 'divider',
                    },
                  }}
                >
                  <Link
                    to={item.href}
                    style={{ textDecoration: 'none', color: 'inherit', width: '100%' }}
                  >
                    <Box sx={{ width: '100%' }}>
                      <Box
                        sx={{
                          fontSize: '0.875rem',
                          fontWeight: 500,
                          color: 'text.primary',
                          mb: 0.25,
                          letterSpacing: '-0.01em',
                        }}
                      >
                        {item.label}
                      </Box>
                      <Box
                        sx={{
                          fontSize: '0.8125rem',
                          color: 'text.secondary',
                          lineHeight: 1.4,
                          whiteSpace: 'normal',
                          opacity: 0.8,
                        }}
                      >
                        {item.description}
                      </Box>
                    </Box>
                  </Link>
                </MenuItem>
              ))}
            </MenuList>
          </Paper>
        </Box>
      </Popper>
    </>
  );
}

function EvalsDropdown({
  activeMenu,
  setActiveMenu,
}: {
  activeMenu: ActiveMenu;
  setActiveMenu: (menu: ActiveMenu) => void;
}) {
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const location = useLocation();

  const handleClick = (event: React.MouseEvent<HTMLElement>) => {
    setAnchorEl(event.currentTarget);
    setActiveMenu('evals');
  };

  const handleClose = () => {
    setActiveMenu(null);
  };

  const handleMouseEnter = (event: React.MouseEvent<HTMLElement>) => {
    setAnchorEl(event.currentTarget);
    setActiveMenu('evals');
  };

  const handleMouseLeave = () => {
    setActiveMenu(null);
  };

  const isActive = ['/eval', '/evals'].some((route) => location.pathname.startsWith(route));

  const menuItems = [
    {
      href: '/eval',
      label: 'Latest Eval',
      description: 'View your most recent evaluation results',
    },
    {
      href: '/evals',
      label: 'All Evals',
      description: 'Browse and manage all evaluation runs',
    },
  ];

  const isOpen = activeMenu === 'evals';

  return (
    <>
      <Button
        onClick={handleClick}
        onMouseEnter={handleMouseEnter}
        endIcon={
          <ExpandMoreIcon
            sx={{
              transform: isOpen ? 'rotate(180deg)' : 'none',
              transition: 'transform 0.3s',
              fontSize: '1rem',
              opacity: 0.5,
            }}
          />
        }
        sx={{
          color: 'text.primary',
          position: 'relative',
          borderRadius: isOpen ? '4px 4px 0 0' : '4px',
          transition: 'all 0.2s ease',
          '&:hover': {
            backgroundColor: 'action.hover',
          },
          ...(isOpen && {
            backgroundColor: 'background.paper',
            boxShadow: (theme) =>
              `0 -2px 8px ${theme.palette.mode === 'dark' ? 'rgba(0,0,0,0.3)' : 'rgba(0,0,0,0.1)'}`,
            zIndex: 1301,
          }),
          ...(isActive && {
            backgroundColor: 'action.selected',
          }),
        }}
      >
        Evals
      </Button>
      <Popper
        anchorEl={anchorEl}
        open={isOpen}
        placement="bottom-start"
        onMouseLeave={handleMouseLeave}
        sx={{ zIndex: 1300 }}
        modifiers={[
          {
            name: 'offset',
            options: {
              offset: [0, -1],
            },
          },
        ]}
      >
        <Box sx={{ pt: 1 }}>
          <Paper
            elevation={3}
            sx={{
              width: 320,
              maxWidth: '90vw',
              borderRadius: '0 0 8px 8px',
              overflow: 'hidden',
              position: 'relative',
              boxShadow: (theme) =>
                `0 4px 20px ${theme.palette.mode === 'dark' ? 'rgba(0,0,0,0.5)' : 'rgba(0,0,0,0.15)'}`,
            }}
          >
            <MenuList sx={{ py: 1 }}>
              {menuItems.map((item) => (
                <MenuItem
                  key={item.href}
                  onClick={handleClose}
                  sx={{
                    py: 1.5,
                    px: 2.5,
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'flex-start',
                    minHeight: 'auto',
                    whiteSpace: 'normal',
                    transition: 'background-color 0.2s ease',
                    '&:hover': {
                      backgroundColor: 'action.hover',
                    },
                    '&:not(:last-child)': {
                      borderBottom: '1px solid',
                      borderBottomColor: 'divider',
                    },
                  }}
                >
                  <Link
                    to={item.href}
                    style={{ textDecoration: 'none', color: 'inherit', width: '100%' }}
                  >
                    <Box sx={{ width: '100%' }}>
                      <Box
                        sx={{
                          fontSize: '0.875rem',
                          fontWeight: 500,
                          color: 'text.primary',
                          mb: 0.25,
                          letterSpacing: '-0.01em',
                        }}
                      >
                        {item.label}
                      </Box>
                      <Box
                        sx={{
                          fontSize: '0.8125rem',
                          color: 'text.secondary',
                          lineHeight: 1.4,
                          whiteSpace: 'normal',
                          opacity: 0.8,
                        }}
                      >
                        {item.description}
                      </Box>
                    </Box>
                  </Link>
                </MenuItem>
              ))}
            </MenuList>
          </Paper>
        </Box>
      </Popper>
    </>
  );
}

export default function Navigation({
  darkMode,
  onToggleDarkMode,
}: {
  darkMode: boolean;
  onToggleDarkMode: () => void;
}) {
  const [activeMenu, setActiveMenu] = useState<ActiveMenu>(null);
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
            <CreateDropdown activeMenu={activeMenu} setActiveMenu={setActiveMenu} />
            <EvalsDropdown activeMenu={activeMenu} setActiveMenu={setActiveMenu} />
            <NavLink href="/prompts" label="Prompts" />
            <NavLink href="/datasets" label="Datasets" />
            <NavLink href="/history" label="History" />
            <NavLink href="/model-audit" label="Model Audit" />
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
