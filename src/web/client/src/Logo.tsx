import Box from '@mui/material/Box';

import './Logo.css';

export default function Logo() {
  return (
    <Box className="logo">
      <img src="/logo.svg" alt="Promptfoo logo" /> <span>promptfoo</span>
    </Box>
  );
}
