import './DarkMode.css';
import DarkModeIcon from '@mui/icons-material/DarkMode';
import LightModeIcon from '@mui/icons-material/LightMode';

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
