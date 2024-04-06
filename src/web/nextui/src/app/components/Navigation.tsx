import Link from 'next/link';
import { Stack } from '@mui/material';
import { usePathname } from 'next/navigation';

import Logo from './Logo';
import LoggedInAs from './LoggedInAs';
import DarkMode from './DarkMode';
import { USE_SUPABASE } from '@/constants';

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
  if (process.env.NEXT_PUBLIC_NO_BROWSING) {
    return (
      <Stack direction="row" spacing={2} className="nav">
        <Logo />
        <DarkMode darkMode={darkMode} onToggleDarkMode={onToggleDarkMode} />
      </Stack>
    );
  }
  return (
    <Stack direction="row" spacing={2} className="nav">
      <Logo />
      <NavLink href="/setup" label="New Eval" />
      <NavLink href="/eval" label="Evals" />
      <NavLink href="/prompts" label="Prompts" />
      <NavLink href="/datasets" label="Datasets" />
      <NavLink href="/progress" label="Progress" />
      <div className="right-aligned">
        {USE_SUPABASE ? <LoggedInAs /> : null}
        <DarkMode darkMode={darkMode} onToggleDarkMode={onToggleDarkMode} />
      </div>
    </Stack>
  );
}
