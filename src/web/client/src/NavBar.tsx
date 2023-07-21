import Logo from './Logo';

import DarkModeIcon from '@mui/icons-material/DarkMode';
import LightModeIcon from '@mui/icons-material/LightMode';
import Select from '@mui/material/Select';
import MenuItem from '@mui/material/MenuItem';
import FormControl from '@mui/material/FormControl';
import InputLabel from '@mui/material/InputLabel';

import type { SelectChangeEvent } from '@mui/material/Select';

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
      {recentFiles && recentFiles.length > 0 && (
        <FormControl sx={{ m: 1, minWidth: 200 }} size="small">
          <InputLabel>Select run</InputLabel>
          <Select className="recent-files" label="Previous runs" defaultValue={recentFiles[0]} onChange={(e: SelectChangeEvent) => onRecentFileSelected(e.target.value)}>
            {recentFiles.map((file) => (
              <MenuItem key={file} value={file}>{file}</MenuItem>
            ))}
          </Select>
        </FormControl>
      )}
      <div className="dark-mode-toggle" onClick={onToggleDarkMode}>
        {darkMode ? <DarkModeIcon /> : <LightModeIcon />}
      </div>
    </nav>
  );
}
