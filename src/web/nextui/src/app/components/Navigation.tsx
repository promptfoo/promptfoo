import { useState } from 'react';
import { USE_SUPABASE } from '@/constants';
import InfoIcon from '@mui/icons-material/Info';
import { Stack, IconButton } from '@mui/material';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import DarkMode from './DarkMode';
import { InfoModal } from './InfoModal';
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

  const handleModalToggle = () => setShowInfoModal(!showInfoModal);

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
        <IconButton onClick={handleModalToggle} color="inherit">
          <InfoIcon />
        </IconButton>
        <DarkMode darkMode={darkMode} onToggleDarkMode={onToggleDarkMode} />
      </div>
    </>
  );

  return (
    <>
      <InfoModal open={showInfoModal} onClose={handleModalToggle} />
      <Stack direction="row" spacing={2} className="nav">
        {navigationContent}
      </Stack>
    </>
  );
}
