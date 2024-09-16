import { useState } from 'react';
import { IS_RUNNING_LOCALLY, USE_SUPABASE } from '@app/constants';
import EngineeringIcon from '@mui/icons-material/Engineering';
import InfoIcon from '@mui/icons-material/Info';
import { Stack, IconButton, Tooltip } from '@mui/material';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import ApiSettingsModal from './ApiSettingsModal';
import DarkMode from './DarkMode';
import InfoModal from './InfoModal';
import LoggedInAs from './LoggedInAs';
import Logo from './Logo';
import './Navigation.css';

function NavLink({ href, label }: { href: string; label: string }) {
  const pathname = usePathname() || '';
  return (
    <Link href={href} className={pathname.startsWith(href) ? 'active' : ''}>
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
      {!process.env.NEXT_PUBLIC_NO_BROWSING && (
        <>
          <NavLink href="/setup" label="New Eval" />
          <NavLink href="/eval" label="Evals" />
          <NavLink href="/prompts" label="Prompts" />
          <NavLink href="/datasets" label="Datasets" />
          <NavLink href="/progress" label="Progress" />
        </>
      )}
      <div className="right-aligned">
        {USE_SUPABASE ? <LoggedInAs /> : null}
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
