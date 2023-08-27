import Image from 'next/image';
import Box from '@mui/material/Box';

import './Logo.css';

export default function Logo() {
  return (
    <Box className="logo">
      <Image width={25} height={25} src="/logo.svg" alt="Promptfoo logo" /> <span>promptfoo</span>
    </Box>
  );
}
