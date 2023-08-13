import DarkModeIcon from '@mui/icons-material/DarkMode';
import LightModeIcon from '@mui/icons-material/LightMode';

import './DarkMode.css';

interface NavbarProps {
  darkMode: boolean;
  onToggleDarkMode: () => void;
}

export default function NavBar({ darkMode, onToggleDarkMode }: NavbarProps) {
  return (
    <div className="dark-mode-toggle" onClick={onToggleDarkMode}>
      {darkMode ? <DarkModeIcon /> : <LightModeIcon />}
    </div>
  );
}
