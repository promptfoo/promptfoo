import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useLocation } from 'react-router-dom';
import { IS_RUNNING_LOCALLY } from '@app/constants';
import EngineeringIcon from '@mui/icons-material/Engineering';
import InfoIcon from '@mui/icons-material/Info';
import { Stack, IconButton, Tooltip } from '@mui/material';
import ApiSettingsModal from './ApiSettingsModal';
import DarkMode from './DarkMode';
import InfoModal from './InfoModal';
import Logo from './Logo';
import './Navigation.css';

function NavLink({ href, label }: { href: string; label: string }) {
  const location = useLocation();
  return (
    <Link to={href} className={location.pathname.startsWith(href) ? 'active' : ''}>
      {label}
    </Link>
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
  const navigationContent = (
    <>
      <Logo />
      {!import.meta.env.VITE_PUBLIC_NO_BROWSING && (
        <>
          <NavLink href="/setup" label="New Eval" />
          <NavLink href="/eval" label="Evals" />
          <NavLink href="/prompts" label="Prompts" />
          <NavLink href="/datasets" label="Datasets" />
          <NavLink href="/progress" label="Progress" />
        </>
      )}
      <div className="right-aligned">
        <IconButton onClick={handleModalToggle} sx={{ color: '#f0f0f0' }}>
          <InfoIcon />
        </IconButton>
        {IS_RUNNING_LOCALLY && (
          <Tooltip title="API and Sharing Settings">
            <IconButton onClick={handleApiSettingsModalToggle} sx={{ color: '#f0f0f0' }}>
              <EngineeringIcon />
            </IconButton>
          </Tooltip>
        )}
        <DarkMode darkMode={darkMode} onToggleDarkMode={onToggleDarkMode} />
      </div>
    </>
  );

  return (
    <>
      <InfoModal open={showInfoModal} onClose={handleModalToggle} />
      <ApiSettingsModal open={showApiSettingsModal} onClose={handleApiSettingsModalToggle} />
      <Stack direction="row" spacing={2} className="nav">
        {navigationContent}
      </Stack>
    </>
  );
}
