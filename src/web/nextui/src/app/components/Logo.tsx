import Image from 'next/image';
import Box from '@mui/material/Box';

import './Logo.css';

export default function Logo() {
  return (
    <Box className="logo">
      <Image src="/logo.svg" alt="Promptfoo logo" /> <span>promptfoo</span>
    </Box>
  );
}
