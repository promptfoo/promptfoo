import Logo from './Logo';

import DarkModeIcon from '@mui/icons-material/DarkMode';
import LightModeIcon from '@mui/icons-material/LightMode';
import Select from '@mui/material/Select';
import MenuItem from '@mui/material/MenuItem';

import './NavBar.css';

interface NavbarProps {
  recentFiles: string[];
  darkMode: boolean;
  onToggleDarkMode: () => void;
  onRecentFileSelected: (file: string) => void;
}

export default function NavBar({ recentFiles, darkMode, onToggleDarkMode, onRecentFileSelected }: NavbarProps) {
  return (
    <nav>
      <Logo />
      <Select className="recent-files" onChange={(e) => onRecentFileSelected(e.target.value)}>
        {recentFiles && recentFiles.map((file) => (
          <MenuItem value={file}>{file}</MenuItem>
        ))}
      </Select>
      <div className="dark-mode-toggle" onClick={onToggleDarkMode}>
        {darkMode ? <DarkModeIcon /> : <LightModeIcon />}
      </div>
    </nav>
  );
}
