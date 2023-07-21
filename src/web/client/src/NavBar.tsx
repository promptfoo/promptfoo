import Logo from './Logo';

import DarkModeIcon from '@mui/icons-material/DarkMode';
import LightModeIcon from '@mui/icons-material/LightMode';

import './NavBar.css';

interface NavbarProps {
  recentFiles: string[];
  darkMode: boolean;
  onToggleDarkMode: () => void;
}

export default function NavBar({ recentFiles, darkMode, onToggleDarkMode }: NavbarProps) {
  return (
    <nav>
      <Logo />
      <div className="recent-files">
        {recentFiles && recentFiles.map((file) => (
          <span>{file}</span>
        ))}
      </div>
      <div className="dark-mode-toggle" onClick={onToggleDarkMode}>
        {darkMode ? <DarkModeIcon /> : <LightModeIcon />}
      </div>
    </nav>
  );
}
