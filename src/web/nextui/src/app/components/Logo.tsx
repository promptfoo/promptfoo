import Box from '@mui/material/Box';
import Image from 'next/image';
import './Logo.css';

export default function Logo() {
  return (
    <Box className="logo">
      <Image width={25} height={25} src="/logo-panda.svg" alt="Promptfoo logo" />{' '}
      <span>promptfoo</span>
    </Box>
  );
}
